import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  deleteUser,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getAuthErrorCode, getReadableAuthError } from '../utils/authErrors';
import type {
  AccountDeletionPhase,
  AppData,
  EffectiveEntitlement,
  Project,
  SyncStatus,
  WorkspaceMetaV4,
  WorkspaceSummary,
} from '../types';
import { auth, db } from '../services/firebase';
import {
  ACCOUNT_DELETION_STATE_KEY,
  ACCOUNT_KEY_PREFIX,
  applySelectedActiveProjects,
  clearAccountStorage,
  clearDeletionBroadcast,
  clearGuestWorkspace,
  computeWorkspaceHash,
  consumeLoadWarning,
  createDefaultData,
  exportData,
  hasMeaningfulWorkspaceData,
  isGuestDirty,
  loadAccountData,
  loadData,
  loadSyncBase,
  loadSyncMeta,
  mergeWorkspaceDataDetailed,
  readDeletionBroadcast,
  sanitizeAppData,
  saveAccountData,
  saveData as saveLocalWorkspace,
  saveSyncBase,
  saveSyncMeta,
  setGuestDirty,
  STORAGE_KEY,
  summarizeWorkspace,
  SYNC_META_PREFIX,
  threeWayMergeWorkspaceDetailed,
  writeDeletionBroadcast,
} from '../services/appStore';
import { DEFAULT_FREE_ENTITLEMENT, subscribeToEntitlement } from '../services/entitlementService';
import { loadV4BundleFromFirestore, reconstructV3FromV4 } from '../services/migrationV4';
import * as sync from '../services/syncService';

export interface ConflictState {
  reason: 'guest-merge' | 'offline-divergence' | 'active-project-limit';
  localSummary: WorkspaceSummary;
  cloudSummary: WorkspaceSummary;
  activeProjectCandidates?: Project[];
}

type PendingConflict = {
  reason: 'guest-merge' | 'offline-divergence' | 'active-project-limit';
  localData: AppData;
  cloudData: AppData;
  activeProjectCandidates?: Project[];
};

type HabitContextValue = {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  saveData: (next: AppData) => void;
  user: User | null;
  authReady: boolean;
  syncStatus: SyncStatus;
  syncError: string;
  lastSyncedAt: string | null;
  pendingSync: boolean;
  conflict: ConflictState | null;
  entitlement: EffectiveEntitlement;
  deletionPhase: AccountDeletionPhase;
  incompatibleSchema: number | null;
  exportRecoveryBackup: () => Promise<void>;
  accountNotice: string;
  clearAccountNotice: () => void;
  resolveConflict: (
    strategy: 'keep-cloud' | 'use-local' | 'merge',
    selectedActiveProjectIds?: readonly string[],
  ) => Promise<void>;
  retrySync: () => Promise<void>;
  signIn: () => Promise<unknown>;
  signOut: (options?: { force?: boolean }) => Promise<void>;
  deleteAccount: () => Promise<void>;
  storageNotice: string;
  authNotice: string;
};

export const HabitContext = createContext<HabitContextValue | undefined>(undefined);

const SYNC_DEBOUNCE_MS = 650;
const RECENT_AUTH_MAX_AGE_MS = 2 * 60 * 1000;
const MAX_CONFLICT_RETRIES = 2;

function isSessionConfirmedRecent(user: User): boolean {
  const raw = user.metadata?.lastSignInTime;
  if (!raw) return false;
  const signedInMs = Date.parse(raw);
  if (!Number.isFinite(signedInMs)) return false;
  const ageMs = Date.now() - signedInMs;
  return ageMs >= 0 && ageMs < RECENT_AUTH_MAX_AGE_MS;
}

function formatFriendlySyncError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (typeof parsed.error === 'string') {
      if (parsed.error.toLowerCase().includes('permission') || parsed.error.toLowerCase().includes('insufficient')) {
        return 'Cloud sync was rejected by Firestore permissions. Your changes are safe locally.';
      }
      return parsed.error;
    }
  } catch {
    // Plain error string
  }
  return raw || 'Cloud synchronization failed. Your changes remain saved on this device.';
}

export const HabitProvider = ({ children }: { children: React.ReactNode }) => {
  const [data, setData] = useState<AppData>(() => loadData());
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [syncError, setSyncError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [entitlement, setEntitlement] = useState<EffectiveEntitlement>(DEFAULT_FREE_ENTITLEMENT);
  const [deletionPhase, setDeletionPhase] = useState<AccountDeletionPhase>('idle');
  const [incompatibleSchema, setIncompatibleSchema] = useState<number | null>(null);
  const [accountNotice, setAccountNotice] = useState('');
  const [storageError, setStorageError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [recoveryWarning] = useState(() => consumeLoadWarning());

  const dataRef = useRef<AppData>(data);
  dataRef.current = data;

  const userRef = useRef<User | null>(user);
  userRef.current = user;

  const lastSyncedAtRef = useRef<string | null>(lastSyncedAt);
  lastSyncedAtRef.current = lastSyncedAt;

  const syncStatusRef = useRef<SyncStatus>(syncStatus);
  syncStatusRef.current = syncStatus;

  const tabIdRef = useRef(`tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const sessionGenRef = useRef(0);
  const writeSeqRef = useRef(0);
  const syncTimerRef = useRef<number | null>(null);
  const inFlightSyncRef = useRef<Promise<void> | null>(null);
  const lastSyncedHashRef = useRef<string | null>(null);
  const lastKnownRemoteVersionRef = useRef<number | null>(null);
  const pendingConflictRef = useRef<PendingConflict | null>(null);
  const incompatibleMetaRef = useRef<WorkspaceMetaV4 | null>(null);

  const unsubscribeFirestoreRef = useRef<(() => void) | null>(null);
  const unsubscribeEntitlementRef = useRef<(() => void) | null>(null);
  const isDeletingRef = useRef(false);
  const deletionLockUidRef = useRef<string | null>(null);
  const deletedUidsRef = useRef<Set<string>>(new Set());

  const isCloudWriteBlocked = useCallback((uid?: string | null) => {
    if (isDeletingRef.current || incompatibleMetaRef.current !== null) return true;
    if (!uid) return false;
    if (deletionLockUidRef.current === uid || deletedUidsRef.current.has(uid)) return true;
    const broadcast = readDeletionBroadcast();
    return Boolean(broadcast && broadcast.uid === uid && broadcast.phase !== 'partial-failure');
  }, []);

  const clearDebounce = () => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  };

  const suspendCloudListeners = useCallback(() => {
    clearDebounce();
    sessionGenRef.current += 1;
    unsubscribeFirestoreRef.current?.();
    unsubscribeFirestoreRef.current = null;
    unsubscribeEntitlementRef.current?.();
    unsubscribeEntitlementRef.current = null;
  }, []);

  const persistLocalScoped = useCallback(
    (uid: string | null, next: AppData, isPending: boolean, syncedAt: string | null, remoteVersion?: number | null) => {
      try {
        if (uid) {
          saveAccountData(uid, next);
          saveSyncMeta(uid, {
            pendingSync: isPending,
            lastSyncedAt: syncedAt,
            lastUpdatedByTab: tabIdRef.current,
            remoteSyncVersion: remoteVersion === undefined ? lastKnownRemoteVersionRef.current : remoteVersion,
          });
        } else {
          saveLocalWorkspace(next);
        }
        setStorageError('');
      } catch (error) {
        console.error('Could not save InPursuit data locally', error);
        setStorageError('Changes are visible but could not be saved on this device. Export a backup or free local storage.');
      }
    },
    [],
  );

  const openConflictPrompt = useCallback(
    (
      uid: string,
      reason: PendingConflict['reason'],
      localData: AppData,
      cloudData: AppData,
      activeProjectCandidates?: Project[],
      syncCloudToState = false,
    ) => {
      pendingConflictRef.current = {
        reason,
        localData,
        cloudData,
        activeProjectCandidates,
      };
      if (syncCloudToState) {
        dataRef.current = cloudData;
        setData(cloudData);
        lastSyncedHashRef.current = computeWorkspaceHash(cloudData);
        saveSyncBase(uid, cloudData);
        persistLocalScoped(
          uid,
          cloudData,
          false,
          cloudData.updatedAt ?? new Date().toISOString(),
          lastKnownRemoteVersionRef.current,
        );
      }
      setConflict({
        reason,
        localSummary: summarizeWorkspace(localData),
        cloudSummary: summarizeWorkspace(cloudData),
        activeProjectCandidates,
      });
      setSyncStatus('conflict');
      setSyncError('');
    },
    [persistLocalScoped],
  );

  const flushCloudWrite = useCallback(
    async (uid: string, sessionGen: number, expectedSeq?: number) => {
      if (sessionGen !== sessionGenRef.current || isCloudWriteBlocked(uid)) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSyncStatus('offline');
        setPendingSync(true);
        setSyncError('');
        return;
      }

      const runSync = async () => {
        if (sessionGen !== sessionGenRef.current || isCloudWriteBlocked(uid)) return;
        clearDebounce();

        for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
          if (sessionGen !== sessionGenRef.current || isCloudWriteBlocked(uid)) return;
          const attemptSeq = attempt === 0 && expectedSeq !== undefined ? expectedSeq : writeSeqRef.current;
          const snapshotData = dataRef.current;
          const snapshotHash = computeWorkspaceHash(snapshotData);
          const currentMeta = loadSyncMeta(uid);

          // Avoid redundant Firestore writes when data content is already identical to last confirmed sync
          if (lastSyncedHashRef.current && lastSyncedHashRef.current === snapshotHash && !currentMeta.pendingSync) {
            setSyncStatus('synced');
            setPendingSync(false);
            setSyncError('');
            return;
          }

          setSyncStatus('syncing');
          setSyncError('');

          try {
            const writeResult = await sync.syncToFirestore(uid, snapshotData, {
              expectedSyncVersion: lastKnownRemoteVersionRef.current,
            });
            if (sessionGen !== sessionGenRef.current || isCloudWriteBlocked(uid)) return;

            const confirmedVersion =
              writeResult && typeof writeResult.syncVersion === 'number'
                ? writeResult.syncVersion
                : lastKnownRemoteVersionRef.current !== null
                  ? lastKnownRemoteVersionRef.current + 1
                  : 1;

            lastKnownRemoteVersionRef.current = confirmedVersion;
            lastSyncedHashRef.current = snapshotHash;
            saveSyncBase(uid, snapshotData);

            if (writeSeqRef.current === attemptSeq) {
              const syncedTime = writeResult?.updatedAt || new Date().toISOString();
              saveSyncMeta(uid, {
                pendingSync: false,
                lastSyncedAt: syncedTime,
                lastUpdatedByTab: tabIdRef.current,
                remoteSyncVersion: confirmedVersion,
              });
              setPendingSync(false);
              setLastSyncedAt(syncedTime);
              setSyncStatus('synced');
              setSyncError('');
            } else {
              // Another edit happened while this write was in flight; schedule follow-up flush.
              void flushCloudWrite(uid, sessionGen, writeSeqRef.current);
            }
            return;
          } catch (error) {
            if (sessionGen !== sessionGenRef.current || isCloudWriteBlocked(uid)) return;

            if (error instanceof sync.IncompatibleSchemaError) {
              incompatibleMetaRef.current = error.meta;
              setIncompatibleSchema(error.schemaVersion);
              setSyncStatus('error');
              setSyncError(
                `This cloud account uses schema v${error.schemaVersion}. Syncing is locked to protect your cloud data—export a recovery backup below.`,
              );
              return;
            }

            if (error instanceof sync.SyncConflictError) {
              const baseSnapshot = loadSyncBase(uid);
              if (baseSnapshot && attempt < MAX_CONFLICT_RETRIES) {
                const mergedResult = threeWayMergeWorkspaceDetailed(baseSnapshot, dataRef.current, error.remoteData, true);
                if (mergedResult.exceedsProjectLimit) {
                  lastKnownRemoteVersionRef.current = error.actualVersion;
                  openConflictPrompt(
                    uid,
                    'active-project-limit',
                    dataRef.current,
                    error.remoteData,
                    mergedResult.activeProjects,
                  );
                  return;
                }
                writeSeqRef.current += 1;
                dataRef.current = mergedResult.data;
                setData(mergedResult.data);
                lastKnownRemoteVersionRef.current = error.actualVersion;
                lastSyncedHashRef.current = computeWorkspaceHash(error.remoteData);
                saveSyncBase(uid, error.remoteData);
                persistLocalScoped(
                  uid,
                  mergedResult.data,
                  true,
                  lastSyncedAtRef.current,
                  error.actualVersion,
                );
                setPendingSync(true);
                continue;
              }

              // Exhausted automatic conflict retries or missing base snapshot: ask user explicitly
              lastKnownRemoteVersionRef.current = error.actualVersion;
              const detailed = mergeWorkspaceDataDetailed(error.remoteData, dataRef.current);
              openConflictPrompt(
                uid,
                'offline-divergence',
                dataRef.current,
                error.remoteData,
                detailed.exceedsProjectLimit ? detailed.activeProjects : undefined,
              );
              return;
            }

            const offline = sync.isOfflineError(error);
            saveSyncMeta(uid, {
              pendingSync: true,
              lastSyncedAt: lastSyncedAtRef.current,
              lastUpdatedByTab: tabIdRef.current,
              remoteSyncVersion: lastKnownRemoteVersionRef.current,
            });
            setPendingSync(true);
            if (offline) {
              setSyncStatus('offline');
              setSyncError('');
            } else {
              setSyncStatus('error');
              setSyncError(formatFriendlySyncError(error));
            }
            return;
          }
        }
      };

      const previous = inFlightSyncRef.current;
      const nextPromise = (previous ? previous.catch(() => {}) : Promise.resolve()).then(runSync);
      inFlightSyncRef.current = nextPromise;
      await nextPromise;
    },
    [isCloudWriteBlocked, openConflictPrompt, persistLocalScoped],
  );

  const scheduleCloudSync = useCallback(
    (uid: string, seq: number) => {
      clearDebounce();
      if (isCloudWriteBlocked(uid)) return;
      const sessionGen = sessionGenRef.current;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSyncStatus('offline');
        return;
      }
      setSyncStatus('syncing');
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        if (!isCloudWriteBlocked(uid)) {
          void flushCloudWrite(uid, sessionGen, seq);
        }
      }, SYNC_DEBOUNCE_MS);
    },
    [flushCloudWrite, isCloudWriteBlocked],
  );

  const attachCloudSubscriptions = useCallback(
    (uid: string, options: { candidateGuestData: AppData | null; cachedAccount: AppData | null; sessionGen: number }) => {
      const { candidateGuestData, cachedAccount, sessionGen } = options;
      if (isCloudWriteBlocked(uid) || sessionGen !== sessionGenRef.current) return;

      unsubscribeFirestoreRef.current?.();
      unsubscribeEntitlementRef.current?.();

      let initialHydrationDone = false;

      unsubscribeEntitlementRef.current = subscribeToEntitlement(uid, nextEntitlement => {
        if (sessionGen !== sessionGenRef.current || isCloudWriteBlocked(uid)) return;
        setEntitlement(nextEntitlement);
      });

      unsubscribeFirestoreRef.current = sync.subscribeToFirestore(
        uid,
        event => {
          if (sessionGen !== sessionGenRef.current || isDeletingRef.current || deletionLockUidRef.current === uid || deletedUidsRef.current.has(uid)) {
            return;
          }

          if (event.incompatibleSchema && event.incompatibleSchema >= 4) {
            initialHydrationDone = true;
            incompatibleMetaRef.current = event.v4Meta ?? {
              schemaVersion: 4,
              migrationStatus: 'completed',
              updatedAt: new Date().toISOString(),
            };
            clearDebounce();
            setIncompatibleSchema(event.incompatibleSchema);
            setPendingSync(false);
            setSyncStatus('error');
            setSyncError(
              `Your cloud workspace uses schema v${event.incompatibleSchema}, which requires a v4-capable app. Writes are locked to protect your data—export a recovery backup below.`,
            );
            return;
          }

          if (incompatibleMetaRef.current !== null) return;

          if (event.data && typeof event.syncVersion === 'number' && !event.fromCache) {
            lastKnownRemoteVersionRef.current = event.syncVersion;
          }

          const shouldPromptGuestConflict =
            !initialHydrationDone &&
            candidateGuestData &&
            event.data &&
            !event.fromCache &&
            (isGuestDirty() || (!cachedAccount && computeWorkspaceHash(candidateGuestData) !== computeWorkspaceHash(event.data)));

          if (shouldPromptGuestConflict && candidateGuestData && event.data) {
            initialHydrationDone = true;
            const detailed = mergeWorkspaceDataDetailed(event.data, candidateGuestData);
            openConflictPrompt(
              uid,
              'guest-merge',
              candidateGuestData,
              event.data,
              detailed.exceedsProjectLimit ? detailed.activeProjects : undefined,
              true,
            );
            return;
          }

          if (pendingConflictRef.current) return;

          if (event.data) {
            const currentMeta = loadSyncMeta(uid);
            const remoteHash = computeWorkspaceHash(event.data);
            const localHash = computeWorkspaceHash(dataRef.current);
            const hasLocalUnsyncedWork =
              currentMeta.pendingSync || syncTimerRef.current !== null || inFlightSyncRef.current !== null;

            if (hasLocalUnsyncedWork) {
              initialHydrationDone = true;
              if (event.fromCache) return;

              if (localHash === remoteHash) {
                lastSyncedHashRef.current = remoteHash;
                saveSyncBase(uid, event.data);
                persistLocalScoped(
                  uid,
                  event.data,
                  false,
                  event.data.updatedAt ?? new Date().toISOString(),
                  event.syncVersion ?? lastKnownRemoteVersionRef.current,
                );
                setPendingSync(false);
                setLastSyncedAt(event.data.updatedAt ?? new Date().toISOString());
                setSyncStatus('synced');
                setSyncError('');
                return;
              }

              const baseSnapshot = loadSyncBase(uid);
              if (baseSnapshot) {
                const baseHash = computeWorkspaceHash(baseSnapshot);
                if (baseHash === remoteHash) {
                  void flushCloudWrite(uid, sessionGen);
                  return;
                }
                const mergedResult = threeWayMergeWorkspaceDetailed(baseSnapshot, dataRef.current, event.data, true);
                if (mergedResult.exceedsProjectLimit) {
                  openConflictPrompt(
                    uid,
                    'active-project-limit',
                    dataRef.current,
                    event.data,
                    mergedResult.activeProjects,
                  );
                  return;
                }
                writeSeqRef.current += 1;
                dataRef.current = mergedResult.data;
                setData(mergedResult.data);
                saveSyncBase(uid, event.data);
                lastSyncedHashRef.current = remoteHash;
                persistLocalScoped(
                  uid,
                  mergedResult.data,
                  true,
                  event.data.updatedAt ?? currentMeta.lastSyncedAt,
                  event.syncVersion ?? lastKnownRemoteVersionRef.current,
                );
                setPendingSync(true);
                void flushCloudWrite(uid, sessionGen, writeSeqRef.current);
                return;
              }

              const detailed = mergeWorkspaceDataDetailed(event.data, dataRef.current);
              openConflictPrompt(
                uid,
                'offline-divergence',
                dataRef.current,
                event.data,
                detailed.exceedsProjectLimit ? detailed.activeProjects : undefined,
              );
              return;
            }

            initialHydrationDone = true;
            dataRef.current = event.data;
            setData(event.data);
            const syncedAt = event.data.updatedAt ?? currentMeta.lastSyncedAt ?? new Date().toISOString();
            if (!event.fromCache) {
              lastSyncedHashRef.current = remoteHash;
              saveSyncBase(uid, event.data);
            }
            persistLocalScoped(
              uid,
              event.data,
              false,
              syncedAt,
              event.syncVersion ?? lastKnownRemoteVersionRef.current,
            );
            setPendingSync(false);
            setLastSyncedAt(syncedAt);
            setSyncStatus(event.fromCache && typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'synced');
            setSyncError('');
          } else if (!event.fromCache) {
            initialHydrationDone = true;
            const seedData = cachedAccount ?? candidateGuestData ?? createDefaultData();
            const stamped = sanitizeAppData({ ...seedData, updatedAt: new Date().toISOString() });
            if (candidateGuestData && !cachedAccount) {
              clearGuestWorkspace();
            }
            lastKnownRemoteVersionRef.current = null;
            dataRef.current = stamped;
            setData(stamped);
            persistLocalScoped(uid, stamped, true, null, null);
            setPendingSync(true);
            void flushCloudWrite(uid, sessionGen);
          }
        },
        (error, offline) => {
          if (sessionGen !== sessionGenRef.current || isCloudWriteBlocked(uid)) return;
          if (offline) {
            setSyncStatus('offline');
            setSyncError('');
          } else {
            setSyncStatus('error');
            setSyncError(formatFriendlySyncError(error));
          }
        },
      );
    },
    [flushCloudWrite, isCloudWriteBlocked, openConflictPrompt, persistLocalScoped],
  );

  useEffect(() => {
    void getRedirectResult(auth).catch(error => {
      setAuthNotice(getReadableAuthError(error));
    });

    const unsubscribeAuth = onAuthStateChanged(auth, currentUser => {
      // Protect deletion cleanup from transient onAuthStateChanged ticks during deleteUser()
      if (isDeletingRef.current) return;
      const broadcast = readDeletionBroadcast();
      if (
        currentUser &&
        (deletionLockUidRef.current === currentUser.uid ||
          deletedUidsRef.current.has(currentUser.uid) ||
          (broadcast && broadcast.uid === currentUser.uid && broadcast.phase !== 'partial-failure'))
      ) {
        return;
      }

      suspendCloudListeners();
      const sessionGen = sessionGenRef.current;
      const previousUser = userRef.current;

      pendingConflictRef.current = null;
      lastSyncedHashRef.current = null;
      lastKnownRemoteVersionRef.current = null;
      incompatibleMetaRef.current = null;
      setIncompatibleSchema(null);
      setConflict(null);
      setSyncError('');

      // If previous session signed out, wipe prior account cache unless unsynced changes need recovery backup
      if (previousUser && previousUser.uid !== currentUser?.uid) {
        const prevMeta = loadSyncMeta(previousUser.uid);
        clearAccountStorage(previousUser.uid, {
          preserveRecoveryCopy: prevMeta.pendingSync && !deletedUidsRef.current.has(previousUser.uid),
        });
        if (deletionLockUidRef.current === previousUser.uid) {
          deletionLockUidRef.current = null;
          setDeletionPhase('idle');
        }
      }

      // Capture guest data if signing in from local/guest mode with dirty or meaningful local edits
      const hadGuestWork =
        !previousUser &&
        Boolean(currentUser) &&
        (isGuestDirty() || hasMeaningfulWorkspaceData(dataRef.current));
      const candidateGuestData = hadGuestWork ? dataRef.current : null;

      userRef.current = currentUser;
      setUser(currentUser);
      setAuthReady(true);

      if (!currentUser) {
        setEntitlement(DEFAULT_FREE_ENTITLEMENT);
        const local = loadData();
        dataRef.current = local;
        setData(local);
        setPendingSync(false);
        setLastSyncedAt(null);
        setSyncStatus('local');
        return;
      }

      const uid = currentUser.uid;
      setAccountNotice('');
      setDeletionPhase('idle');
      const cachedAccount = loadAccountData(uid);
      const cachedBase = loadSyncBase(uid);
      const meta = loadSyncMeta(uid);

      lastKnownRemoteVersionRef.current = meta.remoteSyncVersion ?? null;
      if (cachedBase) {
        lastSyncedHashRef.current = computeWorkspaceHash(cachedBase);
      }

      // Isolate UI immediately from any prior account or guest workspace while hydrating
      const initialAccountState = cachedAccount ?? createDefaultData();
      dataRef.current = initialAccountState;
      setData(initialAccountState);
      setPendingSync(meta.pendingSync);
      setLastSyncedAt(meta.lastSyncedAt);
      setSyncStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'hydrating');

      attachCloudSubscriptions(uid, { candidateGuestData, cachedAccount, sessionGen });
    });

    return () => {
      suspendCloudListeners();
      unsubscribeAuth();
    };
  }, [attachCloudSubscriptions, suspendCloudListeners]);

  // Multi-tab localStorage synchronization & cross-tab deletion protection
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return;
      const currentUser = userRef.current;

      if (event.key === ACCOUNT_DELETION_STATE_KEY && currentUser) {
        const broadcast = readDeletionBroadcast();
        if (broadcast && broadcast.uid === currentUser.uid) {
          if (broadcast.phase === 'deleting') {
            deletionLockUidRef.current = currentUser.uid;
            suspendCloudListeners();
            setDeletionPhase('deleting-firestore');
            setSyncStatus('deleting');
          } else if (broadcast.phase === 'deleted') {
            deletedUidsRef.current.add(currentUser.uid);
            deletionLockUidRef.current = null;
            suspendCloudListeners();
            clearAccountStorage(currentUser.uid, { preserveRecoveryCopy: false });
            clearGuestWorkspace();
            const cleanLocal = createDefaultData();
            dataRef.current = cleanLocal;
            setData(cleanLocal);
            lastSyncedHashRef.current = null;
            lastKnownRemoteVersionRef.current = null;
            pendingConflictRef.current = null;
            setConflict(null);
            setPendingSync(false);
            setLastSyncedAt(null);
            setSyncError('');
            setEntitlement(DEFAULT_FREE_ENTITLEMENT);
            userRef.current = null;
            setUser(null);
            setSyncStatus('local');
            setDeletionPhase('completed');
            setAccountNotice('Your cloud account and workspace data were permanently deleted.');
          } else if (broadcast.phase === 'partial-failure') {
            deletionLockUidRef.current = currentUser.uid;
            suspendCloudListeners();
            setDeletionPhase('partial-failure');
            setSyncStatus('error');
          }
        }
        return;
      }

      if (!currentUser) {
        if (event.key === STORAGE_KEY) {
          const reloaded = loadData();
          dataRef.current = reloaded;
          setData(reloaded);
        }
        return;
      }

      const uid = currentUser.uid;
      if (isCloudWriteBlocked(uid)) return;

      if (event.key === `${ACCOUNT_KEY_PREFIX}${uid}` || event.key === `${SYNC_META_PREFIX}${uid}`) {
        const meta = loadSyncMeta(uid);
        if (meta.lastUpdatedByTab === tabIdRef.current) return;

        const nextAccount = loadAccountData(uid);
        if (nextAccount) {
          clearDebounce();
          dataRef.current = nextAccount;
          setData(nextAccount);
        }
        if (meta.remoteSyncVersion !== undefined) {
          lastKnownRemoteVersionRef.current = meta.remoteSyncVersion ?? null;
        }
        setPendingSync(meta.pendingSync);
        setLastSyncedAt(meta.lastSyncedAt);
        if (!meta.pendingSync) {
          const base = loadSyncBase(uid);
          if (base) lastSyncedHashRef.current = computeWorkspaceHash(base);
          if (syncStatusRef.current !== 'conflict') {
            setSyncStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'synced');
          }
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isCloudWriteBlocked, suspendCloudListeners]);

  // Auto-sync when connectivity returns
  useEffect(() => {
    const handleOnline = () => {
      const currentUser = userRef.current;
      if (!currentUser || isCloudWriteBlocked(currentUser.uid)) return;
      const meta = loadSyncMeta(currentUser.uid);
      if (meta.pendingSync || syncStatusRef.current === 'offline' || syncStatusRef.current === 'error') {
        void flushCloudWrite(currentUser.uid, sessionGenRef.current);
      }
    };

    const handleOffline = () => {
      if (userRef.current && !isCloudWriteBlocked(userRef.current.uid)) {
        setSyncStatus('offline');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushCloudWrite, isCloudWriteBlocked]);

  const applyDataChange = useCallback(
    (updater: (current: AppData) => AppData) => {
      if (incompatibleMetaRef.current !== null) {
        // Read-only protection when remote workspace is at v4+
        return;
      }
      const prevHash = computeWorkspaceHash(dataRef.current);
      const next = sanitizeAppData({
        ...updater(dataRef.current),
        updatedAt: new Date().toISOString(),
      });
      const nextHash = computeWorkspaceHash(next);
      dataRef.current = next;
      setData(next);

      const currentUser = userRef.current;
      if (!currentUser) {
        persistLocalScoped(null, next, false, null);
        if (prevHash !== nextHash || hasMeaningfulWorkspaceData(next)) {
          setGuestDirty(true);
        }
        setSyncStatus('local');
        return;
      }

      if (isCloudWriteBlocked(currentUser.uid)) {
        // Keep local copy updated without triggering any cloud write/pending queue during deletion
        persistLocalScoped(currentUser.uid, next, false, lastSyncedAtRef.current);
        return;
      }

      if (prevHash === nextHash && !loadSyncMeta(currentUser.uid).pendingSync) {
        persistLocalScoped(currentUser.uid, next, false, lastSyncedAtRef.current);
        return;
      }

      writeSeqRef.current += 1;
      const seq = writeSeqRef.current;
      setPendingSync(true);
      persistLocalScoped(currentUser.uid, next, true, lastSyncedAtRef.current);
      scheduleCloudSync(currentUser.uid, seq);
    },
    [isCloudWriteBlocked, persistLocalScoped, scheduleCloudSync],
  );

  const saveData = useCallback(
    (next: AppData) => {
      applyDataChange(() => next);
    },
    [applyDataChange],
  );

  const resolveConflict = useCallback(
    async (strategy: 'keep-cloud' | 'use-local' | 'merge', selectedActiveProjectIds?: readonly string[]) => {
      const currentUser = userRef.current;
      const pending = pendingConflictRef.current;
      if (!currentUser || !pending || isCloudWriteBlocked(currentUser.uid)) return;

      pendingConflictRef.current = null;
      setConflict(null);

      if (pending.reason === 'guest-merge') {
        clearGuestWorkspace();
      } else {
        setGuestDirty(false);
      }

      if (strategy === 'keep-cloud') {
        dataRef.current = pending.cloudData;
        setData(pending.cloudData);
        const syncedAt = pending.cloudData.updatedAt ?? new Date().toISOString();
        lastSyncedHashRef.current = computeWorkspaceHash(pending.cloudData);
        if (typeof pending.cloudData.syncVersion === 'number') {
          lastKnownRemoteVersionRef.current = pending.cloudData.syncVersion;
        }
        saveSyncBase(currentUser.uid, pending.cloudData);
        persistLocalScoped(currentUser.uid, pending.cloudData, false, syncedAt, lastKnownRemoteVersionRef.current);
        setPendingSync(false);
        setLastSyncedAt(syncedAt);
        setSyncStatus('synced');
        return;
      }

      let chosen: AppData;
      if (strategy === 'merge') {
        chosen = mergeWorkspaceDataDetailed(pending.cloudData, pending.localData, selectedActiveProjectIds).data;
      } else {
        const appliedLocal = applySelectedActiveProjects(pending.localData.projects, selectedActiveProjectIds);
        chosen = sanitizeAppData({
          ...pending.localData,
          projects: appliedLocal.projects,
          updatedAt: new Date().toISOString(),
        });
      }

      if (typeof pending.cloudData.syncVersion === 'number') {
        lastKnownRemoteVersionRef.current = pending.cloudData.syncVersion;
      }
      writeSeqRef.current += 1;
      dataRef.current = chosen;
      setData(chosen);
      setPendingSync(true);
      persistLocalScoped(currentUser.uid, chosen, true, lastSyncedAtRef.current, lastKnownRemoteVersionRef.current);
      await flushCloudWrite(currentUser.uid, sessionGenRef.current, writeSeqRef.current);
    },
    [flushCloudWrite, isCloudWriteBlocked, persistLocalScoped],
  );

  const retrySync = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser || isCloudWriteBlocked(currentUser.uid)) return;
    await flushCloudWrite(currentUser.uid, sessionGenRef.current, writeSeqRef.current);
  }, [flushCloudWrite, isCloudWriteBlocked]);

  const exportRecoveryBackup = useCallback(async () => {
    const currentUser = userRef.current;
    if (currentUser && incompatibleMetaRef.current) {
      const bundle = await loadV4BundleFromFirestore(db, currentUser.uid, incompatibleMetaRef.current);
      const reconstructed = reconstructV3FromV4(bundle);
      exportData(reconstructed);
      return;
    }
    exportData(dataRef.current);
  }, []);

  const signIn = async () => {
    setAuthNotice('');
    setAccountNotice('');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(auth, provider);
      const signedUid = result?.user?.uid;
      if (signedUid) {
        deletedUidsRef.current.delete(signedUid);
        clearDeletionBroadcast(signedUid);
        if (deletionLockUidRef.current === signedUid) {
          deletionLockUidRef.current = null;
        }
      }
      return result;
    } catch (error) {
      const code = getAuthErrorCode(error);
      let isTopLevel = false;
      try {
        isTopLevel = typeof window !== 'undefined' && window.self === window.top;
      } catch {
        isTopLevel = false;
      }
      const isMobile =
        typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

      if (
        isTopLevel &&
        isMobile &&
        (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment')
      ) {
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw error;
    }
  };

  const signOut = async (options?: { force?: boolean }) => {
    clearDebounce();
    const uid = userRef.current?.uid;
    const isLocked = Boolean(uid && (deletionLockUidRef.current === uid || incompatibleMetaRef.current !== null));
    if (uid && !isLocked && !options?.force && loadSyncMeta(uid).pendingSync && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      await flushCloudWrite(uid, sessionGenRef.current, writeSeqRef.current);
    }
    if (uid) {
      if (deletionLockUidRef.current === uid) {
        deletionLockUidRef.current = null;
        setDeletionPhase('idle');
      }
      clearAccountStorage(uid, { preserveRecoveryCopy: Boolean(!isLocked && options?.force && loadSyncMeta(uid).pendingSync) });
    }
    await firebaseSignOut(auth);
  };

  const deleteAccount = async () => {
    const currentUser = userRef.current ?? auth.currentUser;
    if (!currentUser) {
      throw new Error('No signed-in cloud account is active.');
    }
    if (isDeletingRef.current) {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('You are currently offline. Connect to the internet before permanently deleting your cloud account and data.');
    }

    const uid = currentUser.uid;
    const wasPartialRetry = deletionLockUidRef.current === uid;
    isDeletingRef.current = true;
    deletionLockUidRef.current = uid;
    setAccountNotice('');
    setSyncError('');
    setSyncStatus('deleting');

    // 1. Stop scheduled writes, unsubscribe active cloud listeners, and drain any in-flight write
    suspendCloudListeners();
    if (inFlightSyncRef.current) {
      await inFlightSyncRef.current.catch(() => {});
    }

    const reauthenticate = async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await reauthenticateWithPopup(currentUser, provider);
    };

    // 2. Resolve recent-login requirement BEFORE touching any Firestore workspace documents
    if (!isSessionConfirmedRecent(currentUser)) {
      setDeletionPhase('reauthenticating');
      try {
        await reauthenticate();
      } catch (reauthError) {
        const code = getAuthErrorCode(reauthError);
        const cancelled = code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';

        isDeletingRef.current = false;
        if (!wasPartialRetry) {
          // Zero destructive changes occurred: preserve all data and restore normal sync
          deletionLockUidRef.current = null;
          setDeletionPhase('idle');
          const cachedAccount = loadAccountData(uid);
          const pendingNow = loadSyncMeta(uid).pendingSync;
          setSyncStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'hydrating');
          attachCloudSubscriptions(uid, { candidateGuestData: null, cachedAccount, sessionGen: sessionGenRef.current });
          if (pendingNow) {
            void flushCloudWrite(uid, sessionGenRef.current, writeSeqRef.current);
          }
        } else {
          setDeletionPhase('partial-failure');
          setSyncStatus('error');
        }

        throw new Error(
          cancelled
            ? 'Reauthentication was cancelled. Your account and data were preserved.'
            : getReadableAuthError(reauthError),
        );
      }
    }

    // Broadcast deletion lock across other open tabs only once destructive operations begin
    writeDeletionBroadcast(uid, 'deleting');

    // 3. Delete all 8 v4 subcollections + root Firestore document idempotently
    setDeletionPhase('deleting-firestore');
    try {
      await sync.deleteUserWorkspaceDoc(uid);
    } catch (fsError) {
      isDeletingRef.current = false;
      writeDeletionBroadcast(uid, 'partial-failure');
      setDeletionPhase('partial-failure');
      setSyncStatus('error');
      const partial = fsError instanceof sync.WorkspaceDeletionError && fsError.partial;
      const failedPath = fsError instanceof sync.WorkspaceDeletionError ? fsError.path : `users/${uid}`;
      const message = partial
        ? `Cloud deletion was interrupted while removing ${failedPath}. Some cloud data may still remain, and your local copy is preserved. Retry deletion or export a backup.`
        : `Could not delete cloud workspace (${failedPath}). Your Firebase Auth account and local data remain intact. Retry deletion or export a backup.`;
      setSyncError(message);
      throw new Error(message);
    }

    // 4. Delete Firebase Authentication account (with fallback if server clock still rejects freshness)
    setDeletionPhase('deleting-auth');
    try {
      await deleteUser(currentUser);
    } catch (authError) {
      const code = getAuthErrorCode(authError);
      if (code === 'auth/user-not-found') {
        // Auth user is already absent; proceed cleanly to local cleanup
      } else if (code === 'auth/requires-recent-login') {
        setDeletionPhase('reauthenticating');
        try {
          await reauthenticate();
          setDeletionPhase('deleting-auth');
          await deleteUser(currentUser);
        } catch (retryError) {
          isDeletingRef.current = false;
          writeDeletionBroadcast(uid, 'partial-failure');
          setDeletionPhase('partial-failure');
          setSyncStatus('error');
          const retryCode = getAuthErrorCode(retryError);
          if (retryCode !== 'auth/user-not-found') {
            const detail =
              retryCode === 'auth/popup-closed-by-user' || retryCode === 'auth/cancelled-popup-request'
                ? 'Reauthentication was cancelled.'
                : getReadableAuthError(retryError);
            const message = `Cloud workspace was deleted, but removing your authentication account did not complete: ${detail} Your local copy is preserved—export a backup if needed and retry deletion.`;
            setSyncError(message);
            throw new Error(message);
          }
        }
      } else {
        isDeletingRef.current = false;
        writeDeletionBroadcast(uid, 'partial-failure');
        setDeletionPhase('partial-failure');
        setSyncStatus('error');
        const message = `Cloud workspace was deleted, but removing your authentication account failed: ${getReadableAuthError(authError)} Your local copy is preserved—export a backup if needed and retry deletion.`;
        setSyncError(message);
        throw new Error(message);
      }
    }

    // 5. Complete cleanup strictly after Firestore + Auth deletions succeed
    deletedUidsRef.current.add(uid);
    writeDeletionBroadcast(uid, 'deleted');
    deletionLockUidRef.current = null;
    isDeletingRef.current = false;

    clearAccountStorage(uid, { preserveRecoveryCopy: false });
    clearGuestWorkspace();

    const cleanLocal = createDefaultData();
    dataRef.current = cleanLocal;
    setData(cleanLocal);
    lastSyncedHashRef.current = null;
    lastKnownRemoteVersionRef.current = null;
    pendingConflictRef.current = null;
    setConflict(null);
    setPendingSync(false);
    setLastSyncedAt(null);
    setSyncError('');
    setEntitlement(DEFAULT_FREE_ENTITLEMENT);
    userRef.current = null;
    setUser(null);
    setSyncStatus('local');
    setDeletionPhase('completed');
    setAccountNotice('Your cloud account and workspace data were permanently deleted.');
  };

  const storageNotice = [recoveryWarning, storageError].filter(Boolean).join(' ');

  return (
    <HabitContext.Provider
      value={{
        data,
        updateData: applyDataChange,
        saveData,
        user,
        authReady,
        syncStatus,
        syncError,
        lastSyncedAt,
        pendingSync,
        conflict,
        entitlement,
        deletionPhase,
        incompatibleSchema,
        exportRecoveryBackup,
        accountNotice,
        clearAccountNotice: () => setAccountNotice(''),
        resolveConflict,
        retrySync,
        signIn,
        signOut,
        deleteAccount,
        storageNotice,
        authNotice,
      }}
    >
      {children}
    </HabitContext.Provider>
  );
};

export const useHabits = () => {
  const context = useContext(HabitContext);
  if (!context) throw new Error('useHabits must be used within HabitProvider');
  return context;
};
