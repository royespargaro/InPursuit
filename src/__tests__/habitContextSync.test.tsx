// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import type { AppData, EffectiveEntitlement } from '../types';
import { fireEvent } from '@testing-library/react';
import {
  ACCOUNT_DELETION_STATE_KEY,
  ACCOUNT_KEY_PREFIX,
  createDefaultData,
  loadAccountData,
  loadSyncMeta,
  saveAccountData,
  saveSyncBase,
  saveSyncMeta,
  STORAGE_KEY,
} from '../services/appStore';

let authCallback: ((user: User | null) => void) | null = null;
let firestoreListeners = new Map<string, {
  onNext: (event: { data: AppData | null; fromCache: boolean; hasPendingWrites: boolean }) => void;
  onError: (err: Error, offline: boolean) => void;
  unsubscribed: boolean;
}>();

const mockSignInWithPopup = vi.fn();
const mockSignInWithRedirect = vi.fn();
const mockGetRedirectResult = vi.fn().mockResolvedValue(null);
const mockFirebaseSignOut = vi.fn().mockResolvedValue(undefined);
const mockDeleteUser = vi.fn().mockResolvedValue(undefined);
const mockReauthenticateWithPopup = vi.fn().mockResolvedValue(undefined);
const mockSyncToFirestore = vi.fn();
const mockDeleteUserWorkspaceDoc = vi.fn().mockResolvedValue({ deletedSubcollectionDocs: 0, deletedRootDoc: true });
const mockSubscribeToEntitlement = vi.fn((_uid: string, cb: (e: EffectiveEntitlement) => void) => {
  cb({
    tier: 'free',
    status: 'active',
    isPro: false,
    isExpired: false,
    expiresAt: null,
    planLabel: 'Free · Rp0',
  });
  return () => {};
});

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn();
  },
  getRedirectResult: (...args: unknown[]) => mockGetRedirectResult(...args),
  onAuthStateChanged: vi.fn((_auth, cb: (user: User | null) => void) => {
    authCallback = cb;
    return () => {
      authCallback = null;
    };
  }),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signInWithRedirect: (...args: unknown[]) => mockSignInWithRedirect(...args),
  reauthenticateWithPopup: (...args: unknown[]) => mockReauthenticateWithPopup(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  signOut: (...args: unknown[]) => mockFirebaseSignOut(...args),
}));

vi.mock('../services/firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

const mockLoadV4BundleFromFirestore = vi.fn();
const mockExportData = vi.fn();

vi.mock('../services/migrationV4', async () => {
  const actual = await vi.importActual<typeof import('../services/migrationV4')>('../services/migrationV4');
  return {
    ...actual,
    loadV4BundleFromFirestore: (...args: unknown[]) => mockLoadV4BundleFromFirestore(...args),
  };
});

vi.mock('../services/appStore', async () => {
  const actual = await vi.importActual<typeof import('../services/appStore')>('../services/appStore');
  return {
    ...actual,
    exportData: (...args: unknown[]) => mockExportData(...args),
  };
});

vi.mock('../services/syncService', () => {
  class WorkspaceDeletionError extends Error {
    readonly path: string;
    readonly partial: boolean;
    readonly deletedSubcollectionDocs: number;

    constructor(message: string, details: { path: string; partial: boolean; deletedSubcollectionDocs: number }) {
      super(message);
      this.name = 'WorkspaceDeletionError';
      this.path = details.path;
      this.partial = details.partial;
      this.deletedSubcollectionDocs = details.deletedSubcollectionDocs;
    }
  }
  class SyncConflictError extends Error {
    readonly remoteData: AppData;
    readonly expectedVersion: number;
    readonly actualVersion: number;

    constructor(message: string, details: { remoteData: AppData; expectedVersion: number; actualVersion: number }) {
      super(message);
      this.name = 'SyncConflictError';
      this.remoteData = details.remoteData;
      this.expectedVersion = details.expectedVersion;
      this.actualVersion = details.actualVersion;
    }
  }
  class IncompatibleSchemaError extends Error {
    readonly schemaVersion: number;
    readonly meta: { schemaVersion: 4; migrationStatus: 'pending' | 'completed'; updatedAt: string };

    constructor(
      message: string,
      details: { schemaVersion: number; meta: { schemaVersion: 4; migrationStatus: 'pending' | 'completed'; updatedAt: string } },
    ) {
      super(message);
      this.name = 'IncompatibleSchemaError';
      this.schemaVersion = details.schemaVersion;
      this.meta = details.meta;
    }
  }
  return {
    WorkspaceDeletionError,
    SyncConflictError,
    IncompatibleSchemaError,
    subscribeToFirestore: vi.fn((uid: string, onNext, onError) => {
      const entry = { onNext, onError, unsubscribed: false };
      firestoreListeners.set(uid, entry);
      return () => {
        entry.unsubscribed = true;
      };
    }),
    syncToFirestore: (...args: unknown[]) => mockSyncToFirestore(...args),
    deleteUserWorkspaceDoc: (...args: unknown[]) => mockDeleteUserWorkspaceDoc(...args),
    isOfflineError: (err: unknown) => err instanceof Error && err.message.includes('offline'),
    isQuotaExceededError: (err: unknown) => {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      return msg.includes('quota limit exceeded') || msg.includes('quota exceeded') || msg.includes('resource-exhausted');
    },
  };
});

vi.mock('../services/entitlementService', () => ({
  PRO_TIER_MONTHLY_IDR: 29_000,
  PRO_TIER_ANNUAL_IDR: 249_000,
  MANUAL_PAYMENT_REQUESTS_ENABLED: false,
  DEFAULT_FREE_ENTITLEMENT: {
    tier: 'free',
    status: 'active',
    isPro: false,
    isExpired: false,
    expiresAt: null,
    planLabel: 'Free · Rp0',
  },
  subscribeToEntitlement: (...args: unknown[]) => mockSubscribeToEntitlement(args[0] as string, args[1] as (e: EffectiveEntitlement) => void),
  submitManualPaymentRequest: vi.fn(),
}));

import { HabitProvider, useHabits } from '../context/HabitContext';
import { ConflictModal } from '../components/ConflictModal';
import { SettingsModal } from '../components/SettingsModal';
import { SignInPage } from '../components/SignInPage';
import { SyncConflictError, WorkspaceDeletionError } from '../services/syncService';

function Harness({ onDeleteError }: { onDeleteError?: (err: Error) => void }) {
  const ctx = useHabits();
  return (
    <div>
      <span data-testid="auth-ready">{String(ctx.authReady)}</span>
      <span data-testid="user-uid">{ctx.user?.uid ?? 'guest'}</span>
      <span data-testid="sync-status">{ctx.syncStatus}</span>
      <span data-testid="deletion-phase">{ctx.deletionPhase}</span>
      <span data-testid="account-notice">{ctx.accountNotice}</span>
      <span data-testid="sync-error">{ctx.syncError}</span>
      <span data-testid="pending-sync">{String(ctx.pendingSync)}</span>
      <span data-testid="goal-titles">{ctx.data.goals.map(g => g.title).join(',')}</span>
      <span data-testid="conflict-present">{String(Boolean(ctx.conflict))}</span>
      <span data-testid="conflict-reason">{ctx.conflict?.reason ?? 'none'}</span>
      <span data-testid="incompatible-schema">{String(ctx.incompatibleSchema ?? 'none')}</span>
      <span data-testid="active-projects">{ctx.data.projects.filter(p => p.status === 'active').map(p => p.title).join(',')}</span>
      <button
        type="button"
        data-testid="add-goal"
        onClick={() =>
          ctx.updateData(current => ({
            ...current,
            goals: [
              ...current.goals,
              {
                id: `g-${current.goals.length + 1}`,
                lifeAreaId: null,
                title: `Goal ${current.goals.length + 1}`,
                outcome: '',
                targetDate: '',
                status: 'active',
                createdAt: '2026-11-12T00:00:00.000Z',
              },
            ],
          }))
        }
      >
        Add goal
      </button>
      <button
        type="button"
        data-testid="export-recovery-btn"
        onClick={() => void ctx.exportRecoveryBackup()}
      >
        Recovery export
      </button>
      <button type="button" data-testid="retry-sync" onClick={() => void ctx.retrySync()}>
        Retry
      </button>
      <button type="button" data-testid="merge-conflict" onClick={() => void ctx.resolveConflict('merge')}>
        Merge
      </button>
      <button type="button" data-testid="signout-btn" onClick={() => void ctx.signOut()}>
        Sign out
      </button>
      <button
        type="button"
        data-testid="delete-account-btn"
        onClick={() => {
          void ctx.deleteAccount().catch(err => {
            onDeleteError?.(err as Error);
          });
        }}
      >
        Delete account
      </button>
    </div>
  );
}

const makeUser = (uid: string, ageMs = 15_000) =>
  ({
    uid,
    email: `${uid}@example.com`,
    displayName: uid,
    metadata: { lastSignInTime: new Date(Date.now() - ageMs).toISOString() },
  }) as User;

describe('HabitContext synchronization & account isolation', () => {
  beforeEach(() => {
    localStorage.clear();
    authCallback = null;
    firestoreListeners = new Map();
    mockSyncToFirestore.mockReset();
    mockSyncToFirestore.mockResolvedValue({ syncVersion: 1, updatedAt: '2026-11-14T00:00:00.000Z' });
    mockLoadV4BundleFromFirestore.mockReset();
    mockExportData.mockReset();
    mockDeleteUserWorkspaceDoc.mockReset();
    mockDeleteUserWorkspaceDoc.mockResolvedValue({ deletedSubcollectionDocs: 0, deletedRootDoc: true });
    mockReauthenticateWithPopup.mockReset();
    mockReauthenticateWithPopup.mockResolvedValue(undefined);
    mockDeleteUser.mockReset();
    mockDeleteUser.mockResolvedValue(undefined);
    mockFirebaseSignOut.mockReset();
    mockFirebaseSignOut.mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('operates locally for guests without attempting Firestore sync', async () => {
    render(
      <HabitProvider>
        <Harness />
      </HabitProvider>,
    );

    act(() => authCallback?.(null));

    expect(screen.getByTestId('auth-ready').textContent).toBe('true');
    expect(screen.getByTestId('sync-status').textContent).toBe('local');

    act(() => screen.getByTestId('add-goal').click());

    expect(screen.getByTestId('goal-titles').textContent).toBe('Goal 1');
    expect(screen.getByTestId('sync-status').textContent).toBe('local');
    expect(mockSyncToFirestore).not.toHaveBeenCalled();
  });

  it('hydrates remote data, tracks honest synced/error states, and recovers via retrySync', async () => {
    render(
      <HabitProvider>
        <Harness />
      </HabitProvider>,
    );

    act(() => authCallback?.(makeUser('user-1')));
    expect(screen.getByTestId('sync-status').textContent).toBe('hydrating');

    const cloudDoc = createDefaultData();
    cloudDoc.goals.push({
      id: 'cg1',
      lifeAreaId: null,
      title: 'Cloud Goal',
      outcome: '',
      targetDate: '',
      status: 'active',
      createdAt: '2026-11-12T00:00:00.000Z',
    });

    act(() => {
      firestoreListeners.get('user-1')?.onNext({ data: cloudDoc, fromCache: false, hasPendingWrites: false });
    });

    expect(screen.getByTestId('goal-titles').textContent).toBe('Cloud Goal');
    expect(screen.getByTestId('sync-status').textContent).toBe('synced');

    mockSyncToFirestore.mockRejectedValueOnce(new Error('permission-denied'));

    act(() => screen.getByTestId('add-goal').click());
    expect(screen.getByTestId('sync-status').textContent).toBe('syncing');

    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('error'));
    expect(screen.getByTestId('pending-sync').textContent).toBe('true');

    mockSyncToFirestore.mockResolvedValueOnce(undefined);
    act(() => screen.getByTestId('retry-sync').click());

    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('synced'));
    expect(screen.getByTestId('pending-sync').textContent).toBe('false');
  });

  it('pauses automatic Firestore retries during quota cooldown, displays friendly quota notice, and allows manual retrySync', async () => {
    render(
      <HabitProvider>
        <Harness />
      </HabitProvider>,
    );

    act(() => authCallback?.(makeUser('user-quota')));
    const cloudDoc = createDefaultData();
    act(() => {
      firestoreListeners.get('user-quota')?.onNext({ data: cloudDoc, fromCache: false, hasPendingWrites: false });
    });
    expect(screen.getByTestId('sync-status').textContent).toBe('synced');

    mockSyncToFirestore.mockRejectedValueOnce(
      new Error(
        JSON.stringify({
          error:
            "Quota limit exceeded. Cause - Quota exceeded for quota metric 'Free daily write units per project (free tier database)'",
          operationType: 'write',
          path: 'users/user-quota',
        }),
      ),
    );

    act(() => screen.getByTestId('add-goal').click());
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('error'));
    expect(screen.getByTestId('pending-sync').textContent).toBe('true');
    expect(screen.getByTestId('sync-error').textContent).toContain('daily Firestore free-tier quota was exceeded');
    expect(mockSyncToFirestore).toHaveBeenCalledTimes(1);

    // Subsequent edits and online reconnects must not hammer Firestore while in cooldown
    act(() => screen.getByTestId('add-goal').click());
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await new Promise(resolve => setTimeout(resolve, 750));
    expect(mockSyncToFirestore).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('sync-status').textContent).toBe('error');

    // Manual retrySync explicitly bypasses cooldown and succeeds when quota recovers
    mockSyncToFirestore.mockResolvedValueOnce({ syncVersion: 2, updatedAt: new Date().toISOString() });
    act(() => screen.getByTestId('retry-sync').click());
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('synced'));
    expect(mockSyncToFirestore).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('pending-sync').textContent).toBe('false');
  });

  it('queues edits while offline and merges concurrent offline + remote changes safely on reconnect', async () => {
    const baseDoc = createDefaultData();
    saveAccountData('user-offline', baseDoc);
    saveSyncBase('user-offline', baseDoc);

    render(
      <HabitProvider>
        <Harness />
      </HabitProvider>,
    );

    act(() => authCallback?.(makeUser('user-offline')));
    act(() => {
      firestoreListeners.get('user-offline')?.onNext({ data: baseDoc, fromCache: false, hasPendingWrites: false });
    });

    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    act(() => screen.getByTestId('add-goal').click());

    expect(screen.getByTestId('sync-status').textContent).toBe('offline');
    expect(mockSyncToFirestore).not.toHaveBeenCalled();

    const remoteUpdated = {
      ...baseDoc,
      goals: [
        {
          id: 'remote-g1',
          lifeAreaId: null,
          title: 'Remote Device Goal',
          outcome: '',
          targetDate: '',
          status: 'active' as const,
          createdAt: '2026-11-12T00:00:00.000Z',
        },
      ],
      updatedAt: '2026-11-12T01:00:00.000Z',
    };

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    act(() => {
      firestoreListeners.get('user-offline')?.onNext({ data: remoteUpdated, fromCache: false, hasPendingWrites: false });
    });

    await waitFor(() => expect(mockSyncToFirestore).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('synced'));
    expect(screen.getByTestId('goal-titles').textContent).toContain('Remote Device Goal');
    expect(screen.getByTestId('goal-titles').textContent).toContain('Goal 1');
  });

  it('isolates accounts cleanly on user switch without cross-account leakage', async () => {
    render(
      <HabitProvider>
        <Harness />
      </HabitProvider>,
    );

    act(() => authCallback?.(makeUser('user-a')));
    const userAData = createDefaultData();
    userAData.goals.push({
      id: 'ga1',
      lifeAreaId: null,
      title: 'Secret A',
      outcome: '',
      targetDate: '',
      status: 'active',
      createdAt: '2026-11-12T00:00:00.000Z',
    });
    act(() => {
      firestoreListeners.get('user-a')?.onNext({ data: userAData, fromCache: false, hasPendingWrites: false });
    });
    expect(screen.getByTestId('goal-titles').textContent).toBe('Secret A');

    act(() => authCallback?.(null));
    expect(screen.getByTestId('goal-titles').textContent).toBe('');
    expect(loadAccountData('user-a')).toBeNull();

    act(() => authCallback?.(makeUser('user-b')));
    expect(screen.getByTestId('goal-titles').textContent).toBe('');
    expect(mockSyncToFirestore).not.toHaveBeenCalled();
  });

  it('prompts conflict when guest is dirty even if cachedAccount previously existed on browser', async () => {
    const staleCache = createDefaultData();
    saveAccountData('user-returning', staleCache);

    render(
      <HabitProvider>
        <Harness />
      </HabitProvider>,
    );

    act(() => authCallback?.(null));
    act(() => screen.getByTestId('add-goal').click());

    act(() => authCallback?.(makeUser('user-returning')));
    const cloudDoc = createDefaultData();
    cloudDoc.goals.push({
      id: 'cloud-1',
      lifeAreaId: null,
      title: 'Cloud Goal',
      outcome: '',
      targetDate: '',
      status: 'active',
      createdAt: '2026-11-12T00:00:00.000Z',
    });
    act(() => {
      firestoreListeners.get('user-returning')?.onNext({ data: cloudDoc, fromCache: false, hasPendingWrites: false });
    });

    expect(screen.getByTestId('conflict-present').textContent).toBe('true');
    expect(screen.getByTestId('conflict-reason').textContent).toBe('guest-merge');

    act(() => screen.getByTestId('merge-conflict').click());

    await waitFor(() => expect(mockSyncToFirestore).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('conflict-present').textContent).toBe('false');
    expect(screen.getByTestId('goal-titles').textContent).toContain('Cloud Goal');
    expect(screen.getByTestId('goal-titles').textContent).toContain('Goal 1');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('syncs multi-tab localStorage updates from another tab without overwriting them', async () => {
    render(
      <HabitProvider>
        <Harness />
      </HabitProvider>,
    );

    act(() => authCallback?.(makeUser('user-tabs')));
    const initial = createDefaultData();
    act(() => {
      firestoreListeners.get('user-tabs')?.onNext({ data: initial, fromCache: false, hasPendingWrites: false });
    });

    const externalTabDoc = {
      ...initial,
      goals: [
        {
          id: 'tab2-g1',
          lifeAreaId: null,
          title: 'Other Tab Goal',
          outcome: '',
          targetDate: '',
          status: 'active' as const,
          createdAt: '2026-11-12T00:00:00.000Z',
        },
      ],
    };
    saveAccountData('user-tabs', externalTabDoc);
    saveSyncMeta('user-tabs', { pendingSync: false, lastSyncedAt: '2026-11-12T05:00:00.000Z', lastUpdatedByTab: 'external-tab' });

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: `${ACCOUNT_KEY_PREFIX}user-tabs`,
          newValue: JSON.stringify(externalTabDoc),
        }),
      );
    });

    expect(screen.getByTestId('goal-titles').textContent).toBe('Other Tab Goal');
  });

  describe('Safe account deletion lifecycle', () => {
    const hydrateUser = (uid: string, ageMs = 15_000) => {
      const user = makeUser(uid, ageMs);
      act(() => authCallback?.(user));
      const initial = createDefaultData();
      initial.goals.push({
        id: 'g-keep',
        lifeAreaId: null,
        title: 'User Goal',
        outcome: '',
        targetDate: '',
        status: 'active',
        createdAt: '2026-11-12T00:00:00.000Z',
      });
      act(() => {
        firestoreListeners.get(uid)?.onNext({ data: initial, fromCache: false, hasPendingWrites: false });
      });
      return user;
    };

    it('1. executes successful account deletion, unsubscribes listeners, wipes caches, and records completion notice', async () => {
      const callOrder: string[] = [];
      mockDeleteUserWorkspaceDoc.mockImplementation(async () => {
        callOrder.push('firestore');
        return { deletedSubcollectionDocs: 2, deletedRootDoc: true };
      });
      mockDeleteUser.mockImplementation(async () => {
        callOrder.push('auth');
      });

      render(
        <HabitProvider>
          <Harness />
        </HabitProvider>,
      );

      const user = hydrateUser('user-del');
      const initialListener = firestoreListeners.get('user-del')!;

      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });

      expect(initialListener.unsubscribed).toBe(true);
      expect(mockReauthenticateWithPopup).not.toHaveBeenCalled();
      expect(callOrder).toEqual(['firestore', 'auth']);
      expect(mockDeleteUserWorkspaceDoc).toHaveBeenCalledWith('user-del');
      expect(mockDeleteUser).toHaveBeenCalledWith(user);
      expect(loadAccountData('user-del')).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(screen.getByTestId('user-uid').textContent).toBe('guest');
      expect(screen.getByTestId('sync-status').textContent).toBe('local');
      expect(screen.getByTestId('deletion-phase').textContent).toBe('completed');
      expect(screen.getByTestId('account-notice').textContent).toContain('permanently deleted');
    });

    it('2a. proactively reauthenticates stale sessions BEFORE touching Firestore workspace', async () => {
      const events: string[] = [];
      mockReauthenticateWithPopup.mockImplementation(async () => {
        events.push('reauth');
      });
      mockDeleteUserWorkspaceDoc.mockImplementation(async () => {
        events.push('firestore');
        return { deletedSubcollectionDocs: 0, deletedRootDoc: true };
      });
      mockDeleteUser.mockImplementation(async () => {
        events.push('auth');
      });

      render(
        <HabitProvider>
          <Harness />
        </HabitProvider>,
      );

      hydrateUser('user-stale', 15 * 60 * 1000);

      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });

      expect(events).toEqual(['reauth', 'firestore', 'auth']);
      expect(screen.getByTestId('deletion-phase').textContent).toBe('completed');
    });

    it('2b. handles server auth/requires-recent-login fallback defensively', async () => {
      mockDeleteUser
        .mockRejectedValueOnce({ code: 'auth/requires-recent-login' })
        .mockResolvedValueOnce(undefined);

      render(
        <HabitProvider>
          <Harness />
        </HabitProvider>,
      );

      hydrateUser('user-skew', 15_000);

      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });

      expect(mockReauthenticateWithPopup).toHaveBeenCalledTimes(1);
      expect(mockDeleteUser).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('deletion-phase').textContent).toBe('completed');
      expect(loadAccountData('user-skew')).toBeNull();
    });

    it('3. preserves all Firestore and local data and restores sync when user cancels reauthentication', async () => {
      const errors: Error[] = [];
      mockReauthenticateWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });

      render(
        <HabitProvider>
          <Harness onDeleteError={e => errors.push(e)} />
        </HabitProvider>,
      );

      hydrateUser('user-cancel', 15 * 60 * 1000);
      const listenerBefore = firestoreListeners.get('user-cancel')!;

      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });

      expect(errors[0]?.message).toContain('Reauthentication was cancelled');
      expect(mockDeleteUserWorkspaceDoc).not.toHaveBeenCalled();
      expect(mockDeleteUser).not.toHaveBeenCalled();
      expect(listenerBefore.unsubscribed).toBe(true);
      // Resumed new listener and preserved user workspace + sync
      const resumedListener = firestoreListeners.get('user-cancel')!;
      expect(resumedListener).not.toBe(listenerBefore);
      expect(resumedListener.unsubscribed).toBe(false);
      expect(loadAccountData('user-cancel')?.goals[0].title).toBe('User Goal');
      expect(screen.getByTestId('user-uid').textContent).toBe('user-cancel');
      expect(screen.getByTestId('deletion-phase').textContent).toBe('idle');

      // Normal sync works again after abort
      act(() => screen.getByTestId('add-goal').click());
      await waitFor(() => expect(mockSyncToFirestore).toHaveBeenCalledTimes(1));
    });

    it('4. preserves all data and restores sync when reauthentication fails', async () => {
      const errors: Error[] = [];
      mockReauthenticateWithPopup.mockRejectedValueOnce({ code: 'auth/user-mismatch' });

      render(
        <HabitProvider>
          <Harness onDeleteError={e => errors.push(e)} />
        </HabitProvider>,
      );

      hydrateUser('user-reauth-fail', 15 * 60 * 1000);

      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });

      expect(errors[0]?.message).toContain('same Google account');
      expect(mockDeleteUserWorkspaceDoc).not.toHaveBeenCalled();
      expect(mockDeleteUser).not.toHaveBeenCalled();
      expect(loadAccountData('user-reauth-fail')?.goals[0].title).toBe('User Goal');
      expect(screen.getByTestId('deletion-phase').textContent).toBe('idle');
    });

    it('5. halts before deleting Auth, keeps local backup, and blocks sync when Firestore deletion fails', async () => {
      const errors: Error[] = [];
      mockDeleteUserWorkspaceDoc.mockRejectedValueOnce(
        new WorkspaceDeletionError('permission-denied', {
          path: 'users/user-fs-fail/tasks',
          partial: true,
          deletedSubcollectionDocs: 2,
        }),
      );

      render(
        <HabitProvider>
          <Harness onDeleteError={e => errors.push(e)} />
        </HabitProvider>,
      );

      hydrateUser('user-fs-fail');

      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });

      expect(errors[0]?.message).toContain('users/user-fs-fail/tasks');
      expect(mockDeleteUser).not.toHaveBeenCalled();
      expect(loadAccountData('user-fs-fail')?.goals[0].title).toBe('User Goal');
      expect(screen.getByTestId('deletion-phase').textContent).toBe('partial-failure');
      expect(screen.getByTestId('sync-status').textContent).toBe('error');

      // Ensure retrySync or updates do not resurrect deleted docs while in partial-failure lock
      act(() => screen.getByTestId('retry-sync').click());
      act(() => screen.getByTestId('add-goal').click());
      await new Promise(r => setTimeout(r, 50));
      expect(mockSyncToFirestore).not.toHaveBeenCalled();
    });

    it('6. handles Auth deletion failure explicitly without clearing local backup or resurrecting Firestore', async () => {
      const errors: Error[] = [];
      mockDeleteUser.mockRejectedValueOnce({ code: 'auth/network-request-failed' });

      render(
        <HabitProvider>
          <Harness onDeleteError={e => errors.push(e)} />
        </HabitProvider>,
      );

      hydrateUser('user-auth-fail');

      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });

      expect(mockDeleteUserWorkspaceDoc).toHaveBeenCalledTimes(1);
      expect(errors[0]?.message).toContain('Cloud workspace was deleted');
      expect(loadAccountData('user-auth-fail')).not.toBeNull();
      expect(screen.getByTestId('deletion-phase').textContent).toBe('partial-failure');
      expect(screen.getByTestId('user-uid').textContent).toBe('user-auth-fail');

      act(() => {
        window.dispatchEvent(new Event('online'));
        screen.getByTestId('retry-sync').click();
      });
      await new Promise(r => setTimeout(r, 50));
      expect(mockSyncToFirestore).not.toHaveBeenCalled();
    });

    it('7. ignores snapshot listener null/resurrection events fired while deletion is running', async () => {
      let releaseFsDelete: () => void = () => {};
      mockDeleteUserWorkspaceDoc.mockImplementationOnce(
        () =>
          new Promise<{ deletedSubcollectionDocs: number; deletedRootDoc: boolean }>(resolve => {
            releaseFsDelete = () => resolve({ deletedSubcollectionDocs: 1, deletedRootDoc: true });
          }),
      );

      render(
        <HabitProvider>
          <Harness />
        </HabitProvider>,
      );

      hydrateUser('user-snap-race');
      const capturedListener = firestoreListeners.get('user-snap-race')!;

      act(() => {
        screen.getByTestId('delete-account-btn').click();
      });

      expect(capturedListener.unsubscribed).toBe(true);

      // Even if SDK dispatches an already-queued null snapshot event during deletion, it must NOT trigger flushCloudWrite
      act(() => {
        capturedListener.onNext({ data: null, fromCache: false, hasPendingWrites: false });
      });
      expect(mockSyncToFirestore).not.toHaveBeenCalled();

      await act(async () => {
        releaseFsDelete();
      });

      expect(mockSyncToFirestore).not.toHaveBeenCalled();
      expect(screen.getByTestId('deletion-phase').textContent).toBe('completed');
    });

    it('8. cancels pending debounced writes and drains in-flight sync before deletion without trailing resurrection', async () => {
      let releaseInFlight!: () => void;
      mockSyncToFirestore.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            releaseInFlight = resolve;
          }),
      );

      const events: string[] = [];
      mockDeleteUserWorkspaceDoc.mockImplementation(async () => {
        events.push('delete-fs');
        return { deletedSubcollectionDocs: 0, deletedRootDoc: true };
      });

      render(
        <HabitProvider>
          <Harness />
        </HabitProvider>,
      );

      hydrateUser('user-pending');

      // Trigger first write and flush via retrySync so syncToFirestore is mid-flight
      act(() => screen.getByTestId('add-goal').click());
      act(() => screen.getByTestId('retry-sync').click());
      await waitFor(() => expect(mockSyncToFirestore).toHaveBeenCalledTimes(1));

      // Queue another debounced edit on top
      act(() => screen.getByTestId('add-goal').click());
      expect(loadSyncMeta('user-pending').pendingSync).toBe(true);

      act(() => {
        screen.getByTestId('delete-account-btn').click();
      });

      // Firestore deletion waits for in-flight write to finish rather than racing with it
      expect(events).toEqual([]);

      await act(async () => {
        releaseInFlight();
      });

      await waitFor(() => expect(screen.getByTestId('deletion-phase').textContent).toBe('completed'));
      expect(events).toEqual(['delete-fs']);
      // Debounced write must never execute after deletion began
      await new Promise(r => setTimeout(r, 750));
      expect(mockSyncToFirestore).toHaveBeenCalledTimes(1);
    });

    it('9. supports idempotent retry after partial failure to complete full cleanup', async () => {
      const errors: Error[] = [];
      mockDeleteUser
        .mockRejectedValueOnce({ code: 'auth/network-request-failed' })
        .mockResolvedValueOnce(undefined);

      render(
        <HabitProvider>
          <Harness onDeleteError={e => errors.push(e)} />
        </HabitProvider>,
      );

      hydrateUser('user-partial-retry');

      // First attempt: Firestore deleted, Auth fails
      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });
      expect(errors).toHaveLength(1);
      expect(screen.getByTestId('deletion-phase').textContent).toBe('partial-failure');
      expect(loadAccountData('user-partial-retry')).not.toBeNull();

      // Retry deletion: succeeds cleanly
      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });

      expect(mockDeleteUserWorkspaceDoc).toHaveBeenCalledTimes(2);
      expect(mockDeleteUser).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('deletion-phase').textContent).toBe('completed');
      expect(loadAccountData('user-partial-retry')).toBeNull();
    });

    it('10. prevents workspace resurrection on edits, retries, online events, or late auth ticks after deletion', async () => {
      render(
        <HabitProvider>
          <Harness />
        </HabitProvider>,
      );

      const user = hydrateUser('user-no-resurrect');

      await act(async () => {
        screen.getByTestId('delete-account-btn').click();
      });
      expect(screen.getByTestId('deletion-phase').textContent).toBe('completed');

      act(() => {
        screen.getByTestId('add-goal').click();
        screen.getByTestId('retry-sync').click();
        window.dispatchEvent(new Event('online'));
        authCallback?.(user);
      });

      await new Promise(r => setTimeout(r, 750));
      expect(mockSyncToFirestore).not.toHaveBeenCalled();
      expect(screen.getByTestId('user-uid').textContent).toBe('guest');
    });

    it('displays honest error/retry feedback in SettingsModal and success notice in SignInPage', async () => {
      mockDeleteUser.mockRejectedValueOnce({ code: 'auth/network-request-failed' }).mockResolvedValueOnce(undefined);
      const onClose = vi.fn();
      const onOpenSignIn = vi.fn();

      render(
        <HabitProvider>
          <SettingsModal onClose={onClose} onOpenSignIn={onOpenSignIn} />
          <SignInPage onContinueLocal={vi.fn()} />
        </HabitProvider>,
      );

      hydrateUser('user-ui-del');

      fireEvent.click(screen.getByRole('button', { name: /delete cloud account/i }));
      fireEvent.change(screen.getByPlaceholderText(/type delete to confirm/i), { target: { value: 'DELETE' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }));
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toContain('Cloud workspace was deleted');
      const retryBtn = screen.getByRole('button', { name: /retry permanent deletion/i });

      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(onOpenSignIn).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/cloud account and workspace data were permanently deleted/i)).toBeTruthy();
    });

    it('11. suspends cloud listeners and clears local workspace cleanly on cross-tab deletion broadcast', async () => {
      render(
        <HabitProvider>
          <Harness />
        </HabitProvider>,
      );

      hydrateUser('user-cross-tab');
      const activeListener = firestoreListeners.get('user-cross-tab')!;
      expect(activeListener.unsubscribed).toBe(false);

      localStorage.setItem(
        ACCOUNT_DELETION_STATE_KEY,
        JSON.stringify({ uid: 'user-cross-tab', phase: 'deleted', updatedAt: new Date().toISOString() }),
      );
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: ACCOUNT_DELETION_STATE_KEY,
            newValue: localStorage.getItem(ACCOUNT_DELETION_STATE_KEY),
          }),
        );
      });

      expect(activeListener.unsubscribed).toBe(true);
      expect(loadAccountData('user-cross-tab')).toBeNull();
      expect(screen.getByTestId('user-uid').textContent).toBe('guest');
      expect(screen.getByTestId('deletion-phase').textContent).toBe('completed');
    });
  });

  describe('Transactional conflict resolution, active-project picker & schema v4 protection', () => {
    it('auto-merges concurrent SyncConflictError via three-way merge and retries atomically', async () => {
      const baseDoc = createDefaultData();
      saveSyncBase('user-occ', baseDoc);

      const remoteDoc: AppData = {
        ...baseDoc,
        syncVersion: 2,
        goals: [
          {
            id: 'g-remote',
            lifeAreaId: null,
            title: 'Remote Device Goal',
            outcome: '',
            targetDate: '',
            status: 'active',
            createdAt: '2026-11-12T00:00:00.000Z',
          },
        ],
      };

      mockSyncToFirestore
        .mockRejectedValueOnce(
          new SyncConflictError('version mismatch', { remoteData: remoteDoc, expectedVersion: 1, actualVersion: 2 }),
        )
        .mockResolvedValueOnce({ syncVersion: 3, updatedAt: '2026-11-14T01:00:00.000Z' });

      render(
        <HabitProvider>
          <Harness />
        </HabitProvider>,
      );

      act(() => authCallback?.(makeUser('user-occ')));
      act(() => {
        firestoreListeners.get('user-occ')?.onNext({ data: baseDoc, syncVersion: 1, fromCache: false, hasPendingWrites: false } as never);
      });

      act(() => screen.getByTestId('add-goal').click());
      act(() => screen.getByTestId('retry-sync').click());

      await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('synced'));
      expect(mockSyncToFirestore).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('goal-titles').textContent).toContain('Remote Device Goal');
      expect(screen.getByTestId('goal-titles').textContent).toContain('Goal 1');
    });

    it('prompts ConflictModal project picker when merged active projects exceed 3 and preserves user selection', async () => {
      const makeProj = (id: string, title: string) => ({
        id,
        goalId: null,
        title,
        description: '',
        dueDate: '',
        status: 'active' as const,
        createdAt: '2026-11-12T00:00:00.000Z',
      });

      const baseDoc = { ...createDefaultData(), projects: [makeProj('p1', 'Alpha')] };
      const localEdited = { ...baseDoc, projects: [makeProj('p1', 'Alpha'), makeProj('p2', 'Beta'), makeProj('p3', 'Gamma')] };
      const remoteDoc = { ...baseDoc, syncVersion: 2, projects: [makeProj('p1', 'Alpha'), makeProj('p4', 'Delta')] };

      saveAccountData('user-cap', localEdited);
      saveSyncBase('user-cap', baseDoc);
      saveSyncMeta('user-cap', { pendingSync: true, lastSyncedAt: null, remoteSyncVersion: 1 });

      function HarnessWithModal() {
        const ctx = useHabits();
        return (
          <>
            <Harness />
            {ctx.conflict && <ConflictModal conflict={ctx.conflict} onResolve={ctx.resolveConflict} />}
          </>
        );
      }

      render(
        <HabitProvider>
          <HarnessWithModal />
        </HabitProvider>,
      );

      act(() => authCallback?.(makeUser('user-cap')));
      act(() => {
        firestoreListeners.get('user-cap')?.onNext({ data: remoteDoc, syncVersion: 2, fromCache: false, hasPendingWrites: false } as never);
      });

      expect(screen.getByTestId('conflict-reason').textContent).toBe('active-project-limit');
      expect(screen.getByText('3 / 3 selected')).toBeTruthy();

      // Candidates are ordered remote-first ([Alpha, Delta, Beta, Gamma]), so Alpha, Delta, Beta are initially checked.
      // Uncheck Alpha and check Gamma so Beta, Delta, Gamma remain active.
      fireEvent.click(screen.getByLabelText('Alpha'));
      fireEvent.click(screen.getByLabelText('Gamma'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /merge with selected/i }));
      });

      await waitFor(() => expect(screen.getByTestId('conflict-present').textContent).toBe('false'));
      const activeList = screen.getByTestId('active-projects').textContent?.split(',') ?? [];
      expect(activeList.sort()).toEqual(['Beta', 'Delta', 'Gamma']);
    });

    it('locks writes and exports v4 recovery backup safely when remote workspace uses schema v4', async () => {
      mockLoadV4BundleFromFirestore.mockResolvedValueOnce({
        meta: { schemaVersion: 4, migrationStatus: 'completed', updatedAt: '2026-11-14T00:00:00.000Z' },
        lifeAreas: [],
        goals: [
          { id: 'v4-g1', lifeAreaId: null, title: 'V4 Goal', outcome: '', targetDate: '', status: 'active', createdAt: '2026-11-14T00:00:00.000Z' },
        ],
        projects: [],
        tasks: [],
        habits: [],
        habitLogMonths: [],
        dailyPlans: [],
        dailyReviews: [],
      });

      render(
        <HabitProvider>
          <Harness />
        </HabitProvider>,
      );

      act(() => authCallback?.(makeUser('user-v4')));
      act(() => {
        firestoreListeners.get('user-v4')?.onNext({
          data: null,
          incompatibleSchema: 4,
          v4Meta: { schemaVersion: 4, migrationStatus: 'completed', updatedAt: '2026-11-14T00:00:00.000Z' },
          fromCache: false,
          hasPendingWrites: false,
        } as never);
      });

      expect(screen.getByTestId('incompatible-schema').textContent).toBe('4');
      expect(screen.getByTestId('sync-status').textContent).toBe('error');

      // Mutating locally must remain blocked and must NOT attempt cloud overwrite
      act(() => screen.getByTestId('add-goal').click());
      expect(screen.getByTestId('goal-titles').textContent).toBe('');
      expect(mockSyncToFirestore).not.toHaveBeenCalled();

      await act(async () => {
        screen.getByTestId('export-recovery-btn').click();
      });

      expect(mockLoadV4BundleFromFirestore).toHaveBeenCalledTimes(1);
      expect(mockExportData).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaVersion: 3,
          goals: [expect.objectContaining({ id: 'v4-g1', title: 'V4 Goal' })],
        }),
      );
    });
  });
});

