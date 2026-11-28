import { describe, expect, it } from 'vitest';
import type { Goal } from '../../../types';
import type { GoalFeasibilityAssessment } from './goalFeasibility';
import { buildGoalPlanBlueprint, createGoalPlanRecords } from './goalPlanning';

const goal: Goal = {
  id: 'goal-1', lifeAreaId: null, title: 'Get a remote job',
  outcome: 'Receive at least one interview invitation', targetDate: '2026-12-05',
  status: 'active', createdAt: '2026-11-28T00:00:00.000Z',
  successCriteria: [{ id: 'criterion-1', text: 'Receive one interview invitation' }],
};

const assessment = {
  goalId: goal.id, goalTitle: goal.title, deadline: goal.targetDate, daysRemaining: 7,
  level: 'high_stretch', label: 'High stretch', summary: 'Test assessment',
  evidence: [{
    node: { id: 'sales', title: 'Sales Consultant', description: 'Sales and customer communication', aliases: [], type: 'Experience', evidence_grade: 'Q3' },
    category: 'experience', strength: 'strong', reason: 'Relevant experience',
  }],
  strongEvidenceCount: 1, supportingEvidenceCount: 0, missingInformation: [], risks: [],
  suggestedActions: [
    { title: 'Prepare application package', description: 'CV and profile', daysFromStart: 1 },
    { title: 'Submit targeted applications', description: 'Qualified applications', daysFromStart: 3 },
  ],
  evidenceCoverage: 'partial',
} as unknown as GoalFeasibilityAssessment;

describe('goal planning blueprint', () => {
  it('maps a job goal to requirements, evidence, milestones and a justified recurring habit', () => {
    const plan = buildGoalPlanBlueprint(goal, assessment);
    expect(plan.requirements.length).toBeGreaterThan(0);
    expect(plan.milestones).toHaveLength(2);
    expect(plan.habits).toHaveLength(1);
    expect(plan.habits[0].minimumVersion).toContain('one high-quality');
    expect(plan.strategy).toContain('qualified pipeline');
  });

  it('does not create recurring habits for every generic goal', () => {
    const genericGoal = { ...goal, title: 'Improve my home workspace', outcome: 'Create a more functional workspace' };
    const plan = buildGoalPlanBlueprint(genericGoal, assessment);
    expect(plan.habits).toHaveLength(0);
  });

  it('creates a goal-linked project, tasks and only recommended habits', () => {
    const plan = buildGoalPlanBlueprint(goal, assessment);
    const records = createGoalPlanRecords(goal, plan, {
      now: new Date('2026-11-28T12:00:00.000Z'),
      today: '2026-11-28',
      projectStatus: 'active',
      id: (() => { let n = 0; return () => `id-${++n}`; })(),
    });
    expect(records.project.goalId).toBe(goal.id);
    expect(records.project.exitCondition).toContain('interview invitation');
    expect(records.tasks).toHaveLength(2);
    expect(records.tasks.every((task) => task.projectId === records.project.id)).toBe(true);
    expect(records.habits).toHaveLength(1);
    expect(records.habits[0].goalId).toBe(goal.id);
  });
});
