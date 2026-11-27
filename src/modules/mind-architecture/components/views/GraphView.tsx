import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type {
  ConnectionBasis,
  HypothesisDecision,
  IndexedDataset,
  KnowledgeEdge,
  ViewId,
} from '../../types/knowledge';
import {
  BASIS_META,
  computeCelestialLayout,
  getDomainTheme,
  GRADE_META,
  type CelestialLayout,
  type ClusterAnchor,
  type PositionedNode,
} from '../../utils/dataset';
import { getCachedMindBundle } from '../../utils/datasetCache';
import { NodeDossier } from '../NodeDossier';

interface GraphViewProps {
  dataset: IndexedDataset;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  hideSensitive: boolean;
  onToggleSensitive: () => void;
  hypothesisDecisions: Record<string, HypothesisDecision>;
  onUpdateHypothesis: (edgeId: string, decision: HypothesisDecision) => void;
  onNavigateView: (view: ViewId) => void;
}

type ExplorationMode = 'progressive' | 'all' | 'q3';

interface CameraState {
  x: number;
  y: number;
  scale: number;
}

interface PreparedEdge {
  edge: KnowledgeEdge;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  sDomain: string;
  tDomain: string;
  color: string;
  dash: number[];
  seed: number;
}

interface BackgroundStar {
  x: number;
  y: number;
  size: number;
  alpha: number;
  parallax: number;
  color: string;
}

const DEFAULT_BASIS_VISIBILITY: Record<ConnectionBasis, boolean> = {
  explicit: true,
  user_suggested: true,
  co_discussed: true,
  inferred: true,
  structural: true,
  established_academic: false,
};

const LAYOUT_CACHE = new WeakMap<IndexedDataset, CelestialLayout>();

function getLayoutForDataset(dataset: IndexedDataset): CelestialLayout {
  const fromWeak = LAYOUT_CACHE.get(dataset);
  if (fromWeak) return fromWeak;
  const fromBundle = getCachedMindBundle(undefined, dataset.raw);
  if (fromBundle && fromBundle.indexed === dataset) {
    LAYOUT_CACHE.set(dataset, fromBundle.layout);
    return fromBundle.layout;
  }
  const computed = computeCelestialLayout(dataset);
  LAYOUT_CACHE.set(dataset, computed);
  return computed;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(212, 255, 58, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function evalQuadBezier(p0: number, p1: number, p2: number, t: number): number {
  const inv = 1 - t;
  return inv * inv * p0 + 2 * inv * t * p1 + t * t * p2;
}

function evalQuadTangent(p0: number, p1: number, p2: number, t: number): number {
  return 2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1);
}

// Deterministic background cosmic starfield tuned to InPursuit palette
function generateStarfield(count: number): BackgroundStar[] {
  const stars: BackgroundStar[] = [];
  let s = 48271;
  const nextRand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const palette = ['#f5f5f3', '#89a8ff', '#ff8b3d', '#d4ff3a', '#9ba3b0'];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: (nextRand() - 0.5) * 4200,
      y: (nextRand() - 0.5) * 3200,
      size: 1 + Math.round(nextRand() * 1.2),
      alpha: 0.14 + nextRand() * 0.38,
      parallax: i % 3 === 0 ? 0.2 : 0.09,
      color: palette[i % palette.length],
    });
  }
  return stars;
}

const STARFIELD = generateStarfield(140);

export const GraphView: React.FC<GraphViewProps> = ({
  dataset,
  selectedNodeId,
  onSelectNode,
  hideSensitive,
  onToggleSensitive,
  hypothesisDecisions,
  onUpdateHypothesis,
  onNavigateView,
}) => {
  const layout = useMemo(() => getLayoutForDataset(dataset), [dataset]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgBufferRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef({ width: 1200, height: 760, dpr: 1 });

  const cameraRef = useRef<CameraState>({ x: 0, y: 0, scale: 0.5 });
  const targetCameraRef = useRef<CameraState>({ x: 0, y: 0, scale: 0.5 });
  const velocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const hasInitializedCamera = useRef(false);
  const scheduleRenderRef = useRef<() => void>(() => {});

  const [zoomPercent, setZoomPercent] = useState(50);
  const lastZoomPercentRef = useRef(50);
  const [isDraggingUi, setIsDraggingUi] = useState(false);

  const [focusedDomain, setFocusedDomain] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredBasis, setHoveredBasis] = useState<ConnectionBasis | null>(null);
  const [hoveredClusterDomain, setHoveredClusterDomain] = useState<string | null>(null);
  const [explorationMode, setExplorationMode] = useState<ExplorationMode>('progressive');
  const [basisVisible, setBasisVisible] = useState<Record<ConnectionBasis, boolean>>(
    DEFAULT_BASIS_VISIBILITY
  );
  const [showLegend, setShowLegend] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    camStartX: number;
    camStartY: number;
    moved: boolean;
  } | null>(null);

  const reducedMotionRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
      scheduleRenderRef.current();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const fitUniverseCamera = useCallback(
    (w = viewportRef.current.width, h = viewportRef.current.height): CameraState => {
      const pad = w < 640 ? 40 : 80;
      const scaleX = (w - pad) / layout.width;
      const scaleY = (h - pad) / layout.height;
      const scale = Math.max(0.24, Math.min(0.68, Math.min(scaleX, scaleY) * 1.18));
      return {
        x: w / 2 - layout.centerX * scale,
        y: h / 2 - layout.centerY * scale,
        scale,
      };
    },
    [layout]
  );

  // Measure container & keep high-DPI canvas + cached background glow crisp
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const rebuildBgBuffer = (w: number, h: number) => {
      if (typeof document === 'undefined') return;
      const buf = bgBufferRef.current ?? document.createElement('canvas');
      buf.width = Math.max(1, Math.round(w));
      buf.height = Math.max(1, Math.round(h));
      const bctx = buf.getContext('2d');
      if (bctx) {
        bctx.fillStyle = '#000000';
        bctx.fillRect(0, 0, buf.width, buf.height);

        const orangeGlow = bctx.createRadialGradient(
          buf.width * 0.9,
          buf.height * 0.95,
          10,
          buf.width * 0.9,
          buf.height * 0.95,
          Math.max(buf.width, buf.height) * 0.68
        );
        orangeGlow.addColorStop(0, 'rgba(255, 106, 0, 0.16)');
        orangeGlow.addColorStop(0.5, 'rgba(255, 106, 0, 0.04)');
        orangeGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        bctx.fillStyle = orangeGlow;
        bctx.fillRect(0, 0, buf.width, buf.height);

        const blueGlow = bctx.createRadialGradient(
          buf.width * 0.06,
          buf.height * 0.16,
          10,
          buf.width * 0.06,
          buf.height * 0.16,
          Math.max(buf.width, buf.height) * 0.58
        );
        blueGlow.addColorStop(0, 'rgba(35, 77, 204, 0.18)');
        blueGlow.addColorStop(0.55, 'rgba(35, 77, 204, 0.04)');
        blueGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        bctx.fillStyle = blueGlow;
        bctx.fillRect(0, 0, buf.width, buf.height);
      }
      bgBufferRef.current = buf;
    };

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const isNarrow = rect.width < 768;
      const maxDpr = isNarrow ? 1.5 : 2;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      viewportRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      rebuildBgBuffer(rect.width, rect.height);

      if (!hasInitializedCamera.current) {
        hasInitializedCamera.current = true;
        const initial = fitUniverseCamera(rect.width, rect.height);
        cameraRef.current = { ...initial };
        targetCameraRef.current = { ...initial };
      }
      scheduleRenderRef.current();
    };

    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitUniverseCamera]);

  const activeId = hoveredNodeId ?? selectedNodeId;
  const activeNeighborhood = useMemo(() => {
    const neighborIds = new Set<string>();
    const activeEdgeIds = new Set<string>();
    if (!activeId) return { neighborIds, activeEdgeIds };

    neighborIds.add(activeId);
    const edges = dataset.edgesByNodeId.get(activeId) ?? [];
    for (const edge of edges) {
      if (!basisVisible[edge.basis]) continue;
      if (
        hideSensitive &&
        (dataset.sensitiveNodeIds.has(edge.source) ||
          dataset.sensitiveNodeIds.has(edge.target))
      ) {
        continue;
      }
      activeEdgeIds.add(edge.id);
      neighborIds.add(edge.source);
      neighborIds.add(edge.target);
    }
    return { neighborIds, activeEdgeIds };
  }, [activeId, dataset, basisVisible, hideSensitive]);

  const semanticAnchorIds = useMemo(() => {
    const set = new Set<string>();
    for (const edge of dataset.raw.edges) {
      if (edge.basis !== 'structural') {
        set.add(edge.source);
        set.add(edge.target);
      }
    }
    for (const node of dataset.raw.nodes) {
      if (
        node.level <= 2 ||
        node.evidence_grade === 'Q3' ||
        node.domains.length > 1 ||
        node.type === 'Hypothesis' ||
        node.type === 'Goal' ||
        node.type === 'Project' ||
        node.type === 'Experience'
      ) {
        set.add(node.id);
      }
    }
    return set;
  }, [dataset]);

  const preparedEdges = useMemo<PreparedEdge[]>(() => {
    const result: PreparedEdge[] = [];
    dataset.raw.edges.forEach((edge, idx) => {
      if (edge.source === edge.target) return;
      if (!basisVisible[edge.basis]) return;
      if (
        hideSensitive &&
        (dataset.sensitiveNodeIds.has(edge.source) ||
          dataset.sensitiveNodeIds.has(edge.target))
      ) {
        return;
      }
      if (explorationMode === 'q3') {
        const sNode = dataset.nodeById.get(edge.source);
        const tNode = dataset.nodeById.get(edge.target);
        if (
          sNode?.evidence_grade !== 'Q3' &&
          tNode?.evidence_grade !== 'Q3' &&
          !activeNeighborhood.activeEdgeIds.has(edge.id)
        ) {
          return;
        }
      }

      const s = layout.nodes.get(edge.source);
      const t = layout.nodes.get(edge.target);
      if (!s || !t) return;

      let cx: number;
      let cy: number;
      if (s.primaryDomain === t.primaryDomain && edge.basis === 'structural') {
        cx = (s.x + t.x) / 2;
        cy = (s.y + t.y) / 2;
      } else {
        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = edge.basis === 'structural' ? 0.08 : 0.16;
        cx = mx + (layout.centerX - mx) * pull - (dy / dist) * 18;
        cy = my + (layout.centerY - my) * pull + (dx / dist) * 18;
      }

      const meta = BASIS_META[edge.basis];
      const decision = hypothesisDecisions[edge.id];
      const color =
        decision === 'confirmed'
          ? '#72e3a8'
          : decision === 'rejected'
          ? '#4b5262'
          : meta.color;
      const dash =
        meta.dash === 'none'
          ? []
          : meta.dash.split(' ').map((n) => parseFloat(n) || 3);

      result.push({
        edge,
        sx: s.x,
        sy: s.y,
        cx,
        cy,
        tx: t.x,
        ty: t.y,
        sDomain: s.primaryDomain,
        tDomain: t.primaryDomain,
        color,
        dash,
        seed: (idx * 0.137) % 1,
      });
    });
    return result;
  }, [
    dataset,
    layout,
    basisVisible,
    hideSensitive,
    explorationMode,
    activeNeighborhood,
    hypothesisDecisions,
  ]);

  const visibleNodes = useMemo<PositionedNode[]>(() => {
    const list: PositionedNode[] = [];
    for (const pos of layout.nodes.values()) {
      if (hideSensitive && dataset.sensitiveNodeIds.has(pos.node.id)) continue;
      list.push(pos);
    }
    return list;
  }, [layout, hideSensitive, dataset.sensitiveNodeIds]);

  const clustersArray = useMemo<ClusterAnchor[]>(
    () => Array.from(layout.clusters.values()),
    [layout]
  );

  const renderStateRef = useRef({
    selectedNodeId,
    hoveredNodeId,
    hoveredBasis,
    hoveredClusterDomain,
    focusedDomain,
    explorationMode,
    activeId,
    activeNeighborhood,
    semanticAnchorIds,
    preparedEdges,
    visibleNodes,
    clustersArray,
  });
  renderStateRef.current = {
    selectedNodeId,
    hoveredNodeId,
    hoveredBasis,
    hoveredClusterDomain,
    focusedDomain,
    explorationMode,
    activeId,
    activeNeighborhood,
    semanticAnchorIds,
    preparedEdges,
    visibleNodes,
    clustersArray,
  };

  useEffect(() => {
    scheduleRenderRef.current();
  }, [
    selectedNodeId,
    hoveredNodeId,
    hoveredBasis,
    hoveredClusterDomain,
    focusedDomain,
    explorationMode,
    basisVisible,
    hideSensitive,
    hypothesisDecisions,
    preparedEdges,
    visibleNodes,
  ]);

  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== prevSelectedRef.current) {
      const pos = layout.nodes.get(selectedNodeId);
      if (pos) {
        velocityRef.current = { vx: 0, vy: 0 };
        const { width, height } = viewportRef.current;
        const targetScale = Math.max(targetCameraRef.current.scale, 1.05);
        targetCameraRef.current = {
          x: width / 2 - pos.x * targetScale,
          y: height / 2 - pos.y * targetScale,
          scale: targetScale,
        };
        scheduleRenderRef.current();
      }
    }
    prevSelectedRef.current = selectedNodeId;
  }, [selectedNodeId, layout]);

  const handleFocusDomain = useCallback(
    (domainName: string | null) => {
      setFocusedDomain(domainName);
      velocityRef.current = { vx: 0, vy: 0 };
      if (!domainName) {
        targetCameraRef.current = fitUniverseCamera();
        scheduleRenderRef.current();
        return;
      }
      const anchor = layout.clusters.get(domainName);
      if (anchor) {
        const { width, height } = viewportRef.current;
        const targetScale = domainName === '(no domain)' ? 0.96 : 1.12;
        targetCameraRef.current = {
          x: width / 2 - anchor.x * targetScale,
          y: height / 2 - anchor.y * targetScale,
          scale: targetScale,
        };
        scheduleRenderRef.current();
      }
    },
    [layout, fitUniverseCamera]
  );

  const zoomBy = useCallback((factor: number) => {
    velocityRef.current = { vx: 0, vy: 0 };
    const { width, height } = viewportRef.current;
    const cur = targetCameraRef.current;
    const nextScale = Math.max(0.24, Math.min(2.8, cur.scale * factor));
    const cx = width / 2;
    const cy = height / 2;
    const ratio = nextScale / cur.scale;
    targetCameraRef.current = {
      scale: nextScale,
      x: cx - (cx - cur.x) * ratio,
      y: cy - (cy - cur.y) * ratio,
    };
    scheduleRenderRef.current();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      velocityRef.current = { vx: 0, vy: 0 };
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const delta = Math.max(-120, Math.min(120, e.deltaY));
      const factor = Math.exp(-delta * 0.0022);
      const cur = targetCameraRef.current;
      const nextScale = Math.max(0.24, Math.min(2.8, cur.scale * factor));
      const ratio = nextScale / cur.scale;

      targetCameraRef.current = {
        scale: nextScale,
        x: mx - (mx - cur.x) * ratio,
        y: my - (my - cur.y) * ratio,
      };
      scheduleRenderRef.current();
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'Escape') {
        if (selectedNodeId) onSelectNode(null);
        else if (focusedDomain) handleFocusDomain(null);
      } else if (e.key === '=' || e.key === '+') {
        zoomBy(1.22);
      } else if (e.key === '-' || e.key === '_') {
        zoomBy(0.82);
      } else if (e.key === '0') {
        setFocusedDomain(null);
        onSelectNode(null);
        targetCameraRef.current = fitUniverseCamera();
        scheduleRenderRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNodeId, focusedDomain, onSelectNode, handleFocusDomain, zoomBy, fitUniverseCamera]);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current;
    return {
      wx: (sx - cam.x) / cam.scale,
      wy: (sy - cam.y) / cam.scale,
    };
  }, []);

  const hitTestAt = useCallback(
    (sx: number, sy: number): { nodeId: string | null; clusterDomain: string | null } => {
      const cam = cameraRef.current;
      const { wx, wy } = screenToWorld(sx, sy);
      const { visibleNodes: nodes, clustersArray: clusters } = renderStateRef.current;

      let bestNodeId: string | null = null;
      let bestDist = Infinity;
      const pad = (viewportRef.current.width < 768 ? 16 : 11) / cam.scale;

      for (let i = nodes.length - 1; i >= 0; i--) {
        const pos = nodes[i];
        const hitR = pos.radius + pad;
        const dx = wx - pos.x;
        const dy = wy - pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= hitR * hitR && d2 < bestDist) {
          bestDist = d2;
          bestNodeId = pos.node.id;
        }
      }
      if (bestNodeId) {
        return { nodeId: bestNodeId, clusterDomain: null };
      }

      for (const c of clusters) {
        const crownY = c.y - c.orbitRadius - 24;
        if (
          Math.abs(wx - c.x) <= Math.max(95, 70 / cam.scale) &&
          Math.abs(wy - crownY) <= Math.max(28, 22 / cam.scale)
        ) {
          return { nodeId: null, clusterDomain: c.domain };
        }
      }

      return { nodeId: null, clusterDomain: null };
    },
    [screenToWorld]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture unsupported
    }

    velocityRef.current = { vx: 0, vy: 0 };
    targetCameraRef.current = { ...cameraRef.current };

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      camStartX: cameraRef.current.x,
      camStartY: cameraRef.current.y,
      moved: false,
    };
    setIsDraggingUi(true);
    scheduleRenderRef.current();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drag = dragRef.current;

    if (drag) {
      const totalDx = e.clientX - drag.startX;
      const totalDy = e.clientY - drag.startY;
      if (Math.hypot(totalDx, totalDy) > 4) {
        drag.moved = true;
      }

      const stepDx = e.clientX - drag.lastX;
      const stepDy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;

      velocityRef.current = {
        vx: velocityRef.current.vx * 0.45 + stepDx * 0.55,
        vy: velocityRef.current.vy * 0.45 + stepDy * 0.55,
      };

      const nextX = drag.camStartX + totalDx;
      const nextY = drag.camStartY + totalDy;
      cameraRef.current.x = nextX;
      cameraRef.current.y = nextY;
      targetCameraRef.current.x = nextX;
      targetCameraRef.current.y = nextY;
      scheduleRenderRef.current();
      return;
    }

    if (e.pointerType === 'touch') return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTestAt(sx, sy);

    if (hit.nodeId !== renderStateRef.current.hoveredNodeId) {
      setHoveredNodeId(hit.nodeId);
    }
    if (hit.clusterDomain !== renderStateRef.current.hoveredClusterDomain) {
      setHoveredClusterDomain(hit.clusterDomain);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    if (canvas && drag) {
      try {
        if (canvas.hasPointerCapture(drag.pointerId)) {
          canvas.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // ignore
      }
    }

    const wasClick = drag && !drag.moved;
    dragRef.current = null;
    setIsDraggingUi(false);

    if (wasClick && canvas) {
      velocityRef.current = { vx: 0, vy: 0 };
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hit = hitTestAt(sx, sy);

      if (hit.nodeId) {
        onSelectNode(hit.nodeId);
      } else if (hit.clusterDomain) {
        handleFocusDomain(
          renderStateRef.current.focusedDomain === hit.clusterDomain
            ? null
            : hit.clusterDomain
        );
      } else if (renderStateRef.current.selectedNodeId) {
        onSelectNode(null);
      }
    }
    scheduleRenderRef.current();
  };

  const handlePointerLeave = () => {
    if (!dragRef.current) {
      if (hoveredNodeId) setHoveredNodeId(null);
      if (hoveredClusterDomain) setHoveredClusterDomain(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const hit = hitTestAt(e.clientX - rect.left, e.clientY - rect.top);

    if (hit.nodeId) {
      const pos = layout.nodes.get(hit.nodeId);
      if (pos) {
        onSelectNode(hit.nodeId);
        const { width, height } = viewportRef.current;
        const targetScale = 1.48;
        targetCameraRef.current = {
          x: width / 2 - pos.x * targetScale,
          y: height / 2 - pos.y * targetScale,
          scale: targetScale,
        };
        scheduleRenderRef.current();
      }
    } else if (hit.clusterDomain) {
      handleFocusDomain(hit.clusterDomain);
    } else {
      setFocusedDomain(null);
      targetCameraRef.current = fitUniverseCamera();
      scheduleRenderRef.current();
    }
  };

  // On-demand render loop: runs at high FPS while panning/zooming/pulsing and stops completely when idle
  useEffect(() => {
    let rafId = 0;

    const drawFrame = (now: number) => {
      rafId = 0;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height, dpr } = viewportRef.current;
      if (width <= 0 || height <= 0) return;

      const cam = cameraRef.current;
      const target = targetCameraRef.current;
      const vel = velocityRef.current;
      let needsAnotherFrame = false;

      if (dragRef.current) {
        needsAnotherFrame = true;
      } else if (Math.abs(vel.vx) > 0.08 || Math.abs(vel.vy) > 0.08) {
        cam.x += vel.vx;
        cam.y += vel.vy;
        target.x = cam.x;
        target.y = cam.y;
        vel.vx *= 0.9;
        vel.vy *= 0.9;
        needsAnotherFrame = true;
      } else {
        vel.vx = 0;
        vel.vy = 0;
        const dx = target.x - cam.x;
        const dy = target.y - cam.y;
        const ds = target.scale - cam.scale;
        if (Math.abs(dx) > 0.12 || Math.abs(dy) > 0.12 || Math.abs(ds) > 0.0005) {
          const lerp = reducedMotionRef.current ? 1 : 0.24;
          cam.x += dx * lerp;
          cam.y += dy * lerp;
          cam.scale += ds * lerp;
          if (!reducedMotionRef.current) needsAnotherFrame = true;
        } else {
          cam.x = target.x;
          cam.y = target.y;
          cam.scale = target.scale;
        }
      }

      const roundedZoom = Math.round(cam.scale * 100);
      if (roundedZoom !== lastZoomPercentRef.current) {
        lastZoomPercentRef.current = roundedZoom;
        setZoomPercent(roundedZoom);
      }

      const {
        selectedNodeId: selId,
        hoveredNodeId: hovId,
        hoveredBasis: hovBasis,
        hoveredClusterDomain: hovCluster,
        focusedDomain: focDom,
        explorationMode: expMode,
        activeId: actId,
        activeNeighborhood: actNb,
        semanticAnchorIds: semAnchors,
        preparedEdges: edges,
        visibleNodes: nodes,
        clustersArray: clusters,
      } = renderStateRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (bgBufferRef.current) {
        ctx.drawImage(bgBufferRef.current, 0, 0, width, height);
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
      }

      for (let i = 0; i < STARFIELD.length; i++) {
        const star = STARFIELD[i];
        const px =
          ((star.x + cam.x * star.parallax + width * 2) % (width + 80)) - 40;
        const py =
          ((star.y + cam.y * star.parallax + height * 2) % (height + 80)) - 40;
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = star.color;
        ctx.fillRect(px, py, star.size, star.size);
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.scale, cam.scale);

      const cx0 = layout.centerX;
      const cy0 = layout.centerY;

      const rings = [
        { r: 470, dash: [] as number[], alpha: 0.08 },
        { r: 820, dash: [5, 9], alpha: 0.065 },
        { r: 1060, dash: [] as number[], alpha: 0.05 },
      ];
      for (const ring of rings) {
        ctx.strokeStyle = `rgba(245, 245, 243, ${ring.alpha})`;
        ctx.lineWidth = 1 / cam.scale;
        ctx.setLineDash(ring.dash);
        ctx.beginPath();
        ctx.arc(cx0, cy0, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(245, 245, 243, 0.03)';
      ctx.lineWidth = 1 / cam.scale;
      for (let i = 0; i < 12; i++) {
        const rad = (i * 30 * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx0 + Math.cos(rad) * 140, cy0 + Math.sin(rad) * 140);
        ctx.lineTo(cx0 + Math.cos(rad) * 1060, cy0 + Math.sin(rad) * 1060);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(212, 255, 58, 0.14)';
      for (let deg = 0; deg < 360; deg += 5) {
        const rad = (deg * Math.PI) / 180;
        const isMajor = deg % 30 === 0;
        const rIn = isMajor ? 1044 : 1052;
        ctx.beginPath();
        ctx.moveTo(cx0 + Math.cos(rad) * rIn, cy0 + Math.sin(rad) * rIn);
        ctx.lineTo(cx0 + Math.cos(rad) * 1060, cy0 + Math.sin(rad) * 1060);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(212, 255, 58, 0.24)';
      ctx.lineWidth = 1 / cam.scale;
      ctx.beginPath();
      ctx.arc(cx0, cy0, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx0 - 38, cy0);
      ctx.lineTo(cx0 + 38, cy0);
      ctx.moveTo(cx0, cy0 - 38);
      ctx.lineTo(cx0, cy0 + 38);
      ctx.stroke();

      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        const isDimmedByFocus = focDom !== null && focDom !== c.domain;
        const isClusterHovered = hovCluster === c.domain;
        let hasActiveMember = false;
        if (actId) {
          for (const nid of actNb.neighborIds) {
            const p = layout.nodes.get(nid);
            if (p?.primaryDomain === c.domain) {
              hasActiveMember = true;
              break;
            }
          }
        }
        const isDimmedByNode = actId !== null && !hasActiveMember;
        const alpha = isDimmedByFocus ? 0.16 : isDimmedByNode ? 0.24 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        const haloR = c.orbitRadius + 30;
        ctx.fillStyle = hexToRgba(
          c.theme.color,
          isClusterHovered || focDom === c.domain ? 0.09 : 0.045
        );
        ctx.beginPath();
        ctx.arc(c.x, c.y, haloR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hexToRgba(
          c.theme.color,
          isClusterHovered || focDom === c.domain ? 0.48 : 0.2
        );
        ctx.lineWidth = (isClusterHovered ? 1.4 : 1) / cam.scale;
        ctx.setLineDash([4, 7]);
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.orbitRadius + 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
      }

      const activePulseEdges: PreparedEdge[] = [];

      for (let i = 0; i < edges.length; i++) {
        const pe = edges[i];
        const isEdgeActive = actNb.activeEdgeIds.has(pe.edge.id);
        const isBasisHighlighted = hovBasis === pe.edge.basis;
        const inFocusedCluster =
          focDom !== null && (pe.sDomain === focDom || pe.tDomain === focDom);

        if (isEdgeActive || isBasisHighlighted) {
          activePulseEdges.push(pe);
          continue;
        }

        let alpha =
          pe.edge.basis === 'structural'
            ? inFocusedCluster
              ? 0.26
              : 0.09
            : pe.edge.basis === 'explicit'
            ? 0.4
            : pe.edge.basis === 'user_suggested'
            ? 0.44
            : 0.32;

        if (actId || hovBasis) {
          alpha = 0.035;
        } else if (focDom && !inFocusedCluster) {
          alpha = 0.035;
        }

        ctx.strokeStyle = hexToRgba(pe.color, alpha);
        ctx.lineWidth =
          (pe.edge.basis === 'structural' ? 0.8 : 1.25) / Math.sqrt(cam.scale);
        ctx.setLineDash(pe.dash);
        ctx.beginPath();
        ctx.moveTo(pe.sx, pe.sy);
        ctx.quadraticCurveTo(pe.cx, pe.cy, pe.tx, pe.ty);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      let hasAnimatedPulse = false;

      for (let i = 0; i < activePulseEdges.length; i++) {
        const pe = activePulseEdges[i];
        const isSemantic = pe.edge.basis !== 'structural';

        ctx.strokeStyle = hexToRgba(pe.color, isSemantic ? 0.28 : 0.16);
        ctx.lineWidth = (isSemantic ? 4.5 : 2.6) / cam.scale;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pe.sx, pe.sy);
        ctx.quadraticCurveTo(pe.cx, pe.cy, pe.tx, pe.ty);
        ctx.stroke();

        ctx.strokeStyle = hexToRgba(pe.color, isSemantic ? 0.94 : 0.58);
        ctx.lineWidth = (isSemantic ? 1.85 : 1.1) / cam.scale;
        ctx.setLineDash(pe.dash);
        ctx.beginPath();
        ctx.moveTo(pe.sx, pe.sy);
        ctx.quadraticCurveTo(pe.cx, pe.cy, pe.tx, pe.ty);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isSemantic) {
          const tArrow = 0.86;
          const ax = evalQuadBezier(pe.sx, pe.cx, pe.tx, tArrow);
          const ay = evalQuadBezier(pe.sy, pe.cy, pe.ty, tArrow);
          const tx = evalQuadTangent(pe.sx, pe.cx, pe.tx, tArrow);
          const ty = evalQuadTangent(pe.sy, pe.cy, pe.ty, tArrow);
          const angle = Math.atan2(ty, tx);
          const size = 6 / Math.sqrt(cam.scale);
          ctx.fillStyle = pe.color;
          ctx.beginPath();
          ctx.moveTo(ax + Math.cos(angle) * size, ay + Math.sin(angle) * size);
          ctx.lineTo(
            ax + Math.cos(angle + 2.55) * size * 0.78,
            ay + Math.sin(angle + 2.55) * size * 0.78
          );
          ctx.lineTo(
            ax + Math.cos(angle - 2.55) * size * 0.78,
            ay + Math.sin(angle - 2.55) * size * 0.78
          );
          ctx.closePath();
          ctx.fill();

          if (!reducedMotionRef.current && actId) {
            hasAnimatedPulse = true;
            const tPulse = (now * 0.00045 + pe.seed) % 1;
            const px = evalQuadBezier(pe.sx, pe.cx, pe.tx, tPulse);
            const py = evalQuadBezier(pe.sy, pe.cy, pe.ty, tPulse);
            const pulseR = 2.6 / Math.sqrt(cam.scale);
            ctx.fillStyle = '#f5f5f3';
            ctx.beginPath();
            ctx.arc(px, py, pulseR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (hasAnimatedPulse && !document.hidden) {
        needsAnotherFrame = true;
      }

      const isZoomedIntoDetail = cam.scale >= 0.9;
      const labelCandidates: {
        pos: PositionedNode;
        priority: number;
        text: string;
        fontSize: number;
        weight: number;
        color: string;
      }[] = [];

      for (let i = 0; i < nodes.length; i++) {
        const pos = nodes[i];
        const { node } = pos;
        const isSelected = selId === node.id;
        const isHovered = hovId === node.id;
        const isNeighbor = actNb.neighborIds.has(node.id);

        let prominent = false;
        if (actId && isNeighbor) prominent = true;
        else if (focDom && node.domains.includes(focDom)) prominent = true;
        else if (focDom === '(no domain)' && node.domains.length === 0) prominent = true;
        else if (expMode === 'all') prominent = true;
        else if (expMode === 'q3') {
          prominent = node.evidence_grade === 'Q3' || node.type === 'Discipline';
        } else {
          prominent = isZoomedIntoDetail || semAnchors.has(node.id);
        }

        let nodeAlpha = prominent ? 0.96 : 0.24;
        if (actId) {
          nodeAlpha = isNeighbor ? 1 : 0.14;
        } else if (focDom) {
          const belongs =
            focDom === '(no domain)'
              ? node.domains.length === 0
              : node.domains.includes(focDom);
          nodeAlpha = belongs ? 0.98 : 0.14;
        }

        ctx.save();
        ctx.globalAlpha = nodeAlpha;

        const r = pos.radius;

        if (node.evidence_grade === 'Q3' || node.type === 'Discipline' || isSelected || isHovered) {
          const glowR = isSelected || isHovered ? r * 2.7 : r * 2.1;
          ctx.fillStyle = hexToRgba(
            isSelected || isHovered ? '#d4ff3a' : pos.color,
            isSelected ? 0.24 : 0.14
          );
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        if (isSelected || isHovered) {
          const retR = r + 7.5 / Math.sqrt(cam.scale);
          ctx.strokeStyle = '#d4ff3a';
          ctx.lineWidth = 1.4 / cam.scale;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, retR, 0, Math.PI * 2);
          ctx.stroke();

          const tick = 4 / cam.scale;
          const rot = reducedMotionRef.current ? 0 : (now * 0.0005) % (Math.PI * 2);
          for (let k = 0; k < 4; k++) {
            const a = rot + (k * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(
              pos.x + Math.cos(a) * (retR + 1),
              pos.y + Math.sin(a) * (retR + 1)
            );
            ctx.lineTo(
              pos.x + Math.cos(a) * (retR + tick + 2),
              pos.y + Math.sin(a) * (retR + tick + 2)
            );
            ctx.stroke();
          }
          if (!reducedMotionRef.current && !document.hidden) {
            needsAnotherFrame = true;
          }
        }

        if (pos.isBridge) {
          ctx.strokeStyle = 'rgba(245, 245, 243, 0.55)';
          ctx.lineWidth = 0.9 / cam.scale;
          ctx.setLineDash([2, 2.5]);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r + 4.2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (node.type === 'Hypothesis') {
          ctx.fillStyle = '#0c0d10';
          ctx.strokeStyle = '#ff8b3d';
          ctx.lineWidth = 1.6 / Math.sqrt(cam.scale);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y - r * 1.3);
          ctx.lineTo(pos.x + r * 1.2, pos.y);
          ctx.lineTo(pos.x, pos.y + r * 1.3);
          ctx.lineTo(pos.x - r * 1.2, pos.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (node.type === 'Discipline') {
          ctx.fillStyle = pos.color;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.2 / Math.sqrt(cam.scale);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f5f5f3';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else if (node.type === 'Subdiscipline') {
          ctx.fillStyle = '#0c0d10';
          ctx.strokeStyle = pos.color;
          ctx.lineWidth = 1.9 / Math.sqrt(cam.scale);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = pos.color;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r * 0.38, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = isSelected ? '#d4ff3a' : pos.color;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.2 / Math.sqrt(cam.scale);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (node.evidence_grade === 'Q3') {
            ctx.strokeStyle = hexToRgba(pos.color, 0.55);
            ctx.lineWidth = 0.9 / Math.sqrt(cam.scale);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r + 3, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        ctx.restore();

        if (node.type !== 'Discipline') {
          const shouldLabel =
            isSelected ||
            isHovered ||
            (actId !== null && isNeighbor) ||
            (node.type === 'Subdiscipline' &&
              (isZoomedIntoDetail || focDom === pos.primaryDomain)) ||
            (cam.scale >= 0.86 && prominent) ||
            (focDom === pos.primaryDomain && prominent);

          if (shouldLabel) {
            const priority = isSelected
              ? 100
              : isHovered
              ? 95
              : actId && isNeighbor
              ? 80
              : node.type === 'Subdiscipline'
              ? 60
              : node.evidence_grade === 'Q3'
              ? 40
              : 20;

            labelCandidates.push({
              pos,
              priority,
              text:
                node.title.length > 32
                  ? `${node.title.slice(0, 30)}…`
                  : node.title,
              fontSize:
                node.type === 'Subdiscipline'
                  ? 12
                  : isSelected || isHovered
                  ? 12.5
                  : 11,
              weight: isSelected || node.type === 'Subdiscipline' ? 600 : 400,
              color: isSelected || isHovered ? '#f5f5f3' : '#d6d9e0',
            });
          }
        }
      }

      ctx.restore();

      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        const sx = c.x * cam.scale + cam.x;
        const sy = (c.y - c.orbitRadius - 26) * cam.scale + cam.y;
        if (sx < -200 || sx > width + 200 || sy < -80 || sy > height + 80) continue;

        const isDimmedByFocus = focDom !== null && focDom !== c.domain;
        const isClusterHovered = hovCluster === c.domain;
        ctx.save();
        ctx.globalAlpha = isDimmedByFocus ? 0.22 : 1;
        ctx.textAlign = 'center';

        const metaSize = Math.max(9.5, Math.min(11.5, 9 + cam.scale * 3));
        ctx.font = `500 ${metaSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = isClusterHovered ? '#f5f5f3' : c.theme.color;
        ctx.fillText(`${c.theme.roman} · ${c.nodeCount} NODES`, sx, sy - 14);

        const titleSize = Math.max(12.5, Math.min(18, 11.5 + cam.scale * 7));
        ctx.font = `700 ${titleSize}px "Bricolage Grotesque", "Instrument Sans", sans-serif`;
        ctx.fillStyle =
          isClusterHovered || focDom === c.domain ? '#ffffff' : '#f5f5f3';
        ctx.fillText(c.theme.shortName, sx, sy + 4);
        ctx.restore();
      }

      labelCandidates.sort((a, b) => b.priority - a.priority);
      const occupiedBoxes: { x1: number; y1: number; x2: number; y2: number }[] = [];

      for (let i = 0; i < labelCandidates.length; i++) {
        const item = labelCandidates[i];
        const sx = item.pos.x * cam.scale + cam.x;
        const sy = item.pos.y * cam.scale + cam.y;
        if (sx < -120 || sx > width + 120 || sy < -40 || sy > height + 40) continue;

        ctx.font = `${item.weight} ${item.fontSize}px "Instrument Sans", system-ui, sans-serif`;
        const textW = ctx.measureText(item.text).width;
        const labelY = sy + item.pos.radius * cam.scale + 13;
        const box = {
          x1: sx - textW / 2 - 6,
          y1: labelY - item.fontSize + 1,
          x2: sx + textW / 2 + 6,
          y2: labelY + 5,
        };

        let collides = false;
        if (item.priority < 90) {
          for (let b = 0; b < occupiedBoxes.length; b++) {
            const ob = occupiedBoxes[b];
            if (
              !(
                box.x2 < ob.x1 ||
                box.x1 > ob.x2 ||
                box.y2 < ob.y1 ||
                box.y1 > ob.y2
              )
            ) {
              collides = true;
              break;
            }
          }
        }
        if (collides) continue;
        occupiedBoxes.push(box);

        ctx.fillStyle = 'rgba(8, 9, 12, 0.84)';
        ctx.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

        ctx.textAlign = 'center';
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, sx, labelY);
      }

      if (needsAnotherFrame) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    const scheduleRender = () => {
      if (rafId === 0) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    scheduleRenderRef.current = scheduleRender;
    scheduleRender();

    const onVisibility = () => {
      if (!document.hidden) scheduleRender();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (rafId !== 0) cancelAnimationFrame(rafId);
      scheduleRenderRef.current = () => {};
    };
  }, [layout]);

  const hoveredNode = hoveredNodeId ? dataset.nodeById.get(hoveredNodeId) : null;
  const domainList = useMemo(
    () => [...dataset.domainNodes.map((d) => d.title), '(no domain)'],
    [dataset.domainNodes]
  );

  return (
    <div className="relative flex flex-1 h-full min-h-[460px] md:min-h-[540px] w-full overflow-hidden bg-black">
      {/* Main Interactive Universe Stage */}
      <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
        {/* Observatory Top Control Strip */}
        <div className="z-20 flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.08] bg-black/88 md:backdrop-blur-md px-3 py-2.5 sm:px-4 lg:px-6">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full pb-0.5">
            <button
              type="button"
              onClick={() => handleFocusDomain(null)}
              className={`min-h-[36px] sm:min-h-[30px] rounded-full px-3 py-1 text-[12px] sm:text-xs whitespace-nowrap shrink-0 border transition-colors ${
                focusedDomain === null
                  ? 'border-[#d4ff3a]/50 bg-[#d4ff3a]/12 text-[#d4ff3a] font-medium'
                  : 'border-white/[0.08] text-[#9ba3b0] hover:text-[#f5f5f3]'
              }`}
            >
              All Constellations
            </button>
            {domainList.map((dom) => {
              const theme = getDomainTheme(dom === '(no domain)' ? undefined : dom);
              const isSelected = focusedDomain === dom;
              return (
                <button
                  key={dom}
                  type="button"
                  onClick={() => handleFocusDomain(isSelected ? null : dom)}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] sm:min-h-[30px] rounded-full px-3 py-1 text-[12px] sm:text-xs whitespace-nowrap shrink-0 border transition-colors ${
                    isSelected
                      ? 'border-white/30 bg-white/[0.1] text-[#f5f5f3] font-medium'
                      : 'border-white/[0.07] text-[#9ba3b0] hover:text-[#f5f5f3] hover:border-white/20'
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

          <div className="flex items-center gap-2 shrink-0 max-w-full overflow-x-auto no-scrollbar">
            <div className="flex items-center rounded-full border border-white/[0.08] bg-[#0c0d10] p-0.5">
              {(
                [
                  { id: 'progressive', label: 'Progressive' },
                  { id: 'all', label: `All ${dataset.raw.nodes.length}` },
                  { id: 'q3', label: 'Q3 Practiced' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setExplorationMode(mode.id)}
                  className={`min-h-[32px] sm:min-h-[26px] rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    explorationMode === mode.id
                      ? 'bg-white/[0.1] text-[#d4ff3a]'
                      : 'text-[#9ba3b0] hover:text-[#f5f5f3]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleSensitive}
              title="Toggle sensitive review items (data_quality.sensitive_review)"
              aria-label={hideSensitive ? 'Show sensitive items' : 'Hide sensitive items'}
              className={`inline-flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] rounded-full border px-3 py-1 text-[11px] whitespace-nowrap transition-colors ${
                hideSensitive
                  ? 'border-[#d4ff3a]/45 bg-[#d4ff3a]/12 text-[#d4ff3a]'
                  : 'border-white/[0.08] text-[#9ba3b0] hover:text-[#f5f5f3]'
              }`}
            >
              {hideSensitive ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">
                {hideSensitive ? 'Sensitive Hidden' : 'Showing All'}
              </span>
            </button>
          </div>
        </div>

        {/* On-Demand High-DPI Constellation Canvas */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 overflow-hidden select-none"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onDoubleClick={handleDoubleClick}
            aria-label="Interactive Intellectual Universe Constellation"
            className={`block h-full w-full touch-none ${
              isDraggingUi
                ? 'cursor-grabbing'
                : hoveredNodeId || hoveredClusterDomain
                ? 'cursor-pointer'
                : 'cursor-grab'
            }`}
          />

          {/* Bottom-Left Telemetry Hover Card & Connection Layer Toggles */}
          <div className="pointer-events-none absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-20 flex flex-col gap-2 max-w-[calc(100%-178px)] sm:max-w-[340px]">
            {hoveredNode && (
              <div className="pointer-events-auto rounded-2xl border border-white/[0.14] bg-[rgba(12,13,16,0.94)] md:backdrop-blur-md px-4 py-3 shadow-2xl">
                <div className="flex items-center gap-2 text-[10px] font-mono text-[#9ba3b0]">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: getDomainTheme(hoveredNode.domains[0]).color,
                    }}
                  />
                  <span>{hoveredNode.type}</span>
                  <span>·</span>
                  <span
                    style={{
                      color: GRADE_META[hoveredNode.evidence_grade]?.color,
                    }}
                  >
                    {hoveredNode.evidence_grade}
                  </span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {dataset.edgesByNodeId.get(hoveredNode.id)?.length ?? 0} edges
                  </span>
                </div>
                <p className="mt-1 font-display text-sm font-semibold tracking-tight text-[#f5f5f3] leading-snug">
                  {hoveredNode.title}
                </p>
                <p className="mt-1 text-[13px] sm:text-xs text-[#9ba3b0] line-clamp-2">
                  {hoveredNode.description}
                </p>
              </div>
            )}

            <div className="pointer-events-auto rounded-2xl border border-white/[0.1] bg-[rgba(12,13,16,0.92)] md:backdrop-blur-md overflow-hidden">
              <button
                type="button"
                onClick={() => setShowLegend((v) => !v)}
                className="flex w-full min-h-[38px] sm:min-h-[32px] items-center justify-between gap-2.5 px-3.5 py-2 text-[11px] font-mono text-[#9ba3b0] hover:text-[#f5f5f3]"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Layers className="h-3.5 w-3.5 text-[#d4ff3a] shrink-0" />
                  <span className="truncate">Layers</span>
                </span>
                <span className="shrink-0 text-[#f5f5f3]/70">{showLegend ? 'Hide' : 'Show'}</span>
              </button>

              {showLegend && (
                <div className="border-t border-white/[0.07] px-3.5 py-2.5 space-y-1.5">
                  {(
                    [
                      'explicit',
                      'user_suggested',
                      'co_discussed',
                      'inferred',
                      'structural',
                    ] as ConnectionBasis[]
                  ).map((basis) => {
                    const meta = BASIS_META[basis];
                    const active = basisVisible[basis];
                    const count = dataset.raw.data_quality.edge_bases[basis] ?? 0;
                    return (
                      <button
                        key={basis}
                        type="button"
                        onMouseEnter={() => setHoveredBasis(basis)}
                        onMouseLeave={() => setHoveredBasis(null)}
                        onClick={() =>
                          setBasisVisible((prev) => ({
                            ...prev,
                            [basis]: !prev[basis],
                          }))
                        }
                        className={`flex w-full min-h-[28px] items-center justify-between gap-3 text-left text-[11px] transition-opacity ${
                          active ? 'opacity-100' : 'opacity-40'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-[#d6d9e0] hover:text-white truncate">
                          <svg width="18" height="6" className="shrink-0" aria-hidden="true">
                            <line
                              x1="0"
                              y1="3"
                              x2="18"
                              y2="3"
                              stroke={meta.color}
                              strokeWidth="1.6"
                              strokeDasharray={meta.dash === 'none' ? undefined : meta.dash}
                            />
                          </svg>
                          <span className="truncate">{meta.shortLabel}</span>
                        </span>
                        <span className="font-mono text-[10px] text-[#7c8494] tabular-nums shrink-0">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Bottom-Right Observatory Navigation Controls */}
          <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 flex items-center gap-0.5 sm:gap-1 rounded-full border border-white/[0.1] bg-[rgba(12,13,16,0.92)] p-1 md:backdrop-blur-md">
            <button
              type="button"
              onClick={() => zoomBy(1.26)}
              aria-label="Zoom in"
              className="flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[#9ba3b0] hover:text-[#f5f5f3] hover:bg-white/[0.06] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="px-1.5 sm:px-2 font-mono text-[11px] text-[#9ba3b0] tabular-nums min-w-[42px] text-center">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={() => zoomBy(0.79)}
              aria-label="Zoom out"
              className="flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[#9ba3b0] hover:text-[#f5f5f3] hover:bg-white/[0.06] transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <div className="h-4 w-[1px] bg-white/[0.08] mx-0.5" />
            <button
              type="button"
              onClick={() => {
                setFocusedDomain(null);
                onSelectNode(null);
                velocityRef.current = { vx: 0, vy: 0 };
                targetCameraRef.current = fitUniverseCamera();
                scheduleRenderRef.current();
              }}
              aria-label="Reset universe view"
              title="Fit all constellations (0)"
              className="inline-flex h-9 sm:h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] text-[#9ba3b0] hover:text-[#d4ff3a] hover:bg-white/[0.06] transition-colors"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fit</span>
            </button>
            {focusedDomain && (
              <button
                type="button"
                onClick={() => handleFocusDomain(null)}
                aria-label="Clear domain focus"
                className="inline-flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[#d4ff3a] hover:bg-white/[0.06]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Empty Selection Subtle Cue */}
          {!selectedNodeId && !hoveredNode && (
            <div className="pointer-events-none absolute top-4 right-4 z-10 hidden md:flex items-center gap-2 rounded-full border border-white/[0.08] bg-[rgba(12,13,16,0.82)] px-3.5 py-1.5 text-[11px] text-[#9ba3b0] backdrop-blur-sm">
              <Compass className="h-3.5 w-3.5 text-[#d4ff3a]" />
              <span>
                Scroll to zoom · Drag with momentum · Click any star to inspect
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right-hand Archival Dossier Panel */}
      {selectedNodeId && (
        <div className="absolute inset-y-0 right-0 z-30 w-full max-w-[400px] lg:static lg:h-full lg:w-[400px] lg:shrink-0">
          <NodeDossier
            nodeId={selectedNodeId}
            dataset={dataset}
            hypothesisDecisions={hypothesisDecisions}
            onUpdateHypothesis={onUpdateHypothesis}
            onSelectNode={(id) => onSelectNode(id)}
            onNavigateView={(view) => onNavigateView(view)}
            onClose={() => onSelectNode(null)}
          />
        </div>
      )}
    </div>
  );
};
