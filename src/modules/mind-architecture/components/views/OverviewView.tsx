import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Compass,
  Layers,
  Plus,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  HypothesisDecision,
  IndexedDataset,
  MindWorkspaceProfile,
  RecentExplorationEntry,
  ViewId,
} from '../../types/knowledge';
import type { MindSyncState } from '../../context/MindWorkspaceContext';
import { CognitiveArchitecturePanel } from '../CognitiveArchitecturePanel';
import { ContextualRetrievalPanel } from '../ContextualRetrievalPanel';
import { computeMindInsights } from '../../services/mindBuilder';
import {
  computeCelestialLayout,
  getDomainTheme,
  GRADE_META,
  type CelestialLayout,
} from '../../utils/dataset';

interface OverviewViewProps {
  dataset: IndexedDataset;
  layout?: CelestialLayout | null;
  profile: MindWorkspaceProfile;
  syncState: MindSyncState;
  syncNotice: string | null;
  hideSensitive: boolean;
  hypothesisDecisions: Record<string, HypothesisDecision>;
  recentExplorations: RecentExplorationEntry[];
  canSeedFromGoals: boolean;
  onUpdateHypothesis: (edgeId: string, decision: HypothesisDecision) => void;
  onFocusNodeInGraph: (nodeId: string, targetView?: ViewId) => void;
  onContinueExploring: (preferredNodeId?: string) => void;
  onNavigateView: (view: ViewId) => void;
  onOpenCustomize: (initialTab?: 'setup' | 'node' | 'edge' | 'notes') => void;
  onSeedFromGoals?: () => void;
}

const SYNC_STATUS_LABELS: Record<MindSyncState, string> = {
  synced: 'Synced',
  syncing: 'Syncing…',
  local: 'Device storage',
  offline: 'Offline cache',
  error: 'Saved locally',
};

function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'Recently';
  const diffMin = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  dataset,
  layout: externalLayout,
  profile,
  syncState,
  syncNotice,
  hideSensitive,
  hypothesisDecisions,
  recentExplorations,
  canSeedFromGoals,
  onUpdateHypothesis,
  onFocusNodeInGraph,
  onContinueExploring,
  onNavigateView,
  onOpenCustomize,
  onSeedFromGoals,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [focusedDomain, setFocusedDomain] = useState<string>('all');
  const [hoveredNode, setHoveredNode] = useState<{
    id: string;
    title: string;
    domain: string;
    grade: string;
  } | null>(null);

  const layout = useMemo(
    () => externalLayout ?? computeCelestialLayout(dataset),
    [externalLayout, dataset]
  );

  const insights = useMemo(
    () => computeMindInsights(dataset, hypothesisDecisions, hideSensitive),
    [dataset, hypothesisDecisions, hideSensitive]
  );

  const domainButtons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of dataset.raw.nodes) {
      if (hideSensitive && dataset.sensitiveNodeIds.has(node.id)) continue;
      const dom = node.domains[0];
      if (!dom) continue;
      counts.set(dom, (counts.get(dom) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([domain, count]) => ({
        domain,
        count,
        theme: getDomainTheme(domain),
      }));
  }, [dataset, hideSensitive]);

  const pendingInferredEdges = useMemo(() => {
    return dataset.raw.edges.filter((edge) => {
      if (edge.basis !== 'inferred') return false;
      const decision = hypothesisDecisions[edge.id];
      return decision !== 'confirmed' && decision !== 'rejected';
    });
  }, [dataset, hypothesisDecisions]);

  const recentItems = useMemo(() => {
    const validRecent = recentExplorations
      .map((entry) => {
        const node = dataset.nodeById.get(entry.nodeId);
        if (!node) return null;
        if (hideSensitive && dataset.sensitiveNodeIds.has(node.id)) return null;
        return {
          nodeId: node.id,
          title: node.title,
          type: node.type,
          domain: node.domains[0] ?? entry.domain ?? 'Unmapped',
          grade: node.evidence_grade,
          metaLabel: formatRelativeTime(entry.visitedAt),
          isSuggested: false,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, 5);

    if (validRecent.length > 0) return validRecent;

    return dataset.raw.nodes
      .filter((n) => {
        if (hideSensitive && dataset.sensitiveNodeIds.has(n.id)) return false;
        return n.type !== 'Discipline' && (n.evidence_grade === 'Q4' || n.evidence_grade === 'Q3');
      })
      .sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0))
      .slice(0, 4)
      .map((node) => ({
        nodeId: node.id,
        title: node.title,
        type: node.type,
        domain: node.domains[0] ?? 'Unmapped',
        grade: node.evidence_grade,
        metaLabel: 'Core anchor',
        isSuggested: true,
      }));
  }, [dataset, hideSensitive, recentExplorations]);

  const lastExploredId = recentItems[0]?.nodeId;

  // Projected screen coordinates for fast zero-lag canvas hover/click hit-testing
  const screenNodesRef = useRef<
    Array<{ id: string; title: string; domain: string; grade: string; x: number; y: number; r: number }>
  >([]);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    const rect = stage.getBoundingClientRect();
    const width = Math.max(280, Math.round(rect.width || canvas.clientWidth || 720));
    const height = Math.max(240, Math.round(rect.height || canvas.clientHeight || 360));
    const dpr = Math.min(window.devicePixelRatio || 1, width < 640 ? 1.5 : 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padX = width < 540 ? 20 : 36;
    const padY = 24;
    const availW = Math.max(120, width - padX * 2);
    const availH = Math.max(120, height - padY * 2);

    let minX = layout.width * 0.1;
    let maxX = layout.width * 0.9;
    let minY = layout.height * 0.1;
    let maxY = layout.height * 0.9;

    if (focusedDomain !== 'all') {
      const anchor = layout.clusters.get(focusedDomain);
      if (anchor) {
        const span = Math.max(260, anchor.orbitRadius * 2.3);
        minX = anchor.x - span;
        maxX = anchor.x + span;
        minY = anchor.y - span;
        maxY = anchor.y + span;
      }
    } else if (layout.nodes.size > 0) {
      let bMinX = Infinity;
      let bMaxX = -Infinity;
      let bMinY = Infinity;
      let bMaxY = -Infinity;
      for (const cluster of layout.clusters.values()) {
        bMinX = Math.min(bMinX, cluster.x - cluster.orbitRadius);
        bMaxX = Math.max(bMaxX, cluster.x + cluster.orbitRadius);
        bMinY = Math.min(bMinY, cluster.y - cluster.orbitRadius);
        bMaxY = Math.max(bMaxY, cluster.y + cluster.orbitRadius);
      }
      if (Number.isFinite(bMinX)) {
        minX = bMinX - 40;
        maxX = bMaxX + 40;
        minY = bMinY - 40;
        maxY = bMaxY + 40;
      }
    }

    const spanW = Math.max(200, maxX - minX);
    const spanH = Math.max(200, maxY - minY);
    const scale = Math.min(availW / spanW, availH / spanH);
    const offsetX = padX + (availW - spanW * scale) / 2 - minX * scale;
    const offsetY = padY + (availH - spanH * scale) / 2 - minY * scale;

    const toX = (x: number) => offsetX + x * scale;
    const toY = (y: number) => offsetY + y * scale;

    // Astrolabe outer & inner guide rings when showing full graph
    if (focusedDomain === 'all') {
      const cx = toX(layout.centerX);
      const cy = toY(layout.centerY);
      ctx.save();
      for (const rScale of [0.38, 0.72, 1.0]) {
        ctx.strokeStyle =
          rScale === 0.72 ? 'rgba(255, 106, 0, 0.16)' : 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(availW, availH) * 0.45 * rScale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Domain orbit rings & labels
    for (const cluster of layout.clusters.values()) {
      const isMatch = focusedDomain === 'all' || cluster.domain === focusedDomain;
      if (!isMatch) continue;
      const cx = toX(cluster.x);
      const cy = toY(cluster.y);
      const r = Math.max(12, cluster.orbitRadius * scale);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `${cluster.theme.color}40`;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (width >= 420 && cluster.domain !== '(no domain)') {
        ctx.fillStyle = `${cluster.theme.color}CC`;
        ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(cluster.theme.shortName, cx, Math.max(14, cy - r - 6));
      }
    }

    // Draw edges (semantic emphasized, structural muted)
    for (const edge of dataset.raw.edges) {
      if (hideSensitive && (dataset.sensitiveNodeIds.has(edge.source) || dataset.sensitiveNodeIds.has(edge.target))) {
        continue;
      }
      const s = layout.nodes.get(edge.source);
      const t = layout.nodes.get(edge.target);
      if (!s || !t) continue;
      const touchesFocus =
        focusedDomain === 'all' ||
        s.primaryDomain === focusedDomain ||
        t.primaryDomain === focusedDomain;
      if (!touchesFocus) continue;
      if (focusedDomain === 'all' && edge.basis === 'structural') continue;

      const decision = hypothesisDecisions[edge.id];
      if (decision === 'rejected') continue;

      ctx.beginPath();
      ctx.moveTo(toX(s.x), toY(s.y));
      ctx.lineTo(toX(t.x), toY(t.y));
      ctx.strokeStyle =
        edge.basis === 'explicit'
          ? 'rgba(212, 255, 58, 0.34)'
          : edge.basis === 'user_suggested'
            ? 'rgba(114, 227, 168, 0.28)'
            : edge.basis === 'inferred'
              ? decision === 'confirmed'
                ? 'rgba(114, 227, 168, 0.36)'
                : 'rgba(255, 139, 61, 0.28)'
              : 'rgba(137, 168, 255, 0.16)';
      ctx.lineWidth = edge.basis === 'explicit' ? 1.05 : 0.75;
      ctx.stroke();
    }

    // Draw nodes and store hit targets
    const projected: typeof screenNodesRef.current = [];
    for (const pos of layout.nodes.values()) {
      if (hideSensitive && dataset.sensitiveNodeIds.has(pos.node.id)) continue;
      const inFocus = focusedDomain === 'all' || pos.primaryDomain === focusedDomain;
      const nx = toX(pos.x);
      const ny = toY(pos.y);
      const baseR =
        pos.node.type === 'Discipline'
          ? 5.2
          : pos.node.evidence_grade === 'Q3' || pos.node.evidence_grade === 'Q4'
            ? 3.1
            : 2.1;
      const nr = focusedDomain === 'all' ? baseR : baseR * 1.25;
      const isHovered = hoveredNode?.id === pos.node.id;

      ctx.globalAlpha = inFocus ? (isHovered ? 1 : pos.node.type === 'Discipline' ? 0.96 : 0.85) : 0.14;
      if (pos.node.type === 'Discipline' || isHovered) {
        ctx.fillStyle = isHovered ? '#d4ff3a' : pos.color;
        ctx.globalAlpha = isHovered ? 0.32 : 0.16;
        ctx.beginPath();
        ctx.arc(nx, ny, nr * 2.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = inFocus ? 1 : 0.14;
      }

      ctx.fillStyle = isHovered ? '#d4ff3a' : pos.color;
      ctx.beginPath();
      ctx.arc(nx, ny, isHovered ? nr * 1.45 : nr, 0, Math.PI * 2);
      ctx.fill();

      if (inFocus) {
        projected.push({
          id: pos.node.id,
          title: pos.node.title,
          domain: pos.primaryDomain,
          grade: pos.node.evidence_grade,
          x: nx,
          y: ny,
          r: Math.max(8, nr + 6),
        });
      }
    }
    ctx.globalAlpha = 1;
    screenNodesRef.current = projected;
  }, [dataset, focusedDomain, hideSensitive, hoveredNode?.id, hypothesisDecisions, layout]);

  useEffect(() => {
    drawPreview();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => drawPreview());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [drawPreview]);

  const findHitNode = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    let best: (typeof screenNodesRef.current)[number] | null = null;
    let bestD2 = 18 * 18;
    for (const item of screenNodesRef.current) {
      const dx = mx - item.x;
      const dy = my - item.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = item;
      }
    }
    return best;
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const hit = findHitNode(e.clientX, e.clientY);
    if ((hit?.id ?? null) !== (hoveredNode?.id ?? null)) {
      setHoveredNode(
        hit
          ? { id: hit.id, title: hit.title, domain: hit.domain, grade: hit.grade }
          : null
      );
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = findHitNode(e.clientX, e.clientY);
    if (hit) {
      onFocusNodeInGraph(hit.id, 'graph');
    } else {
      onContinueExploring(lastExploredId);
    }
  };

  const modeSummary =
    profile.mode === 'custom'
      ? `Personal workspace · ${SYNC_STATUS_LABELS[syncState]}`
      : `Reference archive · Sample v${dataset.raw.version}`;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8 space-y-6">
      {/* 1. Header: Clear Identity, Short Description, Active Status & Primary Actions */}
      <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#9ba3b0]">
            <span className="text-[#d4ff3a]">Mind Architecture</span>
            <span aria-hidden="true">·</span>
            <span>{modeSummary}</span>
            {syncNotice && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#ff8b3d] normal-case tracking-normal">{syncNotice}</span>
              </>
            )}
          </div>
          <h1 className="mt-2 font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#f5f5f3] text-balance">
            {profile.title}
          </h1>
          <p className="mt-1.5 text-sm text-[#9ba3b0] leading-relaxed">
            {profile.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenCustomize('setup')}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.04] px-4 py-2 text-xs font-medium text-[#f5f5f3] hover:border-white/30 hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#9ba3b0]" />
            <span>Customize</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenCustomize('node')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/[0.14] bg-white/[0.04] px-4 py-2 text-xs font-medium text-[#f5f5f3] hover:border-[#d4ff3a]/50 hover:text-[#d4ff3a] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5 text-[#d4ff3a]" />
            <span>Add Entry</span>
          </button>

          <button
            type="button"
            onClick={() => onContinueExploring(lastExploredId)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#d4ff3a] px-5 py-2 text-xs font-semibold text-black hover:bg-[#e2ff6e] transition-colors whitespace-nowrap shrink-0"
          >
            <span>Continue Exploring</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* 2. Knowledge Graph Centerpiece + 4 Metrics Strip */}
      <section
        aria-label="Knowledge graph centerpiece"
        className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#06070a]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setFocusedDomain('all')}
              className={`min-h-[32px] rounded-full border px-3 py-1 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                focusedDomain === 'all'
                  ? 'border-[#d4ff3a]/50 bg-[#d4ff3a]/12 text-[#d4ff3a]'
                  : 'border-white/[0.09] text-[#9ba3b0] hover:text-[#f5f5f3]'
              }`}
            >
              All Domains
            </button>
            {domainButtons.map(({ domain, theme }) => {
              const active = focusedDomain === domain;
              return (
                <button
                  key={domain}
                  type="button"
                  onClick={() => setFocusedDomain(active ? 'all' : domain)}
                  className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'border-white/35 bg-white/[0.09] text-[#f5f5f3] font-medium'
                      : 'border-white/[0.08] text-[#9ba3b0] hover:text-[#f5f5f3]'
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: theme.color }}
                  />
                  <span>{theme.shortName}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onNavigateView('graph')}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-[#d4ff3a] hover:underline whitespace-nowrap shrink-0"
          >
            <span>Open Full Map</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Visual Centerpiece Canvas */}
        <div
          ref={stageRef}
          className="relative h-[290px] sm:h-[360px] lg:h-[400px] w-full overflow-hidden bg-[radial-gradient(60%_70%_at_82%_100%,rgba(255,106,0,0.16),transparent_68%),radial-gradient(45%_60%_at_8%_15%,rgba(35,77,204,0.16),transparent_68%),#050608]"
        >
          <canvas
            ref={canvasRef}
            onPointerMove={handleCanvasPointerMove}
            onPointerLeave={() => setHoveredNode(null)}
            onClick={handleCanvasClick}
            aria-label="Interactive knowledge graph constellation"
            className="block h-full w-full cursor-pointer"
          />

          {hoveredNode && (
            <div className="pointer-events-none absolute left-4 top-4 max-w-[85%] rounded-lg border border-white/[0.14] bg-black/90 px-3 py-2 text-xs">
              <p className="font-medium text-[#f5f5f3] truncate">{hoveredNode.title}</p>
              <p className="mt-0.5 font-mono text-[10px] text-[#9ba3b0]">
                {getDomainTheme(hoveredNode.domain).shortName} · {hoveredNode.grade} · Click to inspect
              </p>
            </div>
          )}

          {dataset.raw.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md text-center space-y-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#d4ff3a]">
                  Empty Personal Constellation
                </p>
                <h2 className="font-display text-lg font-semibold text-[#f5f5f3] text-balance">
                  Start mapping your own ideas, disciplines, and questions
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  {canSeedFromGoals && onSeedFromGoals && (
                    <button
                      type="button"
                      onClick={onSeedFromGoals}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#d4ff3a] px-4 py-2 text-xs font-semibold text-black hover:bg-[#e2ff6e] transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Seed from InPursuit Goals</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenCustomize('node')}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 text-xs font-medium text-[#f5f5f3] hover:border-[#d4ff3a]/50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#d4ff3a]" />
                    <span>Add First Node</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenCustomize('notes')}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 text-xs font-medium text-[#f5f5f3] hover:border-white/40 transition-colors"
                  >
                    <span>Extract from Notes</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Metrics: 4 Crisp Tabular Slots */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-white/[0.08] bg-black/50">
          <div className="p-4 sm:p-5 border-b lg:border-b-0 border-r border-white/[0.08]">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7f8794]">
              Nodes
            </p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#f5f5f3]">
              {insights.nodeCount}
            </p>
            <p className="mt-1 text-xs text-[#9ba3b0]">
              {insights.domainCount} domains mapped
            </p>
          </div>

          <div className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-white/[0.08]">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7f8794]">
              Connections
            </p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#f5f5f3]">
              {insights.connectionCount}
            </p>
            <p className="mt-1 text-xs text-[#9ba3b0]">
              {insights.semanticCount} semantic · {insights.structuralCount} structural
            </p>
          </div>

          <div className="p-4 sm:p-5 border-r border-white/[0.08]">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7f8794]">
              Sources
            </p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#f5f5f3]">
              {insights.sourceCount}
            </p>
            <p className="mt-1 text-xs text-[#9ba3b0]">
              Provenance records
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7f8794]">
              Practiced Core (Q3/Q4)
            </p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#d4ff3a]">
              {insights.practicedCount}
            </p>
            <p className="mt-1 text-xs text-[#9ba3b0]">
              {insights.practicedPct}% of knowledge base
            </p>
          </div>
        </div>
      </section>

      {/* Cognitive model: a functional lens over the shared graph, not separate memory stores */}
      <CognitiveArchitecturePanel
        dataset={dataset}
        hideSensitive={hideSensitive}
        onNavigateView={onNavigateView}
      />

      {/* Temporary, goal-conditioned working set over the shared knowledge graph */}
      <ContextualRetrievalPanel
        dataset={dataset}
        hideSensitive={hideSensitive}
        hypothesisDecisions={hypothesisDecisions}
        onFocusNodeInGraph={(nodeId) => onFocusNodeInGraph(nodeId, 'graph')}
      />

      {/* 4. Review Panel + 5. Recent Exploration + 6. Key Insight */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Review Panel */}
        <section
          aria-label="Inferred connections review panel"
          className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-white/[0.09] bg-[#0a0b0f] p-5 sm:p-6"
        >
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#ff8b3d]">
                  Synthesis Review
                </p>
                <h2 className="mt-1 font-display text-base sm:text-lg font-semibold tracking-tight text-[#f5f5f3]">
                  <span className="font-mono tabular-nums">{insights.inferredPendingCount}</span>{' '}
                  inferred connections awaiting review
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onNavigateView('evidence')}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-[#9ba3b0] hover:text-[#d4ff3a] transition-colors whitespace-nowrap shrink-0"
              >
                <span>Evidence Ledger</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {pendingInferredEdges.length === 0 ? (
              <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs text-[#9ba3b0]">
                {insights.inferredTotal === 0
                  ? 'No unreviewed inferred links yet. Add connections or import notes to synthesize cross-domain links.'
                  : `All ${insights.inferredTotal} inferred hypotheses have been reviewed (${insights.confirmedInferredCount} confirmed).`}
              </div>
            ) : (
              <div className="mt-4 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                {pendingInferredEdges.slice(0, 4).map((edge) => {
                  const srcNode = dataset.nodeById.get(edge.source);
                  const tgtNode = dataset.nodeById.get(edge.target);
                  return (
                    <div
                      key={edge.id}
                      className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-[#f5f5f3]">
                          <button
                            type="button"
                            onClick={() => onFocusNodeInGraph(edge.source, 'graph')}
                            className="hover:text-[#d4ff3a] transition-colors text-left truncate max-w-[220px]"
                          >
                            {srcNode?.title ?? edge.source}
                          </button>
                          <span className="font-mono text-[10px] text-[#ff8b3d]">
                            → {edge.relationship} →
                          </span>
                          <button
                            type="button"
                            onClick={() => onFocusNodeInGraph(edge.target, 'graph')}
                            className="hover:text-[#d4ff3a] transition-colors text-left truncate max-w-[220px]"
                          >
                            {tgtNode?.title ?? edge.target}
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-[#9ba3b0] line-clamp-2 leading-relaxed">
                          {edge.explanation}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onUpdateHypothesis(edge.id, 'confirmed')}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[#72e3a8]/40 bg-[#72e3a8]/10 px-3 py-1 text-[11px] font-medium text-[#72e3a8] hover:bg-[#72e3a8]/20 transition-colors"
                        >
                          <Check className="h-3 w-3" />
                          <span>Confirm</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateHypothesis(edge.id, 'rejected')}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.03] px-3 py-1 text-[11px] text-[#9ba3b0] hover:border-[#ff8b3d]/50 hover:text-[#ff8b3d] transition-colors"
                        >
                          <X className="h-3 w-3" />
                          <span>Dismiss</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3.5 font-mono text-[11px] text-[#7f8794]">
            <span>
              {insights.confirmedInferredCount} confirmed · {insights.inferredPendingCount} pending
            </span>
            {pendingInferredEdges.length > 4 && (
              <button
                type="button"
                onClick={() => onNavigateView('evidence')}
                className="text-[#d4ff3a] hover:underline"
              >
                Review remaining {pendingInferredEdges.length - 4} →
              </button>
            )}
          </div>
        </section>

        {/* Right Stack: Key Insight + Recent Exploration */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Key Insight */}
          <section
            aria-label="Key insight"
            className="rounded-2xl border border-white/[0.09] bg-[#0a0b0f] p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#89a8ff]">
                Key Insight
              </p>
              <button
                type="button"
                onClick={() => onNavigateView('patterns')}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-[#9ba3b0] hover:text-[#d4ff3a] transition-colors"
              >
                <Layers className="h-3 w-3" />
                <span>Patterns</span>
              </button>
            </div>
            <h2 className="mt-2 font-display text-base font-semibold leading-snug text-[#f5f5f3] text-balance">
              {insights.headlineInsight}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#9ba3b0]">
              {insights.detailInsight}
            </p>
          </section>

          {/* Recent Exploration */}
          <section
            aria-label="Recent exploration"
            className="flex-1 rounded-2xl border border-white/[0.09] bg-[#0a0b0f] p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4ff3a]">
                Recent Exploration
              </p>
              <button
                type="button"
                onClick={() => onNavigateView('atlas')}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-[#9ba3b0] hover:text-[#d4ff3a] transition-colors"
              >
                <Compass className="h-3 w-3" />
                <span>Atlas</span>
              </button>
            </div>

            {recentItems.length === 0 ? (
              <p className="mt-4 text-xs text-[#9ba3b0]">
                Open any node in the graph to build your recent exploration trail.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-white/[0.07]">
                {recentItems.map((item) => {
                  const theme = getDomainTheme(item.domain);
                  const grade = GRADE_META[item.grade as keyof typeof GRADE_META];
                  return (
                    <button
                      key={item.nodeId}
                      type="button"
                      onClick={() => onFocusNodeInGraph(item.nodeId, 'graph')}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-white/[0.03] -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: theme.color }}
                          />
                          <span className="truncate text-xs font-medium text-[#f5f5f3]">
                            {item.title}
                          </span>
                        </div>
                        <p className="mt-0.5 pl-4 font-mono text-[10px] text-[#7f8794] truncate">
                          {theme.shortName} · {item.type} ·{' '}
                          <span style={{ color: grade?.color }}>{item.grade}</span>
                        </p>
                      </div>
                      <span className="font-mono text-[10px] text-[#7f8794] whitespace-nowrap shrink-0">
                        {item.metaLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-white/[0.07] flex justify-end">
              <button
                type="button"
                onClick={() => onContinueExploring(lastExploredId)}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#d4ff3a] hover:underline"
              >
                <span>Continue Exploring</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
