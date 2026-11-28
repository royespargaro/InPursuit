import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Database,
  Download,
  FileCode2,
  GitFork,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { HypothesisDecision, IndexedDataset } from '../../types/knowledge';
import { useMindWorkspaceOptional } from '../../context/MindWorkspaceContext';
import { PersonalModelView } from './PersonalModelView';
import { BASIS_META, GRADE_META } from '../../utils/dataset';

interface EvidenceViewProps {
  dataset: IndexedDataset;
  hideSensitive: boolean;
  hypothesisDecisions: Record<string, HypothesisDecision>;
  onUpdateHypothesis: (edgeId: string, decision: HypothesisDecision) => void;
  onResetHypotheses: () => void;
  onFocusNodeInGraph: (nodeId: string) => void;
}

type EvidenceTab =
  | 'sources'
  | 'hypotheses'
  | 'resolution'
  | 'orphans'
  | 'ingestion'\n  | 'personal';

const INGESTION_STAGES = [
  { stage: '0. Intake', desc: 'Detect conversations.json or shards, hash each file, verify list schema.' },
  { stage: '1. Register', desc: 'Read original conversation_id, title, create_time, update_time (raw + UTC ISO).' },
  { stage: '2. Linearize', desc: 'Walk current_node back to root for main thread; preserve edits as alternate branches.' },
  { stage: '3. Message Records', desc: 'Classify author_kind: user_message (primary), user_profile_text (context), assistant_context, tool_output.' },
  { stage: '4. Candidate Extraction', desc: 'Deterministic English/Indonesian/Spanish question detection + model-assisted extraction with verbatim excerpts.' },
  { stage: '5. Validation', desc: 'Reject any proposal with unknown message_ref, non-user author, or non-verbatim excerpt.' },
  { stage: '6. Entity Resolution', desc: 'Exact normalized title/alias match links evidence; partial overlap routes to resolution_queue (never auto-merged).' },
  { stage: '7. Dedup & Merge', desc: 'Append-only merge; preserve summary sources; recompute evidence_grade up to Q4.' },
  { stage: '8. Coverage Report', desc: 'Per-batch metrics for processed, partial, skipped_empty, failed_parse, rejects, and conflicts.' },
];

export const EvidenceView: React.FC<EvidenceViewProps> = ({
  dataset,
  hideSensitive,
  hypothesisDecisions,
  onUpdateHypothesis,
  onResetHypotheses,
  onFocusNodeInGraph,
}) => {
  const [activeTab, setActiveTab] = useState<EvidenceTab>('personal');
  const workspace = useMindWorkspaceOptional();
  const [sourceClassFilter, setSourceClassFilter] = useState<string>('all');

  const inferredEdges = useMemo(
    () => dataset.raw.edges.filter((e) => e.basis === 'inferred'),
    [dataset]
  );

  const filteredSources = useMemo(() => {
    if (sourceClassFilter === 'all') return dataset.raw.sources;
    return dataset.raw.sources.filter((s) => s.evidence_class === sourceClassFilter);
  }, [dataset, sourceClassFilter]);

  const noEdgeNodes = useMemo(() => {
    return dataset.raw.nodes.filter((n) => {
      if (hideSensitive && dataset.sensitiveNodeIds.has(n.id)) return false;
      return (dataset.edgesByNodeId.get(n.id)?.length ?? 0) === 0;
    });
  }, [dataset, hideSensitive]);

  const decisionCounts = useMemo(() => {
    let confirmed = 0;
    let rejected = 0;
    for (const e of inferredEdges) {
      const d = hypothesisDecisions[e.id];
      if (d === 'confirmed') confirmed += 1;
      else if (d === 'rejected') rejected += 1;
    }
    return {
      confirmed,
      rejected,
      unreviewed: inferredEdges.length - confirmed - rejected,
    };
  }, [inferredEdges, hypothesisDecisions]);

  const handleExportReviewDecisions = () => {
    const payload = {
      dataset_version: dataset.raw.version,
      exported_at: new Date().toISOString(),
      inferred_edge_reviews: inferredEdges.map((e) => ({
        edge_id: e.id,
        source: e.source,
        target: e.target,
        decision: hypothesisDecisions[e.id] ?? 'unreviewed',
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inferred_edge_reviews.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const dq = dataset.raw.data_quality;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8 space-y-8">
      {/* Masthead */}
      <div className="border-b border-white/[0.08] pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#d4ff3a]">
          Epistemic Audit & Provenance Ledger
        </p>
        <h1 className="mt-1.5 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#f5f5f3] text-balance">
          Evidence Explorer
        </h1>
        <p className="mt-1.5 max-w-3xl text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">
          Inspect source provenance, verify evidence grades (Q1–Q4), review unconfirmed assistant hypotheses, and audit candidate duplicate pairs without altering immutable IDs.
        </p>
      </div>

      {/* Dataset Integrity & Grade Strip */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Preserved Nodes', val: dataset.raw.nodes.length, sub: '0 duplicate IDs' },
          { label: 'Preserved Edges', val: dataset.raw.edges.length, sub: '0 dangling edges' },
          { label: 'Q3 Practice / Multi', val: dq.evidence_grades.Q3 ?? 0, sub: 'Highest current tier' },
          { label: 'Q2 Single Summary', val: dq.evidence_grades.Q2 ?? 0, sub: 'Secondary summaries' },
          { label: 'Q1 Brief / Proposal', val: dq.evidence_grades.Q1 ?? 0, sub: 'Unexplored / proposed' },
          { label: 'Q4 Conversations', val: dq.evidence_grades.Q4 ?? 0, sub: `0 of ${dataset.raw.sources.length} sources original` },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-4"
          >
            <p className="text-[11px] text-[#9ba3b0]">{kpi.label}</p>
            <p className="mt-1 font-mono text-2xl font-medium text-[#f5f5f3] tabular-nums">
              {kpi.val}
            </p>
            <p className="mt-1 font-mono text-[10px] text-[#7c8494]">{kpi.sub}</p>
          </div>
        ))}
      </section>

      {/* Dataset Rules & Evidence Grade Definitions */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#72e3a8]">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Invariant Dataset Rules ({dataset.raw.rules.length})</span>
          </div>
          <ul className="mt-4 space-y-2 text-[13px] sm:text-xs text-[#d6d9e0]">
            {dataset.raw.rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2.5">
                <span className="font-mono text-[#7c8494]">—</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-6 rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#d4ff3a]">
            <Database className="h-3.5 w-3.5" />
            <span>Evidence Grades & Structural Share</span>
          </div>
          <div className="mt-4 space-y-2.5">
            {(['Q4', 'Q3', 'Q2', 'Q1'] as const).map((g) => {
              const meta = GRADE_META[g];
              return (
                <div key={g} className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4 text-[13px] sm:text-xs">
                  <span className="font-mono font-medium shrink-0" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <span className="sm:text-right text-[#9ba3b0]">
                    {dataset.raw.evidence_grades[g]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t border-white/[0.06] pt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#9ba3b0]">
            <span>Structural share: {(dq.structural_share * 100).toFixed(1)}%</span>
            <span>Nodes with structural-only edges: {dq.nodes_with_only_structural_edges}</span>
          </div>
        </div>
      </section>

      {/* Interactive Workbench Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-white/[0.08] pb-3">
        {(
          [
            { id: 'personal', label: `Personal Model (${workspace?.record.model.claims.length ?? 0})` },
            { id: 'sources', label: `Sources Registry (${dataset.raw.sources.length})` },
            { id: 'hypotheses', label: `Inferred Hypotheses (${inferredEdges.length})` },
            {
              id: 'resolution',
              label: `Resolution Queue (${dataset.raw.entity_tables.resolution_queue.length})`,
            },
            { id: 'orphans', label: `Unconnected & Change Log (${noEdgeNodes.length})` },
            { id: 'ingestion', label: 'Ingestion Spec (v4)' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[38px] sm:min-h-[34px] rounded-full px-4 py-1.5 text-[13px] sm:text-xs whitespace-nowrap shrink-0 border transition-colors ${
              activeTab === tab.id
                ? 'border-[#d4ff3a]/50 bg-[#d4ff3a]/12 text-[#d4ff3a] font-medium'
                : 'border-white/[0.08] text-[#9ba3b0] hover:text-[#f5f5f3]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'personal' && <PersonalModelView hideSensitive={hideSensitive} />}\n\n      {/* TAB 1: Sources Registry */}
      {activeTab === 'sources' && (
        <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:px-6">
            <h2 className="font-display text-sm sm:text-base font-semibold tracking-tight text-[#f5f5f3]">
              Source Provenance Records
            </h2>
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full rounded-full border border-white/[0.08] bg-black/50 p-1">
              {[
                'all',
                'summary_claude_memory',
                'summary_chatgpt',
                'user_brief',
                'assistant_inferred',
              ].map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setSourceClassFilter(cls)}
                  className={`min-h-[30px] rounded-full px-3 py-1 font-mono text-[11px] whitespace-nowrap transition-colors ${
                    sourceClassFilter === cls
                      ? 'bg-white/[0.1] text-[#d4ff3a]'
                      : 'text-[#9ba3b0] hover:text-[#f5f5f3]'
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.02] font-mono text-[11px] text-[#7c8494]">
                  <th className="py-3 px-5 sm:px-6 font-medium">Source ID</th>
                  <th className="py-3 px-4 font-medium">Class</th>
                  <th className="py-3 px-4 font-medium">Path / Description</th>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Reliability</th>
                  <th className="py-3 px-5 sm:px-6 font-medium text-right">Linked Nodes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredSources.map((src) => {
                  const count = dataset.raw.nodes.filter((n) =>
                    n.source_ids.includes(src.id)
                  ).length;
                  return (
                    <tr key={src.id} className="hover:bg-white/[0.03]">
                      <td className="py-3 px-5 sm:px-6 font-mono font-medium text-[#d4ff3a]">
                        {src.id}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#9ba3b0]">
                        {src.evidence_class}
                      </td>
                      <td className="py-3 px-4 text-[#d6d9e0]">
                        {src.path ?? src.file ?? src.description}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#9ba3b0] tabular-nums">
                        {src.date ?? 'null'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#9ba3b0]">
                        {src.reliability}
                      </td>
                      <td className="py-3 px-5 sm:px-6 font-mono text-right text-[#f5f5f3] tabular-nums">
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: Inferred Hypotheses Workbench */}
      {activeTab === 'hypotheses' && (
        <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-display text-sm sm:text-base font-semibold tracking-tight text-[#f5f5f3]">
                Unreviewed Assistant Hypotheses ({inferredEdges.length})
              </h2>
              <p className="mt-1 text-[13px] sm:text-xs text-[#9ba3b0]">
                Session review: {decisionCounts.unreviewed} unreviewed ·{' '}
                <span className="text-[#72e3a8]">{decisionCounts.confirmed} confirmed</span> ·{' '}
                <span className="text-[#ff8b3d]">{decisionCounts.rejected} dismissed</span>. Does not mutate the JSON dataset.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResetHypotheses}
                className="inline-flex items-center gap-1.5 min-h-[36px] rounded-full border border-white/[0.1] px-3.5 py-1.5 text-xs text-[#9ba3b0] hover:text-[#f5f5f3]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleExportReviewDecisions}
                className="inline-flex items-center gap-1.5 min-h-[36px] rounded-full border border-[#d4ff3a]/40 bg-[#d4ff3a]/12 px-3.5 py-1.5 text-xs font-medium text-[#d4ff3a] hover:bg-[#d4ff3a]/20"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Decisions</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {inferredEdges.map((edge) => {
              const sNode = dataset.nodeById.get(edge.source);
              const tNode = dataset.nodeById.get(edge.target);
              const decision = hypothesisDecisions[edge.id] ?? 'unreviewed';

              return (
                <div
                  key={edge.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] sm:text-xs">
                      <span className="font-mono text-[11px] text-[#7c8494]">
                        {edge.id}
                      </span>
                      <button
                        type="button"
                        onClick={() => onFocusNodeInGraph(edge.source)}
                        className="font-medium text-[#f5f5f3] hover:text-[#d4ff3a]"
                      >
                        {sNode?.title ?? edge.source}
                      </button>
                      <span className="font-mono text-[#ff8b3d]">→</span>
                      <button
                        type="button"
                        onClick={() => onFocusNodeInGraph(edge.target)}
                        className="font-medium text-[#f5f5f3] hover:text-[#d4ff3a]"
                      >
                        {tNode?.title ?? edge.target}
                      </button>
                      <span className="font-mono text-[11px] text-[#9ba3b0]">
                        · confidence: {edge.confidence}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] sm:text-xs text-[#9ba3b0]">{edge.explanation}</p>
                    <p className="mt-1 font-mono text-[10px] text-[#7c8494]">
                      {BASIS_META.inferred.ruleNote}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateHypothesis(
                          edge.id,
                          decision === 'confirmed' ? 'unreviewed' : 'confirmed'
                        )
                      }
                      className={`inline-flex items-center gap-1 min-h-[36px] rounded-full border px-3.5 py-1.5 font-mono text-[11px] transition-colors ${
                        decision === 'confirmed'
                          ? 'border-[#72e3a8] bg-[#72e3a8]/18 text-[#72e3a8]'
                          : 'border-white/[0.1] text-[#9ba3b0] hover:text-[#f5f5f3]'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Confirm</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateHypothesis(
                          edge.id,
                          decision === 'rejected' ? 'unreviewed' : 'rejected'
                        )
                      }
                      className={`inline-flex items-center gap-1 min-h-[36px] rounded-full border px-3.5 py-1.5 font-mono text-[11px] transition-colors ${
                        decision === 'rejected'
                          ? 'border-[#ff8b3d] bg-[#ff8b3d]/18 text-[#ff8b3d]'
                          : 'border-white/[0.1] text-[#9ba3b0] hover:text-[#f5f5f3]'
                      }`}
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Dismiss</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 3: Resolution Queue */}
      {activeTab === 'resolution' && (
        <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
          <div className="border-b border-white/[0.08] px-5 py-4 sm:px-6">
            <h2 className="font-display text-sm sm:text-base font-semibold tracking-tight text-[#f5f5f3]">
              Entity Resolution Queue ({dataset.raw.entity_tables.resolution_queue.length} pairs)
            </h2>
            <p className="mt-1 text-[13px] sm:text-xs text-[#9ba3b0]">
              Possible duplicate or parent/child pairs queued for human review. Nothing is auto-merged.
            </p>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {dataset.raw.entity_tables.resolution_queue.map((rq) => {
              const nodeA = dataset.nodeById.get(rq.node_a);
              const nodeB = dataset.nodeById.get(rq.node_b);
              return (
                <div
                  key={rq.id}
                  className="grid grid-cols-1 gap-3 px-5 py-3.5 sm:px-6 md:grid-cols-12 md:items-center text-[13px] sm:text-xs"
                >
                  <div className="md:col-span-1 font-mono text-[#7c8494]">{rq.id}</div>
                  <div className="md:col-span-4">
                    <button
                      type="button"
                      onClick={() => onFocusNodeInGraph(rq.node_a)}
                      className="font-medium text-[#f5f5f3] hover:text-[#d4ff3a] text-left"
                    >
                      {nodeA?.title ?? rq.node_a}
                    </button>
                    <p className="font-mono text-[10px] text-[#7c8494]">
                      {nodeA?.type} · {nodeA?.evidence_grade}
                    </p>
                  </div>
                  <div className="md:col-span-1 flex justify-start md:justify-center text-[#d4ff3a]">
                    <GitFork className="h-3.5 w-3.5" />
                  </div>
                  <div className="md:col-span-4">
                    <button
                      type="button"
                      onClick={() => onFocusNodeInGraph(rq.node_b)}
                      className="font-medium text-[#f5f5f3] hover:text-[#d4ff3a] text-left"
                    >
                      {nodeB?.title ?? rq.node_b}
                    </button>
                    <p className="font-mono text-[10px] text-[#7c8494]">
                      {nodeB?.type} · {nodeB?.evidence_grade}
                    </p>
                  </div>
                  <div className="md:col-span-2 md:text-right font-mono text-[11px] text-[#9ba3b0]">
                    {rq.reason} · {rq.status}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 4: Unconnected Nodes & Change Log */}
      {activeTab === 'orphans' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <section className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
            <div className="border-b border-white/[0.08] px-5 py-4 sm:px-6">
              <h2 className="font-display text-sm sm:text-base font-semibold tracking-tight text-[#f5f5f3]">
                Nodes Without Edges ({noEdgeNodes.length})
              </h2>
              <p className="mt-1 text-[13px] sm:text-xs text-[#9ba3b0]">
                Includes the 7 reported Hypothesis patterns and undated Conversation titles from the export.
              </p>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {noEdgeNodes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6 text-[13px] sm:text-xs"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onFocusNodeInGraph(n.id)}
                      className="font-medium text-[#f5f5f3] hover:text-[#d4ff3a] text-left"
                    >
                      {n.title}
                    </button>
                    <p className="font-mono text-[10px] text-[#7c8494]">
                      {n.type} · {n.evidence_grade} · {n.source_ids.join(', ')}
                    </p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-[#7c8494] shrink-0" />
                </div>
              ))}
            </div>
          </section>

          <section className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-sm sm:text-base font-semibold tracking-tight text-[#f5f5f3]">
              Dataset Change Log (v2 → v3)
            </h2>
            {dataset.raw.change_log.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-[13px] sm:text-xs"
              >
                <div className="flex items-center justify-between font-mono text-[11px] text-[#d4ff3a]">
                  <span>{entry.id}</span>
                  <span>{entry.type}</span>
                </div>
                <p className="mt-1.5 text-[#d6d9e0] leading-relaxed">
                  {entry.reason ?? entry.detail}
                </p>
                {entry.edge_id && (
                  <p className="mt-1 font-mono text-[10px] text-[#7c8494]">
                    edge_id: {entry.edge_id} (before: {String(entry.before)} → after:{' '}
                    {String(entry.after)})
                  </p>
                )}
              </div>
            ))}
          </section>
        </div>
      )}

      {/* TAB 5: Ingestion Architecture Spec */}
      {activeTab === 'ingestion' && (
        <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#d4ff3a]">
            <FileCode2 className="h-3.5 w-3.5" />
            <span>ingest_chatgpt_export.py · Stages 0–8</span>
          </div>
          <h2 className="mt-1.5 font-display text-base sm:text-lg font-semibold tracking-tight text-[#f5f5f3]">
            Conversation Evidence Ingestion Architecture
          </h2>
          <p className="mt-1.5 max-w-3xl text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">
            Designed to promote nodes to Q4 when original ChatGPT conversations.json exports are supplied—enforcing verbatim user-message provenance and rejecting ungrounded extractor proposals.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            {INGESTION_STAGES.map((s) => (
              <div
                key={s.stage}
                className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"
              >
                <p className="font-mono text-xs font-medium text-[#d4ff3a]">{s.stage}</p>
                <p className="mt-1.5 text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
