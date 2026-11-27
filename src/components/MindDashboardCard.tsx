import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Button } from './ui';
import { useLanguage } from '../context/LanguageContext';
import type { KnowledgeDataset } from '../modules/mind-architecture/types/knowledge';
import { computeCelestialLayout, indexDataset } from '../modules/mind-architecture/utils/dataset';

const DEFAULT_DATASET_URL = '/assets/aistudio/knowledge_extraction_v3_2556cc71.json';

let cachedDataset: KnowledgeDataset | null = null;

interface MindDashboardCardProps {
  onOpen: () => void;
  datasetUrl?: string;
  initialData?: KnowledgeDataset;
}

export function MindDashboardCard({
  onOpen,
  datasetUrl = DEFAULT_DATASET_URL,
  initialData,
}: MindDashboardCardProps) {
  const { l } = useLanguage();
  const [rawData, setRawData] = useState<KnowledgeDataset | null>(
    () => initialData ?? cachedDataset,
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (initialData) {
      cachedDataset = initialData;
      setRawData(initialData);
      return;
    }
    if (cachedDataset) {
      setRawData(cachedDataset);
      return;
    }
    if (typeof fetch !== 'function') return;

    let cancelled = false;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

    try {
      const pending = fetch(datasetUrl, controller ? { signal: controller.signal } : undefined);
      if (pending && typeof pending.then === 'function') {
        pending
          .then((res) => (res && res.ok ? (res.json() as Promise<KnowledgeDataset>) : null))
          .then((json) => {
            if (cancelled || !json || !Array.isArray(json.nodes)) return;
            cachedDataset = json;
            setRawData(json);
          })
          .catch(() => {
            // Silently keep lightweight fallback preview when offline or in test environments
          });
      }
    } catch {
      // Ignore fetch errors in test environments
    }

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [datasetUrl, initialData]);

  const indexed = useMemo(() => (rawData ? indexDataset(rawData) : null), [rawData]);
  const layout = useMemo(() => (indexed ? computeCelestialLayout(indexed) : null), [indexed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !indexed) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth || 360;
    const height = canvas.clientHeight || 156;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    const scale = Math.min(width / layout.width, height / layout.height) * 0.92;
    const offsetX = (width - layout.width * scale) / 2;
    const offsetY = (height - layout.height * scale) / 2;

    const toX = (x: number) => offsetX + x * scale;
    const toY = (y: number) => offsetY + y * scale;

    for (const cluster of layout.clusters.values()) {
      const cx = toX(cluster.x);
      const cy = toY(cluster.y);
      const r = Math.max(8, cluster.orbitRadius * scale);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `${cluster.theme.color}33`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.lineWidth = 0.7;
    for (const edge of indexed.raw.edges) {
      const s = layout.nodes.get(edge.source);
      const t = layout.nodes.get(edge.target);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(toX(s.x), toY(s.y));
      ctx.lineTo(toX(t.x), toY(t.y));
      ctx.strokeStyle =
        edge.basis === 'explicit'
          ? 'rgba(212, 175, 114, 0.22)'
          : edge.basis === 'user_suggested'
            ? 'rgba(120, 173, 142, 0.22)'
            : 'rgba(155, 163, 180, 0.08)';
      ctx.stroke();
    }

    for (const pos of layout.nodes.values()) {
      if (indexed.sensitiveNodeIds.has(pos.node.id)) continue;
      const nx = toX(pos.x);
      const ny = toY(pos.y);
      const nr = Math.max(1.2, Math.min(3.5, pos.radius * scale * 1.45));

      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fillStyle = pos.color;
      ctx.fill();
    }
  }, [indexed, layout]);

  const nodeCount = indexed?.raw.nodes.length ?? 303;
  const edgeCount = indexed?.raw.edges.length ?? 357;
  const domainCount = indexed?.domainNodes.length ?? 12;

  return (
    <section
      className="panel mind-dashboard-card"
      aria-label={l('Mind Architecture overview', 'Ringkasan Arsitektur Pikiran')}
    >
      <div className="panel-head">
        <div>
          <div className="eyebrow">{l('mind architecture · v3 archive', 'arsitektur pikiran · arsip v3')}</div>
          <h2>{l('The Architecture of My Mind', 'Arsitektur Pikiran')}</h2>
        </div>
        <Button variant="outline" onClick={onOpen}>
          <span>{l('Open', 'Buka')}</span>
          <ArrowUpRight size={14} />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
        <button
          type="button"
          onClick={onOpen}
          aria-label={l('Open Mind Architecture constellation', 'Buka konstelasi Arsitektur Pikiran')}
          className="group relative md:col-span-5 h-36 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#06080D] text-left transition-colors hover:border-[#d4ff3a]/50 focus-visible:outline-none"
        >
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="block h-full w-full pointer-events-none"
          />
          {!layout && (
            <svg
              aria-hidden="true"
              viewBox="0 0 320 140"
              className="absolute inset-0 h-full w-full pointer-events-none opacity-80"
            >
              <circle cx="95" cy="70" r="34" fill="none" stroke="rgba(212,175,114,0.22)" />
              <circle cx="165" cy="52" r="28" fill="none" stroke="rgba(125,181,202,0.22)" />
              <circle cx="228" cy="84" r="30" fill="none" stroke="rgba(120,173,142,0.22)" />
              <line x1="95" y1="70" x2="165" y2="52" stroke="rgba(212,175,114,0.3)" />
              <line x1="165" y1="52" x2="228" y2="84" stroke="rgba(155,163,180,0.25)" />
              <circle cx="95" cy="70" r="3.5" fill="#D4AF72" />
              <circle cx="165" cy="52" r="3" fill="#7DB5CA" />
              <circle cx="228" cy="84" r="3" fill="#78AD8E" />
            </svg>
          )}
          <span className="pointer-events-none absolute bottom-2 right-2.5 rounded-full border border-white/10 bg-black/75 px-2.5 py-0.5 font-mono text-[10px] text-[#9ba3b0] group-hover:border-[#d4ff3a]/40 group-hover:text-[#d4ff3a] transition-colors">
            {l('Explore constellation', 'Jelajahi konstelasi')}
          </span>
        </button>

        <div className="md:col-span-7 flex flex-col justify-between gap-3">
          <p className="text-xs leading-relaxed text-[#9ba3b0]">
            {l(
              'Explore your intellectual constellation, domain atlas, thinking patterns, and evidence ledger across 12 disciplines.',
              'Jelajahi konstelasi intelektual, atlas domain, pola pikir, dan buku besar bukti di 12 disiplin ilmu.',
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#c2c8d2]">
            <span className="border border-white/10 bg-white/[0.03] px-2.5 py-1 rounded-full">
              {nodeCount} {l('nodes', 'simpul')}
            </span>
            <span className="border border-white/10 bg-white/[0.03] px-2.5 py-1 rounded-full">
              {edgeCount} {l('connections', 'koneksi')}
            </span>
            <span className="border border-white/10 bg-white/[0.03] px-2.5 py-1 rounded-full">
              {domainCount} {l('disciplines', 'disiplin')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
