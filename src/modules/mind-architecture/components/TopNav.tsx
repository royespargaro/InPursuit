import React from 'react';
import { Search } from 'lucide-react';
import type { ViewId } from '../types/knowledge';

interface TopNavProps {
  activeView: ViewId;
  onSelectView: (view: ViewId) => void;
  onOpenSearch: () => void;
  embedded?: boolean;
}

const NAV_ITEMS: { id: ViewId; label: string }[] = [
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
  embedded = false,
}) => {
  const stickyClasses =
    activeView === 'graph'
      ? 'relative z-20 shrink-0'
      : 'sticky top-[64px] max-md:top-[calc(56px+env(safe-area-inset-top))] z-20 shrink-0';

  return (
    <header
      className={`${stickyClasses} border-b border-white/[0.08] bg-[#080A0F]/92 backdrop-blur-md`}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 lg:px-6">
        {!embedded && (
          <button
            type="button"
            onClick={() => onSelectView('graph')}
            className="font-sans text-sm sm:text-base font-semibold tracking-tight text-[#EDE9E0] whitespace-nowrap shrink-0 hover:text-[#D4AF72] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF72]"
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
                className={`relative py-1.5 text-xs tracking-[0.01em] whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF72] ${
                  isActive
                    ? 'text-[#EDE9E0] font-semibold'
                    : 'text-[#8C95A6] hover:text-[#EDE9E0]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[10px] h-[1.5px] bg-[#D4AF72]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex items-center gap-1.5 border border-[#D4AF72]/35 bg-[#D4AF72]/10 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#EDE9E0] hover:border-[#D4AF72]/70 hover:bg-[#D4AF72]/18 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF72]"
          >
            <Search className="h-3.5 w-3.5 text-[#D4AF72]" />
            <span>Search</span>
            <kbd className="hidden sm:inline-block font-mono text-[10px] text-[#9BA3B4] pl-0.5">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>
    </header>
  );
};
