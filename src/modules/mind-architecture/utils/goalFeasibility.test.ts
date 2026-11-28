import { describe, expect, it } from 'vitest';
import type { Goal } from '../../../types';
import type { KnowledgeDataset, KnowledgeNode } from '../types/knowledge';
import { assessGoalFeasibility } from './goalFeasibility';

const goal: Goal = {
  id: 'goal-remote',
  lifeAreaId: null,
  title: 'Get a remote job',
  outcome: '',
  targetDate: '2026-12-05',
  status: 'active',
  createdAt: '2026-11-28T00:00:00.000Z',
};

function node(overrides: Partial<KnowledgeNode>): KnowledgeNode {
  return {
    id: 'node',
    title: 'Recorded experience',
    type: 'Experience',
    domains: ['Business and entrepreneurship'],
    level: 2,
    engagement: 'active',
    lifecycle: 'active',
    lifecycle_basis: 'source_backed',
    description: 'Relevant professional experience.',
    source_ids: ['source'],
    evidence_classes: ['summary_chatgpt'],
    confidence: 'high',
    mentions: 1,
    aliases: [],
    evidence_grade: 'Q3',
    first_observed_at: '2026-01-01',
    last_observed_at: '2026-01-01',
    observation_ids: [],
    question_ids: [],
    ...overrides,
  };
}

function dataset(nodes: KnowledgeNode[]): KnowledgeDataset {
  return {
    version: '3.1',
    evidence_classes: {},
    connection_bases: {},
    sources: [],
    nodes,
    edges: [],
    conflicts: [],
    rules: [],
    evidence_grades: {},
    entity_tables: {
      conversations: [],
      messages: [],
      questions: [],
      question_threads: [],
      observations: [],
      positions: [],
      position_changes: [],
      resolution_queue: [],
      ingest_ledger: [],
      resolution_events: [],
    },
    entity_schemas: {
      conversation: [],
      message: [],
      question: [],
      question_thread: [],
      observation: [],
      position: [],
      position_change: [],
      resolution_event: [],
    },
    change_log: [],
    coverage_matrix: [],
    data_quality: {
      duplicate_node_ids: 0,
      dangling_edges: 0,
      edges_missing_sources: 0,
      nodes_missing_sources: 0,
      evidence_class_mismatch: 0,
      conversation_nodes_without_id_or_date: 0,
      sources_without_conversation_id: 0,
      lifecycle_missing: 0,
      lifecycle_unknown_or_unverified: 0,
      evidence_grades: {},
      edge_bases: {},
      inferred_unreviewed: 0,
      structural_share: 0,
      structural_from_assistant_groupings: 0,
      nodes_with_only_structural_edges: 0,
      nodes_without_edges: 0,
      multi_domain_nodes: 0,
      nodes_without_domain: 0,
      assistant_proposed_nodes: 0,
    },
  } as KnowledgeDataset;
}

describe('assessGoalFeasibility', () => {
  it('finds relevant sales, customer success and language evidence for a remote job goal', () => {
    const result = assessGoalFeasibility(goal, dataset([
      node({ id: 'active-study', title: 'Active Study Global — Sales Consultant', description: '38 enrolments in 8 months, 95.7% retention' }),
      node({ id: 'teleperformance', title: 'Teleperformance — Customer Success / Content Moderator' }),
      node({ id: 'english', title: 'English and Bahasa Indonesia', type: 'Skill', domains: ['Education and international mobility'] }),
      node({ id: 'spanish', title: 'Spanish B1', type: 'Skill', domains: ['Education and international mobility'] }),
      node({ id: 'unrelated', title: 'Handstand practice', type: 'Skill', domains: ['Health, fitness, and physical development'] }),
    ]), new Date('2026-11-28T12:00:00'));

    expect(result.daysRemaining).toBe(7);
    expect(result.evidence.some((item) => item.node.id === 'active-study')).toBe(true);
    expect(result.evidence.some((item) => item.node.id === 'teleperformance')).toBe(true);
    expect(result.evidence.some((item) => item.node.id === 'english')).toBe(true);
    expect(result.evidence.some((item) => item.node.id === 'unrelated')).toBe(false);
    expect(result.level).toBe('needs_definition');
    expect(result.risks.some((risk) => risk.includes('week'))).toBe(true);
    expect(result.missingInformation.some((item) => item.includes('target role'))).toBe(true);
  });

  it('marks a defined goal with a one-week deadline as high-stretch, not impossible', () => {
    const definedGoal = {
      ...goal,
      outcome: 'Receive a signed remote employment offer',
      successCriteria: [{ id: 'offer', text: 'Written offer accepted', done: false }],
    };
    const result = assessGoalFeasibility(definedGoal, dataset([
      node({ id: 'sales', title: 'Sales Consultant' }),
      node({ id: 'cs', title: 'Customer Success Specialist' }),
    ]), new Date('2026-11-28T12:00:00'));

    expect(result.level).toBe('high_stretch');
    expect(result.label).toBe('High-stretch deadline');
    expect(result.strongEvidenceCount).toBeGreaterThan(0);
  });

  it('does not claim feasibility when the archive has no relevant evidence', () => {
    const result = assessGoalFeasibility(goal, dataset([
      node({ id: 'fitness', title: 'Muscle-up training', type: 'Skill', domains: ['Health, fitness, and physical development'] }),
    ]), new Date('2026-11-28T12:00:00'));

    expect(result.level).toBe('insufficient_evidence');
    expect(result.evidence).toHaveLength(0);
  });

  it('treats a goal without a deadline as open-ended', () => {
    const result = assessGoalFeasibility({ ...goal, targetDate: '' }, dataset([
      node({ id: 'sales', title: 'Sales Consultant' }),
    ]), new Date('2026-11-28T12:00:00'));

    expect(result.daysRemaining).toBeNull();
    expect(result.deadline).toBeNull();
  });
});
