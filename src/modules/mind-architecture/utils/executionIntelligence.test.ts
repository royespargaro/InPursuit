import { describe, expect, it } from 'vitest';
import type { AppData } from '../../../types';
import type { KnowledgeDataset, KnowledgeEdge, KnowledgeNode } from '../types/knowledge';
import { createEmptyMindDataset } from '../services/mindBuilder';
import { computeExecutionIntelligence, getGoalKnowledgeNodeId } from './executionIntelligence';

function makeNode(id: string, title: string, type: string): KnowledgeNode {
  return {
    id,
    title,
    type,
    domains: ['Work'],
    level: 2,
    engagement: 'active',
    lifecycle: 'active',
    lifecycle_basis: 'user_authored',
    description: title,
    source_ids: [],
    evidence_classes: [],
    confidence: 'high',
    mentions: 1,
    aliases: [],
    evidence_grade: 'Q3',
    first_observed_at: '2026-01-01',
    last_observed_at: '2026-01-01',
    observation_ids: [],
    question_ids: [],
  };
}

function makeEdge(id: string, source: string, target: string, basis: KnowledgeEdge['basis'] = 'explicit'): KnowledgeEdge {
  return {
    id,
    source,
    target,
    relationship: 'requires_capability',
    basis,
    explanation: 'A test capability relationship.',
    confidence: 'high',
    source_ids: [],
    evidence_classes: [],
    assertion_level: 'asserted',
    claim_scope: 'personal',
    review_status: 'verified',
    presentation_rule: 'Test fixture',
    external_citation: null,
  };
}

function makeAppData(): AppData {
  return {
    schemaVersion: 3,
    lifeAreas: [],
    goals: [{
      id: 'goal-1',
      lifeAreaId: null,
      title: 'Build a sustainable business',
      outcome: 'Reach consistent revenue',
      targetDate: '2027-06-01',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      successCriteria: [{ id: 'criterion-1', text: 'First paying customer', done: false }],
    }],
    projects: [{
      id: 'project-1',
      goalId: 'goal-1',
      title: 'Customer acquisition',
      description: '',
      dueDate: '2027-01-01',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    tasks: [{
      id: 'task-1',
      projectId: 'project-1',
      title: 'Contact first buyer',
      dueDate: '2026-01-02',
      priority: 'high',
      status: 'todo',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
    }],
    habits: [{
      id: 'habit-1',
      name: 'Daily outreach',
      frequency: 'daily',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      goalId: 'goal-1',
    }],
    habitLogs: [],
    dailyPlans: [],
    dailyReviews: [],
  };
}

describe('computeExecutionIntelligence', () => {
  it('connects active goals to their projects, tasks and explicitly linked habits', () => {
    const result = computeExecutionIntelligence(
      makeAppData(),
      createEmptyMindDataset(),
      {},
      true,
      new Set(),
      new Date('2026-01-05T12:00:00'),
    );

    expect(result?.activeGoals).toHaveLength(1);
    expect(result?.activeGoals[0].projects).toHaveLength(1);
    expect(result?.activeGoals[0].openTasks).toBe(1);
    expect(result?.activeGoals[0].overdueTasks).toBe(1);
    expect(result?.activeGoals[0].activeHabits.map((habit) => habit.id)).toEqual(['habit-1']);
    expect(result?.linkedHabits).toBe(1);
    expect(result?.recommendations.some((item) => item.id === 'overdue-tasks')).toBe(true);
  });

  it('counts only explicit or user-confirmed capability relationships', () => {
    const dataset = createEmptyMindDataset();
    const goalNodeId = getGoalKnowledgeNodeId('goal-1');
    dataset.nodes = [
      makeNode(goalNodeId, 'Build a sustainable business', 'Goal'),
      makeNode('skill-sales', 'B2B Sales', 'Skill'),
      makeNode('skill-copy', 'Copywriting', 'Skill'),
    ];
    dataset.edges = [
      makeEdge('confirmed-sales', goalNodeId, 'skill-sales', 'inferred'),
      makeEdge('rejected-copy', goalNodeId, 'skill-copy', 'inferred'),
    ];

    const result = computeExecutionIntelligence(
      makeAppData(),
      dataset,
      { 'confirmed-sales': 'confirmed', 'rejected-copy': 'rejected' },
      true,
    );

    expect(result?.activeGoals[0].requiredSkills.map((skill) => skill.id)).toEqual(['skill-sales']);
  });

  it('respects the sensitive-node filter when mapping capabilities', () => {
    const dataset = createEmptyMindDataset();
    const goalNodeId = getGoalKnowledgeNodeId('goal-1');
    dataset.nodes = [
      makeNode(goalNodeId, 'Build a sustainable business', 'Goal'),
      makeNode('skill-sensitive', 'Private capability', 'Skill'),
    ];
    dataset.edges = [makeEdge('sensitive-edge', goalNodeId, 'skill-sensitive')];

    const hidden = computeExecutionIntelligence(makeAppData(), dataset, {}, true, new Set(['skill-sensitive']));
    const visible = computeExecutionIntelligence(makeAppData(), dataset, {}, false, new Set(['skill-sensitive']));

    expect(hidden?.activeGoals[0].requiredSkills).toHaveLength(0);
    expect(visible?.activeGoals[0].requiredSkills).toHaveLength(1);
  });
});
