import React from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { ViewId } from '../types/knowledge';

interface TopNavProps {
  activeView: ViewId;
  onSelectView: (view: ViewId) => void;
  onOpenSearch: () => void;
  onOpenCustomize?: () => void;
  embedded?: boolean;
}

const NAV_ITEMS: { id: ViewId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'graph', label: 'Intellectual Graph' },
  { id: 'atlas', label: 'Intellectual Atlas' },
  { id: 'evolution', label: 'Personal Evolution' },
  { id: 'patterns', label: 'Thinking Patterns' },
  { id: 'evidence', label: 'Evidence Explorer' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  onSelectView,
  onOpenSearch,
  onOpenCustomize,
  embedded = false,
}) => {
  const stickyClasses =
    activeView === 'graph'
      ? 'relative z-20 shrink-0'
      : 'sticky top-[64px] max-md:top-[calc(56px+env(safe-area-inset-top))] z-20 shrink-0';

  return (
    <header
      className={`${stickyClasses} border-b border-white/[0.08] bg-black/90 md:bg-black/82 md:backdrop-blur-md`}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2 lg:px-6">
        {!embedded && (
          <button
            type="button"
            onClick={() => onSelectView('overview')}
            className="font-display text-sm sm:text-base font-semibold tracking-tight text-[#f5f5f3] whitespace-nowrap shrink-0 hover:text-[#d4ff3a] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4ff3a]"
          >
            The Architecture of My Mind
          </button>
        )}

        <nav
          aria-label="Primary views"
          className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5 overflow-x-auto no-scrollbar"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative min-h-[36px] py-1.5 text-[13px] sm:text-xs tracking-[0.01em] whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4ff3a] ${
                  isActive
                    ? 'text-[#f5f5f3] font-semibold'
                    : 'text-[#9ba3b0] hover:text-[#f5f5f3]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[9px] h-[2px] bg-[#d4ff3a]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenCustomize && (
            <button
              type="button"
              onClick={onOpenCustomize}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[#f5f5f3] hover:border-[#d4ff3a]/55 hover:text-[#d4ff3a] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4ff3a]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#9ba3b0]" />
              <span className="hidden sm:inline">Customize</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 sm:px-3.5 py-1.5 text-xs font-medium text-[#f5f5f3] hover:border-[#d4ff3a]/55 hover:text-[#d4ff3a] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4ff3a]"
          >
            <Search className="h-3.5 w-3.5 text-[#d4ff3a]" />
            <span>Search</span>
            <kbd className="hidden sm:inline-block font-mono text-[10px] text-[#9ba3b0] pl-0.5">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>
    </header>
  );
};
