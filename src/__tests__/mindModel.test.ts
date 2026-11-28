import { describe, expect, it } from 'vitest';
import {
  addMindObservation,
  addMindSource,
  attachMindEvidence,
  createEmptyMindModel,
  createMindClaim,
  reviewMindClaim,
  sanitizeMindModel,
} from '../modules/mind-architecture/services/mindModel';
import {
  createDefaultMindWorkspaceRecord,
  sanitizeMindWorkspaceRecord,
} from '../modules/mind-architecture/services/mindStore';
import type {
  MindClaim,
  MindObservation,
  MindSourceRecord,
} from '../modules/mind-architecture/types/knowledge';

const now = '2026-11-28T04:00:00.000Z';
const source: MindSourceRecord = {
  id: 'source-1',
  kind: 'conversation',
  author: 'user',
  title: 'User statement',
  capturedAt: now,
  originalAvailable: true,
  sensitivity: 'normal',
};
const observation: MindObservation = {
  id: 'observation-1',
  sourceId: source.id,
  method: 'user_report',
  content: 'I prefer to plan from long-term goals backwards.',
  capturedAt: now,
  recordedBy: 'user',
};
const candidate: Omit<MindClaim, 'status' | 'evidence' | 'createdAt' | 'updatedAt'> = {
  id: 'claim-1',
  statement: 'The user prefers backward planning from long-term goals.',
  kind: 'preference',
  domain: 'Planning',
  epistemicBasis: 'self_reported',
  confidence: 0.8,
};

describe('Personal Mind Model v2', () => {
  it('starts as an empty personal model rather than importing the sample archive', () => {
    const record = createDefaultMindWorkspaceRecord();
    expect(record.schemaVersion).toBe(2);
    expect(record.model.claims).toEqual([]);
    expect(record.model.observations).toEqual([]);
  });

  it('migrates a legacy workspace without losing its existing intellectual archive', () => {
    const legacy = {
      schemaVersion: 1,
      profile: { title: 'My archive', subtitle: 'Old data', mode: 'custom', updatedAt: now },
      customDataset: { version: 'legacy', nodes: [], edges: [] },
      hypothesisDecisions: { edgeA: 'confirmed' },
      recentExplorations: [],
      updatedAt: now,
    };
    const migrated = sanitizeMindWorkspaceRecord(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.model.claims).toEqual([]);
    expect(migrated.profile.title).toBe('My archive');
    expect(migrated.hypothesisDecisions.edgeA).toBe('confirmed');
    expect(migrated.customDataset).not.toBeNull();
  });

  it('requires a real source before accepting an observation', () => {
    const empty = createEmptyMindModel(now);
    expect(addMindObservation(empty, observation)).toBe(empty);
    const withSource = addMindSource(empty, source);
    expect(addMindObservation(withSource, observation).observations).toHaveLength(1);
  });

  it('keeps new claims provisional until a user review event is appended', () => {
    const withSource = addMindSource(createEmptyMindModel(now), source);
    const withObservation = addMindObservation(withSource, observation);
    const withClaim = createMindClaim(withObservation, candidate, now);
    expect(withClaim.claims[0].status).toBe('candidate');
    expect(withClaim.reviewEvents).toHaveLength(0);
  });

  it('does not allow confirmation without supporting evidence', () => {
    const withClaim = createMindClaim(createEmptyMindModel(now), candidate, now);
    const reviewed = reviewMindClaim(withClaim, 'claim-1', 'confirm', 'review-1', 'user', undefined, now);
    expect(reviewed.claims[0].status).toBe('candidate');
    expect(reviewed.reviewEvents).toHaveLength(0);
  });

  it('preserves evidence and appends a review event when a claim is confirmed', () => {
    let model = addMindSource(createEmptyMindModel(now), source);
    model = addMindObservation(model, observation);
    model = createMindClaim(model, candidate, now);
    model = attachMindEvidence(model, 'claim-1', {
      id: 'evidence-1',
      observationId: 'observation-1',
      polarity: 'supports',
      createdAt: now,
    });
    model = reviewMindClaim(model, 'claim-1', 'confirm', 'review-1', 'user', 'Reviewed against the original statement.', now);
    expect(model.claims[0].status).toBe('active');
    expect(model.claims[0].evidence).toHaveLength(1);
    expect(model.reviewEvents).toHaveLength(1);
    expect(model.reviewEvents[0]).toMatchObject({
      action: 'confirm',
      previousStatus: 'candidate',
      nextStatus: 'active',
    });
  });

  it('drops orphaned observations and evidence links during sanitization', () => {
    const sanitized = sanitizeMindModel({
      schemaVersion: 2,
      sources: [source],
      observations: [{ ...observation, sourceId: 'missing-source' }],
      claims: [{
        ...candidate,
        status: 'active',
        evidence: [{ id: 'orphan', observationId: 'missing-observation', polarity: 'supports', createdAt: now }],
        createdAt: now,
        updatedAt: now,
      }],
    });
    expect(sanitized.observations).toHaveLength(0);
    expect(sanitized.claims[0].evidence).toHaveLength(0);
    expect(sanitized.claims[0].status).toBe('active');
  });

  it('clamps confidence and rejects dangling relationship references', () => {
    const sanitized = sanitizeMindModel({
      claims: [{ ...candidate, confidence: 8, createdAt: now, updatedAt: now }],
      relationships: [{
        id: 'bad-link',
        fromClaimId: 'claim-1',
        toClaimId: 'missing',
        predicate: 'influences',
        status: 'accepted',
        basis: 'inferred',
        confidence: 0.9,
        observationIds: [],
        createdAt: now,
      }],
    });
    expect(sanitized.claims[0].confidence).toBe(1);
    expect(sanitized.relationships).toHaveLength(0);
  });
});
