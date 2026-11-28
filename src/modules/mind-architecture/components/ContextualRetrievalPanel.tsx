import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Network, Search } from 'lucide-react';
import type { HypothesisDecision, IndexedDataset } from '../types/knowledge';
import { GRADE_META } from '../utils/dataset';
import { rankContextualNodes } from '../utils/contextualRetrieval';

interface ContextualRetrievalPanelProps {
  dataset: IndexedDataset;
  hideSensitive: boolean;
  hypothesisDecisions: Record<string, HypothesisDecision>;
  onFocusNodeInGraph: (nodeId: string) => void;
}

const CONTEXT_TYPES = new Set(['Goal', 'Project', 'Problem']);

export const ContextualRetrievalPanel: React.FC<ContextualRetrievalPanelProps> = ({
  dataset, hideSensitive, hypothesisDecisions, onFocusNodeInGraph,
}) => {
  const contexts = useMemo(() => dataset.raw.nodes
    .filter((node) => CONTEXT_TYPES.has(node.type))
    .filter((node) => !hideSensitive || !dataset.sensitiveNodeIds.has(node.id))
    .sort((a, b) => {
      const typeRank = (type: string) => type === 'Goal' ? 0 : type === 'Project' ? 1 : 2;
      return typeRank(a.type) - typeRank(b.type) || a.title.localeCompare(b.title);
    }), [dataset, hideSensitive]);

  const [selectedId, setSelectedId] = useState('');
  const activeId = contexts.some((node) => node.id === selectedId) ? selectedId : contexts[0]?.id ?? '';
  const results = useMemo(() => activeId
    ? rankContextualNodes(dataset, activeId, hideSensitive, hypothesisDecisions, 6)
    : [], [dataset, activeId, hideSensitive, hypothesisDecisions]);
  const active = contexts.find((node) => node.id === activeId);

  return (
    <section aria-label="Contextual retrieval" className="rounded-2xl border border-white/[0.09] bg-[#0a0b0f] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4ff3a]">Working memory · Contextual retrieval</p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-[#f5f5f3]">What matters to this goal?</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#9ba3b0]">
            Surface connected knowledge around an active goal, project or problem. Results are ranked from recorded graph relationships and shared domains—not generated conclusions.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#9ba3b0]" />
          <select
            aria-label="Choose an active goal or project"
            value={activeId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="min-w-0 max-w-[240px] bg-transparent text-xs text-[#f5f5f3] outline-none"
          >
            {contexts.map((node) => (
              <option key={node.id} value={node.id} className="bg-[#101218]">{node.type} · {node.title}</option>
            ))}
          </select>
        </div>
      </div>

      {!active ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/[0.12] p-5 text-center">
          <Network className="mx-auto h-5 w-5 text-[#7f8794]" />
          <p className="mt-2 text-sm text-[#f5f5f3]">No active context nodes yet</p>
          <p className="mt-1 text-xs text-[#9ba3b0]">Add a Goal, Project or Problem to start retrieving related knowledge.</p>
        </div>
      ) : results.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/[0.12] p-5 text-center">
          <Network className="mx-auto h-5 w-5 text-[#7f8794]" />
          <p className="mt-2 text-sm text-[#f5f5f3]">No related knowledge found</p>
          <p className="mt-1 text-xs text-[#9ba3b0]">Connect this context node to experiences, concepts or skills to make retrieval useful.</p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {results.map((result, index) => {
            const grade = GRADE_META[result.node.evidence_grade];
            return (
              <button
                key={result.node.id}
                type="button"
                onClick={() => onFocusNodeInGraph(result.node.id)}
                className="group rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 text-left transition-colors hover:border-[#d4ff3a]/35 hover:bg-white/[0.045]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-[#7f8794]">0{index + 1}</span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#89a8ff]">{result.node.type}</span>
                      <span className="font-mono text-[9px]" style={{ color: grade?.color }}>{result.node.evidence_grade}</span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-medium text-[#f5f5f3] group-hover:text-[#d4ff3a]">{result.node.title}</h3>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-[#7f8794] group-hover:text-[#d4ff3a]" />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#9ba3b0]">{result.reason}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.node.domains.slice(0, 3).map((domain) => (
                    <span key={domain} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[9px] text-[#7f8794]">{domain}</span>
                  ))}
                  {result.pathIds.length > 2 && <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[9px] text-[#7f8794]">2-step path</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-[#7f8794]">
        Evidence grade describes source quality, not relevance. Unconfirmed inferred links are down-weighted and explicitly flagged.
      </p>
    </section>
  );
};
