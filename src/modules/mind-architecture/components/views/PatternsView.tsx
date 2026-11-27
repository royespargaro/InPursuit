import React, { useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Compass,
  GitBranch,
  ShieldAlert,
} from 'lucide-react';
import type { IndexedDataset, KnowledgeEdge } from '../../types/knowledge';
import { getDomainTheme } from '../../utils/dataset';

interface PatternsViewProps {
  dataset: IndexedDataset;
  hideSensitive: boolean;
  onFocusNodeInGraph: (nodeId: string) => void;
}

const BIG_FIVE = [
  { key: 'E', label: 'Extraversion', value: 99 },
  { key: 'C', label: 'Conscientiousness', value: 99 },
  { key: 'O', label: 'Openness', value: 90 },
  { key: 'A', label: 'Agreeableness', value: 58 },
  { key: 'N', label: 'Neuroticism', value: 33 },
];

const DISC_SCORES = [
  { key: 'D', label: 'Dominance', value: 51, color: '#d4ff3a' },
  { key: 'I', label: 'Influence', value: 30, color: '#89a8ff' },
  { key: 'C', label: 'Conscientiousness', value: 13, color: '#72e3a8' },
  { key: 'S', label: 'Steadiness', value: 6, color: '#9ba3b0' },
];

export const PatternsView: React.FC<PatternsViewProps> = ({
  dataset,
  hideSensitive,
  onFocusNodeInGraph,
}) => {
  const hypothesisNodes = useMemo(
    () => dataset.raw.nodes.filter((n) => n.type === 'Hypothesis'),
    [dataset]
  );

  const userChains = useMemo(() => {
    const suggested = dataset.raw.edges.filter((e) => e.basis === 'user_suggested');
    const outMap = new Map<string, KnowledgeEdge>();
    const targets = new Set<string>();
    for (const e of suggested) {
      outMap.set(e.source, e);
      targets.add(e.target);
    }
    const starts = suggested
      .map((e) => e.source)
      .filter((s) => !targets.has(s));

    const chains: { id: string; nodeIds: string[]; edges: KnowledgeEdge[] }[] = [];
    for (const startId of starts) {
      const nodeIds = [startId];
      const edges: KnowledgeEdge[] = [];
      let cur = startId;
      const visited = new Set<string>([startId]);
      while (outMap.has(cur)) {
        const edge = outMap.get(cur)!;
        edges.push(edge);
        if (visited.has(edge.target)) break;
        visited.add(edge.target);
        nodeIds.push(edge.target);
        cur = edge.target;
      }
      chains.push({ id: startId, nodeIds, edges });
    }
    return chains;
  }, [dataset]);

  const mandalartGrid = useMemo(() => {
    const ids = [
      'career_pillar',
      'education_pillar',
      'investing_pillar',
      'lifestyle_pillar',
      'net_worth_and_freedom_goal',
      'family_pillar',
      'impact_pillar',
      'personal_development_pillar',
      'javabali_co',
    ];
    return ids.map((id) => dataset.nodeById.get(id)).filter(Boolean);
  }, [dataset]);

  const mbtiNode = dataset.nodeById.get('mbti');
  const enneagramNode = dataset.nodeById.get('enneagram');
  const humanDesignNode = dataset.nodeById.get('human_design');
  const hideHumanDesign =
    hideSensitive && dataset.sensitiveNodeIds.has('human_design');

  const radarPoints = useMemo(() => {
    const cx = 120;
    const cy = 120;
    const maxR = 84;
    return BIG_FIVE.map((dim, idx) => {
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / BIG_FIVE.length;
      const r = (dim.value / 100) * maxR;
      return {
        ...dim,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        lx: cx + Math.cos(angle) * (maxR + 20),
        ly: cy + Math.sin(angle) * (maxR + 20),
        ax: cx + Math.cos(angle) * maxR,
        ay: cy + Math.sin(angle) * maxR,
      };
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8 space-y-8">
      {/* Masthead */}
      <div className="border-b border-white/[0.08] pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#d4ff3a]">
          Cognitive Architecture & Self-Models
        </p>
        <h1 className="mt-1.5 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#f5f5f3] text-balance">
          Thinking Patterns
        </h1>
        <p className="mt-1.5 max-w-3xl text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">
          Reported behavioral hypotheses, the 2027 Mandalart strategic architecture, user-proposed cross-domain reasoning chains, and self-reported psychometric models.
        </p>
      </div>

      {/* Section 1: Reported Cognitive Patterns */}
      <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
        <div className="border-b border-white/[0.08] px-5 py-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#ff8b3d]">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Unvalidated Hypotheses · 0 Structural Edges</span>
            </div>
            <h2 className="mt-1.5 font-display text-base sm:text-lg font-semibold tracking-tight text-[#f5f5f3]">
              Reported Thinking & Execution Patterns ({hypothesisNodes.length})
            </h2>
          </div>
          <span className="font-mono text-xs text-[#9ba3b0]">
            Awaiting corpus validation against original conversations
          </span>
        </div>

        <div className="grid grid-cols-1 divide-y divide-white/[0.05] md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-white/[0.06]">
          {hypothesisNodes.map((node, idx) => (
            <div
              key={node.id}
              className="bg-[rgba(12,13,16,0.92)] p-5 sm:p-6 flex flex-col justify-between gap-4 hover:bg-white/[0.03] transition-colors"
            >
              <div>
                <div className="flex items-center justify-between font-mono text-[11px] text-[#7c8494]">
                  <span>0{idx + 1}. Hypothesis</span>
                  <span className="text-[#ff8b3d]">
                    confidence: {node.confidence} · {node.evidence_grade}
                  </span>
                </div>
                <h3 className="mt-2 font-display text-sm sm:text-base font-semibold tracking-tight text-[#f5f5f3] leading-snug">
                  {node.title}
                </h3>
                <p className="mt-2 text-[13px] sm:text-xs text-[#9ba3b0]">{node.description}</p>
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] font-mono text-[#7c8494]">
                <span>source: {node.source_ids.join(', ')}</span>
                <button
                  type="button"
                  onClick={() => onFocusNodeInGraph(node.id)}
                  className="inline-flex items-center gap-1 min-h-[32px] text-[#d4ff3a] hover:underline"
                >
                  <span>Locate</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Mandalart 9x9 Core Matrix & B:2 Reasoning Chains */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <section className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[#d4ff3a]">
                M:mandalart · 2027 Execution Cycle
              </p>
              <h2 className="mt-1 font-display text-base sm:text-lg font-semibold tracking-tight text-[#f5f5f3]">
                Mandalart Core Matrix
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onFocusNodeInGraph('mandalart')}
              className="inline-flex items-center gap-1.5 min-h-[34px] rounded-full border border-[#d4ff3a]/35 bg-[#d4ff3a]/10 px-3 py-1 text-xs text-[#d4ff3a] hover:bg-[#d4ff3a]/20"
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Graph</span>
            </button>
          </div>

          <p className="mt-2 text-[13px] sm:text-xs text-[#9ba3b0]">
            9×9 life-architecture framework centering on Net Worth & Freedom, branching into 7 pillars and Javabali Co. as the first business.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {mandalartGrid.map((cell) => {
              if (!cell) return null;
              const isCenter = cell.id === 'net_worth_and_freedom_goal';
              return (
                <button
                  key={cell.id}
                  type="button"
                  onClick={() => onFocusNodeInGraph(cell.id)}
                  className={`min-h-[88px] sm:min-h-[96px] rounded-xl p-2.5 sm:p-3 text-left flex flex-col justify-between border transition-colors ${
                    isCenter
                      ? 'border-[#d4ff3a]/60 bg-[#d4ff3a]/12 hover:bg-[#d4ff3a]/20'
                      : 'border-white/[0.08] bg-white/[0.025] hover:border-white/25'
                  }`}
                >
                  <span className="font-mono text-[10px] text-[#9ba3b0]">
                    {isCenter ? 'CENTER' : cell.type.toUpperCase()}
                  </span>
                  <span className="text-[12px] sm:text-xs font-medium text-[#f5f5f3] leading-snug">
                    {cell.title}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#72e3a8]">
            <GitBranch className="h-3.5 w-3.5" />
            <span>Source B:2 · User-Suggested Edges</span>
          </div>
          <h2 className="mt-1 font-display text-base sm:text-lg font-semibold tracking-tight text-[#f5f5f3]">
            Illustrative Cross-Domain Chains
          </h2>
          <p className="mt-1.5 text-[13px] sm:text-xs text-[#9ba3b0]">
            Rule: These chains were proposed as illustrative examples in your project brief—not presented as claims of deep prior discussion.
          </p>

          <div className="mt-5 space-y-4">
            {userChains.map((chain, idx) => (
              <div
                key={chain.id}
                className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-[#7c8494] mb-2.5">
                  <span>Chain 0{idx + 1} · You proposed in brief</span>
                  <span>{chain.edges.length} links</span>
                </div>
                <div className="flex flex-wrap items-center gap-y-2 gap-x-1.5">
                  {chain.nodeIds.map((nid, nIdx) => {
                    const node = dataset.nodeById.get(nid);
                    const theme = getDomainTheme(node?.domains[0]);
                    return (
                      <React.Fragment key={nid}>
                        <button
                          type="button"
                          onClick={() => onFocusNodeInGraph(nid)}
                          className="inline-flex items-center gap-1.5 min-h-[32px] rounded-full border border-white/[0.08] bg-black/50 px-3 py-1 text-xs text-[#f5f5f3] hover:border-[#d4ff3a]/50 transition-colors"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: theme.color }}
                          />
                          <span>{node?.title ?? nid}</span>
                        </button>
                        {nIdx < chain.nodeIds.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-[#d4ff3a]/70 shrink-0" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Section 3: Psychometric & Self-Modeling Frameworks */}
      <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6 lg:p-8">
        <div className="border-b border-white/[0.07] pb-5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#9ba3b0]">
            Self-Reported Typologies
          </p>
          <h2 className="mt-1 font-display text-base sm:text-lg font-semibold tracking-tight text-[#f5f5f3]">
            Personality & Self-Modeling Frameworks
          </h2>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5 flex flex-col items-center rounded-xl border border-white/[0.07] bg-white/[0.025] p-5">
            <div className="w-full flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => onFocusNodeInGraph('big_five')}
                className="font-display text-sm font-semibold tracking-tight text-[#f5f5f3] hover:text-[#d4ff3a]"
              >
                Big Five Profile
              </button>
              <span className="font-mono text-[11px] text-[#9ba3b0]">
                X:export · B:1, B:2
              </span>
            </div>

            <svg width="240" height="240" viewBox="0 0 240 240" className="my-2 max-w-full">
              {[25, 50, 75, 100].map((pct) => {
                const pts = BIG_FIVE.map((_, i) => {
                  const a = -Math.PI / 2 + (i * 2 * Math.PI) / BIG_FIVE.length;
                  const r = (pct / 100) * 84;
                  return `${120 + Math.cos(a) * r},${120 + Math.sin(a) * r}`;
                }).join(' ');
                return (
                  <polygon
                    key={pct}
                    points={pts}
                    fill="none"
                    stroke="rgba(226, 232, 240, 0.12)"
                    strokeWidth="1"
                  />
                );
              })}
              {radarPoints.map((p) => (
                <line
                  key={p.key}
                  x1="120"
                  y1="120"
                  x2={p.ax}
                  y2={p.ay}
                  stroke="rgba(226, 232, 240, 0.12)"
                  strokeWidth="1"
                />
              ))}
              <polygon
                points={radarPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(212, 255, 58, 0.16)"
                stroke="#d4ff3a"
                strokeWidth="1.8"
              />
              {radarPoints.map((p) => (
                <g key={p.key}>
                  <circle cx={p.x} cy={p.y} r="3.5" fill="#d4ff3a" />
                  <text
                    x={p.lx}
                    y={p.ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#d6d9e0"
                    fontSize="11"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {p.key} {p.value}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-5">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => onFocusNodeInGraph('disc')}
                  className="font-display text-sm font-semibold tracking-tight text-[#f5f5f3] hover:text-[#d4ff3a]"
                >
                  DISC Breakdown
                </button>
                <span className="font-mono text-[11px] text-[#9ba3b0]">
                  D51 · I30 · S6 · C13
                </span>
              </div>
              <div className="space-y-2.5">
                {DISC_SCORES.map((item) => (
                  <div key={item.key} className="grid grid-cols-12 items-center gap-3 text-[13px] sm:text-xs">
                    <span className="col-span-5 sm:col-span-4 text-[#9ba3b0] truncate">{item.label}</span>
                    <div className="col-span-5 sm:col-span-6 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${item.value}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                    <span className="col-span-2 text-right font-mono text-[#f5f5f3] tabular-nums">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {mbtiNode && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onFocusNodeInGraph(mbtiNode.id)}
                      className="font-display text-sm font-semibold tracking-tight text-[#f5f5f3] hover:text-[#d4ff3a]"
                    >
                      {mbtiNode.title}
                    </button>
                    <span className="font-mono text-[11px] text-[#d4ff3a]">
                      {mbtiNode.evidence_grade}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">
                    {mbtiNode.description}
                  </p>
                </div>
              )}

              {enneagramNode && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onFocusNodeInGraph(enneagramNode.id)}
                      className="font-display text-sm font-semibold tracking-tight text-[#f5f5f3] hover:text-[#d4ff3a]"
                    >
                      {enneagramNode.title}
                    </button>
                    <span className="font-mono text-[11px] text-[#9ba3b0]">
                      {enneagramNode.evidence_grade}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">
                    {enneagramNode.description}
                  </p>
                </div>
              )}

              {humanDesignNode && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onFocusNodeInGraph(humanDesignNode.id)}
                      className="font-display text-sm font-semibold tracking-tight text-[#f5f5f3] hover:text-[#d4ff3a]"
                    >
                      {humanDesignNode.title}
                    </button>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#ff8b3d]">
                      <ShieldAlert className="h-3 w-3" />
                      <span>Sensitive Review</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">
                    {hideHumanDesign
                      ? 'Masked in Shared View mode (sensitive_review). Switch to Showing All to inspect.'
                      : humanDesignNode.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
