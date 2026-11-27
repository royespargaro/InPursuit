/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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

const DATASET_URL = '/assets/aistudio/knowledge_extraction_v3_2556cc71.json';
const HYPOTHESIS_STORAGE_KEY = 'architecture_of_my_mind_v3_hypotheses';

function loadStoredDecisions(): Record<string, HypothesisDecision> {
  try {
    const raw = window.localStorage.getItem(HYPOTHESIS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, HypothesisDecision>;
    }
  } catch {
    // Ignore storage parse/access errors
  }
  return {};
}

export default function App() {
  const [dataset, setDataset] = useState<IndexedDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ViewId>('graph');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hideSensitive, setHideSensitive] = useState(true);
  const [hypothesisDecisions, setHypothesisDecisions] = useState<
    Record<string, HypothesisDecision>
  >(() => loadStoredDecisions());

  const loadArchive = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch(DATASET_URL);
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
  }, []);

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
      // Ignore storage quota/access errors
    }
  }, [hypothesisDecisions]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

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
      <div className="min-h-screen bg-[#080A0F] text-[#EDE9E0] flex items-center justify-center p-6">
        <div className="max-w-md border border-white/[0.1] bg-[#0D1119] p-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#D9826C]">
            Archive Unavailable
          </p>
          <h1 className="mt-2 font-serif text-2xl font-medium">
            Could not load knowledge extraction v3
          </h1>
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
      <div className="min-h-screen bg-[#080A0F] text-[#EDE9E0] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#D4AF72]">
            Initializing Observatory
          </p>
          <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight">
            The Architecture of My Mind
          </h1>
          <p className="mt-2 text-xs text-[#8C95A6]">
            Indexing 303 nodes, 357 connections, and 20 provenance sources…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080A0F] text-[#EDE9E0] flex flex-col">
      <TopNav
        activeView={activeView}
        onSelectView={handleSelectView}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      <main className="flex-1 flex flex-col">
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
      </main>

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
