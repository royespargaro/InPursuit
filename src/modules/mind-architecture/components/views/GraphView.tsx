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
  type ClusterAnchor,
  type PositionedNode,
} from '../../utils/dataset';
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

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(212, 175, 114, ${alpha})`;
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

// Deterministic background cosmic starfield
function generateStarfield(count: number): BackgroundStar[] {
  const stars: BackgroundStar[] = [];
  let s = 48271;
  const nextRand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const palette = ['#EDE9E0', '#C5D3EB', '#D4AF72', '#9DB4D4', '#E6EEF8'];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: (nextRand() - 0.5) * 4200,
      y: (nextRand() - 0.5) * 3200,
      size: 0.6 + nextRand() * 1.15,
      alpha: 0.14 + nextRand() * 0.42,
      parallax: i % 3 === 0 ? 0.22 : 0.1,
      color: palette[i % palette.length],
    });
  }
  return stars;
}

const STARFIELD = generateStarfield(300);

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
  const layout = useMemo(() => computeCelestialLayout(dataset), [dataset]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef({ width: 1200, height: 760, dpr: 1 });

  const cameraRef = useRef<CameraState>({ x: 0, y: 0, scale: 0.5 });
  const targetCameraRef = useRef<CameraState>({ x: 0, y: 0, scale: 0.5 });
  const velocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const hasInitializedCamera = useRef(false);

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
  const [showLegend, setShowLegend] = useState(true);

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
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const fitUniverseCamera = useCallback(
    (w = viewportRef.current.width, h = viewportRef.current.height): CameraState => {
      const scaleX = (w - 80) / layout.width;
      const scaleY = (h - 80) / layout.height;
      const scale = Math.max(0.28, Math.min(0.66, Math.min(scaleX, scaleY) * 1.18));
      return {
        x: w / 2 - layout.centerX * scale,
        y: h / 2 - layout.centerY * scale,
        scale,
      };
    },
    [layout]
  );

  // Measure container & keep high-DPI canvas crisp
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewportRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);

      if (!hasInitializedCamera.current) {
        hasInitializedCamera.current = true;
        const initial = fitUniverseCamera(rect.width, rect.height);
        cameraRef.current = { ...initial };
        targetCameraRef.current = { ...initial };
      }
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
          ? '#78AD8E'
          : decision === 'rejected'
          ? '#4B5262'
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
        return;
      }
      const anchor = layout.clusters.get(domainName);
      if (anchor) {
        const { width, height } = viewportRef.current;
        const targetScale = domainName === '(no domain)' ? 0.98 : 1.15;
        targetCameraRef.current = {
          x: width / 2 - anchor.x * targetScale,
          y: height / 2 - anchor.y * targetScale,
          scale: targetScale,
        };
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
      const pad = 11 / cam.scale;

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
      return;
    }

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
      }
    } else if (hit.clusterDomain) {
      handleFocusDomain(hit.clusterDomain);
    } else {
      setFocusedDomain(null);
      targetCameraRef.current = fitUniverseCamera();
    }
  };

  useEffect(() => {
    let rafId = 0;

    const renderFrame = (now: number) => {
      rafId = requestAnimationFrame(renderFrame);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height, dpr } = viewportRef.current;
      if (width <= 0 || height <= 0) return;

      const cam = cameraRef.current;
      const target = targetCameraRef.current;
      const vel = velocityRef.current;

      if (!dragRef.current) {
        if (Math.abs(vel.vx) > 0.08 || Math.abs(vel.vy) > 0.08) {
          cam.x += vel.vx;
          cam.y += vel.vy;
          target.x = cam.x;
          target.y = cam.y;
          vel.vx *= 0.91;
          vel.vy *= 0.91;
        } else {
          vel.vx = 0;
          vel.vy = 0;
          const lerp = reducedMotionRef.current ? 1 : 0.22;
          cam.x += (target.x - cam.x) * lerp;
          cam.y += (target.y - cam.y) * lerp;
          cam.scale += (target.scale - cam.scale) * lerp;
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

      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        20,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.78
      );
      bgGrad.addColorStop(0, '#0D1220');
      bgGrad.addColorStop(0.55, '#080B12');
      bgGrad.addColorStop(1, '#05070B');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < STARFIELD.length; i++) {
        const star = STARFIELD[i];
        const px =
          ((star.x + cam.x * star.parallax + width * 2) % (width + 80)) - 40;
        const py =
          ((star.y + cam.y * star.parallax + height * 2) % (height + 80)) - 40;
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(px, py, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.scale, cam.scale);

      const cx0 = layout.centerX;
      const cy0 = layout.centerY;

      const coreGrad = ctx.createRadialGradient(cx0, cy0, 10, cx0, cy0, 1080);
      coreGrad.addColorStop(0, 'rgba(212, 175, 114, 0.065)');
      coreGrad.addColorStop(0.45, 'rgba(110, 148, 204, 0.025)');
      coreGrad.addColorStop(1, 'rgba(5, 7, 11, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx0, cy0, 1080, 0, Math.PI * 2);
      ctx.fill();

      const rings = [
        { r: 470, dash: [] as number[], alpha: 0.07 },
        { r: 820, dash: [5, 9], alpha: 0.06 },
        { r: 1060, dash: [] as number[], alpha: 0.05 },
      ];
      for (const ring of rings) {
        ctx.strokeStyle = `rgba(226, 232, 240, ${ring.alpha})`;
        ctx.lineWidth = 1 / cam.scale;
        ctx.setLineDash(ring.dash);
        ctx.beginPath();
        ctx.arc(cx0, cy0, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.032)';
      ctx.lineWidth = 1 / cam.scale;
      for (let i = 0; i < 12; i++) {
        const rad = (i * 30 * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx0 + Math.cos(rad) * 140, cy0 + Math.sin(rad) * 140);
        ctx.lineTo(cx0 + Math.cos(rad) * 1060, cy0 + Math.sin(rad) * 1060);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(212, 175, 114, 0.14)';
      for (let deg = 0; deg < 360; deg += 5) {
        const rad = (deg * Math.PI) / 180;
        const isMajor = deg % 30 === 0;
        const rIn = isMajor ? 1044 : 1052;
        ctx.beginPath();
        ctx.moveTo(cx0 + Math.cos(rad) * rIn, cy0 + Math.sin(rad) * rIn);
        ctx.lineTo(cx0 + Math.cos(rad) * 1060, cy0 + Math.sin(rad) * 1060);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(212, 175, 114, 0.22)';
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
        const alpha = isDimmedByFocus ? 0.16 : isDimmedByNode ? 0.25 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        const haloR = c.orbitRadius + 34;
        const neb = ctx.createRadialGradient(c.x, c.y, 6, c.x, c.y, haloR);
        neb.addColorStop(
          0,
          hexToRgba(c.theme.color, isClusterHovered || focDom === c.domain ? 0.16 : 0.09)
        );
        neb.addColorStop(0.65, hexToRgba(c.theme.color, 0.03));
        neb.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = neb;
        ctx.beginPath();
        ctx.arc(c.x, c.y, haloR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hexToRgba(
          c.theme.color,
          isClusterHovered || focDom === c.domain ? 0.42 : 0.18
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
              ? 0.24
              : 0.085
            : pe.edge.basis === 'explicit'
            ? 0.38
            : pe.edge.basis === 'user_suggested'
            ? 0.44
            : 0.3;

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

      for (let i = 0; i < activePulseEdges.length; i++) {
        const pe = activePulseEdges[i];
        const isSemantic = pe.edge.basis !== 'structural';

        ctx.strokeStyle = hexToRgba(pe.color, isSemantic ? 0.26 : 0.16);
        ctx.lineWidth = (isSemantic ? 4.5 : 2.6) / cam.scale;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pe.sx, pe.sy);
        ctx.quadraticCurveTo(pe.cx, pe.cy, pe.tx, pe.ty);
        ctx.stroke();

        ctx.strokeStyle = hexToRgba(pe.color, isSemantic ? 0.94 : 0.55);
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
            const tPulse = (now * 0.00045 + pe.seed) % 1;
            const px = evalQuadBezier(pe.sx, pe.cx, pe.tx, tPulse);
            const py = evalQuadBezier(pe.sy, pe.cy, pe.ty, tPulse);
            const pulseR = 2.6 / Math.sqrt(cam.scale);
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(px, py, pulseR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
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
          const glowR = isSelected || isHovered ? r * 3.1 : r * 2.4;
          const glow = ctx.createRadialGradient(pos.x, pos.y, r * 0.2, pos.x, pos.y, glowR);
          glow.addColorStop(
            0,
            hexToRgba(isSelected || isHovered ? '#D4AF72' : pos.color, isSelected ? 0.42 : 0.24)
          );
          glow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        if (isSelected || isHovered) {
          const retR = r + 7.5 / Math.sqrt(cam.scale);
          ctx.strokeStyle = '#D4AF72';
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
        }

        if (pos.isBridge) {
          ctx.strokeStyle = 'rgba(237, 233, 224, 0.55)';
          ctx.lineWidth = 0.9 / cam.scale;
          ctx.setLineDash([2, 2.5]);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r + 4.2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (node.type === 'Hypothesis') {
          ctx.fillStyle = '#0B0E16';
          ctx.strokeStyle = '#D9826C';
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
          ctx.strokeStyle = '#080A0F';
          ctx.lineWidth = 2.2 / Math.sqrt(cam.scale);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FFF9EE';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else if (node.type === 'Subdiscipline') {
          ctx.fillStyle = '#0A0E17';
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
          ctx.fillStyle = isSelected ? '#D4AF72' : pos.color;
          ctx.strokeStyle = '#07090E';
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
                  ? 11.5
                  : isSelected || isHovered
                  ? 12
                  : 10.5,
              weight: isSelected || node.type === 'Subdiscipline' ? 600 : 400,
              color: isSelected || isHovered ? '#EDE9E0' : '#C9C4B8',
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
        ctx.fillStyle = isClusterHovered ? '#EDE9E0' : c.theme.color;
        ctx.fillText(`${c.theme.roman} · ${c.nodeCount} NODES`, sx, sy - 14);

        const titleSize = Math.max(12, Math.min(18, 11 + cam.scale * 7));
        ctx.font = `600 ${titleSize}px "Instrument Sans", system-ui, sans-serif`;
        ctx.fillStyle =
          isClusterHovered || focDom === c.domain ? '#FFFFFF' : '#EDE9E0';
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
          x1: sx - textW / 2 - 5,
          y1: labelY - item.fontSize + 1,
          x2: sx + textW / 2 + 5,
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

        ctx.fillStyle = 'rgba(6, 8, 13, 0.78)';
        ctx.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

        ctx.textAlign = 'center';
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, sx, labelY);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [layout]);

  const hoveredNode = hoveredNodeId ? dataset.nodeById.get(hoveredNodeId) : null;
  const domainList = useMemo(
    () => [...dataset.domainNodes.map((d) => d.title), '(no domain)'],
    [dataset.domainNodes]
  );

  return (
    <div className="relative flex flex-1 h-full min-h-[540px] w-full overflow-hidden bg-[#06080D]">
      {/* Main Interactive Universe Stage */}
      <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
        {/* Observatory Top Control Strip (below Mind Architecture TopNav) */}
        <div className="z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#090C14]/92 px-4 py-2.5 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full pb-0.5">
            <button
              type="button"
              onClick={() => handleFocusDomain(null)}
              className={`px-2.5 py-1 text-xs whitespace-nowrap shrink-0 border transition-colors ${
                focusedDomain === null
                  ? 'border-[#D4AF72]/50 bg-[#D4AF72]/15 text-[#EDE9E0]'
                  : 'border-white/[0.07] text-[#8C95A6] hover:text-[#EDE9E0]'
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs whitespace-nowrap shrink-0 border transition-colors ${
                    isSelected
                      ? 'border-white/30 bg-[#151B28] text-[#EDE9E0]'
                      : 'border-white/[0.06] text-[#8C95A6] hover:text-[#EDE9E0] hover:border-white/15'
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

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center border border-white/[0.08] bg-[#07090F] p-0.5">
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
                  className={`px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    explorationMode === mode.id
                      ? 'bg-[#171E2C] text-[#D4AF72]'
                      : 'text-[#8C95A6] hover:text-[#EDE9E0]'
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
              className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] whitespace-nowrap transition-colors ${
                hideSensitive
                  ? 'border-[#D4AF72]/45 bg-[#D4AF72]/12 text-[#D4AF72]'
                  : 'border-white/[0.08] text-[#8C95A6] hover:text-[#EDE9E0]'
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

        {/* High-DPI 120fps Hardware-Accelerated Constellation Canvas */}
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
          <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-col gap-2 max-w-[360px]">
            {hoveredNode && (
              <div className="pointer-events-auto border border-white/[0.14] bg-[#0B0E16]/95 px-4 py-3 backdrop-blur-md shadow-2xl">
                <div className="flex items-center gap-2 text-[10px] font-mono text-[#9BA3B4]">
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
                <p className="mt-1 font-sans text-sm font-semibold tracking-tight text-[#EDE9E0] leading-snug">
                  {hoveredNode.title}
                </p>
                <p className="mt-1 text-xs text-[#9BA3B4] line-clamp-2">
                  {hoveredNode.description}
                </p>
              </div>
            )}

            <div className="pointer-events-auto border border-white/[0.1] bg-[#0A0D15]/90 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setShowLegend((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-[11px] font-mono text-[#9BA3B4] hover:text-[#EDE9E0]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#D4AF72]" />
                  <span>Connection Layers</span>
                </span>
                <span>{showLegend ? 'Hide' : 'Show'}</span>
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
                        className={`flex w-full items-center justify-between gap-4 text-left text-[11px] transition-opacity ${
                          active ? 'opacity-100' : 'opacity-40'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-[#D4CFC4] hover:text-white">
                          <svg width="20" height="6" aria-hidden="true">
                            <line
                              x1="0"
                              y1="3"
                              x2="20"
                              y2="3"
                              stroke={meta.color}
                              strokeWidth="1.6"
                              strokeDasharray={meta.dash === 'none' ? undefined : meta.dash}
                            />
                          </svg>
                          <span>{meta.shortLabel}</span>
                        </span>
                        <span className="font-mono text-[10px] text-[#646D7E] tabular-nums">
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
          <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 border border-white/[0.1] bg-[#0A0D15]/90 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => zoomBy(1.26)}
              aria-label="Zoom in"
              className="p-2 text-[#9BA3B4] hover:text-[#EDE9E0] hover:bg-white/[0.05] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px] text-[#8C95A6] tabular-nums min-w-[46px] text-center">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={() => zoomBy(0.79)}
              aria-label="Zoom out"
              className="p-2 text-[#9BA3B4] hover:text-[#EDE9E0] hover:bg-white/[0.05] transition-colors"
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
              }}
              aria-label="Reset universe view"
              title="Fit all constellations (0)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-[#9BA3B4] hover:text-[#D4AF72] hover:bg-white/[0.05] transition-colors"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fit</span>
            </button>
            {focusedDomain && (
              <button
                type="button"
                onClick={() => handleFocusDomain(null)}
                aria-label="Clear domain focus"
                className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] text-[#D4AF72] hover:bg-white/[0.05]"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Empty Selection Subtle Cue */}
          {!selectedNodeId && !hoveredNode && (
            <div className="pointer-events-none absolute top-4 right-4 z-10 hidden md:flex items-center gap-2 border border-white/[0.07] bg-[#0A0D15]/80 px-3.5 py-2 text-[11px] text-[#8C95A6] backdrop-blur-sm">
              <Compass className="h-3.5 w-3.5 text-[#D4AF72]" />
              <span>
                Scroll to zoom · Drag with momentum · Click or double-click any star to inspect
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
