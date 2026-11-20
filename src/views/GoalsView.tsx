import { ArrowUpRight, CalendarDays, Check, CheckCircle2, Plus, Settings2, Sparkles, Trash2 } from '../components/Icon';
import { Button, cx, Empty, Progress, SectionTitle, shortDate } from '../components/ui';
import type { Goal, LifeArea, Project, Task } from '../types';
import { getGoalProgress } from '../utils/intelligence';

interface GoalsViewProps {
  goals: Goal[];
  lifeAreas: LifeArea[];
  projects: Project[];
  tasks: Task[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onManageAreas: () => void;
  onOpenImportPlan?: () => void;
  onToggleCriterion?: (goalId: string, criterionId: string) => void;
}

export function GoalsView({
  goals,
  lifeAreas,
  projects,
  tasks,
  onAdd,
  onEdit,
  onDelete,
  onManageAreas,
  onOpenImportPlan,
  onToggleCriterion,
}: GoalsViewProps) {
  const active = goals.filter(g => g.status === 'active');
  const inactive = goals.filter(g => g.status !== 'active');

  return (
    <div className="view-stack">
      <SectionTitle eyebrow="direction · outcomes" title="Goals">
        <div className="project-title-actions">
          {onOpenImportPlan && (
            <Button variant="outline" onClick={onOpenImportPlan}><Sparkles size={14} /> Import plan</Button>
          )}
          <Button variant="outline" onClick={onManageAreas}>Manage areas</Button>
          <Button variant="solid" onClick={onAdd}><Plus size={15} /> New goal</Button>
        </div>
      </SectionTitle>
      <div className="page-lede">A goal defines the result. Projects and tasks define the work that gets you there.</div>

      {active.length ? (
        <div className="goal-grid">
          {active.map(goal => {
            const metrics = getGoalProgress(goal, projects, tasks);
            const lifeArea = lifeAreas.find(area => area.id === goal.lifeAreaId);
            return (
              <article className="goal-card" key={goal.id}>
                <div className="card-topline">
                  <span className="tag-label">
                    {lifeArea?.name ?? 'UNASSIGNED AREA'}
                    {typeof goal.pillarWeightPct === 'number' ? ` · ${goal.pillarWeightPct}%` : ''}
                  </span>
                  <div className="project-actions">
                    <button type="button" className="icon-btn" title="Edit goal" aria-label={`Edit goal ${goal.title}`} onClick={() => onEdit(goal.id)}>
                      <Settings2 size={15} />
                    </button>
                    <button type="button" className="icon-btn" title="Delete goal" aria-label={`Delete goal ${goal.title}`} onClick={() => onDelete(goal.id, goal.title)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <h3>{goal.title}</h3>
                <p>{goal.outcome || 'Define what success looks like.'}</p>
                <div className="goal-date"><CalendarDays size={14} /> Target · {goal.targetDate ? shortDate(goal.targetDate) : 'No deadline'}</div>
                {goal.successCriteria && goal.successCriteria.length > 0 && (
                  <div className="goal-extra-list" aria-label={`Success criteria for ${goal.title}`}>
                    <div className="eyebrow">success criteria</div>
                    {goal.successCriteria.map(criterion => (
                      <button
                        key={criterion.id}
                        type="button"
                        className={cx('goal-criterion-row', criterion.done && 'is-done')}
                        onClick={() => onToggleCriterion?.(goal.id, criterion.id)}
                      >
                        <span className={cx('criterion-check', criterion.done && 'checked')}>
                          {criterion.done && <Check size={11} />}
                        </span>
                        <span>{criterion.text}</span>
                      </button>
                    ))}
                  </div>
                )}
                {goal.principles && goal.principles.length > 0 && (
                  <div className="goal-extra-list" aria-label={`Principles for ${goal.title}`}>
                    <div className="eyebrow">principles</div>
                    {goal.principles.map(principle => (
                      <div key={principle.id} className="goal-principle-row">
                        {principle.text}
                      </div>
                    ))}
                  </div>
                )}
                <div className="goal-progress-head">
                  <span>Execution progress</span>
                  <b>{metrics.percent}%</b>
                </div>
                <Progress value={metrics.percent} />
                <div className="goal-card-foot">
                  <span>
                    {metrics.linkedProjects} projects · {metrics.completedTasks}/{metrics.totalTasks} tasks done
                  </span>
                  <button type="button" onClick={() => onEdit(goal.id)}>Edit goal <ArrowUpRight size={13} /></button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Give your effort a direction."
          body="Create one meaningful outcome. You can connect projects and tasks to it as you go."
          action={<Button variant="solid" onClick={onAdd}><Plus size={15} /> Create a goal</Button>}
        />
      )}

      {inactive.length > 0 && (
        <div className="archive-list">
          <div className="eyebrow">completed / archived</div>
          {inactive.map(g => (
            <div key={g.id} className="archive-row">
              <CheckCircle2 size={15} />
              <span>{g.title}</span>
              <small className="archive-status">{g.status}</small>
              <button type="button" onClick={() => onEdit(g.id)}>Edit</button>
              <button type="button" aria-label={`Delete ${g.title}`} onClick={() => onDelete(g.id, g.title)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
