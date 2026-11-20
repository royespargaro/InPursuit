import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGoal,
  createHabit,
  createLifeArea,
  createProject,
  createTask,
  deleteGoal,
  deleteHabit,
  deleteProject,
  deleteTask,
  FIELD_LIMITS,
  logHabit,
  mutateWorkspace,
  readWorkspace,
  setDailyPlan,
  upsertDailyReview,
  updateProject,
  WorkspaceConflictError,
  WorkspaceNotFoundError,
  WorkspaceSchemaError,
  WorkspaceValidationError,
} from '../../api/_lib/workspace';
import type { AppData } from '../types';

function makeWorkspace(overrides: Partial<AppData> = {}): AppData {
  return {
    schemaVersion: 3,
    syncVersion: 1,
    lifeAreas: [
      { id: 'la-1', name: 'Health', description: 'Vitality', createdAt: '2026-11-01T00:00:00.000Z' },
    ],
    goals: [
      {
        id: 'g-1',
        lifeAreaId: 'la-1',
        title: 'Run a half marathon',
        outcome: 'Finish under 2h',
        targetDate: '2026-12-31',
        status: 'active',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    projects: [],
    tasks: [],
    habits: [
      { id: 'h-1', name: 'Deep work', frequency: 'daily', active: true, createdAt: '2026-11-01T00:00:00.000Z' },
    ],
    habitLogs: [],
    dailyPlans: [],
    dailyReviews: [],
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function createMockFirestore(initialDocs: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initialDocs));
  let conflictFailuresRemaining = 0;
  let onConflictTick: (() => void) | null = null;
  const txCalls: string[] = [];
  const setCalls: Array<{ path: string; data: unknown }> = [];

  const createSnap = (path: string) => {
    const raw = store.get(path);
    return {
      exists: raw !== undefined,
      data: () => (raw !== undefined ? structuredClone(raw) : undefined),
    };
  };

  const db = {
    doc: vi.fn((path: string) => ({
      path,
      get: vi.fn(async () => createSnap(path)),
    })),
    runTransaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      txCalls.push('attempt');
      const staged = new Map<string, unknown>();
      const tx = {
        get: vi.fn(async (ref: { path: string }) => createSnap(ref.path)),
        set: vi.fn((ref: { path: string }, payload: unknown) => {
          staged.set(ref.path, structuredClone(payload));
        }),
      };

      const result = await fn(tx);

      if (conflictFailuresRemaining > 0) {
        conflictFailuresRemaining -= 1;
        onConflictTick?.();
        const err = new Error('10 ABORTED: cross-transaction contention') as Error & { code: number };
        err.code = 10;
        throw err;
      }

      for (const [path, payload] of staged.entries()) {
        store.set(path, payload);
        setCalls.push({ path, data: payload });
      }
      return result;
    }),
  };

  return {
    db: db as unknown as Firestore,
    store,
    txCalls,
    setCalls,
    failNextTransactions(count: number, onTick?: () => void) {
      conflictFailuresRemaining = count;
      onConflictTick = onTick ?? null;
    },
  };
}

describe('server workspace data layer (api/_lib/workspace)', () => {
  const fixedNow = new Date('2026-11-18T10:00:00.000Z');
  let mock: ReturnType<typeof createMockFirestore>;

  beforeEach(() => {
    mock = createMockFirestore({
      'users/u-1': makeWorkspace(),
    });
  });

  it('enforces the 3 active project limit across create, update, and raw mutations', async () => {
    mock = createMockFirestore({
      'users/u-1': makeWorkspace({
        projects: [
          { id: 'p-1', goalId: 'g-1', title: 'P1', description: '', dueDate: '', status: 'active', createdAt: '2026-11-01T00:00:00.000Z' },
          { id: 'p-2', goalId: 'g-1', title: 'P2', description: '', dueDate: '', status: 'active', createdAt: '2026-11-01T00:00:00.000Z' },
          { id: 'p-3', goalId: null, title: 'P3', description: '', dueDate: '', status: 'active', createdAt: '2026-11-01T00:00:00.000Z' },
          { id: 'p-4', goalId: null, title: 'P4', description: '', dueDate: '', status: 'archived', createdAt: '2026-11-01T00:00:00.000Z' },
        ],
      }),
    });

    await expect(
      createProject('u-1', { title: 'Fourth Active' }, { db: mock.db, now: fixedNow }),
    ).rejects.toThrow(WorkspaceValidationError);

    await expect(
      updateProject('u-1', 'p-4', { status: 'active' }, { db: mock.db, now: fixedNow }),
    ).rejects.toThrow(WorkspaceValidationError);

    await expect(
      mutateWorkspace(
        'u-1',
        current => ({
          ...current,
          projects: [
            ...current.projects,
            { id: 'p-5', goalId: null, title: 'Injected', description: '', dueDate: '', status: 'active', createdAt: fixedNow.toISOString() },
          ],
        }),
        { db: mock.db, now: fixedNow },
      ),
    ).rejects.toThrow(WorkspaceValidationError);

    expect(mock.setCalls).toHaveLength(0);

    // Archived project creation still succeeds under the 3-active limit
    const archived = await createProject(
      'u-1',
      { title: 'Backlog Project', status: 'archived' },
      { db: mock.db, now: fixedNow },
    );
    expect(archived.project.status).toBe('archived');
    expect(archived.write.syncVersion).toBe(2);
  });

  it('dedupes habit logs by (habitId, date) and keeps the latest status', async () => {
    const first = await logHabit(
      'u-1',
      { habitId: 'h-1', date: '2026-11-18', status: 'skipped' },
      { db: mock.db, now: fixedNow },
    );
    expect(first.log?.status).toBe('skipped');
    const logId = first.log!.id;

    const second = await logHabit(
      'u-1',
      { habitId: 'h-1', date: '2026-11-18', status: 'done' },
      { db: mock.db, now: fixedNow },
    );
    expect(second.write.data.habitLogs).toHaveLength(1);
    expect(second.log).toEqual({
      id: logId,
      habitId: 'h-1',
      date: '2026-11-18',
      status: 'done',
    });

    // Even a raw mutator appending a duplicate (habitId, date) keeps only the latest entry
    const rawWrite = await mutateWorkspace(
      'u-1',
      current => ({
        ...current,
        habitLogs: [
          ...current.habitLogs,
          { id: 'hl-override', habitId: 'h-1', date: '2026-11-18', status: 'skipped' },
        ],
      }),
      { db: mock.db, now: fixedNow },
    );
    expect(rawWrite.data.habitLogs).toHaveLength(1);
    expect(rawWrite.data.habitLogs[0].status).toBe('skipped');

    const cleared = await logHabit(
      'u-1',
      { habitId: 'h-1', date: '2026-11-18', status: 'clear' },
      { db: mock.db, now: fixedNow },
    );
    expect(cleared.log).toBeNull();
    expect(cleared.write.data.habitLogs).toHaveLength(0);
  });

  it('enforces daily plan max 3 unique valid task ids', async () => {
    mock = createMockFirestore({
      'users/u-1': makeWorkspace({
        tasks: [
          { id: 't-1', projectId: null, title: 'T1', dueDate: '', priority: 'high', status: 'todo', createdAt: '2026-11-01T00:00:00.000Z', completedAt: null },
          { id: 't-2', projectId: null, title: 'T2', dueDate: '', priority: 'medium', status: 'todo', createdAt: '2026-11-01T00:00:00.000Z', completedAt: null },
          { id: 't-3', projectId: null, title: 'T3', dueDate: '', priority: 'low', status: 'todo', createdAt: '2026-11-01T00:00:00.000Z', completedAt: null },
          { id: 't-4', projectId: null, title: 'T4', dueDate: '', priority: 'low', status: 'todo', createdAt: '2026-11-01T00:00:00.000Z', completedAt: null },
        ],
      }),
    });

    const deduped = await setDailyPlan(
      'u-1',
      { date: '2026-11-18', priorityTaskIds: ['t-1', 't-1', 't-2', 't-3', 't-2'] },
      { db: mock.db, now: fixedNow },
    );
    expect(deduped.plan.priorityTaskIds).toEqual(['t-1', 't-2', 't-3']);

    await expect(
      setDailyPlan(
        'u-1',
        { date: '2026-11-18', priorityTaskIds: ['t-1', 't-2', 't-3', 't-4'] },
        { db: mock.db, now: fixedNow },
      ),
    ).rejects.toThrow(WorkspaceValidationError);

    await expect(
      setDailyPlan(
        'u-1',
        { date: '2026-11-18', priorityTaskIds: ['t-1', 'missing-task'] },
        { db: mock.db, now: fixedNow },
      ),
    ).rejects.toThrow(WorkspaceNotFoundError);

    // Raw mutator bypassing setDailyPlan is still sanitized to <= 3 unique valid task IDs
    const rawPlanWrite = await mutateWorkspace(
      'u-1',
      current => ({
        ...current,
        dailyPlans: [{ date: '2026-11-19', priorityTaskIds: ['t-1', 'missing', 't-2', 't-2', 't-3', 't-4'] }],
      }),
      { db: mock.db, now: fixedNow },
    );
    const plan19 = rawPlanWrite.data.dailyPlans.find(p => p.date === '2026-11-19');
    expect(plan19?.priorityTaskIds).toEqual(['t-1', 't-2', 't-3']);
  });

  it('clamps field lengths across entities matching client appStore caps', async () => {
    const longArea = await createLifeArea(
      'u-1',
      { name: 'A'.repeat(300), description: 'B'.repeat(1500) },
      { db: mock.db, now: fixedNow },
    );
    expect(longArea.area.name).toHaveLength(FIELD_LIMITS.lifeAreaName);
    expect(longArea.area.description).toHaveLength(FIELD_LIMITS.lifeAreaDescription);

    const longGoal = await createGoal(
      'u-1',
      { title: 'G'.repeat(500), outcome: 'O'.repeat(3000), lifeAreaId: longArea.area.id },
      { db: mock.db, now: fixedNow },
    );
    expect(longGoal.goal.title).toHaveLength(FIELD_LIMITS.goalTitle);
    expect(longGoal.goal.outcome).toHaveLength(FIELD_LIMITS.goalOutcome);

    const longProject = await createProject(
      'u-1',
      { title: 'P'.repeat(500), description: 'D'.repeat(3000), goalId: longGoal.goal.id },
      { db: mock.db, now: fixedNow },
    );
    expect(longProject.project.title).toHaveLength(FIELD_LIMITS.projectTitle);
    expect(longProject.project.description).toHaveLength(FIELD_LIMITS.projectDescription);

    const longTask = await createTask(
      'u-1',
      { title: 'T'.repeat(500), projectId: longProject.project.id },
      { db: mock.db, now: fixedNow },
    );
    expect(longTask.task.title).toHaveLength(FIELD_LIMITS.taskTitle);

    const longHabit = await createHabit(
      'u-1',
      { name: 'H'.repeat(300) },
      { db: mock.db, now: fixedNow },
    );
    expect(longHabit.habit.name).toHaveLength(FIELD_LIMITS.habitName);

    const longReview = await upsertDailyReview(
      'u-1',
      {
        date: '2026-11-18',
        wins: 'W'.repeat(5000),
        blockers: 'K'.repeat(5000),
        notes: 'N'.repeat(5000),
        energy: 9,
      },
      { db: mock.db, now: fixedNow },
    );
    expect(longReview.review.wins).toHaveLength(FIELD_LIMITS.reviewText);
    expect(longReview.review.blockers).toHaveLength(FIELD_LIMITS.reviewText);
    expect(longReview.review.notes).toHaveLength(FIELD_LIMITS.reviewText);
    expect(longReview.review.energy).toBe(5);
  });

  it('retries on Firestore transaction contention and bumps syncVersion from the fresh snapshot', async () => {
    // Attempt 1 sees syncVersion=1, loses to concurrent writer advancing remote to syncVersion=4, then retries cleanly.
    mock.failNextTransactions(1, () => {
      const current = mock.store.get('users/u-1') as AppData;
      mock.store.set('users/u-1', {
        ...current,
        syncVersion: 4,
        goals: [
          ...current.goals,
          {
            id: 'g-concurrent',
            lifeAreaId: null,
            title: 'Concurrent Goal',
            outcome: '',
            targetDate: '',
            status: 'active',
            createdAt: '2026-11-18T09:59:00.000Z',
          },
        ],
      });
    });

    const result = await createTask(
      'u-1',
      { title: 'Task added after retry' },
      { db: mock.db, now: fixedNow, maxRetries: 3 },
    );

    expect(mock.txCalls).toHaveLength(2);
    expect(result.write.syncVersion).toBe(5);
    expect(result.write.updatedAt).toBe(fixedNow.toISOString());
    expect(result.write.data.goals.some(g => g.id === 'g-concurrent')).toBe(true);
    expect(result.write.data.tasks.some(t => t.id === result.task.id)).toBe(true);
  });

  it('throws WorkspaceConflictError once transaction retry budget is exhausted', async () => {
    mock.failNextTransactions(5);

    await expect(
      createTask('u-1', { title: 'Blocked task' }, { db: mock.db, now: fixedNow, maxRetries: 2 }),
    ).rejects.toThrow(WorkspaceConflictError);
    expect(mock.txCalls).toHaveLength(2);
  });

  it('unlinks dependent records on delete and refuses schema v4 workspaces', async () => {
    const p = await createProject('u-1', { title: 'Linked Project', goalId: 'g-1' }, { db: mock.db, now: fixedNow });
    const t = await createTask('u-1', { title: 'Linked Task', projectId: p.project.id }, { db: mock.db, now: fixedNow });
    await setDailyPlan('u-1', { date: '2026-11-18', priorityTaskIds: [t.task.id] }, { db: mock.db, now: fixedNow });
    await logHabit('u-1', { habitId: 'h-1', date: '2026-11-18', status: 'done' }, { db: mock.db, now: fixedNow });

    const afterGoalDel = await deleteGoal('u-1', 'g-1', { db: mock.db, now: fixedNow });
    expect(afterGoalDel.data.projects.find(item => item.id === p.project.id)?.goalId).toBeNull();

    const afterProjectDel = await deleteProject('u-1', p.project.id, { db: mock.db, now: fixedNow });
    expect(afterProjectDel.data.tasks.find(item => item.id === t.task.id)?.projectId).toBeNull();

    const afterTaskDel = await deleteTask('u-1', t.task.id, { db: mock.db, now: fixedNow });
    expect(afterTaskDel.data.dailyPlans.find(plan => plan.date === '2026-11-18')?.priorityTaskIds).toEqual([]);

    const afterHabitDel = await deleteHabit('u-1', 'h-1', { db: mock.db, now: fixedNow });
    expect(afterHabitDel.data.habitLogs).toEqual([]);

    mock.store.set('users/u-v4', {
      schemaVersion: 4,
      migrationStatus: 'completed',
      updatedAt: '2026-11-18T00:00:00.000Z',
    });

    await expect(readWorkspace('u-v4', mock.db)).rejects.toThrow(WorkspaceSchemaError);
    await expect(
      createTask('u-v4', { title: 'Should fail' }, { db: mock.db, now: fixedNow }),
    ).rejects.toThrow(WorkspaceSchemaError);
  });
});
