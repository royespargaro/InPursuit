import { Activity, ArrowUpRight, BrainCircuit, CheckCircle2, CircleDashed, Flag, Layers3, Target, Zap } from 'lucide-react';
import type { AppData } from '../../../types';
import type { HypothesisDecision, KnowledgeDataset } from '../types/knowledge';
import { computeExecutionIntelligence } from '../utils/executionIntelligence';

interface ExecutionIntelligencePanelProps {
  appData: AppData | null;
  dataset: KnowledgeDataset;
  decisions: Record<string, HypothesisDecision>;
  hideSensitive: boolean;
  onFocusNode: (nodeId: string) => void;
}

const statClass = 'rounded-xl border border-white/[0.08] bg-white/[0.025] p-3';

export function ExecutionIntelligencePanel({
  appData,
  dataset,
  decisions,
  hideSensitive,
  onFocusNode,
}: ExecutionIntelligencePanelProps) {
  const intelligence = computeExecutionIntelligence(appData, dataset, decisions, hideSensitive);

  if (!intelligence) {
    return (
      <section className="rounded-2xl border border-white/[0.09] bg-[#0a0b0f] p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4ff3a]">Execution intelligence</p>
        <p className="mt-2 text-sm text-[#9ba3b0]">Connect the execution workspace to see goals, projects, habits and capability relationships here.</p>
      </section>
    );
  }

  return (
    <section aria-label="Execution intelligence" className="rounded-2xl border border-white/[0.09] bg-[#0a0b0f] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4ff3a]">Execution intelligence · live workspace</p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-[#f5f5f3]">From intention to capability</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#9ba3b0]">
            A read-only bridge between your goals, projects, tasks, habits and knowledge graph. Relationships are counted only when they are explicitly linked or confirmed.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#72e3a8]">
          <Activity className="h-3.5 w-3.5" /> Connected to execution data
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={statClass}>
          <div className="flex items-center gap-2 text-[#9ba3b0]"><Target className="h-3.5 w-3.5" /><span className="font-mono text-[10px] uppercase">Active goals</span></div>
          <p className="mt-2 font-display text-2xl tabular-nums text-[#f5f5f3]">{intelligence.activeGoals.length}</p>
        </div>
        <div className={statClass}>
          <div className="flex items-center gap-2 text-[#9ba3b0]"><Layers3 className="h-3.5 w-3.5" /><span className="font-mono text-[10px] uppercase">Projects</span></div>
          <p className="mt-2 font-display text-2xl tabular-nums text-[#f5f5f3]">{intelligence.activeProjects}</p>
        </div>
        <div className={statClass}>
          <div className="flex items-center gap-2 text-[#9ba3b0]"><CheckCircle2 className="h-3.5 w-3.5" /><span className="font-mono text-[10px] uppercase">Active habits</span></div>
          <p className="mt-2 font-display text-2xl tabular-nums text-[#f5f5f3]">{intelligence.activeHabits}</p>
          <p className="mt-1 text-[10px] text-[#7f8794]">{intelligence.linkedHabits} linked to active goals</p>
        </div>
        <div className={statClass}>
          <div className="flex items-center gap-2 text-[#9ba3b0]"><CircleDashed className="h-3.5 w-3.5" /><span className="font-mono text-[10px] uppercase">Open tasks</span></div>
          <p className="mt-2 font-display text-2xl tabular-nums text-[#f5f5f3]">{intelligence.openTasks}</p>
          {intelligence.overdueTasks > 0 && <p className="mt-1 text-[10px] text-[#ff8b3d]">{intelligence.overdueTasks} overdue</p>}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9ba3b0]">Active goal pathways</p>
            <span className="font-mono text-[10px] text-[#7f8794]">{intelligence.activeGoals.length} tracked</span>
          </div>
          {intelligence.activeGoals.length === 0 ? (
            <p className="py-4 text-xs text-[#9ba3b0]">No active goals yet. Once you add goals, this area will show how execution supports them.</p>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {intelligence.activeGoals.slice(0, 5).map((item) => (
                <div key={item.goal.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-[#f5f5f3]">{item.goal.title}</h3>
                      <p className="mt-1 text-[11px] text-[#7f8794]">
                        {item.projects.length} projects · {item.activeHabits.length} linked habits · {item.requiredSkills.length} mapped capabilities
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-[#9ba3b0]">{item.goal.targetDate || 'No target date'}</span>
                  </div>
                  {item.requiredSkills.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.requiredSkills.map((skill) => (
                        <button key={skill.id} type="button" onClick={() => onFocusNode(skill.id)} className="inline-flex items-center gap-1 rounded-full border border-[#89a8ff]/25 bg-[#89a8ff]/[0.07] px-2.5 py-1 text-[10px] text-[#b9c8ff] hover:border-[#89a8ff]/60">
                          <BrainCircuit className="h-3 w-3" />{skill.title}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-[#ffb36b]">Capability map not linked yet — no skill requirement has been confirmed.</p>
                  )}
                  {item.tasks.length > 0 && (
                    <p className="mt-2 font-mono text-[10px] text-[#7f8794]">
                      Task activity: {item.completedTasks}/{item.tasks.length} completed
                      {item.overdueTasks > 0 ? <span className="text-[#ff8b3d]"> · {item.overdueTasks} overdue</span> : null}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9ba3b0]">System suggestions</p>
            <span className="font-mono text-[10px] text-[#7f8794]">Explainable · reviewable</span>
          </div>
          {intelligence.recommendations.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-xs text-[#72e3a8]"><Zap className="h-4 w-4" /> No structural gaps detected in the current links.</div>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {intelligence.recommendations.map((recommendation) => (
                <div key={recommendation.id} className="py-3">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 rounded-full p-1 ${recommendation.priority === 'high' ? 'bg-[#ff8b3d]/10 text-[#ffb36b]' : 'bg-[#d4ff3a]/10 text-[#d4ff3a]'}`}>
                      {recommendation.kind === 'capability' ? <BrainCircuit className="h-3.5 w-3.5" /> : recommendation.kind === 'planning' ? <Flag className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-[#f5f5f3]">{recommendation.title}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#9ba3b0]">{recommendation.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 border-t border-white/[0.07] pt-3 text-[10px] leading-relaxed text-[#7f8794]">
            Suggestions identify missing or overdue relationships; they do not create goals, habits or tasks automatically.
          </p>
        </div>
      </div>
    </section>
  );
}
