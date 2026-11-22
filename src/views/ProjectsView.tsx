import { useState } from 'react';
import { ArrowUpRight, CalendarDays, Check, FolderKanban, Plus, Settings2, Trash2 } from '../components/Icon';
import { Button, cx, Empty, Progress, SectionTitle, shortDate } from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
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
  const { locale, l } = useLanguage();
  const [filter, setFilter] = useState<'active' | 'planned' | 'all'>('active');
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const visible = projects.filter(p => (filter === 'all' ? true : p.status === filter));
  const activeCount = projects.filter(p => p.status === 'active').length;
  const plannedCount = projects.filter(p => p.status === 'planned').length;
  const neglectedMap = new Map(getNeglectedProjects(projects, tasks).map(n => [n.project.id, n]));
  const statusLabel = (status: Project['status']) =>
    status === 'active'
      ? l('active', 'aktif')
      : status === 'planned'
        ? l('planned', 'direncanakan')
        : status === 'completed'
          ? l('completed', 'selesai')
          : l('archived', 'diarsipkan');
  const priorityLabel = (priority: Task['priority']) =>
    priority === 'high' ? l('high', 'tinggi') : priority === 'medium' ? l('medium', 'sedang') : l('low', 'rendah');

  return (
    <div className="view-stack">
      <SectionTitle eyebrow={l('strategy · deliverables', 'strategi · target nyata')} title={l('Projects', 'Proyek')}>
        <div className="project-title-actions">
          <span className="active-project-count">{activeCount}/{MAX_ACTIVE_PROJECTS} {l('active', 'aktif')}</span>
          <Button variant="solid" onClick={onAdd}><Plus size={15} /> {l('New project', 'Proyek baru')}</Button>
        </div>
      </SectionTitle>
      <div className="page-toolbar">
        <p className="page-lede">{l(`Projects turn goals into milestones you can actually complete. Limit active work to ${MAX_ACTIVE_PROJECTS}; future phases stay planned.`, `Proyek mengubah tujuan menjadi tonggak yang benar-benar bisa diselesaikan. Batasi proyek aktif hingga ${MAX_ACTIVE_PROJECTS}; fase berikutnya tetap berstatus direncanakan.`)}</p>
        <div className="segmented">
          <button type="button" className={filter === 'active' ? 'selected' : ''} onClick={() => setFilter('active')}>{l('Active', 'Aktif')}</button>
          <button type="button" className={filter === 'planned' ? 'selected' : ''} onClick={() => setFilter('planned')}>
            {l('Planned', 'Direncanakan')}{plannedCount > 0 ? ` (${plannedCount})` : ''}
          </button>
          <button type="button" className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>{l('All', 'Semua')}</button>
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
                      <span className={cx('status-label', project.status)}>{statusLabel(project.status)}</span>
                      {goal && <span>↗ {goal.title}</span>}
                      {project.theme && <span>{l('Theme', 'Tema')}: {project.theme}</span>}
                      {neglected && (
                        <span className="attention-tag">
                          {neglected.reason === 'no-tasks' ? l('No tasks yet', 'Belum ada tugas') : l(`Quiet ${neglected.daysIdle}d`, `Tenang ${neglected.daysIdle}h`)}
                        </span>
                      )}
                    </div>
                    <h3>{project.title}</h3>
                    <p>{project.description || l('No project description yet.', 'Belum ada deskripsi proyek.')}</p>
                    {project.exitCondition && (
                      <p className="phase-meta-line">{l('Exit', 'Syarat selesai')}: {project.exitCondition}</p>
                    )}
                  </div>
                  <div className="project-actions">
                    <button type="button" className="icon-btn" aria-label={l(`Edit project ${project.title}`, `Ubah proyek ${project.title}`)} onClick={() => onEdit(project.id)}>
                      <Settings2 size={16} />
                    </button>
                    <button type="button" className="icon-btn" aria-label={l(`Delete project ${project.title}`, `Hapus proyek ${project.title}`)} onClick={() => onDelete(project.id, project.title)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="project-progress">
                  <div><span>{l(`${done} of ${projectTasks.length} tasks completed`, `${done} dari ${projectTasks.length} tugas selesai`)}</span><b>{progress}%</b></div>
                  <Progress value={progress} />
                </div>

                <div className="project-foot">
                  <span>
                    <CalendarDays size={13} />{' '}
                    {project.startDate && project.dueDate
                      ? `${shortDate(project.startDate, locale)} → ${shortDate(project.dueDate, locale)}`
                      : project.dueDate
                        ? `${l('Due', 'Tenggat')} ${shortDate(project.dueDate, locale)}`
                        : l('No deadline', 'Tanpa tenggat')}
                  </span>
                  <div className="project-foot-actions">
                    {project.status === 'planned' && onStartPhase && (
                      <button
                        type="button"
                        className="start-phase-btn"
                        disabled={activeCount >= MAX_ACTIVE_PROJECTS}
                        title={
                          activeCount >= MAX_ACTIVE_PROJECTS
                            ? l(`Active project limit reached (${MAX_ACTIVE_PROJECTS}). Complete or archive a project first.`, `Batas proyek aktif (${MAX_ACTIVE_PROJECTS}) tercapai. Selesaikan atau arsipkan proyek lain terlebih dahulu.`)
                            : l('Activate this phase now', 'Aktifkan fase ini sekarang')
                        }
                        onClick={() => onStartPhase(project.id)}
                      >
                        {l('Start phase', 'Mulai fase')}
                      </button>
                    )}
                    <button type="button" onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}>
                      {isExpanded ? l('Hide tasks', 'Sembunyikan tugas') : `${l('Tasks', 'Tugas')} (${projectTasks.length})`}
                    </button>
                    <button type="button" onClick={() => onAddTask(project.id)}><Plus size={14} /> {l('Add task', 'Tambah tugas')}</button>
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
                              aria-label={task.status === 'done' ? l(`Reopen ${task.title}`, `Buka kembali ${task.title}`) : l(`Complete ${task.title}`, `Selesaikan ${task.title}`)}
                              className={cx('check-control', task.status === 'done' && 'checked')}
                              onClick={() => onToggleTask(task)}
                            >
                              {task.status === 'done' && <Check size={14} />}
                            </button>
                            <button type="button" className="task-title-button" onClick={() => onEditTask(task.id)}>
                              <b>{task.title}</b>
                              <small>{task.dueDate ? `${l('Due', 'Tenggat')} ${shortDate(task.dueDate, locale)}` : l('No date', 'Tanpa tanggal')} · {priorityLabel(task.priority)}</small>
                            </button>
                            {hasTargetQty && (
                              <div className="weekly-habit-actions" aria-label={l(`${task.title} quantity progress`, `Progres target ${task.title}`)}>
                                <button
                                  type="button"
                                  className="habit-mini-btn"
                                  disabled={completedQty <= 0}
                                  aria-label={l(`Decrease progress for ${task.title} (-1)`, `Kurangi progres ${task.title} (-1)`)}
                                  onClick={() => onAdjustTaskQuantity?.(task, -1)}
                                >
                                  -1
                                </button>
                                <span className="weekly-counter">{completedQty}/{task.targetQuantity}</span>
                                <button
                                  type="button"
                                  className="habit-mini-btn"
                                  disabled={completedQty >= task.targetQuantity!}
                                  aria-label={l(`Increase progress for ${task.title} (+1)`, `Tambah progres ${task.title} (+1)`)}
                                  onClick={() => onAdjustTaskQuantity?.(task, 1)}
                                >
                                  +1
                                </button>
                              </div>
                            )}
                            <button type="button" className="icon-btn subtle" aria-label={l(`Edit ${task.title}`, `Ubah ${task.title}`)} onClick={() => onEditTask(task.id)}>
                              <ArrowUpRight size={14} />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="project-drawer-empty">{l('No tasks linked yet. Add a concrete next action.', 'Belum ada tugas terhubung. Tambahkan langkah konkret berikutnya.')}</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={filter === 'planned' ? l('No planned projects or phases.', 'Belum ada proyek atau fase yang direncanakan.') : l('Start with a project.', 'Mulai dengan sebuah proyek.')}
          body={
            filter === 'planned'
              ? l('Phases imported beyond the 3 active limit or starting in the future appear here as planned.', 'Fase yang diimpor di luar batas 3 proyek aktif atau dimulai di masa depan akan muncul di sini.')
              : l('Give a goal a concrete shape. A project should have a finish line.', 'Beri wujud nyata pada tujuan Anda. Proyek harus memiliki garis finis yang jelas.')
          }
          action={<Button variant="solid" onClick={onAdd}><Plus size={15} /> {l('Create a project', 'Buat proyek')}</Button>}
        />
      )}
    </div>
  );
}
