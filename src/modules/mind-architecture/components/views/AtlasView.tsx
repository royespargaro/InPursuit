import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Compass,
  Eye,
  EyeOff,
  GitMerge,
} from 'lucide-react';
import type { IndexedDataset, KnowledgeNode } from '../../types/knowledge';
import { getDomainTheme, GRADE_META } from '../../utils/dataset';

interface AtlasViewProps {
  dataset: IndexedDataset;
  hideSensitive: boolean;
  onToggleSensitive: () => void;
  onFocusNodeInGraph: (nodeId: string) => void;
}

export const AtlasView: React.FC<AtlasViewProps> = ({
  dataset,
  hideSensitive,
  onToggleSensitive,
  onFocusNodeInGraph,
}) => {
  const coverageRows = dataset.raw.coverage_matrix;
  const [selectedDomain, setSelectedDomain] = useState<string>(
    coverageRows[0]?.domain ?? 'Philosophy and human thought'
  );
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');

  const activeCoverage = useMemo(
    () =>
      coverageRows.find((r) => r.domain === selectedDomain) ?? coverageRows[0],
    [coverageRows, selectedDomain]
  );

  const activeTheme = getDomainTheme(
    selectedDomain === '(no domain)' ? undefined : selectedDomain
  );

  const activeDisciplineNode = useMemo(
    () => dataset.domainNodes.find((d) => d.title === selectedDomain) ?? null,
    [dataset.domainNodes, selectedDomain]
  );

  const domainMembers = useMemo(() => {
    return dataset.raw.nodes.filter((n) => {
      if (hideSensitive && dataset.sensitiveNodeIds.has(n.id)) return false;
      if (selectedDomain === '(no domain)') return n.domains.length === 0;
      return n.domains.includes(selectedDomain);
    });
  }, [dataset, selectedDomain, hideSensitive]);

  const availableTypes = useMemo(() => {
    const set = new Set(domainMembers.map((n) => n.type));
    return ['all', ...Array.from(set).sort()];
  }, [domainMembers]);

  const filteredMembers = useMemo(() => {
    return domainMembers
      .filter((n) => {
        if (typeFilter !== 'all' && n.type !== typeFilter) return false;
        if (gradeFilter !== 'all' && n.evidence_grade !== gradeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        const gradeOrder: Record<string, number> = { Q4: 0, Q3: 1, Q2: 2, Q1: 3 };
        const ga = gradeOrder[a.evidence_grade] ?? 9;
        const gb = gradeOrder[b.evidence_grade] ?? 9;
        if (ga !== gb) return ga - gb;
        return a.title.localeCompare(b.title);
      });
  }, [domainMembers, typeFilter, gradeFilter]);

  const bridgeNodes = useMemo(
    () => domainMembers.filter((n) => n.domains.length > 1),
    [domainMembers]
  );

  const subdisciplines = useMemo(
    () => domainMembers.filter((n) => n.type === 'Subdiscipline'),
    [domainMembers]
  );

  const handleSelectDomain = (dom: string) => {
    setSelectedDomain(dom);
    setTypeFilter('all');
    setGradeFilter('all');
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      {/* Section Masthead */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#d4ff3a]">
            Domain Encyclopedia · {coverageRows.length - 1} Disciplines
          </p>
          <h1 className="mt-1.5 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#f5f5f3] text-balance">
            Intellectual Atlas
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0]">
            A structured monograph across every intellectual domain in the v{dataset.raw.version} corpus, contrasting active practice against thin or brief-only areas without padding.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleSensitive}
          className={`inline-flex items-center gap-2 min-h-[38px] rounded-full border px-4 py-1.5 text-[13px] sm:text-xs self-start transition-colors ${
            hideSensitive
              ? 'border-[#d4ff3a]/45 bg-[#d4ff3a]/12 text-[#d4ff3a]'
              : 'border-white/[0.1] text-[#9ba3b0] hover:text-[#f5f5f3]'
          }`}
        >
          {hideSensitive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          <span>{hideSensitive ? 'Sensitive Items Hidden' : 'Showing All Items'}</span>
        </button>
      </div>

      {/* Split Layout: Left Domain Index + Right Monograph */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Left Domain Navigation Rail */}
        <aside className="lg:col-span-4 xl:col-span-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
            <div className="border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#9ba3b0]">
                Index of Domains
              </span>
              <span className="font-mono text-[11px] text-[#7c8494] tabular-nums">
                {dataset.raw.nodes.length} nodes
              </span>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {coverageRows.map((row) => {
                const theme = getDomainTheme(
                  row.domain === '(no domain)' ? undefined : row.domain
                );
                const isActive = row.domain === selectedDomain;
                const total = Math.max(1, row.nodes);
                const q3Pct = (row.grade_Q3 / total) * 100;
                const q2Pct = (row.grade_Q2 / total) * 100;
                const q1Pct = (row.grade_Q1 / total) * 100;

                return (
                  <button
                    key={row.domain}
                    type="button"
                    onClick={() => handleSelectDomain(row.domain)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      isActive ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: theme.color }}
                        />
                        <span
                          className={`text-[13px] sm:text-xs truncate ${
                            isActive ? 'text-[#f5f5f3] font-semibold' : 'text-[#d6d9e0]'
                          }`}
                        >
                          {row.domain === '(no domain)'
                            ? 'Unmapped Topics & Hypotheses'
                            : row.domain}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-[#9ba3b0] tabular-nums shrink-0">
                        {row.nodes}
                      </span>
                    </div>

                    <div className="mt-2 flex h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        style={{ width: `${q3Pct}%`, backgroundColor: '#d4ff3a' }}
                        title={`Q3: ${row.grade_Q3}`}
                      />
                      <div
                        style={{ width: `${q2Pct}%`, backgroundColor: '#8c94a3' }}
                        title={`Q2: ${row.grade_Q2}`}
                      />
                      <div
                        style={{ width: `${q1Pct}%`, backgroundColor: '#ff8b3d' }}
                        title={`Q1: ${row.grade_Q1}`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Domain Monograph */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6 min-w-0">
          {activeCoverage && (
            <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6 lg:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] pb-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-wider text-[#9ba3b0]">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: activeTheme.color }}
                    />
                    <span>Sector {activeTheme.roman}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeCoverage.source_records} source records</span>
                  </div>
                  <h2 className="mt-2 font-display text-lg sm:text-xl font-bold tracking-tight text-[#f5f5f3] text-balance">
                    {activeCoverage.domain === '(no domain)'
                      ? 'Unassigned Hypotheses & Recent Conversation Topics'
                      : activeCoverage.domain}
                  </h2>
                </div>

                {activeDisciplineNode && (
                  <button
                    type="button"
                    onClick={() => onFocusNodeInGraph(activeDisciplineNode.id)}
                    className="inline-flex items-center gap-2 min-h-[38px] rounded-full border border-[#d4ff3a]/40 bg-[#d4ff3a]/12 px-4 py-1.5 text-[13px] sm:text-xs font-medium text-[#d4ff3a] hover:bg-[#d4ff3a]/20 transition-colors"
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>Open Constellation</span>
                  </button>
                )}
              </div>

              {activeTheme.thinNotice && (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#ff8b3d]/30 bg-[#ff8b3d]/[0.07] px-4 py-3 text-[13px] sm:text-xs text-[#ffd2b0]">
                  <AlertCircle className="h-4 w-4 text-[#ff8b3d] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-[#f5f5f3]">
                      Thin domain — intentionally unpadded.{' '}
                    </span>
                    {activeTheme.thinNotice}. Remains thin until original conversations supply practice evidence.
                  </div>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-4 border-b border-white/[0.07] pb-6 sm:grid-cols-3 xl:grid-cols-6">
                {[
                  { label: 'Total Nodes', val: activeCoverage.nodes },
                  { label: 'Subdomains', val: activeCoverage.subdomains },
                  { label: 'Projects / Exp.', val: activeCoverage.projects_experiences },
                  { label: 'Goals', val: activeCoverage.goals },
                  { label: 'Explicit Edges', val: activeCoverage.explicit_edges },
                  { label: 'Inferred Edges', val: activeCoverage.inferred_edges },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-[11px] text-[#7c8494]">{stat.label}</p>
                    <p className="mt-1 font-mono text-xl sm:text-2xl font-medium text-[#f5f5f3] tabular-nums">
                      {stat.val}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#7c8494]">
                    Evidence Grade Breakdown
                  </h3>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                    {[
                      { g: 'Q4', v: activeCoverage.grade_Q4, c: '#89a8ff' },
                      { g: 'Q3', v: activeCoverage.grade_Q3, c: '#d4ff3a' },
                      { g: 'Q2', v: activeCoverage.grade_Q2, c: '#b4bac4' },
                      { g: 'Q1', v: activeCoverage.grade_Q1, c: '#ff8b3d' },
                    ].map((item) => (
                      <div
                        key={item.g}
                        className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                      >
                        <span className="font-mono text-[11px]" style={{ color: item.c }}>
                          {item.g}
                        </span>
                        <p className="mt-1 font-mono text-lg text-[#f5f5f3] tabular-nums">
                          {item.v}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[13px] sm:text-xs text-[#9ba3b0]">
                    Source classes:{' '}
                    <span className="font-mono text-[#d6d9e0]">
                      {activeCoverage.source_classes.join(' · ')}
                    </span>
                  </p>
                </div>

                <div>
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#7c8494]">
                    Documented Gaps ({activeCoverage.missing.length})
                  </h3>
                  <ul className="mt-3 space-y-1.5 text-[13px] sm:text-xs text-[#9ba3b0]">
                    {activeCoverage.missing.map((gap) => (
                      <li key={gap} className="flex items-start gap-2">
                        <span className="text-[#7c8494]" aria-hidden="true">
                          —
                        </span>
                        <span>{gap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {(subdisciplines.length > 0 || bridgeNodes.length > 0) && (
                <div className="mt-6 grid grid-cols-1 gap-6 border-t border-white/[0.07] pt-6 md:grid-cols-2">
                  {subdisciplines.length > 0 && (
                    <div>
                      <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#7c8494]">
                        Assistant-Proposed Subdisciplines ({subdisciplines.length})
                      </h3>
                      <div className="mt-3 space-y-2">
                        {subdisciplines.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => onFocusNodeInGraph(sub.id)}
                            className="flex w-full min-h-[40px] items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2 text-left text-[13px] sm:text-xs hover:border-[#d4ff3a]/40 transition-colors"
                          >
                            <span className="text-[#f5f5f3]">{sub.title}</span>
                            <span className="font-mono text-[10px] text-[#ff8b3d]">
                              A:1 · Q1
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {bridgeNodes.length > 0 && (
                    <div>
                      <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#7c8494]">
                        Multi-Domain Bridge Nodes ({bridgeNodes.length})
                      </h3>
                      <div className="mt-3 space-y-2">
                        {bridgeNodes.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => onFocusNodeInGraph(b.id)}
                            className="flex w-full min-h-[44px] items-start justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5 text-left text-[13px] sm:text-xs hover:border-[#d4ff3a]/40 transition-colors"
                          >
                            <div>
                              <span className="inline-flex items-center gap-1.5 font-medium text-[#f5f5f3]">
                                <GitMerge className="h-3.5 w-3.5 text-[#d4ff3a]" />
                                {b.title}
                              </span>
                              <p className="mt-0.5 text-[11px] text-[#9ba3b0]">
                                {b.domains.join(' · ')}
                              </p>
                            </div>
                            <ArrowUpRight className="h-3.5 w-3.5 text-[#7c8494] shrink-0 mt-0.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Filterable Domain Entries Catalog */}
          <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:px-6">
              <div>
                <h3 className="font-display text-sm sm:text-base font-semibold tracking-tight text-[#f5f5f3]">
                  Archival Entries ({filteredMembers.length})
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 max-w-full">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full rounded-full border border-white/[0.08] bg-black/50 p-1">
                  {availableTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTypeFilter(t)}
                      className={`min-h-[30px] rounded-full px-3 py-1 text-[11px] whitespace-nowrap transition-colors ${
                        typeFilter === t
                          ? 'bg-white/[0.1] text-[#d4ff3a] font-medium'
                          : 'text-[#9ba3b0] hover:text-[#f5f5f3]'
                      }`}
                    >
                      {t === 'all' ? 'All Types' : t}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-black/50 p-1">
                  {(['all', 'Q3', 'Q2', 'Q1'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGradeFilter(g)}
                      className={`min-h-[30px] rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors ${
                        gradeFilter === g
                          ? 'bg-white/[0.1] text-[#d4ff3a]'
                          : 'text-[#9ba3b0] hover:text-[#f5f5f3]'
                      }`}
                    >
                      {g === 'all' ? 'All' : g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="divide-y divide-white/[0.05]">
              {filteredMembers.length === 0 ? (
                <div className="px-6 py-10 text-center text-[13px] sm:text-xs text-[#9ba3b0]">
                  No entries match the current type and evidence grade filters.
                </div>
              ) : (
                filteredMembers.map((node: KnowledgeNode) => {
                  const grade = GRADE_META[node.evidence_grade];
                  const edgeCount = dataset.edgesByNodeId.get(node.id)?.length ?? 0;

                  return (
                    <div
                      key={node.id}
                      className="flex flex-col gap-3 px-5 py-4 sm:px-6 hover:bg-white/[0.03] transition-colors sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <button
                            type="button"
                            onClick={() => onFocusNodeInGraph(node.id)}
                            className="font-display font-semibold text-sm text-[#f5f5f3] hover:text-[#d4ff3a] text-left transition-colors"
                          >
                            {node.title}
                          </button>
                          <span className="font-mono text-[11px] text-[#7c8494]">
                            {node.type}
                          </span>
                          <span
                            className="font-mono text-[11px]"
                            style={{ color: grade?.color }}
                          >
                            {node.evidence_grade}
                          </span>
                          {node.lifecycle && (
                            <span className="font-mono text-[11px] text-[#9ba3b0]">
                              · {node.lifecycle}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[13px] sm:text-xs leading-relaxed text-[#9ba3b0] max-w-3xl">
                          {node.description}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[#7c8494]">
                          <span>engagement: {node.engagement}</span>
                          <span>·</span>
                          <span>sources: {node.source_ids.join(', ')}</span>
                          <span>·</span>
                          <span className="tabular-nums">{edgeCount} edges</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onFocusNodeInGraph(node.id)}
                        className="inline-flex items-center gap-1.5 min-h-[36px] rounded-full border border-white/[0.1] px-3.5 py-1.5 text-xs text-[#9ba3b0] hover:border-[#d4ff3a]/50 hover:text-[#d4ff3a] transition-colors shrink-0 self-start"
                      >
                        <span>Inspect in Graph</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
