import { describe, expect, it } from 'vitest';
import type { AppData, Task } from '../types';
import { buildDailyBriefing } from './dailyBriefing';

const task: Task = {
  id: 'task-1',
  projectId: 'project-1',
  title: 'Contact a potential buyer',
  dueDate: '2026-11-28',
  priority: 'high',
  status: 'todo',
  createdAt: '2026-11-27T00:00:00.000Z',
  completedAt: null,
};

const data: AppData = {
  schemaVersion: 3,
  lifeAreas: [],
  goals: [{
    id: 'goal-1',
    lifeAreaId: null,
    title: 'Build a business',
    outcome: 'Reach consistent revenue',
    targetDate: '2027-06-01',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  }],
  projects: [{
    id: 'project-1',
    goalId: 'goal-1',
    title: 'Customer acquisition',
    description: '',
    dueDate: '2026-12-01',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  }],
  tasks: [task],
  habits: [],
  habitLogs: [],
  dailyPlans: [],
  dailyReviews: [],
};

describe('buildDailyBriefing', () => {
  it('connects the user-selected focus task to its project and goal', () => {
    const result = buildDailyBriefing(data, [task], [], 2, 3);
    expect(result.focusTask?.id).toBe('task-1');
    expect(result.project?.id).toBe('project-1');
    expect(result.goal?.id).toBe('goal-1');
    expect(result.recommendation).toBe('protect_focus');
    expect(result.habitCompletion).toBe(67);
  });

  it('prioritizes reviewing overdue work without inventing new tasks', () => {
    const result = buildDailyBriefing(data, [], [task], 0, 0);
    expect(result.focusTask).toBeNull();
    expect(result.overdueCount).toBe(1);
    expect(result.recommendation).toBe('resolve_overdue');
  });
});
