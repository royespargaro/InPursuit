// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultData } from '../services/appStore';
import {
  addMindEdge,
  buildDatasetFromInPursuitGoals,
  computeMindInsights,
  createEmptyMindDataset,
  deleteMindNode,
  extractMindFromNotesOffline,
  mergeExtractedBatchIntoDataset,
  upsertMindNode,
} from '../modules/mind-architecture/services/mindBuilder';
import {
  loadLocalMindWorkspace,
  prepareFirestoreMindPayload,
  sanitizeMindWorkspaceRecord,
  saveLocalMindWorkspace,
} from '../modules/mind-architecture/services/mindStore';
import { indexDataset } from '../modules/mind-architecture/utils/dataset';
import { handleExtractMindHttp } from '../../api/_lib/mindExtract';
import { resetRateLimitStore } from '../../api/_lib/importAuth';

describe('Multi-user Mind Architecture workspace store & builder', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetRateLimitStore();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('isolates Mind Architecture workspaces cleanly across user IDs and guests', () => {
    const userARecord = loadLocalMindWorkspace('user_alpha', 'Alpha');
    const emptyA = createEmptyMindDataset();
    const { dataset: withNode } = upsertMindNode(emptyA, {
      title: 'Distributed Systems',
      type: 'Concept',
      domains: ['Engineering'],
      description: 'Consensus and replication trade-offs.',
      evidence_grade: 'Q3',
    });

    saveLocalMindWorkspace('user_alpha', {
      ...userARecord,
      profile: {
        ...userARecord.profile,
        mode: 'custom',
        title: "Alpha's Mind",
      },
      customDataset: withNode,
    });

    const loadedA = loadLocalMindWorkspace('user_alpha', 'Alpha');
    const loadedB = loadLocalMindWorkspace('user_beta', 'Beta');
    const loadedGuest = loadLocalMindWorkspace('guest');

    expect(loadedA.profile.mode).toBe('custom');
    expect(loadedA.profile.title).toBe("Alpha's Mind");
    expect(loadedA.customDataset?.nodes.some((n) => n.title === 'Distributed Systems')).toBe(true);

    expect(loadedB.profile.mode).toBe('sample');
    expect(loadedB.customDataset).toBeNull();
    expect(loadedGuest.profile.mode).toBe('sample');
    expect(loadedGuest.customDataset).toBeNull();
  });

  it('sanitizes payloads and prepares Firestore-safe documents with no undefined values', () => {
    const base = createEmptyMindDataset();
    const added = upsertMindNode(base, {
      title: 'First Principles',
      type: 'Principle',
      domains: ['Philosophy'],
      description: 'Reason up from fundamentals.',
      evidence_grade: 'Q3',
    });

    const sanitized = sanitizeMindWorkspaceRecord({
      schemaVersion: 99,
      profile: {
        title: 'Custom Mind',
        subtitle: 'Personal synthesis',
        mode: 'custom',
        ownerName: undefined,
      },
      customDataset: added.dataset,
      hypothesisDecisions: { edge_1: 'confirmed', edge_bad: 'invalid_val' },
      recentExplorations: [{ nodeId: added.nodeId, title: 'First Principles' }],
    });

    expect(sanitized.schemaVersion).toBe(2);
    expect(sanitized.model.claims).toEqual([]);
    expect(sanitized.hypothesisDecisions).toEqual({ edge_1: 'confirmed' });
    expect(sanitized.recentExplorations).toHaveLength(1);

    const payload = prepareFirestoreMindPayload(sanitized);
    expect(JSON.stringify(payload)).not.toContain('undefined');
    expect(payload.customDataset?.nodes.length).toBeGreaterThanOrEqual(2); // Discipline + Principle
  });

  it('seeds a personal Mind Architecture from InPursuit Life Areas, Goals, Phases, and Habits', () => {
    const appData = createDefaultData();
    const areaId = 'area_1';
    const goalId = 'goal_1';
    const projId = 'proj_1';
    appData.lifeAreas = [
      { id: areaId, name: 'Deep Engineering', description: 'Systems mastery', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    appData.goals = [
      {
        id: goalId,
        lifeAreaId: areaId,
        title: 'Ship Reliable Distributed Storage',
        outcome: 'Production launch',
        targetDate: '2026-12-31',
        status: 'active',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ];
    appData.projects = [
      {
        id: projId,
        goalId,
        title: 'Phase 1: Raft Prototype',
        description: 'Core consensus',
        dueDate: '2026-06-01',
        status: 'active',
        createdAt: '2026-01-03T00:00:00.000Z',
      },
    ];

    const dataset = buildDatasetFromInPursuitGoals(appData);
    expect(dataset.nodes.map((n) => n.title)).toEqual(
      expect.arrayContaining(['Deep Engineering', 'Ship Reliable Distributed Storage', 'Phase 1: Raft Prototype'])
    );
    expect(dataset.edges.length).toBe(2);
    expect(dataset.sources).toHaveLength(1);
  });

  it('supports adding, linking, extracting from notes, deleting nodes, and computing live insights', () => {
    let ds = createEmptyMindDataset();
    const a = upsertMindNode(ds, {
      title: 'Attention Hygiene',
      type: 'Concept',
      domains: ['Cognition'],
      description: 'Protecting focus blocks.',
      evidence_grade: 'Q3',
    });
    ds = a.dataset;

    const b = upsertMindNode(ds, {
      title: 'Deep Writing',
      type: 'Project',
      domains: ['Craft'],
      description: 'Long-form synthesis essays.',
      evidence_grade: 'Q2',
    });
    ds = b.dataset;

    ds = addMindEdge(ds, {
      source: a.nodeId,
      target: b.nodeId,
      relationship: 'enables',
      basis: 'inferred',
      explanation: 'Protected attention enables deep writing.',
    });

    const batch = extractMindFromNotesOffline(
      `# Epistemology\n- Bayesian Updating: Revise beliefs proportionally to evidence\n- Bayesian Updating -> Decision Calibration: Improves real-world judgment`,
      'Weekly Note'
    );
    ds = mergeExtractedBatchIntoDataset(ds, batch);

    const indexed = indexDataset(ds);
    const insights = computeMindInsights(indexed, {}, true);
    expect(insights.nodeCount).toBeGreaterThanOrEqual(6);
    expect(insights.inferredPendingCount).toBe(1);
    expect(insights.sourceCount).toBeGreaterThanOrEqual(2);

    const afterDelete = deleteMindNode(ds, b.nodeId);
    expect(afterDelete.nodes.some((n) => n.id === b.nodeId)).toBe(false);
    expect(afterDelete.edges.some((e) => e.target === b.nodeId)).toBe(false);
  });

  it('enforces authentication and validation on POST /api/extract-mind', async () => {
    const unauth = await handleExtractMindHttp({
      method: 'POST',
      body: { notesText: 'Systems thinking leads to resilience.' },
    });
    expect(unauth.status).toBe(401);

    const invalid = await handleExtractMindHttp({
      method: 'POST',
      authorizationHeader: 'Bearer test-token',
      verifyToken: async () => ({ uid: 'u1', email: 'u1@example.com' }),
      body: { notesText: 'hi' },
    });
    expect(invalid.status).toBe(400);

    const ok = await handleExtractMindHttp({
      method: 'POST',
      authorizationHeader: 'Bearer test-token',
      verifyToken: async () => ({ uid: 'u1', email: 'u1@example.com' }),
      body: {
        notesText: 'Systems thinking connects feedback loops with resilience.',
        sourceLabel: 'Journal',
      },
      extractor: async (notesText, sourceLabel) => ({
        domains: ['Systems'],
        nodes: [
          {
            title: 'Feedback Loops',
            type: 'Concept',
            domain: 'Systems',
            description: notesText,
            evidence_grade: 'Q2',
          },
        ],
        edges: [],
        sourceLabel: sourceLabel ?? 'Journal',
      }),
    });
    expect(ok.status).toBe(200);
    expect((ok.body as { nodes: unknown[] }).nodes).toHaveLength(1);
  });
});
