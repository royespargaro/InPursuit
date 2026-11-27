import React, { useMemo } from 'react';
import type { IndexedDataset } from '../types/knowledge';
import { summarizeCognitiveLayers } from '../utils/cognitiveModel';

interface CognitiveArchitecturePanelProps {
  dataset: IndexedDataset;
  hideSensitive: boolean;
  onNavigateView: (view: 'atlas' | 'evolution' | 'patterns' | 'evidence') => void;
}

const LAYER_STYLE = {
  episodic: { color: '#89a8ff', view: 'evolution' as const, short: 'EPI' },
  semantic: { color: '#d4ff3a', view: 'atlas' as const, short: 'SEM' },
  procedural: { color: '#72e3a8', view: 'patterns' as const, short: 'PRO' },
  executive: { color: '#ff8b3d', view: 'patterns' as const, short: 'ACT' },
  reflective: { color: '#c4a7ff', view: 'evidence' as const, short: 'REF' },
  salience: { color: '#f0b86b', view: 'evidence' as const, short: 'AFF' },
};

export const CognitiveArchitecturePanel: React.FC<CognitiveArchitecturePanelProps> = ({
  dataset, hideSensitive, onNavigateView,
}) => {
  const layers = useMemo(() => summarizeCognitiveLayers(dataset.raw.nodes.filter(
    (node) => !hideSensitive || !dataset.sensitiveNodeIds.has(node.id)
  )), [dataset, hideSensitive]);
  const totalClassified = layers.reduce((sum, layer) => sum + (layer.count ?? 0), 0);

  return (
    <section aria-label="Cognitive architecture" className="rounded-2xl border border-white/[0.09] bg-[#0a0b0f] p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#89a8ff]">Cognitive architecture · Functional model</p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-[#f5f5f3]">How the mind is represented</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#9ba3b0]">
            One connected graph, viewed through different cognitive functions. These are software classifications inspired by memory science, not literal brain-region mappings.
          </p>
        </div>
        <span className="font-mono text-[10px] text-[#7f8794]">{totalClassified} classified nodes</span>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {layers.map((layer) => {
          const style = LAYER_STYLE[layer.id];
          const share = layer.count === null || totalClassified === 0 ? 0 : Math.round((layer.count / totalClassified) * 100);
          return (
            <button key={layer.id} type="button" disabled={layer.status === 'not_modeled'}
              onClick={() => onNavigateView(style.view)} title={layer.description}
              className="group min-h-[112px] rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 text-left transition-colors hover:border-white/[0.2] hover:bg-white/[0.045] disabled:cursor-default disabled:opacity-75">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] tracking-[0.12em]" style={{ color: style.color }}>{style.short}</span>
                {layer.count === null
                  ? <span className="rounded-full border border-white/[0.1] px-2 py-0.5 font-mono text-[9px] text-[#7f8794]">Not modeled</span>
                  : <span className="font-mono text-xs tabular-nums text-[#f5f5f3]">{layer.count}</span>}
              </div>
              <h3 className="mt-2 text-sm font-medium text-[#f5f5f3]">{layer.label}</h3>
              <p className="mt-0.5 text-[11px] text-[#9ba3b0]">{layer.subtitle}</p>
              {layer.count !== null && <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: style.color }} />
              </div>}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-[#7f8794]">
        Emotional significance is intentionally left unmodeled until users can explicitly record it. Node type, evidence quality and emotional importance are separate dimensions.
      </p>
    </section>
  );
};
