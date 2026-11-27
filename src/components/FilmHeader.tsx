import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useMindWorkspaceOptional } from '../modules/mind-architecture/context/MindWorkspaceContext';
import type { IndexedDataset, KnowledgeDataset } from '../modules/mind-architecture/types/knowledge';
import type { CelestialLayout } from '../modules/mind-architecture/utils/dataset';
import {
  DEFAULT_MIND_DATASET_URL,
  getCachedMindBundle,
  loadMindBundle,
} from '../modules/mind-architecture/utils/datasetCache';
import './film-header.css';

export interface HeroGoalSummary {
  id: string;
  title: string;
  areaName: string;
  percent: number;
  completedTasks: number;
  totalTasks: number;
  targetDate: string;
}

interface FilmHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  scene?: string;
  goals?: HeroGoalSummary[];
  datasetUrl?: string;
  initialData?: KnowledgeDataset;
  onReview?: () => void;
  onAddTask?: () => void;
  onOpenGoals?: () => void;
  onOpenGoal?: (goalId: string) => void;
  onAddGoal?: () => void;
  onOpenMindArchitecture?: () => void;
}

interface ProjectedHeroNode {
  id: string;
  title: string;
  nx: number;
  ny: number;
  radius: number;
  color: string;
  isCore: boolean;
  isQ3: boolean;
  phase: number;
}

interface ProjectedHeroEdge {
  sourceIdx: number;
  targetIdx: number;
  semantic: boolean;
  color: string;
}

const HERO_PALETTE = ['#ff8b3d', '#89a8ff', '#d4ff3a', '#ffb86c', '#a9bfff'];

function resolveHeroNodeColor(primaryDomain: string, isQ3: boolean, index: number): string {
  if (isQ3 && index % 4 === 0) return '#d4ff3a';
  let hash = 0;
  for (let i = 0; i < primaryDomain.length; i++) {
    hash = (hash * 31 + primaryDomain.charCodeAt(i)) | 0;
  }
  return HERO_PALETTE[Math.abs(hash) % HERO_PALETTE.length];
}

const pad = (n: number) => String(n).padStart(2, '0');

export const FilmHeader = ({
  eyebrow,
  title,
  subtitle,
  scene,
  goals = [],
  datasetUrl = DEFAULT_MIND_DATASET_URL,
  initialData,
  onReview,
  onAddTask,
  onOpenGoals,
  onOpenGoal,
  onAddGoal,
  onOpenMindArchitecture,
}: FilmHeaderProps) => {
  const { l } = useLanguage();
  const effectiveScene = scene ?? l('daily overview', 'ringkasan harian');
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const workspace = useMindWorkspaceOptional();
  const hasSharedWorkspace = Boolean(workspace && !initialData);

  const [fallbackBundle, setFallbackBundle] = useState<{
    indexed: IndexedDataset;
    layout: CelestialLayout;
  } | null>(() => {
    const cached = getCachedMindBundle(datasetUrl, initialData);
    return cached ? { indexed: cached.indexed, layout: cached.layout } : null;
  });

  const [hoveredInfo, setHoveredInfo] = useState<{ id: string; title: string } | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  useEffect(() => {
    if (hasSharedWorkspace) return;
    const existing = getCachedMindBundle(datasetUrl, initialData);
    if (existing) {
      setFallbackBundle({ indexed: existing.indexed, layout: existing.layout });
      return;
    }

    let cancelled = false;
    void loadMindBundle(datasetUrl)
      .then((loaded) => {
        if (!cancelled && loaded) {
          setFallbackBundle({ indexed: loaded.indexed, layout: loaded.layout });
        }
      })
      .catch(() => {
        // Keep subtle ambient fallback if offline or mocked
      });

    return () => {
      cancelled = true;
    };
  }, [hasSharedWorkspace, datasetUrl, initialData]);

  const bundle =
    hasSharedWorkspace && workspace?.indexed && workspace?.layout
      ? { indexed: workspace.indexed, layout: workspace.layout }
      : fallbackBundle;

  // Live Architecture of Mind constellation canvas inside FilmHeader
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || !bundle) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    const matchMedia =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia.bind(window)
        : null;
    const prefersReducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const isFinePointer = matchMedia?.('(pointer: fine)').matches ?? false;

    const { indexed, layout } = bundle;

    // Precompute normalized constellation coordinates once per dataset
    const nodes: ProjectedHeroNode[] = [];
    const nodeIndexById = new Map<string, number>();
    let idx = 0;

    for (const pos of layout.nodes.values()) {
      if (indexed.sensitiveNodeIds.has(pos.node.id)) continue;
      const nx = (pos.x - layout.centerX) / (layout.width * 0.5);
      const ny = (pos.y - layout.centerY) / (layout.height * 0.5);
      const isCore = pos.node.type === 'Discipline' || pos.node.type === 'Subdiscipline';
      const isQ3 = pos.node.evidence_grade === 'Q3';
      nodeIndexById.set(pos.node.id, idx);
      nodes.push({
        id: pos.node.id,
        title: pos.node.title,
        nx,
        ny,
        radius: pos.node.type === 'Discipline' ? 3.8 : isQ3 ? 2.4 : 1.5,
        color: resolveHeroNodeColor(pos.primaryDomain, isQ3, idx),
        isCore,
        isQ3,
        phase: (idx * 0.43) % (Math.PI * 2),
      });
      idx += 1;
    }

    const edges: ProjectedHeroEdge[] = [];
    for (const edge of indexed.raw.edges) {
      if (edge.basis === 'established_academic') continue;
      const si = nodeIndexById.get(edge.source);
      const ti = nodeIndexById.get(edge.target);
      if (si === undefined || ti === undefined) continue;
      const semantic = edge.basis !== 'structural';
      edges.push({
        sourceIdx: si,
        targetIdx: ti,
        semantic,
        color:
          edge.basis === 'explicit'
            ? '#d4ff3a'
            : edge.basis === 'user_suggested'
              ? '#72e3a8'
              : edge.basis === 'co_discussed'
                ? '#89a8ff'
                : edge.basis === 'inferred'
                  ? '#ff8b3d'
                  : '#9ba3b0',
      });
    }

    let width = 800;
    let height = 430;
    let dpr = 1;
    let isVisible = true;
    let rafId = 0;
    let lastDraw = 0;
    let screenCoords = new Float32Array(nodes.length * 2);

    const resize = () => {
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, width < 640 ? 1.5 : 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      render(performance.now());
    };

    const render = (now: number) => {
      if (!ctx || width <= 0 || height <= 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const compact = width < 520;
      const t = prefersReducedMotion ? 0 : now * 0.00028;
      const parallaxX = pointerRef.current.active ? pointerRef.current.x * 8 : 0;
      const parallaxY = pointerRef.current.active ? pointerRef.current.y * 6 : 0;

      const cx = (compact ? width * 0.74 : width * 0.72) + parallaxX;
      const cy = (compact ? height * 0.29 : height * 0.44) + parallaxY;
      const rx = compact ? width * 0.36 : Math.min(width * 0.28, 300);
      const ry = compact ? height * 0.24 : Math.min(height * 0.38, 175);

      // Subtle architectural rings behind the constellation
      ctx.save();
      for (const scale of [0.42, 0.72, 1.0]) {
        ctx.strokeStyle = scale === 0.72 ? 'rgba(255, 106, 0, 0.16)' : 'rgba(137, 168, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * scale, ry * scale, -0.08, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      const cosRot = Math.cos(t * 0.12);
      const sinRot = Math.sin(t * 0.12);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const rxn = n.nx * cosRot - n.ny * sinRot;
        const ryn = n.nx * sinRot + n.ny * cosRot;
        const driftX = prefersReducedMotion ? 0 : Math.sin(t * 1.4 + n.phase) * 1.6;
        const driftY = prefersReducedMotion ? 0 : Math.cos(t * 1.2 + n.phase) * 1.4;
        screenCoords[i * 2] = cx + rxn * rx + driftX;
        screenCoords[i * 2 + 1] = cy + ryn * ry + driftY;
      }

      const hovId = hoveredIdRef.current;
      const hovIdx = hovId !== null ? nodeIndexById.get(hovId) ?? -1 : -1;

      // Draw edges
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const touchesHovered = hovIdx !== -1 && (e.sourceIdx === hovIdx || e.targetIdx === hovIdx);
        if (!e.semantic && !touchesHovered) continue;

        const sx = screenCoords[e.sourceIdx * 2];
        const sy = screenCoords[e.sourceIdx * 2 + 1];
        const tx = screenCoords[e.targetIdx * 2];
        const ty = screenCoords[e.targetIdx * 2 + 1];

        ctx.strokeStyle = e.color;
        ctx.globalAlpha = touchesHovered ? 0.72 : hovIdx !== -1 ? 0.05 : 0.16;
        ctx.lineWidth = touchesHovered ? 1.35 : 0.75;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo((sx + tx) * 0.5 + (cx - (sx + tx) * 0.5) * 0.14, (sy + ty) * 0.5 + (cy - (sy + ty) * 0.5) * 0.14, tx, ty);
        ctx.stroke();
      }

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const x = screenCoords[i * 2];
        const y = screenCoords[i * 2 + 1];
        const isHovered = i === hovIdx;

        if (n.isCore || n.isQ3 || isHovered) {
          ctx.globalAlpha = isHovered ? 0.34 : 0.12;
          ctx.fillStyle = isHovered ? '#d4ff3a' : n.color;
          ctx.beginPath();
          ctx.arc(x, y, isHovered ? n.radius * 4.2 : n.radius * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = isHovered ? 1 : hovIdx !== -1 ? 0.25 : n.isCore || n.isQ3 ? 0.92 : 0.42;
        ctx.fillStyle = isHovered ? '#d4ff3a' : n.color;
        ctx.beginPath();
        ctx.arc(x, y, isHovered ? n.radius * 1.45 : n.radius, 0, Math.PI * 2);
        ctx.fill();

        if (isHovered) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#d4ff3a';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(x, y, n.radius * 2.4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const shouldAnimate = () =>
      !prefersReducedMotion && isFinePointer && isVisible && !document.hidden && width >= 520;

    const tick = (now: number) => {
      rafId = 0;
      if (!shouldAnimate()) return;
      if (now - lastDraw >= 32) {
        lastDraw = now;
        render(now);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (rafId === 0 && shouldAnimate()) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    resize();
    startLoop();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(resize);
      ro.observe(root);
    }

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
        if (isVisible) {
          render(performance.now());
          startLoop();
        } else {
          stopLoop();
        }
      });
      io.observe(root);
    }

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else {
        render(performance.now());
        startLoop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onPointerMove = (e: PointerEvent) => {
      if (!isFinePointer) return;
      const r = root.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      pointerRef.current = {
        x: (mx / r.width) * 2 - 1,
        y: (my / r.height) * 2 - 1,
        active: true,
      };

      let bestIdx = -1;
      let bestDist2 = 24 * 24;
      for (let i = 0; i < nodes.length; i++) {
        const dx = mx - screenCoords[i * 2];
        const dy = my - screenCoords[i * 2 + 1];
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist2) {
          bestDist2 = d2;
          bestIdx = i;
        }
      }

      const nextId = bestIdx >= 0 ? nodes[bestIdx].id : null;
      if (nextId !== hoveredIdRef.current) {
        hoveredIdRef.current = nextId;
        setHoveredInfo(bestIdx >= 0 ? { id: nodes[bestIdx].id, title: nodes[bestIdx].title } : null);
        render(performance.now());
      }
    };

    const onPointerLeave = () => {
      pointerRef.current.active = false;
      if (hoveredIdRef.current !== null) {
        hoveredIdRef.current = null;
        setHoveredInfo(null);
        render(performance.now());
      }
    };

    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });

    return () => {
      stopLoop();
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [bundle]);

  const handleGoalClick = (goalId: string) => {
    if (onOpenGoal) onOpenGoal(goalId);
    else onOpenGoals?.();
  };

  const nodeCount = bundle?.indexed.raw.nodes.length ?? 303;
  const edgeCount = bundle?.indexed.raw.edges.length ?? 357;

  return (
    <div className="fh-root" ref={rootRef}>
      <div className="fh-layer fh-bg" aria-hidden="true" />

      <div
        className={`fh-mind-stage${onOpenMindArchitecture ? ' is-clickable' : ''}`}
        onClick={onOpenMindArchitecture}
      >
        <canvas
          ref={canvasRef}
          className="fh-mind-canvas"
          aria-label={l('Live Architecture of Mind constellation', 'Konstelasi Arsitektur Pikiran langsung')}
        />
      </div>

      <div className="fh-layer fh-scrim" aria-hidden="true" />
      <div className="fh-layer fh-vig" aria-hidden="true" />

      <div className="fh-hud">
        <div className="fh-tags">
          <span className="fh-live-pill">
            <i aria-hidden="true" />
            {l('live mind', 'pikiran aktif')}
          </span>
          <span className="fh-meta-count">
            {l(`${nodeCount} nodes · ${edgeCount} links`, `${nodeCount} simpul · ${edgeCount} tautan`)}
          </span>
          {hoveredInfo && (
            <span className="fh-hover-readout" title={hoveredInfo.title}>
              {hoveredInfo.title}
            </span>
          )}
        </div>

        {onOpenMindArchitecture ? (
          <button
            type="button"
            className="fh-mind-link"
            onClick={onOpenMindArchitecture}
          >
            {l('Explore mind map →', 'Jelajahi peta pikiran →')}
          </button>
        ) : (
          <div className="fh-scene">{effectiveScene}</div>
        )}
      </div>

      <div className="fh-lower">
        <div className="fh-copy">
          <div className="fh-eyebrow">{eyebrow}</div>
          <h1 className="fh-title">{title}<span>.</span></h1>
          <p className="fh-text">{subtitle}</p>
          <div className="fh-btns">
            <button type="button" className="fh-btn fh-btn-solid" onClick={onReview}>{l('Daily review', 'Evaluasi harian')} <b>→</b></button>
            <button type="button" className="fh-btn fh-btn-outline" onClick={onAddTask}>{l('Add task', 'Tambah tugas')}</button>
          </div>
        </div>
      </div>

      <aside className="fh-horizon-bar" aria-label={l('Active goals progress', 'Progres tujuan aktif')}>
        {goals.length > 0 ? (
          <>
            <div className="fh-horizon-rail">
              <span>{l(`goals · ${goals.length} active`, `tujuan · ${goals.length} aktif`)}</span>
              <button type="button" className="fh-goal-link" onClick={onOpenGoals}>
                {goals.length > 3 ? l(`All ${goals.length} goals →`, `Semua ${goals.length} tujuan →`) : l('Open goals →', 'Buka tujuan →')}
              </button>
            </div>
            <div className="fh-horizon-grid">
              {goals.slice(0, 3).map((goal, index) => (
                <button
                  key={goal.id}
                  type="button"
                  className="fh-horizon-cell"
                  onClick={() => handleGoalClick(goal.id)}
                >
                  <div className="fh-horizon-top">
                    <span className="fh-horizon-title">
                      <em>{pad(index + 1)}</em> {goal.title}
                    </span>
                    <span className="fh-horizon-right">
                      <small className="fh-horizon-count">{goal.completedTasks}/{goal.totalTasks}</small>
                      <strong className="fh-goal-pct">{goal.percent}%</strong>
                    </span>
                  </div>
                  <div className="fh-goal-track">
                    <i style={{ width: `${goal.percent}%` }} />
                  </div>
                  <div className="fh-horizon-meta">
                    <span>{goal.areaName}</span>
                    <span>{goal.completedTasks}/{goal.totalTasks} {l('tasks', 'tugas')}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="fh-horizon-empty">
            <span>{l('No active goals synced yet', 'Belum ada tujuan aktif tersinkron')}</span>
            <button type="button" className="fh-goal-link" onClick={onAddGoal ?? onOpenGoals}>
              {l('Set first goal →', 'Tetapkan tujuan pertama →')}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
