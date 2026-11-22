import { ArrowUpRight, CalendarDays, Check, CheckCircle2, Plus, Settings2, Sparkles, Trash2 } from '../components/Icon';
import { Button, cx, Empty, Progress, SectionTitle, shortDate } from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
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
  const { locale, l } = useLanguage();
  const active = goals.filter(g => g.status === 'active');
  const inactive = goals.filter(g => g.status !== 'active');
  const goalStatusLabel = (status: Goal['status']) =>
    status === 'completed'
      ? l('completed', 'selesai')
      : status === 'archived'
        ? l('archived', 'diarsipkan')
        : l('active', 'aktif');

  return (
    <div className="view-stack">
      <SectionTitle eyebrow={l('direction · outcomes', 'arah · hasil')} title={l('Goals', 'Tujuan')}>
        <div className="project-title-actions">
          {onOpenImportPlan && (
            <Button variant="outline" onClick={onOpenImportPlan}><Sparkles size={14} /> {l('Import plan', 'Impor rencana')}</Button>
          )}
          <Button variant="outline" onClick={onManageAreas}>{l('Manage areas', 'Kelola area')}</Button>
          <Button variant="solid" onClick={onAdd}><Plus size={15} /> {l('New goal', 'Tujuan baru')}</Button>
        </div>
      </SectionTitle>
      <div className="page-lede">{l('A goal defines the result. Projects and tasks define the work that gets you there.', 'Tujuan menetapkan hasil akhir. Proyek dan tugas menentukan langkah nyata menuju ke sana.')}</div>

      {active.length ? (
        <div className="goal-grid">
          {active.map(goal => {
            const metrics = getGoalProgress(goal, projects, tasks);
            const lifeArea = lifeAreas.find(area => area.id === goal.lifeAreaId);
            return (
              <article className="goal-card" key={goal.id}>
                <div className="card-topline">
                  <span className="tag-label">
                    {lifeArea?.name ?? l('UNASSIGNED AREA', 'AREA BELUM DITETAPKAN')}
                    {typeof goal.pillarWeightPct === 'number' ? ` · ${goal.pillarWeightPct}%` : ''}
                  </span>
                  <div className="project-actions">
                    <button type="button" className="icon-btn" title={l('Edit goal', 'Ubah tujuan')} aria-label={l(`Edit goal ${goal.title}`, `Ubah tujuan ${goal.title}`)} onClick={() => onEdit(goal.id)}>
                      <Settings2 size={15} />
                    </button>
                    <button type="button" className="icon-btn" title={l('Delete goal', 'Hapus tujuan')} aria-label={l(`Delete goal ${goal.title}`, `Hapus tujuan ${goal.title}`)} onClick={() => onDelete(goal.id, goal.title)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <h3>{goal.title}</h3>
                <p>{goal.outcome || l('Define what success looks like.', 'Definisikan wujud keberhasilan tujuan ini.')}</p>
                <div className="goal-date"><CalendarDays size={14} /> {l('Target', 'Target')} · {goal.targetDate ? shortDate(goal.targetDate, locale) : l('No deadline', 'Tanpa tenggat')}</div>
                {goal.successCriteria && goal.successCriteria.length > 0 && (
                  <div className="goal-extra-list" aria-label={l(`Success criteria for ${goal.title}`, `Kriteria keberhasilan untuk ${goal.title}`)}>
                    <div className="eyebrow">{l('success criteria', 'kriteria keberhasilan')}</div>
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
                  <div className="goal-extra-list" aria-label={l(`Principles for ${goal.title}`, `Prinsip untuk ${goal.title}`)}>
                    <div className="eyebrow">{l('principles', 'prinsip')}</div>
                    {goal.principles.map(principle => (
                      <div key={principle.id} className="goal-principle-row">
                        {principle.text}
                      </div>
                    ))}
                  </div>
                )}
                <div className="goal-progress-head">
                  <span>{l('Execution progress', 'Progres eksekusi')}</span>
                  <b>{metrics.percent}%</b>
                </div>
                <Progress value={metrics.percent} />
                <div className="goal-card-foot">
                  <span>
                    {l(
                      `${metrics.linkedProjects} projects · ${metrics.completedTasks}/${metrics.totalTasks} tasks done`,
                      `${metrics.linkedProjects} proyek · ${metrics.completedTasks}/${metrics.totalTasks} tugas selesai`,
                    )}
                  </span>
                  <button type="button" onClick={() => onEdit(goal.id)}>{l('Edit goal', 'Ubah tujuan')} <ArrowUpRight size={13} /></button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={l('Give your effort a direction.', 'Beri arah pada usaha Anda.')}
          body={l('Create one meaningful outcome. You can connect projects and tasks to it as you go.', 'Buat satu hasil bermakna. Anda bisa menghubungkan proyek dan tugas ke dalamnya sambil berjalan.')}
          action={<Button variant="solid" onClick={onAdd}><Plus size={15} /> {l('Create a goal', 'Buat tujuan')}</Button>}
        />
      )}

      {inactive.length > 0 && (
        <div className="archive-list">
          <div className="eyebrow">{l('completed / archived', 'selesai / diarsipkan')}</div>
          {inactive.map(g => (
            <div key={g.id} className="archive-row">
              <CheckCircle2 size={15} />
              <span>{g.title}</span>
              <small className="archive-status">{goalStatusLabel(g.status)}</small>
              <button type="button" onClick={() => onEdit(g.id)}>{l('Edit', 'Ubah')}</button>
              <button type="button" aria-label={l(`Delete ${g.title}`, `Hapus ${g.title}`)} onClick={() => onDelete(g.id, g.title)}>{l('Delete', 'Hapus')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
