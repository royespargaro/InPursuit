import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../types';

const mockCollection = vi.fn((_db: unknown, ...segments: string[]) => ({ kind: 'collection', path: segments.join('/') }));
const mockDoc = vi.fn((_db: unknown, ...segments: string[]) => ({ kind: 'doc', path: segments.join('/') }));
const mockGetDocs = vi.fn();
const mockDeleteDoc = vi.fn();
const mockOnSnapshot = vi.fn();
let remoteDocState: { exists: boolean; data: unknown } = { exists: false, data: null };
const mockTransactionSet = vi.fn();
const mockRunTransaction = vi.fn(async (_db: unknown, updateFn: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    get: vi.fn(async () => ({
      exists: () => remoteDocState.exists,
      data: () => remoteDocState.data,
    })),
    set: (ref: unknown, payload: unknown) => {
      mockTransactionSet(ref, payload);
      remoteDocState = { exists: true, data: payload };
    },
  };
  return updateFn(tx);
});

const mockBatchCommits: Array<{ deletes: string[] }> = [];
const mockWriteBatch = vi.fn(() => {
  const ops: string[] = [];
  return {
    delete: vi.fn((ref: { path: string }) => {
      ops.push(ref.path);
    }),
    commit: vi.fn(async () => {
      mockBatchCommits.push({ deletes: [...ops] });
    }),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(args[0], ...(args.slice(1) as string[])),
  doc: (...args: unknown[]) => mockDoc(args[0], ...(args.slice(1) as string[])),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  runTransaction: (dbArg: unknown, fn: (tx: unknown) => Promise<unknown>) => mockRunTransaction(dbArg, fn),
  setDoc: vi.fn(),
  writeBatch: () => mockWriteBatch(),
}));

vi.mock('../services/firebase', () => ({
  auth: { currentUser: { uid: 'u-del', emailVerified: true } },
  db: { __mockDb: true },
}));

import {
  deleteUserWorkspaceDoc,
  IncompatibleSchemaError,
  subscribeToFirestore,
  SyncConflictError,
  syncToFirestore,
  V4_SUBCOLLECTIONS,
  WorkspaceDeletionError,
} from '../services/syncService';

const sampleWorkspace: AppData = {
  schemaVersion: 3,
  lifeAreas: [],
  goals: [],
  projects: [],
  tasks: [],
  habits: [],
  habitLogs: [],
  dailyPlans: [],
  dailyReviews: [],
  updatedAt: '2026-11-14T00:00:00.000Z',
};

describe('syncService.deleteUserWorkspaceDoc', () => {
  beforeEach(() => {
    mockBatchCommits.length = 0;
    mockCollection.mockClear();
    mockDoc.mockClear();
    mockGetDocs.mockReset();
    mockDeleteDoc.mockReset();
    mockDeleteDoc.mockResolvedValue(undefined);
    mockWriteBatch.mockClear();
    mockOnSnapshot.mockReset();
    mockRunTransaction.mockClear();
    mockTransactionSet.mockClear();
    remoteDocState = { exists: false, data: null };
  });

  it('deletes all eight v4 subcollections and root user doc without touching other users or billing collections', async () => {
    expect([...V4_SUBCOLLECTIONS].sort()).toEqual(
      ['dailyPlans', 'dailyReviews', 'goals', 'habitLogMonths', 'habits', 'lifeAreas', 'projects', 'tasks'].sort(),
    );

    mockGetDocs.mockImplementation(async (colRef: { path: string }) => {
      if (colRef.path.endsWith('/tasks')) {
        return {
          empty: false,
          docs: [
            { ref: { path: `${colRef.path}/t1` } },
            { ref: { path: `${colRef.path}/t2` } },
          ],
        };
      }
      if (colRef.path.endsWith('/goals')) {
        return {
          empty: false,
          docs: [{ ref: { path: `${colRef.path}/g1` } }],
        };
      }
      return { empty: true, docs: [] };
    });

    const result = await deleteUserWorkspaceDoc('u-del');

    expect(result).toEqual({ deletedSubcollectionDocs: 3, deletedRootDoc: true });
    const queriedPaths = mockCollection.mock.calls.map(call => call.slice(1).join('/'));
    expect(queriedPaths).toEqual(V4_SUBCOLLECTIONS.map(sub => `users/u-del/${sub}`));
    expect(mockDeleteDoc).toHaveBeenCalledWith({ kind: 'doc', path: 'users/u-del' });

    const allDeleted = mockBatchCommits.flatMap(b => b.deletes);
    expect(allDeleted).toEqual(['users/u-del/goals/g1', 'users/u-del/tasks/t1', 'users/u-del/tasks/t2']);
    for (const p of [...queriedPaths, ...allDeleted]) {
      expect(p.startsWith('users/u-del')).toBe(true);
      expect(p).not.toContain('admins');
      expect(p).not.toContain('entitlements');
      expect(p).not.toContain('paymentRequests');
    }
  });

  it('chunks large subcollection deletions into batches of <= 400 operations', async () => {
    mockGetDocs.mockImplementation(async (colRef: { path: string }) => {
      if (colRef.path === 'users/u-big/tasks') {
        return {
          empty: false,
          docs: Array.from({ length: 850 }, (_, i) => ({ ref: { path: `users/u-big/tasks/t-${i}` } })),
        };
      }
      return { empty: true, docs: [] };
    });

    const result = await deleteUserWorkspaceDoc('u-big');

    expect(result).toEqual({ deletedSubcollectionDocs: 850, deletedRootDoc: true });
    expect(mockBatchCommits.map(b => b.deletes.length)).toEqual([400, 400, 50]);
  });

  it('reports partial progress accurately and stays idempotent when retried after a failure', async () => {
    let failOnTasks = true;
    mockGetDocs.mockImplementation(async (colRef: { path: string }) => {
      if (colRef.path === 'users/u-retry/lifeAreas') {
        return failOnTasks
          ? { empty: false, docs: [{ ref: { path: 'users/u-retry/lifeAreas/la-1' } }] }
          : { empty: true, docs: [] };
      }
      if (colRef.path === 'users/u-retry/tasks') {
        if (failOnTasks) {
          throw new Error('transient network failure');
        }
        return { empty: false, docs: [{ ref: { path: 'users/u-retry/tasks/t-1' } }] };
      }
      return { empty: true, docs: [] };
    });

    await expect(deleteUserWorkspaceDoc('u-retry')).rejects.toMatchObject({
      name: 'WorkspaceDeletionError',
      partial: true,
      deletedSubcollectionDocs: 1,
      path: 'users/u-retry/tasks',
    } satisfies Partial<WorkspaceDeletionError>);
    expect(mockDeleteDoc).not.toHaveBeenCalled();

    failOnTasks = false;
    const retryResult = await deleteUserWorkspaceDoc('u-retry');
    expect(retryResult).toEqual({ deletedSubcollectionDocs: 1, deletedRootDoc: true });
    expect(mockDeleteDoc).toHaveBeenCalledWith({ kind: 'doc', path: 'users/u-retry' });
  });
});

describe('syncService transactional optimistic concurrency & v4 protection', () => {
  beforeEach(() => {
    mockTransactionSet.mockClear();
    mockRunTransaction.mockClear();
    mockOnSnapshot.mockReset();
    remoteDocState = { exists: false, data: null };
  });

  it('increments syncVersion atomically inside runTransaction on create and matching update', async () => {
    const first = await syncToFirestore('u-tx', sampleWorkspace);
    expect(first.syncVersion).toBe(1);
    expect(mockTransactionSet).toHaveBeenCalledTimes(1);

    const second = await syncToFirestore('u-tx', sampleWorkspace, { expectedSyncVersion: 1 });
    expect(second.syncVersion).toBe(2);
  });

  it('throws SyncConflictError without writing when remote syncVersion advanced concurrently', async () => {
    remoteDocState = {
      exists: true,
      data: { ...sampleWorkspace, syncVersion: 5 },
    };

    await expect(
      syncToFirestore('u-tx', sampleWorkspace, { expectedSyncVersion: 3 }),
    ).rejects.toBeInstanceOf(SyncConflictError);
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it('refuses to overwrite schema v4 cloud workspace and throws IncompatibleSchemaError', async () => {
    remoteDocState = {
      exists: true,
      data: {
        schemaVersion: 4,
        migrationStatus: 'completed',
        updatedAt: '2026-11-14T00:00:00.000Z',
      },
    };

    await expect(syncToFirestore('u-v4', sampleWorkspace)).rejects.toBeInstanceOf(IncompatibleSchemaError);
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it('emits incompatibleSchema metadata on subscribeToFirestore without triggering error callback', () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    mockOnSnapshot.mockImplementation((_ref, _opts, nextCb: (snap: unknown) => void) => {
      nextCb({
        exists: () => true,
        metadata: { fromCache: false, hasPendingWrites: false },
        data: () => ({
          schemaVersion: 4,
          migrationStatus: 'completed',
          migratedFromSchema: 3,
          updatedAt: '2026-11-14T00:00:00.000Z',
        }),
      });
      return () => {};
    });

    subscribeToFirestore('u-v4', onNext, onError);

    expect(onError).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        data: null,
        incompatibleSchema: 4,
      }),
    );
  });

  it('strips nested undefined fields before passing payload to Transaction.set', async () => {
    const dirtyWorkspace = {
      ...sampleWorkspace,
      goals: [
        {
          id: 'g1',
          lifeAreaId: null,
          title: 'Goal 1',
          outcome: '',
          targetDate: '',
          status: 'active' as const,
          createdAt: '2026-11-14T00:00:00.000Z',
          successCriteria: undefined,
          principles: undefined,
        },
      ],
      habits: [
        {
          id: 'h1',
          name: 'Hydrate',
          frequency: 'daily' as const,
          minimumVersion: undefined,
          active: true,
          createdAt: '2026-11-14T00:00:00.000Z',
        },
      ],
    };

    await syncToFirestore('u-undef', dirtyWorkspace);

    expect(mockTransactionSet).toHaveBeenCalledTimes(1);
    const written = mockTransactionSet.mock.calls[0][1] as Record<string, unknown>;
    const goalWritten = (written.goals as Array<Record<string, unknown>>)[0];
    const habitWritten = (written.habits as Array<Record<string, unknown>>)[0];

    expect('successCriteria' in goalWritten).toBe(false);
    expect('principles' in goalWritten).toBe(false);
    expect('minimumVersion' in habitWritten).toBe(false);
    expect('syncVersion' in written).toBe(true);
  });
});

