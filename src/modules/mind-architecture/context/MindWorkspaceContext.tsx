import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HabitContext } from '../../../context/HabitContext';
import type { AppData } from '../../../types';
import type {
  HypothesisDecision,
  IndexedDataset,
  KnowledgeDataset,
  MindWorkspaceProfile,
  MindWorkspaceRecord,
  RecentExplorationEntry,
} from '../types/knowledge';
import { computeCelestialLayout, indexDataset, type CelestialLayout } from '../utils/dataset';
import {
  DEFAULT_MIND_DATASET_URL,
  getCachedMindBundle,
  loadMindBundle,
} from '../utils/datasetCache';
import {
  addMindEdge,
  addMindSource,
  mergeExecutionSnapshotIntoDataset,
  cloneDatasetForCustomization,
  createEmptyMindDataset,
  deleteMindEdge,
  deleteMindNode,
  mergeExtractedBatchIntoDataset,
  upsertMindNode,
  type AddMindEdgeInput,
  type ExtractedMindBatch,
  type UpsertMindNodeInput,
} from '../services/mindBuilder';
import {
  createDefaultMindProfile,
  loadLocalMindWorkspace,
  MAX_RECENT_EXPLORATIONS,
  sanitizeKnowledgeDataset,
  saveLocalMindWorkspace,
} from '../services/mindStore';
import {
  isOfflineError,
  isQuotaExceededError,
  pushMindWorkspaceToFirestore,
  subscribeToMindWorkspace,
} from '../services/mindSyncService';

export type MindSyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'error';

export interface MindWorkspaceContextValue {
  record: MindWorkspaceRecord;
  sampleDataset: KnowledgeDataset | null;
  activeDataset: KnowledgeDataset | null;
  indexed: IndexedDataset | null;
  layout: CelestialLayout | null;
  loadError: string | null;
  isLoadingSample: boolean;
  syncState: MindSyncState;
  syncNotice: string | null;
  executionData: AppData | null;
  canSeedFromGoals: boolean;
  retryLoadSample: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<MindWorkspaceProfile, 'title' | 'subtitle'>>) => void;
  switchToSampleMode: () => void;
  startBlankMind: (title?: string) => void;
  cloneSampleToCustom: () => void;
  seedFromInPursuitGoals: () => void;
  upsertNode: (input: UpsertMindNodeInput, ifSample?: 'blank' | 'clone') => string;
  removeNode: (nodeId: string) => void;
  addEdge: (input: AddMindEdgeInput, ifSample?: 'blank' | 'clone') => void;
  removeEdge: (edgeId: string) => void;
  addSource: (
    input: { title: string; sourceType: string; excerpt?: string; date?: string },
    ifSample?: 'blank' | 'clone'
  ) => void;
  importExtractedBatch: (batch: ExtractedMindBatch, ifSample?: 'blank' | 'clone') => void;
  importJsonDataset: (raw: unknown, title?: string) => boolean;
  updateHypothesis: (edgeId: string, decision: HypothesisDecision) => void;
  resetHypotheses: () => void;
  recordExploration: (nodeId: string) => void;
}

const MindWorkspaceContext = createContext<MindWorkspaceContextValue | null>(null);

const CLOUD_SYNC_DEBOUNCE_MS = 850;

export function MindWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const habitCtx = useContext(HabitContext);
  const user = habitCtx?.user ?? null;
  const authReady = habitCtx?.authReady ?? true;
  const appData = habitCtx?.data ?? null;

  const scope = user?.uid ?? 'guest';
  const ownerName = user?.displayName ?? user?.email?.split('@')[0] ?? undefined;

  const [record, setRecord] = useState<MindWorkspaceRecord>(() =>
    loadLocalMindWorkspace(scope, ownerName)
  );
  const [sampleDataset, setSampleDataset] = useState<KnowledgeDataset | null>(() => {
    const cached = getCachedMindBundle(DEFAULT_MIND_DATASET_URL);
    return cached?.raw ?? null;
  });
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<MindSyncState>(() =>
    user ? 'syncing' : 'local'
  );
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const dirtyRef = useRef(false);
  const scopeRef = useRef(scope);
  const pushTimerRef = useRef<number | null>(null);
  const quotaBlockedUntilRef = useRef<number>(0);

  const fetchSampleArchive = useCallback(async () => {
    const cached = getCachedMindBundle(DEFAULT_MIND_DATASET_URL);
    if (cached) {
      setSampleDataset(cached.raw);
      setLoadError(null);
      return;
    }
    setIsLoadingSample(true);
    setLoadError(null);
    try {
      const loaded = await loadMindBundle(DEFAULT_MIND_DATASET_URL);
      if (loaded) {
        setSampleDataset(loaded.raw);
      } else {
        setLoadError('Unable to load reference intellectual archive.');
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load reference intellectual archive.'
      );
    } finally {
      setIsLoadingSample(false);
    }
  }, []);

  useEffect(() => {
    void fetchSampleArchive();
  }, [fetchSampleArchive]);

  // Reload per-user local cache on account switch
  useEffect(() => {
    scopeRef.current = scope;
    dirtyRef.current = false;
    if (pushTimerRef.current !== null) {
      window.clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    setRecord(loadLocalMindWorkspace(scope, ownerName));
    setSyncNotice(null);
    setSyncState(user ? 'syncing' : 'local');
  }, [scope, ownerName, user]);

  // Subscribe to user-scoped Firestore Mind Architecture doc when signed in
  useEffect(() => {
    if (!authReady || !user) {
      setSyncState('local');
      return;
    }

    let cancelled = false;
    const unsubscribe = subscribeToMindWorkspace(
      user.uid,
      ownerName,
      (snapshot) => {
        if (cancelled) return;
        if (snapshot.record) {
          if (!dirtyRef.current) {
            setRecord((prev) => {
              // Keep newer local state if remote timestamp is older
              if (
                prev.updatedAt &&
                snapshot.record?.updatedAt &&
                prev.updatedAt > snapshot.record.updatedAt
              ) {
                return prev;
              }
              saveLocalMindWorkspace(user.uid, snapshot.record!);
              return snapshot.record!;
            });
          }
          setSyncState(snapshot.fromCache ? 'offline' : 'synced');
          setSyncNotice(null);
        } else {
          // User does not have a Mind doc in Firestore yet -> keep local / sample without noisy write
          setSyncState(snapshot.fromCache ? 'offline' : 'synced');
        }
      },
      (err) => {
        if (cancelled) return;
        if (isOfflineError(err)) {
          setSyncState('offline');
          setSyncNotice('Offline — changes stay saved on this device.');
        } else if (isQuotaExceededError(err)) {
          quotaBlockedUntilRef.current = Date.now() + 5 * 60 * 1000;
          setSyncState('error');
          setSyncNotice('Cloud quota reached — saved locally on this device.');
        } else {
          setSyncState('error');
          setSyncNotice('Cloud sync paused — saved locally on this device.');
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authReady, user, ownerName]);

  const scheduleCloudPush = useCallback(
    (nextRecord: MindWorkspaceRecord) => {
      if (!user || !user.emailVerified) {
        setSyncState('local');
        if (user && !user.emailVerified) {
          setSyncNotice('Verify email to sync Mind Architecture to cloud.');
        }
        return;
      }
      if (Date.now() < quotaBlockedUntilRef.current) {
        setSyncState('error');
        return;
      }

      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
      }
      setSyncState('syncing');
      const targetUid = user.uid;

      pushTimerRef.current = window.setTimeout(() => {
        pushTimerRef.current = null;
        void pushMindWorkspaceToFirestore(targetUid, nextRecord)
          .then(() => {
            if (scopeRef.current !== targetUid) return;
            dirtyRef.current = false;
            setSyncState('synced');
            setSyncNotice(null);
          })
          .catch((err) => {
            if (scopeRef.current !== targetUid) return;
            if (isOfflineError(err)) {
              setSyncState('offline');
              setSyncNotice('Offline — changes saved on this device.');
            } else if (isQuotaExceededError(err)) {
              quotaBlockedUntilRef.current = Date.now() + 5 * 60 * 1000;
              setSyncState('error');
              setSyncNotice('Daily cloud quota exceeded — changes saved locally.');
            } else {
              setSyncState('error');
              setSyncNotice(
                err instanceof Error && err.message.includes('KB')
                  ? err.message
                  : 'Cloud sync failed — saved locally.'
              );
            }
          });
      }, CLOUD_SYNC_DEBOUNCE_MS);
    },
    [user]
  );

  useEffect(() => {
    return () => {
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
      }
    };
  }, []);

  const commitRecord = useCallback(
    (updater: (prev: MindWorkspaceRecord) => MindWorkspaceRecord, pushToCloud = true) => {
      setRecord((prev) => {
        const now = new Date().toISOString();
        const next = updater(prev);
        const stamped: MindWorkspaceRecord = {
          ...next,
          profile: {
            ...next.profile,
            updatedAt: now,
          },
          updatedAt: now,
        };
        saveLocalMindWorkspace(scopeRef.current, stamped);
        if (pushToCloud) {
          dirtyRef.current = true;
          scheduleCloudPush(stamped);
        }
        return stamped;
      });
    },
    [scheduleCloudPush]
  );

  const ensureCustomDatasetFrom = useCallback(
    (prev: MindWorkspaceRecord, strategy: 'blank' | 'clone' = 'blank'): KnowledgeDataset => {
      if (prev.profile.mode === 'custom' && prev.customDataset) {
        return prev.customDataset;
      }
      if (strategy === 'clone' && sampleDataset) {
        return cloneDatasetForCustomization(sampleDataset);
      }
      return createEmptyMindDataset('custom-1.0');
    },
    [sampleDataset]
  );

  const updateProfile = useCallback(
    (patch: Partial<Pick<MindWorkspaceProfile, 'title' | 'subtitle'>>) => {
      commitRecord((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          ...(patch.title !== undefined
            ? { title: patch.title.trim().slice(0, 120) || prev.profile.title }
            : {}),
          ...(patch.subtitle !== undefined
            ? { subtitle: patch.subtitle.trim().slice(0, 320) }
            : {}),
        },
      }));
    },
    [commitRecord]
  );

  const switchToSampleMode = useCallback(() => {
    commitRecord((prev) => {
      const sampleProfile = createDefaultMindProfile('sample', ownerName);
      return {
        ...prev,
        profile: sampleProfile,
        customDataset: null,
        recentExplorations: [],
      };
    });
  }, [commitRecord, ownerName]);

  const startBlankMind = useCallback(
    (title?: string) => {
      commitRecord((prev) => {
        const customProfile = createDefaultMindProfile('custom', ownerName);
        return {
          ...prev,
          profile: {
            ...customProfile,
            title: title?.trim().slice(0, 120) || customProfile.title,
          },
          customDataset: createEmptyMindDataset('custom-1.0'),
          hypothesisDecisions: {},
          recentExplorations: [],
        };
      });
    },
    [commitRecord, ownerName]
  );

  const cloneSampleToCustom = useCallback(() => {
    if (!sampleDataset) return;
    commitRecord((prev) => {
      const customProfile = createDefaultMindProfile('custom', ownerName);
      return {
        ...prev,
        profile: {
          ...customProfile,
          title:
            prev.profile.mode === 'custom'
              ? prev.profile.title
              : ownerName
                ? `${ownerName.split(' ')[0]}'s Mind Architecture`
                : 'My Mind Architecture (Custom)',
        },
        customDataset: cloneDatasetForCustomization(sampleDataset),
      };
    });
  }, [commitRecord, ownerName, sampleDataset]);

  const canSeedFromGoals = Boolean(
    appData &&
      (appData.lifeAreas.length > 0 || appData.goals.length > 0 || appData.projects.length > 0)
  );

  const seedFromInPursuitGoals = useCallback(() => {
    if (!appData) return;
    commitRecord((prev) => {
      const base = prev.profile.mode === 'custom' && prev.customDataset
        ? prev.customDataset
        : createEmptyMindDataset();
      const customProfile = prev.profile.mode === 'custom'
        ? prev.profile
        : createDefaultMindProfile('custom', ownerName);
      return {
        ...prev,
        profile: {
          ...customProfile,
          subtitle: 'Living personal architecture connected to your goals, projects, tasks and habits.',
        },
        customDataset: mergeExecutionSnapshotIntoDataset(base, appData),
      };
    });
  }, [appData, commitRecord, ownerName]);

  const upsertNode = useCallback(
    (input: UpsertMindNodeInput, ifSample: 'blank' | 'clone' = 'blank'): string => {
      let createdId = input.id ?? '';
      commitRecord((prev) => {
        const baseDataset = ensureCustomDatasetFrom(prev, ifSample);
        const result = upsertMindNode(baseDataset, input);
        createdId = result.nodeId;
        const customProfile =
          prev.profile.mode === 'custom'
            ? prev.profile
            : createDefaultMindProfile('custom', ownerName);
        return {
          ...prev,
          profile: customProfile,
          customDataset: result.dataset,
        };
      });
      return createdId;
    },
    [commitRecord, ensureCustomDatasetFrom, ownerName]
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      commitRecord((prev) => {
        if (prev.profile.mode !== 'custom' || !prev.customDataset) return prev;
        return {
          ...prev,
          customDataset: deleteMindNode(prev.customDataset, nodeId),
          recentExplorations: prev.recentExplorations.filter((r) => r.nodeId !== nodeId),
        };
      });
    },
    [commitRecord]
  );

  const addEdge = useCallback(
    (input: AddMindEdgeInput, ifSample: 'blank' | 'clone' = 'blank') => {
      commitRecord((prev) => {
        const baseDataset = ensureCustomDatasetFrom(prev, ifSample);
        const customProfile =
          prev.profile.mode === 'custom'
            ? prev.profile
            : createDefaultMindProfile('custom', ownerName);
        return {
          ...prev,
          profile: customProfile,
          customDataset: addMindEdge(baseDataset, input),
        };
      });
    },
    [commitRecord, ensureCustomDatasetFrom, ownerName]
  );

  const removeEdge = useCallback(
    (edgeId: string) => {
      commitRecord((prev) => {
        if (prev.profile.mode !== 'custom' || !prev.customDataset) return prev;
        return {
          ...prev,
          customDataset: deleteMindEdge(prev.customDataset, edgeId),
        };
      });
    },
    [commitRecord]
  );

  const addSource = useCallback(
    (
      input: { title: string; sourceType: string; excerpt?: string; date?: string },
      ifSample: 'blank' | 'clone' = 'blank'
    ) => {
      commitRecord((prev) => {
        const baseDataset = ensureCustomDatasetFrom(prev, ifSample);
        const customProfile =
          prev.profile.mode === 'custom'
            ? prev.profile
            : createDefaultMindProfile('custom', ownerName);
        return {
          ...prev,
          profile: customProfile,
          customDataset: addMindSource(baseDataset, input),
        };
      });
    },
    [commitRecord, ensureCustomDatasetFrom, ownerName]
  );

  const importExtractedBatch = useCallback(
    (batch: ExtractedMindBatch, ifSample: 'blank' | 'clone' = 'blank') => {
      commitRecord((prev) => {
        const baseDataset = ensureCustomDatasetFrom(prev, ifSample);
        const customProfile =
          prev.profile.mode === 'custom'
            ? prev.profile
            : createDefaultMindProfile('custom', ownerName);
        return {
          ...prev,
          profile: customProfile,
          customDataset: mergeExtractedBatchIntoDataset(baseDataset, batch),
        };
      });
    },
    [commitRecord, ensureCustomDatasetFrom, ownerName]
  );

  const importJsonDataset = useCallback(
    (raw: unknown, title?: string): boolean => {
      const sanitized = sanitizeKnowledgeDataset(raw);
      if (!sanitized) return false;
      commitRecord((prev) => {
        const customProfile = createDefaultMindProfile('custom', ownerName);
        return {
          ...prev,
          profile: {
            ...customProfile,
            title: title?.trim().slice(0, 120) || customProfile.title,
          },
          customDataset: sanitized,
          recentExplorations: [],
        };
      });
      return true;
    },
    [commitRecord, ownerName]
  );

  const updateHypothesis = useCallback(
    (edgeId: string, decision: HypothesisDecision) => {
      commitRecord((prev) => ({
        ...prev,
        hypothesisDecisions: {
          ...prev.hypothesisDecisions,
          [edgeId]: decision,
        },
      }));
    },
    [commitRecord]
  );

  const resetHypotheses = useCallback(() => {
    commitRecord((prev) => ({
      ...prev,
      hypothesisDecisions: {},
    }));
  }, [commitRecord]);

  const activeDataset = useMemo<KnowledgeDataset | null>(() => {
    const baseDataset = record.profile.mode === 'custom' && record.customDataset
      ? record.customDataset
      : sampleDataset;
    // Execution entities are always a live derived layer, in both sample and custom modes.
    // This makes newly created goals visible in the constellation without a manual sync action.
    return baseDataset && appData
      ? mergeExecutionSnapshotIntoDataset(baseDataset, appData)
      : baseDataset;
  }, [record.profile.mode, record.customDataset, sampleDataset, appData]);

  const bundle = useMemo(() => {
    if (!activeDataset) return null;
    const indexed = indexDataset(activeDataset);
    const layout = computeCelestialLayout(indexed);
    return { indexed, layout };
  }, [activeDataset]);

  const recordExploration = useCallback(
    (nodeId: string) => {
      const node = bundle?.indexed.nodeById.get(nodeId);
      if (!node) return;
      const now = new Date().toISOString();
      commitRecord((prev) => {
        const entry: RecentExplorationEntry = {
          nodeId,
          title: node.title,
          ...(node.domains[0] ? { domain: node.domains[0] } : {}),
          visitedAt: now,
        };
        const filtered = prev.recentExplorations.filter((r) => r.nodeId !== nodeId);
        return {
          ...prev,
          recentExplorations: [entry, ...filtered].slice(0, MAX_RECENT_EXPLORATIONS),
        };
      });
    },
    [bundle, commitRecord]
  );

  const value = useMemo<MindWorkspaceContextValue>(
    () => ({
      record,
      sampleDataset,
      activeDataset,
      indexed: bundle?.indexed ?? null,
      layout: bundle?.layout ?? null,
      loadError,
      isLoadingSample,
      syncState,
      syncNotice,
      executionData: appData,
      canSeedFromGoals,
      retryLoadSample: fetchSampleArchive,
      updateProfile,
      switchToSampleMode,
      startBlankMind,
      cloneSampleToCustom,
      seedFromInPursuitGoals,
      upsertNode,
      removeNode,
      addEdge,
      removeEdge,
      addSource,
      importExtractedBatch,
      importJsonDataset,
      updateHypothesis,
      resetHypotheses,
      recordExploration,
    }),
    [
      record,
      sampleDataset,
      activeDataset,
      bundle,
      loadError,
      isLoadingSample,
      syncState,
      syncNotice,
      appData,
      canSeedFromGoals,
      fetchSampleArchive,
      updateProfile,
      switchToSampleMode,
      startBlankMind,
      cloneSampleToCustom,
      seedFromInPursuitGoals,
      upsertNode,
      removeNode,
      addEdge,
      removeEdge,
      addSource,
      importExtractedBatch,
      importJsonDataset,
      updateHypothesis,
      resetHypotheses,
      recordExploration,
    ]
  );

  return (
    <MindWorkspaceContext.Provider value={value}>
      {children}
    </MindWorkspaceContext.Provider>
  );
}

export function useMindWorkspaceOptional(): MindWorkspaceContextValue | null {
  return useContext(MindWorkspaceContext);
}
