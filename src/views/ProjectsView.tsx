import { useState } from 'react';
import { ArrowUpRight, CalendarDays, Check, FolderKanban, Plus, Settings2, Trash2 } from '../components/Icon';
import { Button, cx, Empty, Progress, SectionTitle, shortDate } from '../components/ui';
import type { Goal, Project, Task } from '../types';
import { getNeglectedProjects } from '../utils/intelligence';
import { MAX_ACTIVE_PROJECTS } from '../utils/projectLimits';

interface ProjectsViewProps {
  projects: Project[];
  goals: Goal[];
  tasks: Task[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onAddTask: (id: string) => void;
  onToggleTask: (t: Task) => void;
  onAdjustTaskQuantity?: (t: Task, delta: 1 | -1) => void;
  onStartPhase?: (id: string) => void;
  onEditTask: (id: string) => void;
}

export function ProjectsView({
  projects,
  goals,
  tasks,
  onAdd,
  onEdit,
  onDelete,
  onAddTask,
  onToggleTask,
  onAdjustTaskQuantity,
  onStartPhase,
  onEditTask,
}: ProjectsViewProps) {
  const [filter, setFilter] = useState<'active' | 'planned' | 'all'>('active');
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const visible = projects.filter(p => (filter === 'all' ? true : p.status === filter));
  const activeCount = projects.filter(p => p.status === 'active').length;
  const plannedCount = projects.filter(p => p.status === 'planned').length;
  const neglectedMap = new Map(getNeglectedProjects(projects, tasks).map(n => [n.project.id, n]));

  return (
    <div className="view-stack">
      <SectionTitle eyebrow="strategy · deliverables" title="Projects">
        <div className="project-title-actions">
          <span className="active-project-count">{activeCount}/{MAX_ACTIVE_PROJECTS} active</span>
          <Button variant="solid" onClick={onAdd}><Plus size={15} /> New project</Button>
        </div>
      </SectionTitle>
      <div className="page-toolbar">
        <p className="page-lede">Projects turn goals into milestones you can actually complete. Limit active work to {MAX_ACTIVE_PROJECTS}; future phases stay planned.</p>
        <div className="segmented">
          <button type="button" className={filter === 'active' ? 'selected' : ''} onClick={() => setFilter('active')}>Active</button>
          <button type="button" className={filter === 'planned' ? 'selected' : ''} onClick={() => setFilter('planned')}>
            Planned{plannedCount > 0 ? ` (${plannedCount})` : ''}
          </button>
          <button type="button" className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>All</button>
        </div>
      </div>

      {visible.length ? (
        <div className="project-list">
          {visible.map(project => {
            const projectTasks = tasks.filter(t => t.projectId === project.id && t.status !== 'skipped');
            const done = projectTasks.filter(t => t.status === 'done').length;
            const progress = projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0;
            const goal = goals.find(g => g.id === project.goalId);
            const neglected = neglectedMap.get(project.id);
            const isExpanded = expandedProjectId === project.id;

            return (
              <article className="project-card" key={project.id}>
                <div className="project-main">
                  <div className="project-symbol"><FolderKanban size={18} /></div>
                  <div className="project-copy">
                    <div className="project-meta">
                      <span className={cx('status-label', project.status)}>{project.status}</span>
                      {goal && <span>↗ {goal.title}</span>}
                      {project.theme && <span>Theme: {project.theme}</span>}
                      {neglected && (
                        <span className="attention-tag">
                          {neglected.reason === 'no-tasks' ? 'No tasks yet' : `Quiet ${neglected.daysIdle}d`}
                        </span>
                      )}
                    </div>
                    <h3>{project.title}</h3>
                    <p>{project.description || 'No project description yet.'}</p>
                    {project.exitCondition && (
                      <p className="phase-meta-line">Exit: {project.exitCondition}</p>
                    )}
                  </div>
                  <div className="project-actions">
                    <button type="button" className="icon-btn" aria-label={`Edit project ${project.title}`} onClick={() => onEdit(project.id)}>
                      <Settings2 size={16} />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Delete project ${project.title}`} onClick={() => onDelete(project.id, project.title)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="project-progress">
                  <div><span>{done} of {projectTasks.length} tasks completed</span><b>{progress}%</b></div>
                  <Progress value={progress} />
                </div>

                <div className="project-foot">
                  <span>
                    <CalendarDays size={13} />{' '}
                    {project.startDate && project.dueDate
                      ? `${shortDate(project.startDate)} → ${shortDate(project.dueDate)}`
                      : project.dueDate
                        ? `Due ${shortDate(project.dueDate)}`
                        : 'No deadline'}
                  </span>
                  <div className="project-foot-actions">
                    {project.status === 'planned' && onStartPhase && (
                      <button
                        type="button"
                        className="start-phase-btn"
                        disabled={activeCount >= MAX_ACTIVE_PROJECTS}
                        title={
                          activeCount >= MAX_ACTIVE_PROJECTS
                            ? `Active project limit reached (${MAX_ACTIVE_PROJECTS}). Complete or archive a project first.`
                            : 'Activate this phase now'
                        }
                        onClick={() => onStartPhase(project.id)}
                      >
                        Start phase
                      </button>
                    )}
                    <button type="button" onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}>
                      {isExpanded ? 'Hide tasks' : `Tasks (${projectTasks.length})`}
                    </button>
                    <button type="button" onClick={() => onAddTask(project.id)}><Plus size={14} /> Add task</button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="project-task-drawer">
                    {projectTasks.length ? (
                      projectTasks.map(task => {
                        const hasTargetQty = typeof task.targetQuantity === 'number' && task.targetQuantity > 0;
                        const completedQty = hasTargetQty
                          ? Math.max(0, task.completedQuantity ?? (task.status === 'done' ? task.targetQuantity! : 0))
                          : 0;
                        return (
                          <div className={cx('task-row', task.status === 'done' && 'is-done')} key={task.id}>
                            <button
                              type="button"
                              aria-label={task.status === 'done' ? `Reopen ${task.title}` : `Complete ${task.title}`}
                              className={cx('check-control', task.status === 'done' && 'checked')}
                              onClick={() => onToggleTask(task)}
                            >
                              {task.status === 'done' && <Check size={14} />}
                            </button>
                            <button type="button" className="task-title-button" onClick={() => onEditTask(task.id)}>
                              <b>{task.title}</b>
                              <small>{task.dueDate ? `Due ${shortDate(task.dueDate)}` : 'No date'} · {task.priority}</small>
                            </button>
                            {hasTargetQty && (
                              <div className="weekly-habit-actions" aria-label={`${task.title} quantity progress`}>
                                <button
                                  type="button"
                                  className="habit-mini-btn"
                                  disabled={completedQty <= 0}
                                  aria-label={`Decrease progress for ${task.title} (-1)`}
                                  onClick={() => onAdjustTaskQuantity?.(task, -1)}
                                >
                                  -1
                                </button>
                                <span className="weekly-counter">{completedQty}/{task.targetQuantity}</span>
                                <button
                                  type="button"
                                  className="habit-mini-btn"
                                  disabled={completedQty >= task.targetQuantity!}
                                  aria-label={`Increase progress for ${task.title} (+1)`}
                                  onClick={() => onAdjustTaskQuantity?.(task, 1)}
                                >
                                  +1
                                </button>
                              </div>
                            )}
                            <button type="button" className="icon-btn subtle" aria-label={`Edit ${task.title}`} onClick={() => onEditTask(task.id)}>
                              <ArrowUpRight size={14} />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="project-drawer-empty">No tasks linked yet. Add a concrete next action.</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={filter === 'planned' ? 'No planned projects or phases.' : 'Start with a project.'}
          body={
            filter === 'planned'
              ? 'Phases imported beyond the 3 active limit or starting in the future appear here as planned.'
              : 'Give a goal a concrete shape. A project should have a finish line.'
          }
          action={<Button variant="solid" onClick={onAdd}><Plus size={15} /> Create a project</Button>}
        />
      )}
    </div>
  );
}
