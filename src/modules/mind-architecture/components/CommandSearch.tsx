import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Compass, Search, ShieldAlert, X } from 'lucide-react';
import type { IndexedDataset, KnowledgeNode, ViewId } from '../types/knowledge';
import { getDomainTheme, GRADE_META } from '../utils/dataset';

interface CommandSearchProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: IndexedDataset;
  hideSensitive: boolean;
  onSelectNode: (nodeId: string, targetView?: ViewId) => void;
}

export const CommandSearch: React.FC<CommandSearchProps> = ({
  isOpen,
  onClose,
  dataset,
  hideSensitive,
  onSelectNode,
}) => {
  const [query, setQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    } else {
      setQuery('');
      setGradeFilter('all');
      setActiveIndex(0);
    }
  }, [isOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: { node: KnowledgeNode; score: number }[] = [];

    for (const node of dataset.raw.nodes) {
      if (hideSensitive && dataset.sensitiveNodeIds.has(node.id)) continue;
      if (gradeFilter !== 'all' && node.evidence_grade !== gradeFilter) continue;

      if (!q) {
        const baseScore =
          (node.type === 'Discipline' ? 10 : 0) +
          (node.evidence_grade === 'Q3' ? 5 : 0) +
          (dataset.edgesByNodeId.get(node.id)?.length ?? 0) * 0.2;
        list.push({ node, score: baseScore });
        continue;
      }

      const titleL = node.title.toLowerCase();
      const idL = node.id.toLowerCase();
      const descL = node.description.toLowerCase();
      const domL = node.domains.join(' ').toLowerCase();
      const aliasL = node.aliases.join(' ').toLowerCase();
      const srcL = node.source_ids.join(' ').toLowerCase();

      let score = 0;
      if (titleL === q) score = 100;
      else if (titleL.startsWith(q)) score = 70;
      else if (titleL.includes(q)) score = 50;
      else if (aliasL.includes(q)) score = 40;
      else if (idL.includes(q)) score = 35;
      else if (domL.includes(q)) score = 25;
      else if (srcL.includes(q)) score = 22;
      else if (descL.includes(q)) score = 15;

      if (score > 0) {
        list.push({ node, score });
      }
    }

    list.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title));
    return list.slice(0, 32).map((item) => item.node);
  }, [dataset, query, gradeFilter, hideSensitive]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, gradeFilter]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(results.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault();
        onSelectNode(results[activeIndex].id, 'graph');
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, results, activeIndex, onClose, onSelectNode]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search intellectual archive"
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/75 pt-[8vh] px-3 sm:px-4 md:backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/[0.12] bg-[#0c0d10] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Row */}
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 sm:px-5 py-3.5 sm:py-4">
          <Search className="h-4 w-4 text-[#d4ff3a] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${dataset.raw.nodes.length} nodes by concept, project, domain, ID, or source...`}
            className="w-full bg-transparent text-base sm:text-sm text-[#f5f5f3] placeholder-[#7f8794] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="p-2 text-[#9ba3b0] hover:text-[#f5f5f3] transition-colors rounded-full"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Grade Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 sm:px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            {(['all', 'Q3', 'Q2', 'Q1'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGradeFilter(g)}
                className={`rounded-full px-3 py-1 text-xs sm:text-[11px] font-mono transition-colors ${
                  gradeFilter === g
                    ? 'bg-[#d4ff3a]/16 text-[#d4ff3a] border border-[#d4ff3a]/40'
                    : 'text-[#9ba3b0] hover:text-[#f5f5f3] border border-transparent'
                }`}
              >
                {g === 'all' ? 'All Grades' : g}
              </button>
            ))}
          </div>
          <span className="font-mono text-[11px] text-[#7f8794] tabular-nums">
            {results.length} matching {results.length === 1 ? 'entry' : 'entries'}
            {hideSensitive ? ' · Sensitive hidden' : ''}
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-[54vh] overflow-y-auto divide-y divide-white/[0.05]">
          {results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-display text-base font-semibold tracking-tight text-[#f5f5f3]">No matching archival entries</p>
              <p className="mt-1 text-[13px] sm:text-xs text-[#7f8794]">
                Try a concept title, domain name, project, or source ID like M:mandalart.
              </p>
            </div>
          ) : (
            results.map((node, idx) => {
              const domainName = node.domains[0] ?? '(no domain)';
              const theme = getDomainTheme(node.domains[0]);
              const grade = GRADE_META[node.evidence_grade];
              const isSensitive = dataset.sensitiveNodeIds.has(node.id);
              const isSelected = idx === activeIndex;

              return (
                <button
                  key={node.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onSelectNode(node.id, 'graph');
                    onClose();
                  }}
                  className={`w-full text-left px-4 sm:px-5 py-3.5 flex items-start justify-between gap-4 transition-colors ${
                    isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: theme.color }}
                      />
                      <span className="font-medium text-sm text-[#f5f5f3] truncate">
                        {node.title}
                      </span>
                      {isSensitive && (
                        <ShieldAlert
                          className="h-3.5 w-3.5 text-[#ff8b3d] shrink-0"
                          aria-label="Sensitive review item"
                        />
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-4 text-xs text-[#9ba3b0]">
                      <span>{node.type}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[260px]">{domainName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px]" style={{ color: grade?.color }}>
                        {node.evidence_grade}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px] text-[#7f8794]">
                        {node.source_ids.join(', ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs sm:text-[11px] text-[#d4ff3a] shrink-0 pt-0.5">
                    <Compass className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Focus</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.02] px-4 sm:px-5 py-2.5 text-[11px] text-[#7f8794]">
          <span>↑↓ Navigate · Enter to focus in graph · Esc to close</span>
          <span className="font-mono tabular-nums">v{dataset.raw.version} immutable IDs</span>
        </div>
      </div>
    </div>
  );
};
