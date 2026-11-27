'use client';

import { useCallback, useEffect, useState } from 'react';
import { CommandSearch } from './components/CommandSearch';
import { TopNav } from './components/TopNav';
import { AtlasView } from './components/views/AtlasView';
import { EvidenceView } from './components/views/EvidenceView';
import { EvolutionView } from './components/views/EvolutionView';
import { GraphView } from './components/views/GraphView';
import { PatternsView } from './components/views/PatternsView';
import type {
  HypothesisDecision,
  IndexedDataset,
  KnowledgeDataset,
  ViewId,
} from './types/knowledge';
import { indexDataset } from './utils/dataset';

export interface MindArchitectureModuleProps {
  /** Public URL to knowledge_extraction_v3_2556cc71.json */
  datasetUrl?: string;
  /** Optional pre-loaded dataset if InPursuit fetches or bundles JSON directly */
  initialData?: KnowledgeDataset;
  /** Initial active tab (defaults to 'graph') */
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

const DEFAULT_DATASET_URL =
  '/assets/aistudio/knowledge_extraction_v3_2556cc71.json';
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
  datasetUrl = DEFAULT_DATASET_URL,
  initialData,
  initialView = 'graph',
  defaultHideSensitive = true,
  enableSearchShortcut = true,
  embedded = true,
  className = '',
}: MindArchitectureModuleProps) {
  const [dataset, setDataset] = useState<IndexedDataset | null>(() =>
    initialData ? indexDataset(initialData) : null
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ViewId>(initialView);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hideSensitive, setHideSensitive] = useState(defaultHideSensitive);
  const [hypothesisDecisions, setHypothesisDecisions] = useState<
    Record<string, HypothesisDecision>
  >(() => loadStoredDecisions());

  const loadArchive = useCallback(async () => {
    if (initialData) {
      setDataset(indexDataset(initialData));
      return;
    }
    setLoadError(null);
    try {
      const response = await fetch(datasetUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch archive (${response.status})`);
      }
      const raw = (await response.json()) as KnowledgeDataset;
      setDataset(indexDataset(raw));
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load intellectual archive.'
      );
    }
  }, [datasetUrl, initialData]);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        HYPOTHESIS_STORAGE_KEY,
        JSON.stringify(hypothesisDecisions)
      );
    } catch {
      // Ignore storage access errors
    }
  }, [hypothesisDecisions]);

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

  const handleUpdateHypothesis = useCallback(
    (edgeId: string, decision: HypothesisDecision) => {
      setHypothesisDecisions((prev) => ({
        ...prev,
        [edgeId]: decision,
      }));
    },
    []
  );

  const handleResetHypotheses = useCallback(() => {
    setHypothesisDecisions({});
  }, []);

  const handleFocusNodeInGraph = useCallback(
    (nodeId: string, targetView: ViewId = 'graph') => {
      if (dataset?.sensitiveNodeIds.has(nodeId) && hideSensitive) {
        setHideSensitive(false);
      }
      setSelectedNodeId(nodeId);
      setActiveView(targetView);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [dataset, hideSensitive]
  );

  const handleSelectView = useCallback((view: ViewId) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (loadError) {
    return (
      <div className="flex flex-1 min-h-[420px] items-center justify-center bg-[#080A0F] p-6 font-sans text-[#EDE9E0] antialiased">
        <div className="max-w-md border border-white/[0.1] bg-[#0D1119] p-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#D9826C]">
            Archive Unavailable
          </p>
          <h2 className="mt-2 font-sans text-base font-semibold tracking-tight">
            Could not load knowledge extraction v3
          </h2>
          <p className="mt-2 text-xs text-[#9BA3B4] leading-relaxed">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadArchive()}
            className="mt-5 border border-[#D4AF72]/45 bg-[#D4AF72]/12 px-4 py-2 text-xs text-[#EDE9E0] hover:border-[#D4AF72]/80 transition-colors"
          >
            Retry Loading Archive
          </button>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="flex flex-1 min-h-[420px] items-center justify-center bg-[#080A0F] p-6 font-sans text-[#EDE9E0] antialiased">
        <div className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#D4AF72]">
            Initializing Observatory
          </p>
          <h2 className="mt-2 font-sans text-xl font-semibold tracking-tight">
            The Architecture of My Mind
          </h2>
          <p className="mt-2 text-xs text-[#8C95A6]">
            Indexing knowledge nodes, connections, and provenance sources…
          </p>
        </div>
      </div>
    );
  }

  const rootHeightClasses =
    activeView === 'graph'
      ? 'flex-1 min-h-0 max-md:pb-[calc(68px+env(safe-area-inset-bottom))]'
      : 'flex-1 min-h-0 max-md:pb-[calc(68px+env(safe-area-inset-bottom))]';

  return (
    <div
      className={`bg-[#080A0F] font-sans text-[#EDE9E0] antialiased flex flex-col ${rootHeightClasses} ${className}`}
    >
      <TopNav
        activeView={activeView}
        onSelectView={handleSelectView}
        onOpenSearch={() => setIsSearchOpen(true)}
        embedded={embedded}
      />

      <div className="flex-1 flex flex-col min-h-0">
        {activeView === 'graph' && (
          <GraphView
            dataset={dataset}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            hideSensitive={hideSensitive}
            onToggleSensitive={() => setHideSensitive((v) => !v)}
            hypothesisDecisions={hypothesisDecisions}
            onUpdateHypothesis={handleUpdateHypothesis}
            onNavigateView={handleSelectView}
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
    </div>
  );
}

export default MindArchitectureModule;
