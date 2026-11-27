import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Clock,
  Layers,
} from 'lucide-react';
import type { IndexedDataset, KnowledgeNode } from '../../types/knowledge';
import { getDomainTheme, GRADE_META } from '../../utils/dataset';

interface EvolutionViewProps {
  dataset: IndexedDataset;
  hideSensitive: boolean;
  onFocusNodeInGraph: (nodeId: string) => void;
}

const LIFECYCLE_BUCKETS = [
  'all',
  'active',
  'completed',
  'historical',
  'paused',
  'rejected',
  'conflict',
  'unverified',
  'unknown',
  'missing',
] as const;

export const EvolutionView: React.FC<EvolutionViewProps> = ({
  dataset,
  hideSensitive,
  onFocusNodeInGraph,
}) => {
  const [lifecycleFilter, setLifecycleFilter] =
    useState<(typeof LIFECYCLE_BUCKETS)[number]>('all');
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    () => dataset.raw.sources[0]?.id ?? 'M:trading'
  );

  const { datedSources, undatedSources } = useMemo(() => {
    const dated = dataset.raw.sources
      .filter((s) => s.date !== null)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    const undated = dataset.raw.sources.filter((s) => s.date === null);
    return { datedSources: dated, undatedSources: undated };
  }, [dataset]);

  const nodesForSelectedSource = useMemo(() => {
    return dataset.raw.nodes.filter((n) => {
      if (hideSensitive && dataset.sensitiveNodeIds.has(n.id)) return false;
      return n.source_ids.includes(selectedSourceId);
    });
  }, [dataset, selectedSourceId, hideSensitive]);

  const selectedSource = dataset.sourceById.get(selectedSourceId);

  const lifecycleNodes = useMemo(() => {
    return dataset.raw.nodes.filter((n) => {
      if (hideSensitive && dataset.sensitiveNodeIds.has(n.id)) return false;
      return (
        n.type === 'Project' ||
        n.type === 'Experience' ||
        n.type === 'Goal' ||
        n.lifecycle !== null
      );
    });
  }, [dataset, hideSensitive]);

  const filteredLifecycleNodes = useMemo(() => {
    return lifecycleNodes.filter((n) => {
      if (lifecycleFilter === 'all') return true;
      if (lifecycleFilter === 'missing') return n.lifecycle === null;
      return n.lifecycle === lifecycleFilter;
    });
  }, [lifecycleNodes, lifecycleFilter]);

  const lifecycleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: lifecycleNodes.length, missing: 0 };
    for (const n of lifecycleNodes) {
      if (n.lifecycle === null) {
        counts.missing += 1;
      } else {
        counts[n.lifecycle] = (counts[n.lifecycle] ?? 0) + 1;
      }
    }
    return counts;
  }, [lifecycleNodes]);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8 space-y-8">
      {/* Masthead */}
      <div className="border-b border-white/[0.08] pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#d4ff3a]">
          Temporal Provenance & Project Lifecycles
        </p>
        <h1 className="mt-1.5 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#f5f5f3] text-balance">
          Personal Evolution
        </h1>
        <p className="mt-1.5 max-w-3xl text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">
          Chronology of memory snapshots, project and goal lifecycles, and unresolved contradictions preserved verbatim without fabrication.
        </p>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#ff8b3d]/30 bg-[#ff8b3d]/[0.07] px-4 py-3 text-[13px] sm:text-xs text-[#ffd2b0]">
          <Clock className="h-4 w-4 text-[#ff8b3d] shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-[#f5f5f3]">Epistemic Date Notice: </span>
            0 of {dataset.raw.sources.length} source records carry original conversation IDs or message timestamps. Dates below indicate when each Claude memory note was last updated or when the ChatGPT export was created—not when an idea was first explored.
          </div>
        </div>
      </div>

      {/* Section 1: Dated Memory Note Chronicle */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
          <div className="border-b border-white/[0.08] px-5 py-4 sm:px-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold tracking-tight text-[#f5f5f3]">
              Source Update Chronicle (Jul – Nov 2026)
            </h2>
            <span className="font-mono text-[11px] text-[#7c8494] tabular-nums">
              {datedSources.length} dated · {undatedSources.length} undated
            </span>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {datedSources.map((src) => {
              const isSelected = src.id === selectedSourceId;
              const nodeCount = dataset.raw.nodes.filter((n) =>
                n.source_ids.includes(src.id)
              ).length;

              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSelectedSourceId(src.id)}
                  className={`w-full text-left px-5 py-3.5 sm:px-6 flex items-center justify-between gap-4 transition-colors ${
                    isSelected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <span className="font-mono text-xs text-[#d4ff3a] tabular-nums shrink-0">
                      {src.date}
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium text-[#f5f5f3] truncate">
                        {src.id}
                      </p>
                      <p className="text-[11px] text-[#9ba3b0] truncate">
                        {src.path ?? src.file}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[11px] text-[#9ba3b0] tabular-nums">
                      {nodeCount} nodes
                    </span>
                  </div>
                </button>
              );
            })}

            {undatedSources.map((src) => {
              const isSelected = src.id === selectedSourceId;
              const nodeCount = dataset.raw.nodes.filter((n) =>
                n.source_ids.includes(src.id)
              ).length;
              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSelectedSourceId(src.id)}
                  className={`w-full text-left px-5 py-3.5 sm:px-6 flex items-center justify-between gap-4 transition-colors ${
                    isSelected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <span className="font-mono text-xs text-[#7c8494] shrink-0">
                      undated
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium text-[#f5f5f3] truncate">
                        {src.id}
                      </p>
                      <p className="text-[11px] text-[#9ba3b0] truncate">
                        {src.description}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-[#9ba3b0] tabular-nums shrink-0">
                    {nodeCount} nodes
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Snapshot Inspector */}
        <div className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] flex flex-col overflow-hidden">
          <div className="border-b border-white/[0.08] px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-[#d4ff3a]">
                {selectedSource?.id}
              </span>
              <span className="font-mono text-[11px] text-[#9ba3b0]">
                {selectedSource?.evidence_class}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] sm:text-xs text-[#d6d9e0]">
              {selectedSource?.path ??
                selectedSource?.file ??
                selectedSource?.description}
            </p>
            {selectedSource?.date && (
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[#7c8494]">
                <Calendar className="h-3 w-3" />
                <span>
                  {selectedSource.date} ({selectedSource.date_meaning})
                </span>
              </p>
            )}
          </div>

          <div className="flex-1 max-h-[520px] overflow-y-auto divide-y divide-white/[0.05]">
            {nodesForSelectedSource.slice(0, 60).map((n: KnowledgeNode) => {
              const theme = getDomainTheme(n.domains[0]);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onFocusNodeInGraph(n.id)}
                  className="w-full text-left px-5 py-3 sm:px-6 flex items-start justify-between gap-3 hover:bg-white/[0.035] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: theme.color }}
                      />
                      <span className="text-[13px] sm:text-xs font-medium text-[#f5f5f3] truncate">
                        {n.title}
                      </span>
                    </div>
                    <p className="mt-0.5 pl-3.5 text-[12px] sm:text-[11px] text-[#9ba3b0] line-clamp-1">
                      {n.type} · {n.evidence_grade} · {n.description}
                    </p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-[#7c8494] shrink-0 mt-0.5" />
                </button>
              );
            })}
            {nodesForSelectedSource.length > 60 && (
              <div className="px-6 py-3 font-mono text-[11px] text-[#7c8494]">
                Showing first 60 of {nodesForSelectedSource.length} nodes in {selectedSourceId}.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Project, Experience & Goal Lifecycle Matrix */}
      <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-display text-base sm:text-lg font-semibold tracking-tight text-[#f5f5f3]">
              Projects, Experiences & Goals Lifecycle
            </h2>
            <p className="mt-1 text-[13px] sm:text-xs text-[#9ba3b0]">
              Lifecycle state is tracked independently from mention frequency and engagement depth.
            </p>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full rounded-full border border-white/[0.08] bg-black/50 p-1">
            {LIFECYCLE_BUCKETS.map((bucket) => {
              const count = lifecycleCounts[bucket] ?? 0;
              if (bucket !== 'all' && count === 0) return null;
              return (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => setLifecycleFilter(bucket)}
                  className={`min-h-[30px] rounded-full px-3 py-1 text-[11px] font-mono whitespace-nowrap transition-colors ${
                    lifecycleFilter === bucket
                      ? 'bg-white/[0.1] text-[#d4ff3a]'
                      : 'text-[#9ba3b0] hover:text-[#f5f5f3]'
                  }`}
                >
                  {bucket} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/[0.07] bg-white/[0.02] font-mono text-[11px] text-[#7c8494]">
                <th className="py-3 px-5 sm:px-6 font-medium">Entity</th>
                <th className="py-3 px-4 font-medium">Type</th>
                <th className="py-3 px-4 font-medium">Lifecycle</th>
                <th className="py-3 px-4 font-medium">Engagement</th>
                <th className="py-3 px-4 font-medium">Grade</th>
                <th className="py-3 px-5 sm:px-6 font-medium">Summary Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filteredLifecycleNodes.map((node) => {
                const grade = GRADE_META[node.evidence_grade];
                return (
                  <tr
                    key={node.id}
                    className="hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="py-3.5 px-5 sm:px-6">
                      <button
                        type="button"
                        onClick={() => onFocusNodeInGraph(node.id)}
                        className="font-medium text-[#f5f5f3] hover:text-[#d4ff3a] text-left transition-colors"
                      >
                        {node.title}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#9ba3b0]">
                      {node.type}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      <span
                        className={
                          node.lifecycle === 'active'
                            ? 'text-[#72e3a8]'
                            : node.lifecycle === 'conflict' || node.lifecycle === 'rejected'
                            ? 'text-[#ff8b3d]'
                            : node.lifecycle === null
                            ? 'text-[#d4ff3a]'
                            : 'text-[#9ba3b0]'
                        }
                      >
                        {node.lifecycle ?? 'missing (no lifecycle)'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#9ba3b0]">
                      {node.engagement}
                    </td>
                    <td
                      className="py-3.5 px-4 font-mono text-[11px]"
                      style={{ color: grade?.color }}
                    >
                      {node.evidence_grade}
                    </td>
                    <td className="py-3.5 px-5 sm:px-6 text-[13px] sm:text-xs text-[#9ba3b0] max-w-md">
                      {node.description}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Recorded Contradictions & Conflicts */}
      <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
        <div className="border-b border-white/[0.08] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#ff8b3d]">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Preserved Contradictions</span>
          </div>
          <h2 className="mt-1.5 font-display text-base sm:text-lg font-semibold tracking-tight text-[#f5f5f3]">
            Recorded Conflicts ({dataset.raw.conflicts.length})
          </h2>
          <p className="mt-1 text-[13px] sm:text-xs text-[#9ba3b0]">
            Disagreements between exports and memory notes are kept side by side without silent overwriting.
          </p>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {dataset.raw.conflicts.map((conflict) => (
            <div
              key={conflict.topic}
              className="grid grid-cols-1 gap-4 px-5 py-4 sm:px-6 md:grid-cols-12 md:items-start"
            >
              <div className="md:col-span-3">
                <p className="font-display text-sm font-semibold tracking-tight text-[#f5f5f3]">
                  {conflict.topic}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-[#ff8b3d]">
                  {conflict.resolution}
                </p>
              </div>
              <div className="md:col-span-4 text-[13px] sm:text-xs">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#7c8494]">
                  ChatGPT Export
                </p>
                <p className="mt-1 text-[#d6d9e0]">{conflict.this_export}</p>
              </div>
              <div className="md:col-span-5 text-[13px] sm:text-xs">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#7c8494]">
                  Other Summary / Memory Source
                </p>
                <p className="mt-1 text-[#9ba3b0]">
                  {conflict.other_source || 'Multiple conflicting records in source'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: V4 Conversation Evolution Schema Readiness */}
      <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#9ba3b0]">
          <Layers className="h-3.5 w-3.5 text-[#d4ff3a]" />
          <span>3-Layer Evolution Architecture (Awaiting conversations.json)</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {[
            {
              title: '1. Observations',
              count: dataset.raw.entity_tables.observations.length,
              fields: dataset.raw.entity_schemas.observation,
              desc: 'Dated, verbatim user-message observations linking questions, decisions, and plans.',
            },
            {
              title: '2. Positions',
              count: dataset.raw.entity_tables.positions.length,
              fields: dataset.raw.entity_schemas.position,
              desc: 'User-authored stance windows (valid_from → valid_to) separated from assistant text.',
            },
            {
              title: '3. Position Changes',
              count: dataset.raw.entity_tables.position_changes.length,
              fields: dataset.raw.entity_schemas.position_change,
              desc: 'Verified shifts (reversal, refinement, scope_change); reformulation_only never counts as change.',
            },
          ].map((layer) => (
            <div key={layer.title} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold tracking-tight text-[#f5f5f3]">
                  {layer.title}
                </h3>
                <span className="font-mono text-xs text-[#7c8494] tabular-nums">
                  {layer.count} rows
                </span>
              </div>
              <p className="mt-1.5 text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">{layer.desc}</p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed text-[#7c8494]">
                {layer.fields.join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
