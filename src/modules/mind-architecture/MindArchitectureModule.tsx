'use client';

import { useCallback, useEffect, useState } from 'react';
import { CommandSearch } from './components/CommandSearch';
import { MindEditorModal, type MindEditorTab } from './components/MindEditorModal';
import { TopNav } from './components/TopNav';
import { AtlasView } from './components/views/AtlasView';
import { EvidenceView } from './components/views/EvidenceView';
import { EvolutionView } from './components/views/EvolutionView';
import { GraphView } from './components/views/GraphView';
import { OverviewView } from './components/views/OverviewView';
import { PatternsView } from './components/views/PatternsView';
import { useMindWorkspaceOptional } from './context/MindWorkspaceContext';
import {
  addMindEdge,
  addMindSource,
  cloneDatasetForCustomization,
  createEmptyMindDataset,
  deleteMindNode,
  mergeExtractedBatchIntoDataset,
  upsertMindNode,
} from './services/mindBuilder';
import {
  createDefaultMindProfile,
  sanitizeKnowledgeDataset,
} from './services/mindStore';
import type {
  HypothesisDecision,
  IndexedDataset,
  KnowledgeDataset,
  KnowledgeNode,
  MindWorkspaceProfile,
  RecentExplorationEntry,
  ViewId,
} from './types/knowledge';
import { indexDataset } from './utils/dataset';
import {
  DEFAULT_MIND_DATASET_URL,
  getCachedMindBundle,
  loadMindBundle,
} from './utils/datasetCache';

export interface MindArchitectureModuleProps {
  /** Public URL to knowledge_extraction_v3_2556cc71.json */
  datasetUrl?: string;
  /** Optional pre-loaded dataset if InPursuit fetches or bundles JSON directly */
  initialData?: KnowledgeDataset;
  /** Initial active tab (defaults to 'overview') */
  initialView?: ViewId;
  /** Default sensitivity filter state (defaults to true) */
  defaultHideSensitive?: boolean;
  /** Scope global Cmd/Ctrl+K shortcut to this module (defaults to true) */
  enableSearchShortcut?: boolean;
  /** Omit standalone wordmark when embedded inside InPursuit (defaults to true) */
  embedded?: boolean;
  /** Optional className for sizing inside InPursuit's dashboard shell */
  className?: string;
}

const HYPOTHESIS_STORAGE_KEY = 'architecture_of_my_mind_v3_hypotheses';

function loadStoredDecisions(): Record<string, HypothesisDecision> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(HYPOTHESIS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, HypothesisDecision>;
    }
  } catch {
    // Ignore storage access errors
  }
  return {};
}

export function MindArchitectureModule({
  datasetUrl = DEFAULT_MIND_DATASET_URL,
  initialData,
  initialView = 'overview',
  defaultHideSensitive = true,
  enableSearchShortcut = true,
  embedded = true,
  className = '',
}: MindArchitectureModuleProps) {
  const workspace = useMindWorkspaceOptional();
  const useSharedWorkspace = Boolean(workspace && !initialData);

  // Standalone fallback state (used when rendered outside MindWorkspaceProvider or with explicit initialData prop)
  const [standaloneDataset, setStandaloneDataset] = useState<IndexedDataset | null>(() => {
    const cached = getCachedMindBundle(datasetUrl, initialData);
    return cached?.indexed ?? null;
  });
  const [standaloneProfile, setStandaloneProfile] = useState<MindWorkspaceProfile>(() =>
    createDefaultMindProfile(initialData ? 'sample' : 'sample')
  );
  const [standaloneDecisions, setStandaloneDecisions] = useState<
    Record<string, HypothesisDecision>
  >(() => loadStoredDecisions());
  const [standaloneRecent, setStandaloneRecent] = useState<RecentExplorationEntry[]>([]);
  const [standaloneError, setStandaloneError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ViewId>(initialView);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hideSensitive, setHideSensitive] = useState(defaultHideSensitive);
  const [editorState, setEditorState] = useState<{
    isOpen: boolean;
    tab: MindEditorTab;
    editingNode: KnowledgeNode | null;
  }>({ isOpen: false, tab: 'setup', editingNode: null });

  const loadStandaloneArchive = useCallback(async () => {
    if (useSharedWorkspace) return;
    const existing = getCachedMindBundle(datasetUrl, initialData);
    if (existing) {
      setStandaloneDataset(existing.indexed);
      return;
    }
    setStandaloneError(null);
    try {
      const bundle = await loadMindBundle(datasetUrl);
      if (!bundle) {
        throw new Error('Unable to load intellectual archive.');
      }
      setStandaloneDataset(bundle.indexed);
    } catch (err) {
      setStandaloneError(
        err instanceof Error ? err.message : 'Unable to load intellectual archive.'
      );
    }
  }, [useSharedWorkspace, datasetUrl, initialData]);

  useEffect(() => {
    void loadStandaloneArchive();
  }, [loadStandaloneArchive]);

  useEffect(() => {
    if (useSharedWorkspace) return;
    try {
      window.localStorage.setItem(
        HYPOTHESIS_STORAGE_KEY,
        JSON.stringify(standaloneDecisions)
      );
    } catch {
      // Ignore storage access errors
    }
  }, [useSharedWorkspace, standaloneDecisions]);

  useEffect(() => {
    if (!enableSearchShortcut) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (document.querySelector('.modal-backdrop')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [enableSearchShortcut]);

  const dataset = useSharedWorkspace ? workspace!.indexed : standaloneDataset;
  const loadError = useSharedWorkspace ? workspace!.loadError : standaloneError;
  const profile = useSharedWorkspace ? workspace!.record.profile : standaloneProfile;
  const hypothesisDecisions = useSharedWorkspace
    ? workspace!.record.hypothesisDecisions
    : standaloneDecisions;
  const recentExplorations = useSharedWorkspace
    ? workspace!.record.recentExplorations
    : standaloneRecent;

  const handleUpdateHypothesis = useCallback(
    (edgeId: string, decision: HypothesisDecision) => {
      if (useSharedWorkspace) {
        workspace!.updateHypothesis(edgeId, decision);
      } else {
        setStandaloneDecisions((prev) => ({
          ...prev,
          [edgeId]: decision,
        }));
      }
    },
    [useSharedWorkspace, workspace]
  );

  const handleResetHypotheses = useCallback(() => {
    if (useSharedWorkspace) {
      workspace!.resetHypotheses();
    } else {
      setStandaloneDecisions({});
    }
  }, [useSharedWorkspace, workspace]);

  const recordExploration = useCallback(
    (nodeId: string | null) => {
      if (!nodeId || !dataset) return;
      if (useSharedWorkspace) {
        workspace!.recordExploration(nodeId);
        return;
      }
      const node = dataset.nodeById.get(nodeId);
      if (!node) return;
      setStandaloneRecent((prev) => {
        const entry: RecentExplorationEntry = {
          nodeId,
          title: node.title,
          ...(node.domains[0] ? { domain: node.domains[0] } : {}),
          visitedAt: new Date().toISOString(),
        };
        return [entry, ...prev.filter((r) => r.nodeId !== nodeId)].slice(0, 12);
      });
    },
    [dataset, useSharedWorkspace, workspace]
  );

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
      if (nodeId) recordExploration(nodeId);
    },
    [recordExploration]
  );

  const handleFocusNodeInGraph = useCallback(
    (nodeId: string, targetView: ViewId = 'graph') => {
      if (dataset?.sensitiveNodeIds.has(nodeId) && hideSensitive) {
        setHideSensitive(false);
      }
      setSelectedNodeId(nodeId);
      recordExploration(nodeId);
      setActiveView(targetView);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [dataset, hideSensitive, recordExploration]
  );

  const handleContinueExploring = useCallback(
    (preferredNodeId?: string) => {
      if (preferredNodeId && dataset?.nodeById.has(preferredNodeId)) {
        if (dataset.sensitiveNodeIds.has(preferredNodeId) && hideSensitive) {
          setHideSensitive(false);
        }
        setSelectedNodeId(preferredNodeId);
        recordExploration(preferredNodeId);
      }
      setActiveView('graph');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [dataset, hideSensitive, recordExploration]
  );

  const handleSelectView = useCallback((view: ViewId) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const retryLoad = useCallback(() => {
    if (useSharedWorkspace) {
      void workspace!.retryLoadSample();
    } else {
      void loadStandaloneArchive();
    }
  }, [useSharedWorkspace, workspace, loadStandaloneArchive]);

  if (loadError) {
    return (
      <div className="flex flex-1 min-h-[420px] items-center justify-center bg-transparent p-6 font-sans text-[#f5f5f3] antialiased">
        <div className="max-w-md rounded-2xl border border-white/[0.1] bg-[rgba(12,13,16,0.88)] p-7 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#ff8b3d]">
            Archive Unavailable
          </p>
          <h2 className="mt-2 font-display text-lg font-semibold tracking-tight">
            Could not load knowledge architecture
          </h2>
          <p className="mt-2 text-[13px] sm:text-xs text-[#9ba3b0] leading-relaxed">{loadError}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-5 rounded-full border border-[#d4ff3a]/50 bg-[#d4ff3a]/12 px-5 py-2.5 text-xs font-medium text-[#d4ff3a] hover:bg-[#d4ff3a]/20 transition-colors"
          >
            Retry Loading Archive
          </button>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="flex flex-1 min-h-[420px] items-center justify-center bg-transparent p-6 font-sans text-[#f5f5f3] antialiased">
        <div className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#d4ff3a]">
            Initializing Observatory
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
            {profile.title}
          </h2>
          <p className="mt-2 text-[13px] sm:text-xs text-[#9ba3b0]">
            Indexing knowledge nodes, connections, and provenance sources…
          </p>
        </div>
      </div>
    );
  }

  const rootHeightClasses =
    activeView === 'graph'
      ? 'flex-1 min-h-0 max-md:pb-[calc(76px+env(safe-area-inset-bottom))]'
      : 'flex-1 min-h-0 max-md:pb-[calc(92px+env(safe-area-inset-bottom))]';

  return (
    <div
      className={`bg-transparent font-sans text-[#f5f5f3] antialiased flex flex-col ${rootHeightClasses} ${className}`}
    >
      <TopNav
        activeView={activeView}
        onSelectView={handleSelectView}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenCustomize={() =>
          setEditorState({ isOpen: true, tab: 'setup', editingNode: null })
        }
        embedded={embedded}
      />

      <div className="flex-1 flex flex-col min-h-0">
        {activeView === 'overview' && (
          <OverviewView
            dataset={dataset}
            executionData={useSharedWorkspace ? workspace!.executionData : null}
            layout={useSharedWorkspace ? workspace!.layout : undefined}
            profile={profile}
            syncState={useSharedWorkspace ? workspace!.syncState : 'local'}
            syncNotice={useSharedWorkspace ? workspace!.syncNotice : null}
            hideSensitive={hideSensitive}
            hypothesisDecisions={hypothesisDecisions}
            recentExplorations={recentExplorations}
            canSeedFromGoals={useSharedWorkspace ? workspace!.canSeedFromGoals : false}
            onUpdateHypothesis={handleUpdateHypothesis}
            onFocusNodeInGraph={handleFocusNodeInGraph}
            onContinueExploring={handleContinueExploring}
            onNavigateView={handleSelectView}
            onOpenCustomize={(tab = 'setup') =>
              setEditorState({ isOpen: true, tab, editingNode: null })
            }
          />
        )}

        {activeView === 'graph' && (
          <GraphView
            dataset={dataset}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            hideSensitive={hideSensitive}
            onToggleSensitive={() => setHideSensitive((v) => !v)}
            hypothesisDecisions={hypothesisDecisions}
            onUpdateHypothesis={handleUpdateHypothesis}
            onNavigateView={handleSelectView}
            onEditNode={(node) =>
              setEditorState({ isOpen: true, tab: 'node', editingNode: node })
            }
          />
        )}

        {activeView === 'atlas' && (
          <AtlasView
            dataset={dataset}
            hideSensitive={hideSensitive}
            onToggleSensitive={() => setHideSensitive((v) => !v)}
            onFocusNodeInGraph={handleFocusNodeInGraph}
          />
        )}

        {activeView === 'evolution' && (
          <EvolutionView
            dataset={dataset}
            hideSensitive={hideSensitive}
            onFocusNodeInGraph={handleFocusNodeInGraph}
          />
        )}

        {activeView === 'patterns' && (
          <PatternsView
            dataset={dataset}
            hideSensitive={hideSensitive}
            onFocusNodeInGraph={handleFocusNodeInGraph}
          />
        )}

        {activeView === 'evidence' && (
          <EvidenceView
            dataset={dataset}
            hideSensitive={hideSensitive}
            hypothesisDecisions={hypothesisDecisions}
            onUpdateHypothesis={handleUpdateHypothesis}
            onResetHypotheses={handleResetHypotheses}
            onFocusNodeInGraph={handleFocusNodeInGraph}
          />
        )}
      </div>

      <CommandSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        dataset={dataset}
        hideSensitive={hideSensitive}
        onSelectNode={handleFocusNodeInGraph}
      />

      {editorState.isOpen && (
        <MindEditorModal
          key={`${editorState.tab}:${editorState.editingNode?.id ?? 'new'}:${profile.mode}`}
          isOpen={editorState.isOpen}
          initialTab={editorState.tab}
          editingNode={editorState.editingNode}
          profile={profile}
          dataset={dataset}
          canSeedFromGoals={useSharedWorkspace ? workspace!.canSeedFromGoals : false}
          onClose={() => setEditorState({ isOpen: false, tab: 'setup', editingNode: null })}
          onUpdateProfile={(patch) => {
            if (useSharedWorkspace) {
              workspace!.updateProfile(patch);
            } else {
              setStandaloneProfile((prev) => ({
                ...prev,
                ...(patch.title !== undefined ? { title: patch.title } : {}),
                ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle } : {}),
              }));
            }
          }}
          onSwitchToSample={() => {
            if (useSharedWorkspace) {
              workspace!.switchToSampleMode();
              setSelectedNodeId(null);
            }
          }}
          onStartBlank={() => {
            if (useSharedWorkspace) {
              workspace!.startBlankMind();
              setSelectedNodeId(null);
            } else {
              setStandaloneDataset(indexDataset(createEmptyMindDataset()));
              setStandaloneProfile(createDefaultMindProfile('custom'));
              setSelectedNodeId(null);
            }
          }}
          onCloneSample={() => {
            if (useSharedWorkspace) {
              workspace!.cloneSampleToCustom();
            } else {
              setStandaloneDataset(indexDataset(cloneDatasetForCustomization(dataset.raw)));
              setStandaloneProfile(createDefaultMindProfile('custom'));
            }
          }}
          onSeedFromGoals={() => {
            if (useSharedWorkspace) {
              workspace!.seedFromInPursuitGoals();
              setSelectedNodeId(null);
            }
          }}
          onUpsertNode={(input, ifSample) => {
            if (useSharedWorkspace) {
              return workspace!.upsertNode(input, ifSample);
            }
            const base =
              standaloneProfile.mode === 'custom'
                ? dataset.raw
                : ifSample === 'clone'
                  ? cloneDatasetForCustomization(dataset.raw)
                  : createEmptyMindDataset();
            const res = upsertMindNode(base, input);
            setStandaloneProfile(createDefaultMindProfile('custom'));
            setStandaloneDataset(indexDataset(res.dataset));
            return res.nodeId;
          }}
          onDeleteNode={(nodeId) => {
            if (useSharedWorkspace) {
              workspace!.removeNode(nodeId);
            } else {
              setStandaloneDataset(indexDataset(deleteMindNode(dataset.raw, nodeId)));
            }
            if (selectedNodeId === nodeId) setSelectedNodeId(null);
          }}
          onAddEdge={(input, ifSample) => {
            if (useSharedWorkspace) {
              workspace!.addEdge(input, ifSample);
              return;
            }
            const base =
              standaloneProfile.mode === 'custom'
                ? dataset.raw
                : ifSample === 'clone'
                  ? cloneDatasetForCustomization(dataset.raw)
                  : createEmptyMindDataset();
            setStandaloneProfile(createDefaultMindProfile('custom'));
            setStandaloneDataset(indexDataset(addMindEdge(base, input)));
          }}
          onAddSource={(input, ifSample) => {
            if (useSharedWorkspace) {
              workspace!.addSource(input, ifSample);
              return;
            }
            const base =
              standaloneProfile.mode === 'custom'
                ? dataset.raw
                : ifSample === 'clone'
                  ? cloneDatasetForCustomization(dataset.raw)
                  : createEmptyMindDataset();
            setStandaloneProfile(createDefaultMindProfile('custom'));
            setStandaloneDataset(indexDataset(addMindSource(base, input)));
          }}
          onImportBatch={(batch, ifSample) => {
            if (useSharedWorkspace) {
              workspace!.importExtractedBatch(batch, ifSample);
              return;
            }
            const base =
              standaloneProfile.mode === 'custom'
                ? dataset.raw
                : ifSample === 'clone'
                  ? cloneDatasetForCustomization(dataset.raw)
                  : createEmptyMindDataset();
            setStandaloneProfile(createDefaultMindProfile('custom'));
            setStandaloneDataset(indexDataset(mergeExtractedBatchIntoDataset(base, batch)));
          }}
          onImportJson={(raw, title) => {
            if (useSharedWorkspace) {
              return workspace!.importJsonDataset(raw, title);
            }
            const sanitized = sanitizeKnowledgeDataset(raw);
            if (!sanitized) return false;
            setStandaloneProfile(createDefaultMindProfile('custom'));
            setStandaloneDataset(indexDataset(sanitized));
            return true;
          }}
        />
      )}
    </div>
  );
}

export default MindArchitectureModule;
