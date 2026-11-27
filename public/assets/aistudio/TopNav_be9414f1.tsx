import React from 'react';
import { Search } from 'lucide-react';
import type { ViewId } from '../types/knowledge';

interface TopNavProps {
  activeView: ViewId;
  onSelectView: (view: ViewId) => void;
  onOpenSearch: () => void;
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
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#080A0F]/92 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-8 px-5 py-3.5 lg:px-8">
        {/* Zone 1: Single-line editorial wordmark */}
        <button
          type="button"
          onClick={() => onSelectView('graph')}
          className="font-serif text-xl font-semibold tracking-tight text-[#EDE9E0] whitespace-nowrap shrink-0 hover:text-[#D4AF72] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF72]"
        >
          The Architecture of My Mind
        </button>

        {/* Zone 2: 5 concise single-line text links */}
        <nav
          aria-label="Primary views"
          className="hidden lg:flex items-center gap-7"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative py-1.5 text-[13px] tracking-[0.01em] whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF72] ${
                  isActive
                    ? 'text-[#EDE9E0] font-medium'
                    : 'text-[#8C95A6] hover:text-[#EDE9E0]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[15px] h-[1.5px] bg-[#D4AF72]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex items-center gap-2.5 border border-[#D4AF72]/35 bg-[#D4AF72]/10 px-4 py-2 text-xs font-medium text-[#EDE9E0] hover:border-[#D4AF72]/70 hover:bg-[#D4AF72]/18 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF72]"
          >
            <Search className="h-3.5 w-3.5 text-[#D4AF72]" />
            <span>Search Archive</span>
            <kbd className="hidden sm:inline-block font-mono text-[10px] text-[#9BA3B4] pl-1">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>

      {/* Responsive mobile/tablet horizontal view switcher */}
      <nav
        aria-label="Mobile views"
        className="flex lg:hidden items-center gap-5 overflow-x-auto border-t border-white/[0.06] px-5 py-2.5"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`text-xs whitespace-nowrap shrink-0 pb-0.5 transition-colors ${
                isActive
                  ? 'text-[#D4AF72] border-b border-[#D4AF72] font-medium'
                  : 'text-[#8C95A6] hover:text-[#EDE9E0]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
