import { describe, expect, it } from 'vitest';
import { buildV4DocumentsFromV3, reconstructV3FromV4 } from '../services/migrationV4';
import type { AppData } from '../types';

const sampleV3Workspace: AppData = {
  schemaVersion: 3,
  updatedAt: '2026-11-14T08:00:00.000Z',
  lifeAreas: [
    { id: 'la-1', name: 'Career', description: 'Ship meaningful work', createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'la-2', name: 'Health', description: 'Energy & sleep', createdAt: '2026-10-01T00:00:00.000Z' },
  ],
  goals: [
    {
      id: 'g-1',
      lifeAreaId: 'la-1',
      title: 'Launch v1 MVP',
      outcome: '1000 reliable sessions',
      targetDate: '2026-12-31',
      status: 'active',
      createdAt: '2026-10-02T00:00:00.000Z',
    },
  ],
  projects: [
    {
      id: 'p-1',
      goalId: 'g-1',
      title: 'Stabilize sync engine',
      description: 'Subcollection migration design',
      dueDate: '',
      status: 'active',
      createdAt: '2026-10-03T00:00:00.000Z',
    },
  ],
  tasks: [
    {
      id: 't-1',
      projectId: 'p-1',
      title: 'Verify migration roundtrip',
      dueDate: '2026-11-14',
      priority: 'high',
      status: 'done',
      createdAt: '2026-11-10T00:00:00.000Z',
      completedAt: '2026-11-14T07:45:00.000Z',
    },
  ],
  habits: [
    { id: 'h-1', name: 'Deep work 90m', frequency: 'weekdays', active: true, createdAt: '2026-10-01T00:00:00.000Z' },
  ],
  habitLogs: [
    { id: 'hl-1', habitId: 'h-1', date: '2026-10-30', status: 'done' },
    { id: 'hl-2', habitId: 'h-1', date: '2026-11-02', status: 'done' },
    { id: 'hl-3', habitId: 'h-1', date: '2026-11-03', status: 'skipped' },
  ],
  dailyPlans: [
    { date: '2026-11-14', priorityTaskIds: ['t-1'] },
  ],
  dailyReviews: [
    { date: '2026-11-13', wins: 'Closed sync bugs', blockers: 'None', notes: 'Add tests', energy: 4 },
  ],
};

describe('v3 -> v4 normalized subcollection migration & rollback', () => {
  it('deterministically splits a copied v3 dataset into bounded v4 subcollection documents and monthly habit log buckets', () => {
    const bundle = buildV4DocumentsFromV3(sampleV3Workspace);

    expect(bundle.meta).toEqual({
      schemaVersion: 4,
      migrationStatus: 'completed',
      migratedFromSchema: 3,
      updatedAt: '2026-11-14T08:00:00.000Z',
    });
    expect(bundle.lifeAreas).toHaveLength(2);
    expect(bundle.goals).toHaveLength(1);
    expect(bundle.projects).toHaveLength(1);
    expect(bundle.tasks).toHaveLength(1);
    expect(bundle.habits).toHaveLength(1);
    expect(bundle.habitLogMonths.map(m => m.month)).toEqual(['2026-10', '2026-11']);
    expect(Object.keys(bundle.habitLogMonths[1].logs)).toEqual(['h-1_2026-11-02', 'h-1_2026-11-03']);
  });

  it('is idempotent and supports lossless round-trip reconstruction back to v3 (verified rollback)', () => {
    const bundle1 = buildV4DocumentsFromV3(sampleV3Workspace);
    const bundle2 = buildV4DocumentsFromV3(sampleV3Workspace);
    expect(bundle1).toEqual(bundle2);

    const rolledBack = reconstructV3FromV4(bundle1);
    expect(rolledBack).toEqual(sampleV3Workspace);
  });
});
