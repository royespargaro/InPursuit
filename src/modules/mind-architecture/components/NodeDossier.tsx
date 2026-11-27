import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Compass,
  ExternalLink,
  GitFork,
  Pencil,
  ShieldAlert,
  X,
} from 'lucide-react';
import type {
  ConnectionBasis,
  HypothesisDecision,
  IndexedDataset,
  KnowledgeEdge,
  KnowledgeNode,
  ViewId,
} from '../types/knowledge';
import { BASIS_META, getDomainTheme, GRADE_META } from '../utils/dataset';
import { classifyCognitiveLayer, COGNITIVE_LAYER_META } from '../utils/cognitiveModel';

interface NodeDossierProps {
  nodeId: string;
  dataset: IndexedDataset;
  hypothesisDecisions: Record<string, HypothesisDecision>;
  onUpdateHypothesis?: (edgeId: string, decision: HypothesisDecision) => void;
  onSelectNode: (nodeId: string) => void;
  onNavigateView?: (view: ViewId, focusSourceId?: string) => void;
  onEditNode?: (node: KnowledgeNode) => void;
  onClose: () => void;
}

const BASIS_ORDER: ConnectionBasis[] = [
  'explicit',
  'user_suggested',
  'co_discussed',
  'inferred',
  'structural',
];

export const NodeDossier: React.FC<NodeDossierProps> = ({
  nodeId,
  dataset,
  hypothesisDecisions,
  onUpdateHypothesis,
  onSelectNode,
  onNavigateView,
  onEditNode,
  onClose,
}) => {
  const node = dataset.nodeById.get(nodeId);
  if (!node) return null;

  const primaryDomain = node.domains[0] ?? '(no domain)';
  const theme = getDomainTheme(node.domains[0]);
  const grade = GRADE_META[node.evidence_grade];
  const isSensitive = dataset.sensitiveNodeIds.has(node.id);

  const connectedEdges = dataset.edgesByNodeId.get(node.id) ?? [];
  const edgesByBasis = new Map<ConnectionBasis, KnowledgeEdge[]>();
  for (const b of BASIS_ORDER) edgesByBasis.set(b, []);
  for (const edge of connectedEdges) {
    const list = edgesByBasis.get(edge.basis) ?? [];
    list.push(edge);
    edgesByBasis.set(edge.basis, list);
  }

  const relatedConflicts = dataset.raw.conflicts.filter((c) => {
    const topicL = c.topic.toLowerCase();
    const titleL = node.title.toLowerCase();
    return (
      titleL.includes(topicL.split(' ')[0]) ||
      topicL.includes(titleL.split(' ')[0])
    );
  });

  const relatedQueue = dataset.raw.entity_tables.resolution_queue.filter(
    (rq) => rq.node_a === node.id || rq.node_b === node.id
  );

  return (
    <aside
      aria-label={`Archival dossier for ${node.title}`}
      className="flex h-full flex-col border-l border-white/[0.1] bg-[#0c0d10]/98 md:bg-[#0c0d10]/94 md:backdrop-blur-md text-[#f5f5f3]"
    >
      {/* Dossier Header */}
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 sm:px-6 py-4 sm:py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider text-[#9ba3b0]">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: theme.color }}
            />
            <span className="truncate">{node.type}</span>
            <span aria-hidden="true">·</span>
            <span>Level {node.level}</span>
            <span aria-hidden="true">·</span>
            <span style={{ color: grade?.color }}>{node.evidence_grade}</span>
          </div>
          <h2 className="mt-2 font-display text-lg sm:text-base font-semibold tracking-tight leading-tight text-[#f5f5f3] text-balance">
            {node.title}
          </h2>
          <p className="mt-1 font-mono text-[11px] text-[#7f8794] break-all">
            ID: {node.id}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onEditNode && (
            <button
              type="button"
              onClick={() => onEditNode(node)}
              aria-label="Edit node"
              title="Edit node"
              className="p-2 text-[#9ba3b0] hover:text-[#d4ff3a] rounded-full border border-white/[0.1] hover:border-[#d4ff3a]/40 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dossier"
            className="p-2 text-[#9ba3b0] hover:text-[#f5f5f3] rounded-full border border-white/[0.1] hover:border-white/25 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
        {isSensitive && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#ff8b3d]/35 bg-[#ff8b3d]/10 p-3.5 text-xs text-[#ffd6ba]">
            <ShieldAlert className="h-4 w-4 text-[#ff8b3d] shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-[#f5f5f3]">Sensitive Review Item</p>
              <p className="mt-0.5 text-[#e6b697]">
                Flagged in data_quality.sensitive_review for optional hiding in shared views.
              </p>
            </div>
          </div>
        )}

        {/* Description */}
        <section>
          <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#7f8794]">
            Archival Description
          </h3>
          <p className="mt-2 text-[13px] sm:text-xs leading-relaxed text-[#d6d9e0]">
            {node.description || 'No description recorded.'}
          </p>
          {node.aliases.length > 0 && (
            <p className="mt-2 text-xs text-[#9ba3b0]">
              Aliases: <span className="text-[#f5f5f3]">{node.aliases.join(', ')}</span>
            </p>
          )}
        </section>

        {/* Cognitive lens is derived from node type and kept separate from evidence quality */}
        {(() => {
          const cognitiveLayer = classifyCognitiveLayer(node);
          const cognitiveMeta = cognitiveLayer ? COGNITIVE_LAYER_META[cognitiveLayer] : null;
          return (
            <section className="border-t border-white/[0.08] pt-5">
              <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#89a8ff]">
                Cognitive Classification
              </h3>
              <div className="mt-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <p className="text-sm font-medium text-[#f5f5f3]">
                  {cognitiveMeta?.label ?? 'Unclassified'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#9ba3b0]">
                  {cognitiveMeta?.description ?? 'This node type has not yet been assigned a cognitive lens.'}
                </p>
                <p className="mt-2 font-mono text-[10px] text-[#7f8794]">
                  Derived lens · not an evidence grade or brain-region claim
                </p>
              </div>
            </section>
          );
        })()}

        {/* Epistemic Metadata Grid */}
        <section className="border-t border-white/[0.08] pt-5">
          <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#7f8794]">
            Epistemic Classification
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <dt className="text-[#7f8794]">Evidence Grade</dt>
              <dd className="mt-0.5 font-mono font-medium" style={{ color: grade?.color }}>
                {grade?.label ?? node.evidence_grade}
              </dd>
            </div>
            <div>
              <dt className="text-[#7f8794]">Engagement</dt>
              <dd className="mt-0.5 font-mono text-[#f5f5f3]">{node.engagement}</dd>
            </div>
            <div>
              <dt className="text-[#7f8794]">Confidence</dt>
              <dd className="mt-0.5 font-mono text-[#f5f5f3]">{node.confidence}</dd>
            </div>
            <div>
              <dt className="text-[#7f8794]">Lifecycle</dt>
              <dd className="mt-0.5 font-mono text-[#f5f5f3]">
                {node.lifecycle ?? 'unrecorded'}
                {node.lifecycle_basis ? (
                  <span className="text-[#7f8794]"> ({node.lifecycle_basis})</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-[#7f8794]">Summary Mentions</dt>
              <dd className="mt-0.5 font-mono tabular-nums text-[#f5f5f3]">
                {node.mentions}
              </dd>
            </div>
            <div>
              <dt className="text-[#7f8794]">Observed Window</dt>
              <dd className="mt-0.5 font-mono text-[#9ba3b0]">
                {node.first_observed_at || node.last_observed_at
                  ? `${node.first_observed_at ?? '?'} – ${node.last_observed_at ?? '?'}`
                  : 'No conversation dates'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Domains */}
        <section className="border-t border-white/[0.08] pt-5">
          <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#7f8794]">
            Domains ({node.domains.length || 'Unassigned'})
          </h3>
          {node.domains.length === 0 ? (
            <p className="mt-2 text-xs text-[#9ba3b0]">
              No domain assigned ({node.type} without domain grouping).
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {node.domains.map((dom, idx) => {
                const t = getDomainTheme(dom);
                return (
                  <div key={dom} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-[#f5f5f3]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span>{dom}</span>
                    </span>
                    <span className="font-mono text-[10px] text-[#7f8794]">
                      {idx === 0 ? 'Primary' : 'Bridge'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {primaryDomain === '(no domain)' && node.type === 'Conversation' && (
            <p className="mt-2 font-mono text-[11px] text-[#9ba3b0]">
              conversation_id: null · original_available: false · date: null
            </p>
          )}
        </section>

        {/* Provenance Sources */}
        <section className="border-t border-white/[0.08] pt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#7f8794]">
              Provenance Sources ({node.source_ids.length})
            </h3>
            {onNavigateView && (
              <button
                type="button"
                onClick={() => onNavigateView('evidence')}
                className="inline-flex items-center gap-1 text-[11px] text-[#d4ff3a] hover:underline"
              >
                <span>Open Ledger</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="mt-2.5 space-y-2">
            {node.source_ids.map((sid) => {
              const src = dataset.sourceById.get(sid);
              return (
                <div
                  key={sid}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium text-[#d4ff3a]">{sid}</span>
                    <span className="font-mono text-[10px] text-[#9ba3b0]">
                      {src?.evidence_class ?? 'unknown'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#9ba3b0]">
                    {src?.path ?? src?.file ?? src?.description ?? src?.source_type}
                  </p>
                  {src?.date && (
                    <p className="mt-1 font-mono text-[10px] text-[#7f8794]">
                      {src.date} · {src.date_meaning}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Connected Relationships grouped by Basis */}
        <section className="border-t border-white/[0.08] pt-5">
          <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#7f8794]">
            Connections ({connectedEdges.length})
          </h3>

          {connectedEdges.length === 0 ? (
            <p className="mt-2 text-xs text-[#9ba3b0]">
              No edges attached yet in dataset v{dataset.raw.version}.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {BASIS_ORDER.map((basis) => {
                const list = edgesByBasis.get(basis) ?? [];
                if (list.length === 0) return null;
                const meta = BASIS_META[basis];

                return (
                  <div key={basis}>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="font-medium" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                      <span className="font-mono text-[#7f8794] tabular-nums">
                        {list.length}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {list.map((edge) => {
                        const isOutgoing = edge.source === node.id;
                        const otherId = isOutgoing ? edge.target : edge.source;
                        const otherNode = dataset.nodeById.get(otherId);
                        const decision = hypothesisDecisions[edge.id] ?? 'unreviewed';

                        return (
                          <div
                            key={edge.id}
                            className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => onSelectNode(otherId)}
                                className="inline-flex items-center gap-1.5 text-left font-medium text-[#f5f5f3] hover:text-[#d4ff3a] transition-colors min-w-0"
                              >
                                <span className="font-mono text-[10px] text-[#7f8794]">
                                  {isOutgoing ? '→' : '←'}
                                </span>
                                <span className="truncate">
                                  {otherNode?.title ?? otherId}
                                </span>
                                <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" />
                              </button>
                              <span className="font-mono text-[10px] text-[#7f8794] shrink-0">
                                {edge.relationship}
                              </span>
                            </div>

                            <p className="mt-1 text-xs leading-snug text-[#9ba3b0]">
                              {edge.explanation}
                            </p>

                            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[#7f8794]">
                              <span>{edge.presentation_rule}</span>
                              <span>{edge.id}</span>
                            </div>

                            {basis === 'inferred' && onUpdateHypothesis && (
                              <div className="mt-2 flex items-center gap-2 border-t border-white/[0.06] pt-2">
                                <span className="text-[10px] font-mono text-[#ff8b3d]">
                                  Session review: {decision}
                                </span>
                                <div className="ml-auto flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateHypothesis(
                                        edge.id,
                                        decision === 'confirmed' ? 'unreviewed' : 'confirmed'
                                      )
                                    }
                                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono border transition-colors ${
                                      decision === 'confirmed'
                                        ? 'border-[#72e3a8] bg-[#72e3a8]/20 text-[#72e3a8]'
                                        : 'border-white/15 text-[#9ba3b0] hover:text-[#f5f5f3]'
                                    }`}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateHypothesis(
                                        edge.id,
                                        decision === 'rejected' ? 'unreviewed' : 'rejected'
                                      )
                                    }
                                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono border transition-colors ${
                                      decision === 'rejected'
                                        ? 'border-[#ff8b3d] bg-[#ff8b3d]/20 text-[#ff8b3d]'
                                        : 'border-white/15 text-[#9ba3b0] hover:text-[#f5f5f3]'
                                    }`}
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Resolution Queue & Conflict Notices */}
        {(relatedQueue.length > 0 || relatedConflicts.length > 0) && (
          <section className="border-t border-white/[0.08] pt-5 space-y-3">
            <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#7f8794]">
              Audit Flags
            </h3>
            {relatedQueue.map((rq) => {
              const partnerId = rq.node_a === node.id ? rq.node_b : rq.node_a;
              const partner = dataset.nodeById.get(partnerId);
              return (
                <div
                  key={rq.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs"
                >
                  <div className="flex items-center gap-2 text-[#d4ff3a] font-mono text-[11px]">
                    <GitFork className="h-3.5 w-3.5" />
                    <span>Resolution Queue · {rq.id}</span>
                  </div>
                  <p className="mt-1 text-[#d6d9e0]">
                    Overlap with{' '}
                    <button
                      type="button"
                      onClick={() => onSelectNode(partnerId)}
                      className="underline decoration-[#d4ff3a]/50 hover:text-[#d4ff3a]"
                    >
                      {partner?.title ?? partnerId}
                    </button>
                  </p>
                  <p className="mt-1 text-xs text-[#9ba3b0]">{rq.proposed_action}</p>
                </div>
              );
            })}

            {relatedConflicts.map((c) => (
              <div
                key={c.topic}
                className="rounded-xl border border-[#ff8b3d]/35 bg-[#ff8b3d]/10 p-3 text-xs"
              >
                <div className="flex items-center gap-2 font-mono text-[11px] text-[#ff8b3d]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Recorded Conflict · {c.topic}</span>
                </div>
                <p className="mt-1 text-[#f5f5f3]">{c.this_export}</p>
                {c.other_source && (
                  <p className="mt-0.5 text-[#9ba3b0]">vs. {c.other_source}</p>
                )}
                <p className="mt-1 font-mono text-[10px] text-[#9ba3b0]">
                  Status: {c.resolution}
                </p>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* Footer Quick Jump */}
      {onNavigateView && (
        <div className="flex items-center justify-between border-t border-white/[0.08] bg-black/50 px-5 sm:px-6 py-3 text-xs">
          <button
            type="button"
            onClick={() => onNavigateView('atlas')}
            className="inline-flex items-center gap-1.5 text-[#9ba3b0] hover:text-[#d4ff3a] transition-colors"
          >
            <Compass className="h-3.5 w-3.5 text-[#d4ff3a]" />
            <span>View in Domain Atlas</span>
          </button>
          <span className="font-mono text-[10px] text-[#7f8794]">
            {connectedEdges.length} edges
          </span>
        </div>
      )}
    </aside>
  );
};
