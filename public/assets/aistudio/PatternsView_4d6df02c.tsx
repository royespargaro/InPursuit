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
  { key: 'D', label: 'Dominance', value: 51, color: '#D4AF72' },
  { key: 'I', label: 'Influence', value: 30, color: '#7E9BC8' },
  { key: 'C', label: 'Conscientiousness', value: 13, color: '#88B3B8' },
  { key: 'S', label: 'Steadiness', value: 6, color: '#9BA3B4' },
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

  // Reconstruct the illustrative user_suggested chains from B:2 edges
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

  // SVG pentagon radar points for Big Five
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
    <div className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10 lg:py-10 space-y-10">
      {/* Masthead */}
      <div className="border-b border-white/[0.08] pb-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#D4AF72]">
          Cognitive Architecture & Self-Models
        </p>
        <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[#EDE9E0] sm:text-4xl text-balance">
          Thinking Patterns
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#9BA3B4]">
          Reported behavioral hypotheses, the 2027 Mandalart strategic architecture, user-proposed cross-domain reasoning chains, and self-reported psychometric models.
        </p>
      </div>

      {/* Section 1: 7 Reported Cognitive Patterns (Unvalidated Hypotheses) */}
      <section className="border border-white/[0.08] bg-[#0B0E16]">
        <div className="border-b border-white/[0.08] px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-[#D9826C]">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Unvalidated Hypotheses · 0 Structural Edges</span>
            </div>
            <h2 className="mt-1.5 font-serif text-2xl font-medium text-[#EDE9E0]">
              Reported Thinking & Execution Patterns ({hypothesisNodes.length})
            </h2>
          </div>
          <span className="font-mono text-xs text-[#8C95A6]">
            Awaiting corpus validation against original conversations
          </span>
        </div>

        <div className="grid grid-cols-1 divide-y divide-white/[0.05] md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-white/[0.06]">
          {hypothesisNodes.map((node, idx) => (
            <div
              key={node.id}
              className="bg-[#0B0E16] p-6 flex flex-col justify-between gap-4 hover:bg-[#101521] transition-colors"
            >
              <div>
                <div className="flex items-center justify-between font-mono text-[11px] text-[#646D7E]">
                  <span>0{idx + 1}. Hypothesis</span>
                  <span className="text-[#D9826C]">
                    confidence: {node.confidence} · {node.evidence_grade}
                  </span>
                </div>
                <h3 className="mt-2 font-serif text-xl font-medium text-[#EDE9E0] leading-snug">
                  {node.title}
                </h3>
                <p className="mt-2 text-xs text-[#9BA3B4]">{node.description}</p>
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] font-mono text-[#646D7E]">
                <span>source: {node.source_ids.join(', ')}</span>
                <button
                  type="button"
                  onClick={() => onFocusNodeInGraph(node.id)}
                  className="inline-flex items-center gap-1 text-[#D4AF72] hover:underline"
                >
                  <span>Locate</span>
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Mandalart 9x9 Core Matrix & B:2 Reasoning Chains */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Mandalart 3x3 Core */}
        <section className="lg:col-span-5 border border-white/[0.08] bg-[#0B0E16] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-[#D4AF72]">
                M:mandalart · 2027 Execution Cycle
              </p>
              <h2 className="mt-1 font-serif text-2xl font-medium text-[#EDE9E0]">
                Mandalart Core Matrix
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onFocusNodeInGraph('mandalart')}
              className="inline-flex items-center gap-1 text-xs text-[#D4AF72] hover:underline"
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Graph</span>
            </button>
          </div>

          <p className="mt-2 text-xs text-[#9BA3B4]">
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
                  className={`min-h-[96px] p-3 text-left flex flex-col justify-between border transition-colors ${
                    isCenter
                      ? 'border-[#D4AF72]/60 bg-[#D4AF72]/14 hover:bg-[#D4AF72]/22'
                      : 'border-white/[0.08] bg-[#0F131C] hover:border-white/25'
                  }`}
                >
                  <span className="font-mono text-[10px] text-[#8C95A6]">
                    {isCenter ? 'CENTER' : cell.type.toUpperCase()}
                  </span>
                  <span className="text-xs font-medium text-[#EDE9E0] leading-snug">
                    {cell.title}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* User-Proposed Reasoning Chains (B:2) */}
        <section className="lg:col-span-7 border border-white/[0.08] bg-[#0B0E16] p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-[#D4AF72]">
            <GitBranch className="h-3.5 w-3.5" />
            <span>Source B:2 · 17 User-Suggested Edges</span>
          </div>
          <h2 className="mt-1 font-serif text-2xl font-medium text-[#EDE9E0]">
            Illustrative Cross-Domain Chains
          </h2>
          <p className="mt-1.5 text-xs text-[#9BA3B4]">
            Rule: These chains were proposed as illustrative examples in your project brief—not presented as claims of deep prior discussion.
          </p>

          <div className="mt-5 space-y-4">
            {userChains.map((chain, idx) => (
              <div
                key={chain.id}
                className="border border-white/[0.07] bg-[#0F131C] p-4"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-[#646D7E] mb-2.5">
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
                          className="inline-flex items-center gap-1.5 border border-white/[0.08] bg-[#0B0E16] px-2.5 py-1 text-xs text-[#EDE9E0] hover:border-[#D4AF72]/50 transition-colors"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: theme.color }}
                          />
                          <span>{node?.title ?? nid}</span>
                        </button>
                        {nIdx < chain.nodeIds.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-[#D4AF72]/70 shrink-0" />
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
      <section className="border border-white/[0.08] bg-[#0B0E16] p-6 lg:p-8">
        <div className="border-b border-white/[0.07] pb-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-[#8C95A6]">
            Self-Reported Typologies
          </p>
          <h2 className="mt-1 font-serif text-2xl font-medium text-[#EDE9E0]">
            Personality & Self-Modeling Frameworks
          </h2>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Big Five Radar SVG */}
          <div className="lg:col-span-5 flex flex-col items-center border border-white/[0.07] bg-[#0F131C] p-5">
            <div className="w-full flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => onFocusNodeInGraph('big_five')}
                className="font-serif text-lg font-medium text-[#EDE9E0] hover:text-[#D4AF72]"
              >
                Big Five Profile
              </button>
              <span className="font-mono text-[11px] text-[#8C95A6]">
                X:export · B:1, B:2
              </span>
            </div>

            <svg width="240" height="240" viewBox="0 0 240 240" className="my-2">
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
                    stroke="rgba(226, 232, 240, 0.1)"
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
                  stroke="rgba(226, 232, 240, 0.1)"
                  strokeWidth="1"
                />
              ))}
              <polygon
                points={radarPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(212, 175, 114, 0.22)"
                stroke="#D4AF72"
                strokeWidth="1.8"
              />
              {radarPoints.map((p) => (
                <g key={p.key}>
                  <circle cx={p.x} cy={p.y} r="3.5" fill="#D4AF72" />
                  <text
                    x={p.lx}
                    y={p.ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#C9C4B8"
                    fontSize="11"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {p.key} {p.value}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          {/* DISC + MBTI + Enneagram + Human Design */}
          <div className="lg:col-span-7 space-y-5">
            {/* DISC Bars */}
            <div className="border border-white/[0.07] bg-[#0F131C] p-5">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => onFocusNodeInGraph('disc')}
                  className="font-serif text-lg font-medium text-[#EDE9E0] hover:text-[#D4AF72]"
                >
                  DISC Breakdown
                </button>
                <span className="font-mono text-[11px] text-[#8C95A6]">
                  D51 · I30 · S6 · C13
                </span>
              </div>
              <div className="space-y-2.5">
                {DISC_SCORES.map((item) => (
                  <div key={item.key} className="grid grid-cols-12 items-center gap-3 text-xs">
                    <span className="col-span-4 text-[#9BA3B4]">{item.label}</span>
                    <div className="col-span-6 h-1.5 bg-white/[0.06]">
                      <div
                        className="h-full"
                        style={{
                          width: `${item.value}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                    <span className="col-span-2 text-right font-mono text-[#EDE9E0] tabular-nums">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* MBTI / Enneagram / Human Design */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {mbtiNode && (
                <div className="border border-white/[0.07] bg-[#0F131C] p-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onFocusNodeInGraph(mbtiNode.id)}
                      className="font-serif text-lg font-medium text-[#EDE9E0] hover:text-[#D4AF72]"
                    >
                      {mbtiNode.title}
                    </button>
                    <span className="font-mono text-[11px] text-[#D4AF72]">
                      {mbtiNode.evidence_grade}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#9BA3B4]">
                    {mbtiNode.description}
                  </p>
                </div>
              )}

              {enneagramNode && (
                <div className="border border-white/[0.07] bg-[#0F131C] p-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onFocusNodeInGraph(enneagramNode.id)}
                      className="font-serif text-lg font-medium text-[#EDE9E0] hover:text-[#D4AF72]"
                    >
                      {enneagramNode.title}
                    </button>
                    <span className="font-mono text-[11px] text-[#9BA3B4]">
                      {enneagramNode.evidence_grade}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#9BA3B4]">
                    {enneagramNode.description}
                  </p>
                </div>
              )}

              {humanDesignNode && (
                <div className="border border-white/[0.07] bg-[#0F131C] p-4 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onFocusNodeInGraph(humanDesignNode.id)}
                      className="font-serif text-lg font-medium text-[#EDE9E0] hover:text-[#D4AF72]"
                    >
                      {humanDesignNode.title}
                    </button>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#D9826C]">
                      <ShieldAlert className="h-3 w-3" />
                      <span>Sensitive Review</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#9BA3B4]">
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
