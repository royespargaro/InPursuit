import { describe, expect, it } from 'vitest';
import type { AppData, Project, Task } from '../types';
import { promoteDuePhases } from '../utils/phaseLifecycle';
import { selectToday } from '../utils/selectors';
import { getWeeklyHabitCount } from '../utils/habitUtils';

const base = (over: Partial<AppData> = {}): AppData => ({
  schemaVersion: 3,
  lifeAreas: [],
  goals: [],
  projects: [],
  tasks: [],
  habits: [],
  habitLogs: [],
  dailyPlans: [],
  dailyReviews: [],
  ...over,
});

const phase = (id: string, status: Project['status'], startDate: string, dueDate: string): Project => ({
  id, goalId: null, title: id, description: '', startDate, dueDate, status, isPhase: true, createdAt: '2026-11-01T00:00:00.000Z',
});

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, projectId: null, title: id, dueDate: '', priority: 'medium', status: 'todo',
  createdAt: '2026-11-01T00:00:00.000Z', completedAt: null, ...over,
});

describe('promoteDuePhases', () => {
  it('starts a planned phase when its start date arrives', () => {
    const data = base({ projects: [phase('p1', 'completed', '2026-11-01', '2026-11-30'), phase('p2', 'planned', '2026-12-21', '2027-01-19')] });
    expect(promoteDuePhases(data, '2026-12-20')).toBe(data);
    const next = promoteDuePhases(data, '2026-12-21');
    expect(next.projects.find(p => p.id === 'p2')?.status).toBe('active');
  });

  it('respects the 3-active cap and never promotes a phase that already ended', () => {
    const full = base({
      projects: [
        phase('a', 'active', '2026-11-01', '2027-02-01'),
        phase('b', 'active', '2026-11-01', '2027-02-01'),
        phase('c', 'active', '2026-11-01', '2027-02-01'),
        phase('d', 'planned', '2026-11-10', '2027-02-01'),
      ],
    });
    expect(promoteDuePhases(full, '2026-11-20')).toBe(full);

    const ended = base({ projects: [phase('old', 'planned', '2026-10-01', '2026-10-31')] });
    expect(promoteDuePhases(ended, '2026-11-20')).toBe(ended);
  });
});

describe('selectToday', () => {
  const today = '2026-11-20';

  it('keeps Top 3 out of "also today", skips skipped habits in the total, and ignores optional undated phase tasks in progress', () => {
    const data = base({
      projects: [phase('p1', 'active', '2026-11-01', '2026-11-30')],
      tasks: [
        task('top', { dueDate: today }),
        task('due', { dueDate: today }),
        task('phase-undated', { projectId: 'p1' }),
      ],
      habits: [
        { id: 'h1', name: 'Prayer', frequency: 'daily', active: true, createdAt: '2026-11-01T00:00:00.000Z' },
        { id: 'h2', name: 'Read', frequency: 'daily', active: true, createdAt: '2026-11-01T00:00:00.000Z' },
      ],
      habitLogs: [
        { id: 'l1', habitId: 'h1', date: today, status: 'done' },
        { id: 'l2', habitId: 'h2', date: today, status: 'skipped' },
      ],
      dailyPlans: [{ date: today, priorityTaskIds: ['top'] }],
    });
    const sel = selectToday(data, today);
    expect(sel.top3.map(t => t.id)).toEqual(['top']);
    expect(sel.others.map(t => t.id)).not.toContain('top');
    expect(sel.others.map(t => t.id)).toContain('phase-undated');
    // committed = top(1) + habit h1(1, h2 skipped) + due(1); phase-undated is optional
    expect(sel.total).toBe(3);
    expect(sel.done).toBe(1);
    expect(sel.percent).toBe(33);
  });

  it('reports the same weekly habit count that the Habits page uses', () => {
    const data = base({
      habits: [{ id: 'w', name: 'Workout', frequency: 'daily', cadence: 'weekly_count', targetCount: 3, active: true, createdAt: '2026-11-01T00:00:00.000Z' }],
      habitLogs: [
        { id: 'a', habitId: 'w', date: '2026-11-16', status: 'done' },
        { id: 'b', habitId: 'w', date: today, status: 'done' },
        { id: 'c', habitId: 'w', date: today, status: 'done' },
      ],
    });
    const item = selectToday(data, today).habits[0];
    expect(item.weeklyCount).toBe(getWeeklyHabitCount('w', data.habitLogs, today));
    expect(item.todayCount).toBe(2);
    expect(item.status).toBe('done');
  });
});
