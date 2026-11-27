import { useMemo, useState } from 'react';
import { FilmHeader, type HeroGoalSummary } from '../components/FilmHeader';
import { OnboardingCard, type StarterTemplateOption } from '../components/OnboardingCard';
import {
  Activity, ArrowDown, ArrowUp, ArrowUpRight, Check, Flag, FolderKanban, Plus, RotateCcw, Sparkles, Target, X,
} from '../components/Icon';
import { Button, cx, Empty, prettyDate, Progress, shortDate } from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
import type { AppData, Habit, PlanImportRecord, Task } from '../types';
import { getTodayHabitCount, getWeeklyHabitCount } from '../utils/habitUtils';
import { getGoalProgress } from '../utils/intelligence';
import { MAX_ACTIVE_PROJECTS } from '../utils/projectLimits';
import { buildTodaySchedule } from '../utils/todayScheduler';

const DAY_LABELS_ID: Record<string, string> = {
  mon: 'Sen',
  tue: 'Sel',
  wed: 'Rab',
  thu: 'Kam',
  fri: 'Jum',
  sat: 'Sab',
  sun: 'Min',
};

type TaskTab = 'today' | 'upcoming' | 'nodate' | 'all' | 'skipped';

interface TodayViewProps {
  data: AppData;
  today: string;
  todayTasks: Task[];
  overdueTasks: Task[];
  activeHabits: Habit[];
  completedHabitIds: Set<string>;
  skippedHabitIds: Set<string>;
  doneHabits: number;
  scheduledHabitsCount: number;
  priorityTasks: Task[];
  priorityIds: string[];
  showOnboarding: boolean;
  onDismissOnboarding: () => void;
  onApplyTemplate: (template: StarterTemplateOption) => void;
  onToggleHabit: (h: Habit) => void;
  onDecrementHabit?: (h: Habit) => void;
  onToggleSkipHabit: (h: Habit) => void;
  onToggleTask: (t: Task) => void;
  onAdjustTaskQuantity?: (t: Task, delta: 1 | -1) => void;
  onRestoreTask: (t: Task) => void;
  onMoveToToday: (id: string) => void;
  onPriorities: (ids: string[]) => void;
  onAddTask: () => void;
  onEditTask: (id: string) => void;
  onReview: () => void;
  onOpenGoals: () => void;
  onEditGoal: (id: string) => void;
  onAddGoal: () => void;
  onOpenImportPlan?: () => void;
  onOpenMindArchitecture?: () => void;
  lastImportRecord?: PlanImportRecord | null;
  onUndoImport?: () => void;
}

type QueueItem =
  | {
      kind: 'habit';
      key: string;
      done: boolean;
      sortRank: number;
      habit: Habit;
      weeklyCount: number;
      todayCount: number;
    }
  | {
      kind: 'task';
      key: string;
      done: boolean;
      sortRank: number;
      task: Task;
    };

const TODAY_QUEUE_CAP = 5;

export function TodayView({
  data,
  today,
  todayTasks,
  overdueTasks,
  activeHabits,
  completedHabitIds,
  skippedHabitIds,
  doneHabits,
  scheduledHabitsCount,
  priorityTasks,
  priorityIds,
  showOnboarding,
  onDismissOnboarding,
  onApplyTemplate,
  onToggleHabit,
  onDecrementHabit,
  onToggleSkipHabit,
  onToggleTask,
  onAdjustTaskQuantity,
  onRestoreTask,
  onMoveToToday,
  onPriorities,
  onAddTask,
  onEditTask,
  onReview,
  onOpenGoals,
  onEditGoal,
  onAddGoal,
  onOpenImportPlan,
  onOpenMindArchitecture,
  lastImportRecord,
  onUndoImport,
}: TodayViewProps) {
  const { locale, l } = useLanguage();
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskTab, setTaskTab] = useState<TaskTab>('today');
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [roughDay, setRoughDay] = useState(false);

  const schedule = useMemo(() => buildTodaySchedule(data, today), [data, today]);
  const activePhaseIds = useMemo(
    () => new Set(schedule.activePhaseProjects.map(p => p.id)),
    [schedule.activePhaseProjects],
  );

  const upcomingTasks = useMemo(
    () =>
      data.tasks
        .filter(t => t.dueDate > today && t.status !== 'skipped')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [data.tasks, today],
  );
  const undatedTasks = useMemo(
    () => data.tasks.filter(t => t.dueDate === '' && t.status !== 'skipped'),
    [data.tasks],
  );
  const allOpenTasks = useMemo(
    () =>
      data.tasks
        .filter(t => t.status === 'todo')
        .sort((a, b) => {
          if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
          return a.createdAt.localeCompare(b.createdAt);
        }),
    [data.tasks],
  );
  const skippedTasks = useMemo(
    () => data.tasks.filter(t => t.status === 'skipped'),
    [data.tasks],
  );

  const weeklyHabitCounts = useMemo(
    () => new Map(activeHabits.map(habit => [habit.id, getWeeklyHabitCount(habit.id, data.habitLogs, today)])),
    [activeHabits, data.habitLogs, today],
  );

  const todayHabitCounts = useMemo(
    () => new Map(activeHabits.map(habit => [habit.id, getTodayHabitCount(habit.id, data.habitLogs, today)])),
    [activeHabits, data.habitLogs, today],
  );

  // Auto-generated Today execution queue combining overdue, due today, active-phase (undated + this week), and scheduled habits
  const queueItems = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];
    const priorityRank = new Map(priorityIds.map((id, idx) => [id, idx]));

    for (const task of schedule.scheduledTasks) {
      const done = task.status === 'done';
      const pIdx = priorityRank.get(task.id);
      const isOverdue = task.dueDate !== '' && task.dueDate < today;
      const isDueToday = task.dueDate === today;
      const isThisWeek = task.dueDate >= schedule.weekStart && task.dueDate <= schedule.weekEnd;
      const priorityOffset = task.priority === 'high' ? 0 : task.priority === 'medium' ? 2 : 4;
      const baseRank =
        pIdx !== undefined
          ? pIdx
          : isOverdue
            ? 5 + priorityOffset
            : isDueToday
              ? 10 + priorityOffset
              : isThisWeek
                ? 22 + priorityOffset
                : 32 + priorityOffset;

      items.push({
        kind: 'task',
        key: `task:${task.id}`,
        done,
        sortRank: (done ? 100 : 0) + baseRank,
        task,
      });
    }

    for (const habit of activeHabits) {
      if (skippedHabitIds.has(habit.id)) continue;
      const done = completedHabitIds.has(habit.id);
      const baseRank = habit.timeBlock?.start ? 16 : 26;
      items.push({
        kind: 'habit',
        key: `habit:${habit.id}`,
        done,
        sortRank: (done ? 100 : 0) + baseRank,
        habit,
        weeklyCount: weeklyHabitCounts.get(habit.id) ?? 0,
        todayCount: todayHabitCounts.get(habit.id) ?? 0,
      });
    }

    return items.sort((a, b) => a.sortRank - b.sortRank);
  }, [
    activeHabits,
    completedHabitIds,
    priorityIds,
    schedule.scheduledTasks,
    schedule.weekEnd,
    schedule.weekStart,
    skippedHabitIds,
    today,
    todayHabitCounts,
    weeklyHabitCounts,
  ]);

  const visibleQueueItems = queueExpanded ? queueItems : queueItems.slice(0, TODAY_QUEUE_CAP);
  const hiddenQueueCount = Math.max(0, queueItems.length - TODAY_QUEUE_CAP);

  const suggestedPriorityTasks = useMemo(() => {
    const existingSet = new Set(priorityIds);
    return schedule.suggestedPriorityIds
      .filter(id => !existingSet.has(id))
      .map(id => data.tasks.find(t => t.id === id))
      .filter((t): t is Task => Boolean(t));
  }, [data.tasks, priorityIds, schedule.suggestedPriorityIds]);

  const dailyTaskPool = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of todayTasks) map.set(t.id, t);
    for (const t of priorityTasks) map.set(t.id, t);
    return [...map.values()];
  }, [priorityTasks, todayTasks]);

  const dailyTasksDone = useMemo(
    () => dailyTaskPool.filter(t => t.status === 'done').length,
    [dailyTaskPool],
  );
  const totalActions = scheduledHabitsCount + dailyTaskPool.length;
  const doneActions = doneHabits + dailyTasksDone;
  const completion = totalActions === 0 ? 0 : Math.round((doneActions / totalActions) * 100);

  const visibleTabTasks =
    taskTab === 'today'
      ? todayTasks
      : taskTab === 'upcoming'
        ? upcomingTasks
        : taskTab === 'nodate'
          ? undatedTasks
          : taskTab === 'all'
            ? allOpenTasks
            : skippedTasks;

  const displayedOverdue = showAllOverdue ? overdueTasks : overdueTasks.slice(0, 6);

  const available = data.tasks.filter(
    t =>
      t.status !== 'skipped' &&
      t.status !== 'done' &&
      !priorityIds.includes(t.id) &&
      (!taskSearch || t.title.toLowerCase().includes(taskSearch.toLowerCase())),
  );

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? l('Good morning', 'Selamat pagi')
      : hour < 15
        ? l('Good afternoon', 'Selamat siang')
        : hour < 18
          ? l('Good afternoon', 'Selamat sore')
          : l('Good evening', 'Selamat malam');
  const projectName = (id: string | null) => data.projects.find(p => p.id === id)?.title ?? l('Personal', 'Pribadi');
  const priorityLabel = (priority: Task['priority']) =>
    priority === 'high' ? l('high', 'tinggi') : priority === 'medium' ? l('medium', 'sedang') : l('low', 'rendah');
  const formatFrequency = (freq: string) =>
    freq === 'daily' ? l('daily', 'harian') : freq === 'weekly' ? l('weekly', 'mingguan') : freq;
  const formatDays = (days: string[]) =>
    days.map(d => (locale === 'id-ID' ? (DAY_LABELS_ID[d] ?? d) : d)).join(', ');

  const movePriority = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= priorityIds.length) return;
    const next = [...priorityIds];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onPriorities(next);
  };

  const applySuggestedPriorities = () => {
    const merged = [...new Set([...priorityIds, ...schedule.suggestedPriorityIds])].slice(0, 3);
    onPriorities(merged);
  };

  const heroGoals: HeroGoalSummary[] = useMemo(
    () =>
      [...data.goals]
        .filter(g => g.status === 'active')
        .sort((a, b) => {
          if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
          if (a.targetDate) return -1;
          if (b.targetDate) return 1;
          return a.createdAt.localeCompare(b.createdAt);
        })
        .map(goal => {
          const progress = getGoalProgress(goal, data.projects, data.tasks);
          const areaName = data.lifeAreas.find(a => a.id === goal.lifeAreaId)?.name ?? l('Direction', 'Arah');
          return {
            id: goal.id,
            title: goal.title,
            areaName,
            percent: progress.percent,
            completedTasks: progress.completedTasks,
            totalTasks: progress.totalTasks,
            targetDate: goal.targetDate,
          };
        }),
    [data.goals, data.lifeAreas, data.projects, data.tasks, l],
  );

  return (
    <div className="view-stack">
      <FilmHeader
        eyebrow={prettyDate(today, undefined, locale)}
        title={greeting.toLowerCase()}
        subtitle={l('Choose what matters. Then do the work.', 'Pilih yang paling penting. Lalu kerjakan.')}
        scene={l(`daily overview · take ${today}`, `ringkasan harian · ${today}`)}
        goals={heroGoals}
        onReview={onReview}
        onAddTask={onAddTask}
        onOpenGoals={onOpenGoals}
        onOpenGoal={onEditGoal}
        onAddGoal={onAddGoal}
        onOpenMindArchitecture={onOpenMindArchitecture}
      />

      {showOnboarding && (
        <OnboardingCard
          onDismiss={onDismissOnboarding}
          onApplyTemplate={onApplyTemplate}
          onCreateGoal={onAddGoal}
        />
      )}

      {lastImportRecord && onUndoImport && (
        <div className="import-undo-bar" role="status">
          <span>
            {l(
              `Imported ${lastImportRecord.counts.goals} goals · ${lastImportRecord.counts.phases} phases · ${lastImportRecord.counts.habits} habits · ${lastImportRecord.counts.tasks} tasks${lastImportRecord.counts.deduped > 0 ? ` (${lastImportRecord.counts.deduped} deduped)` : ''}`,
              `Diimpor ${lastImportRecord.counts.goals} tujuan · ${lastImportRecord.counts.phases} fase · ${lastImportRecord.counts.habits} kebiasaan · ${lastImportRecord.counts.tasks} tugas${lastImportRecord.counts.deduped > 0 ? ` (${lastImportRecord.counts.deduped} dideduplikasi)` : ''}`,
            )}
          </span>
          <button type="button" className="sync-retry-btn" onClick={onUndoImport}>
            <RotateCcw size={13} /> {l('Undo import', 'Batalkan impor')}
          </button>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top"><span>{l('Daily progress', 'Progres harian')}</span><Activity size={16} /></div>
          <div className="stat-value">{completion}<small>%</small></div>
          <Progress value={completion} />
          <div className="stat-foot">{l(`${doneActions} of ${totalActions} actions completed`, `${doneActions} dari ${totalActions} aksi selesai`)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{l('Priority wins', 'Kemenangan prioritas')}</span><Flag size={16} /></div>
          <div className="stat-value">{priorityTasks.filter(t => t.status === 'done').length}<small>/{priorityTasks.length}</small></div>
          <div className="stat-foot">{l('Your three most important outcomes', 'Tiga hasil terpenting Anda hari ini')}</div>
          <div className="stat-mini"><span style={{ width: `${priorityTasks.length ? (priorityTasks.filter(t => t.status === 'done').length / priorityTasks.length) * 100 : 0}%` }} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>{l('Active projects', 'Proyek aktif')}</span><FolderKanban size={16} /></div>
          <div className="stat-value">{data.projects.filter(p => p.status === 'active').length.toString().padStart(2, '0')}</div>
          <div className="stat-foot">{l(`${data.tasks.filter(t => t.status === 'todo').length} open tasks across your projects`, `${data.tasks.filter(t => t.status === 'todo').length} tugas terbuka di semua proyek`)}</div>
          <div className="stat-quiet"><span />{l(`Max ${MAX_ACTIVE_PROJECTS} active for focus`, `Maks ${MAX_ACTIVE_PROJECTS} aktif agar fokus`)}</div>
        </div>
      </div>

      <section className="panel today-queue-panel" aria-label={l("Today's execution queue", 'Antrean eksekusi hari ini')}>
        <div className="panel-head">
          <div>
            <div className="eyebrow">{l(`auto-scheduled · ${schedule.weekStart} to ${schedule.weekEnd}`, `terjadwal otomatis · ${schedule.weekStart} s.d. ${schedule.weekEnd}`)}</div>
            <h2>{l("Today's focus queue", 'Antrean fokus hari ini')}</h2>
          </div>
          <div className="project-title-actions">
            <button
              type="button"
              className={cx('rough-day-btn', roughDay && 'active')}
              aria-pressed={roughDay}
              onClick={() => setRoughDay(v => !v)}
            >
              {l('Rough day', 'Hari berat')}
            </button>
            {onOpenImportPlan && (
              <Button variant="outline" onClick={onOpenImportPlan}>
                <Sparkles size={14} /> {l('Import plan', 'Impor rencana')}
              </Button>
            )}
            <span className="count-pill">{visibleQueueItems.length}/{queueItems.length}</span>
          </div>
        </div>
        {visibleQueueItems.length > 0 ? (
          <div className="today-queue-list">
            {visibleQueueItems.map(item => {
              if (item.kind === 'habit') {
                const { habit, weeklyCount, todayCount, done } = item;
                const isWeeklyCount = habit.cadence === 'weekly_count';
                const roughLabel = habit.minimumVersion?.trim() || habit.name;
                const metaParts: string[] = [l('Habit', 'Kebiasaan')];
                if (!roughDay) {
                  if (isWeeklyCount && habit.targetCount) {
                    metaParts.push(l(`${weeklyCount}/${habit.targetCount} this week`, `${weeklyCount}/${habit.targetCount} minggu ini`));
                  } else if (habit.cadence === 'specific_days' && habit.days?.length) {
                    metaParts.push(formatDays(habit.days));
                  } else {
                    metaParts.push(formatFrequency(habit.frequency));
                  }
                  if (habit.timeBlock) metaParts.push(`${habit.timeBlock.start}–${habit.timeBlock.end}`);
                  if (habit.minimumVersion) metaParts.push(`Min: ${habit.minimumVersion}`);
                }

                return (
                  <div className={cx('task-row', done && !isWeeklyCount && 'is-done')} key={item.key}>
                    <button
                      type="button"
                      aria-label={done && !isWeeklyCount ? l(`Uncheck ${habit.name}`, `Batalkan centang ${habit.name}`) : l(`Check ${habit.name}`, `Centang ${habit.name}`)}
                      className={cx('check-control', done && 'checked')}
                      onClick={() => onToggleHabit(habit)}
                    >
                      {done && <Check size={14} />}
                    </button>
                    <div className="task-title-button">
                      <b>{roughDay ? roughLabel : habit.name}</b>
                      {!roughDay && <small>{metaParts.join(' · ')}</small>}
                    </div>
                    {isWeeklyCount && (
                      <div className="weekly-habit-actions">
                        {todayCount > 0 && onDecrementHabit && (
                          <button
                            type="button"
                            className="habit-mini-btn"
                            aria-label={l(`Remove one log for ${habit.name} today`, `Kurangi satu catatan ${habit.name} hari ini`)}
                            onClick={() => onDecrementHabit(habit)}
                          >
                            -1
                          </button>
                        )}
                        <button
                          type="button"
                          className="habit-mini-btn"
                          aria-label={l(`Log ${habit.name} (+1)`, `Catat ${habit.name} (+1)`)}
                          onClick={() => onToggleHabit(habit)}
                        >
                          +1
                        </button>
                        {habit.targetCount && (
                          <span className="weekly-counter">
                            {weeklyCount}/{habit.targetCount}
                            {todayCount > 0 ? ` (${todayCount} ${l('today', 'hari ini')})` : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              const { task, done } = item;
              const isOverdue = task.status === 'todo' && task.dueDate !== '' && task.dueDate < today;
              const isActivePhase = Boolean(task.projectId && activePhaseIds.has(task.projectId));
              const scheduleNote = isOverdue
                ? `${l('Overdue', 'Terlambat')} · ${shortDate(task.dueDate, locale)}`
                : task.dueDate === today
                  ? l('Due today', 'Jatuh tempo hari ini')
                  : isActivePhase && task.dueDate
                    ? `${l('Active phase', 'Fase aktif')} · ${shortDate(task.dueDate, locale)}`
                    : isActivePhase
                      ? l('Active phase · Undated', 'Fase aktif · Tanpa tanggal')
                      : task.dueDate
                        ? shortDate(task.dueDate, locale)
                        : l('Undated', 'Tanpa tanggal');

              const hasTargetQty = typeof task.targetQuantity === 'number' && task.targetQuantity > 0;
              const completedQty = hasTargetQty
                ? Math.max(0, task.completedQuantity ?? (task.status === 'done' ? task.targetQuantity! : 0))
                : 0;
              const metaParts = [projectName(task.projectId), scheduleNote, l(`${priorityLabel(task.priority)} priority`, `prioritas ${priorityLabel(task.priority)}`)];
              if (hasTargetQty) metaParts.push(`${completedQty}/${task.targetQuantity}`);

              return (
                <div className={cx('task-row', done && 'is-done')} key={item.key}>
                  <button
                    type="button"
                    aria-label={done ? l(`Uncheck ${task.title}`, `Batalkan centang ${task.title}`) : l(`Check ${task.title}`, `Centang ${task.title}`)}
                    className={cx('check-control', done && 'checked')}
                    onClick={() => onToggleTask(task)}
                  >
                    {done && <Check size={14} />}
                  </button>
                  <button type="button" className="task-title-button" onClick={() => onEditTask(task.id)}>
                    <b>{task.title}</b>
                    <small>{metaParts.join(' · ')}</small>
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
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title={l('Nothing scheduled for today yet.', 'Belum ada yang dijadwalkan untuk hari ini.')}
            body={l('Tasks from your active phase, overdue work, and habits scheduled today appear here automatically.', 'Tugas dari fase aktif, tugas terlambat, dan kebiasaan hari ini muncul di sini otomatis.')}
            action={onOpenImportPlan ? <Button variant="outline" onClick={onOpenImportPlan}><Sparkles size={14} /> {l('Import a plan', 'Impor rencana')}</Button> : undefined}
          />
        )}
        {hiddenQueueCount > 0 && (
          <button
            type="button"
            className="clear-priorities"
            aria-expanded={queueExpanded}
            onClick={() => setQueueExpanded(v => !v)}
          >
            {queueExpanded
              ? l(`Collapse to top ${TODAY_QUEUE_CAP}`, `Ringkas ke ${TODAY_QUEUE_CAP} teratas`)
              : l(`Show ${hiddenQueueCount} more today items`, `Tampilkan ${hiddenQueueCount} item lagi`)}
          </button>
        )}
      </section>

      <div className="today-columns">
        <section className="panel priorities-panel">
          <div className="panel-head">
            <div><div className="eyebrow">{l('the essential', 'yang utama')}</div><h2>{l("Today's priorities", 'Prioritas hari ini')}</h2></div>
            <span className="count-pill">{priorityTasks.length}/3</span>
          </div>
          {priorityTasks.length ? (
            <div className="priority-list">
              {priorityTasks.map((task, index) => (
                <div className={cx('priority-row', task.status === 'done' && 'is-done')} key={task.id}>
                  <button
                    type="button"
                    aria-label={task.status === 'done' ? l(`Reopen ${task.title}`, `Buka kembali ${task.title}`) : l(`Complete ${task.title}`, `Selesaikan ${task.title}`)}
                    className={cx('check-control', task.status === 'done' && 'checked')}
                    onClick={() => onToggleTask(task)}
                  >
                    {task.status === 'done' && <Check size={14} />}
                  </button>
                  <span className="priority-number">0{index + 1}</span>
                  <button type="button" className="task-title-button" onClick={() => onEditTask(task.id)}>
                    <b>{task.title}</b>
                    <small>
                      {projectName(task.projectId)} · {l(`${priorityLabel(task.priority)} priority`, `prioritas ${priorityLabel(task.priority)}`)}
                      {task.dueDate && task.dueDate !== today ? ` · ${shortDate(task.dueDate, locale)}` : ''}
                    </small>
                  </button>
                  {priorityTasks.length > 1 && (
                    <div className="priority-reorder">
                      <button
                        type="button"
                        className="icon-btn subtle"
                        disabled={index === 0}
                        aria-label={l(`Move ${task.title} higher`, `Naikkan ${task.title}`)}
                        title={l('Move up', 'Naikkan')}
                        onClick={() => movePriority(index, -1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn subtle"
                        disabled={index === priorityTasks.length - 1}
                        aria-label={l(`Move ${task.title} lower`, `Turunkan ${task.title}`)}
                        title={l('Move down', 'Turunkan')}
                        onClick={() => movePriority(index, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="icon-btn subtle"
                    title={l("Remove from today's priorities", 'Hapus dari prioritas hari ini')}
                    aria-label={l(`Remove ${task.title} from priorities`, `Hapus ${task.title} dari prioritas`)}
                    onClick={() => onPriorities(priorityIds.filter(id => id !== task.id))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="priority-empty">
              <Target size={21} />
              <p>{l('Nothing is in your top three yet.', 'Belum ada tugas di tiga prioritas utama.')}</p>
              <span>{l('Pick up to three tasks that would make today count.', 'Pilih hingga tiga tugas yang membuat hari ini berarti.')}</span>
            </div>
          )}

          {priorityIds.length < 3 && suggestedPriorityTasks.length > 0 && (
            <div className="priority-suggestions" aria-label={l('Suggested top 3 priorities', 'Saran 3 prioritas utama')}>
              <div className="priority-suggestions-head">
                <span className="eyebrow">{l('suggested from overdue · today · active phase', 'saran dari terlambat · hari ini · fase aktif')}</span>
                <button type="button" className="text-action" onClick={applySuggestedPriorities}>
                  {priorityIds.length === 0 ? l('Apply 3 priorities', 'Terapkan 3 prioritas') : l('Fill top 3', 'Lengkapi 3 besar')}
                </button>
              </div>
              <div className="priority-suggestion-list">
                {suggestedPriorityTasks.slice(0, 3 - priorityIds.length).map(task => (
                  <button
                    key={task.id}
                    type="button"
                    className="picker-item"
                    onClick={() => onPriorities([...priorityIds, task.id].slice(0, 3))}
                  >
                    <Plus size={13} />
                    <span>{task.title}</span>
                    <small>{task.dueDate ? shortDate(task.dueDate, locale) : l('Active phase', 'Fase aktif')}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="panel-foot">
            <Button variant="outline" onClick={() => setShowPriorityPicker(v => !v)}>
              <Plus size={15} />{showPriorityPicker ? l('Done selecting', 'Selesai memilih') : l('Set priorities', 'Atur prioritas')}
            </Button>
            <span>{l('Limit yourself to three.', 'Batasi maksimal tiga.')}</span>
          </div>
          {showPriorityPicker && (
            <div className="priority-picker">
              <div className="picker-top">
                <b>{l('Choose your priorities', 'Pilih prioritas Anda')}</b>
                <span>{l(`${priorityIds.length}/3 selected`, `${priorityIds.length}/3 dipilih`)}</span>
              </div>
              <input
                className="search-input"
                placeholder={l('Find an open task...', 'Cari tugas terbuka...')}
                value={taskSearch}
                onChange={e => setTaskSearch(e.target.value)}
              />
              {available.slice(0, 8).map(task => (
                <button
                  type="button"
                  className="picker-item"
                  key={task.id}
                  disabled={priorityIds.length >= 3}
                  onClick={() => onPriorities([...priorityIds, task.id])}
                >
                  <Plus size={14} />
                  <span>{task.title}</span>
                  <small>{projectName(task.projectId)}</small>
                </button>
              ))}
              {available.length === 0 && <div className="picker-empty">{l('No matching open tasks available.', 'Tidak ada tugas terbuka yang cocok.')}</div>}
              {priorityIds.length > 0 && (
                <button type="button" className="clear-priorities" onClick={() => onPriorities([])}>
                  {l("Clear today's priorities", 'Kosongkan prioritas hari ini')}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="panel habits-panel" aria-label={l('Habits', 'Kebiasaan')}>
          <div className="panel-head">
            <div><div className="eyebrow">{roughDay ? l('rough day · minimum versions', 'hari berat · versi minimum') : l('show up daily', 'hadir setiap hari')}</div><h2>{l('Habits', 'Kebiasaan')}</h2></div>
            <span className="count-pill">{doneHabits}/{scheduledHabitsCount}</span>
          </div>
          {activeHabits.length ? (
            <div className="habit-check-list">
              {activeHabits.map(habit => {
                const done = completedHabitIds.has(habit.id);
                const skipped = skippedHabitIds.has(habit.id);
                const isWeeklyCount = habit.cadence === 'weekly_count';
                const weeklyCount = weeklyHabitCounts.get(habit.id) ?? 0;
                const todayCount = todayHabitCounts.get(habit.id) ?? 0;
                const displayLabel = roughDay ? (habit.minimumVersion?.trim() || habit.name) : habit.name;
                const statusLabel =
                  isWeeklyCount && habit.targetCount
                    ? `${weeklyCount}/${habit.targetCount}${todayCount > 0 ? ` (+${todayCount})` : ''}`
                    : done
                      ? l('done', 'selesai')
                      : skipped
                        ? l('skipped', 'dilewati')
                        : l('open', 'terbuka');
                return (
                  <div
                    key={habit.id}
                    className={cx('habit-check-row-wrap', done && !isWeeklyCount && 'is-done', skipped && 'is-skipped')}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleHabit(habit)}
                      className={cx('habit-check-row', done && !isWeeklyCount && 'is-done')}
                      aria-pressed={done}
                    >
                      <span className={cx('habit-check', done && 'checked', skipped && 'skipped')}>
                        {done ? <Check size={13} /> : skipped ? '–' : null}
                      </span>
                      <span>{displayLabel}</span>
                      {!roughDay && <small>{statusLabel}</small>}
                    </button>
                    {isWeeklyCount && (
                      <div className="weekly-habit-actions">
                        {todayCount > 0 && onDecrementHabit && (
                          <button
                            type="button"
                            className="habit-mini-btn"
                            aria-label={l(`Undo one ${habit.name} log today`, `Kurangi satu catatan ${habit.name} hari ini`)}
                            onClick={() => onDecrementHabit(habit)}
                          >
                            -1
                          </button>
                        )}
                        <button
                          type="button"
                          className="habit-mini-btn"
                          aria-label={l(`Add completion for ${habit.name}`, `Tambah penyelesaian ${habit.name}`)}
                          onClick={() => onToggleHabit(habit)}
                        >
                          +1
                        </button>
                      </div>
                    )}
                    {!done && (
                      <button
                        type="button"
                        className={cx('habit-skip-btn', skipped && 'active')}
                        title={skipped ? l('Undo skip', 'Batalkan lewati') : l('Skip for today without breaking streak', 'Lewati hari ini tanpa memutus rentetan')}
                        aria-label={skipped ? l(`Undo skip for ${habit.name}`, `Batalkan lewati ${habit.name}`) : l(`Skip ${habit.name} today`, `Lewati ${habit.name} hari ini`)}
                        onClick={() => onToggleSkipHabit(habit)}
                      >
                        {skipped ? l('Undo', 'Batalkan') : l('Skip', 'Lewati')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title={l('No scheduled habits today', 'Tidak ada kebiasaan terjadwal hari ini')} body={l('Add repeatable actions or check your habit schedule in Habits.', 'Tambahkan aksi berulang atau periksa jadwal di tab Kebiasaan.')} />
          )}
          <div className="habits-progress">
            <Progress value={scheduledHabitsCount ? (doneHabits / scheduledHabitsCount) * 100 : 0} />
            <span>{scheduledHabitsCount ? Math.round((doneHabits / scheduledHabitsCount) * 100) : 0}% {l('complete', 'selesai')}</span>
          </div>
        </section>
      </div>

      <section className="panel tasks-panel">
        <div className="panel-head">
          <div><div className="eyebrow">{l('make progress visible', 'buat progres terlihat')}</div><h2>{l('Tasks', 'Tugas')}</h2></div>
          <Button variant="solid" onClick={onAddTask}><Plus size={15} /> {l('Add task', 'Tambah tugas')}</Button>
        </div>

        <div className="task-tabs" role="tablist" aria-label={l('Filter tasks', 'Saring tugas')}>
          {(
            [
              { id: 'today', label: l('Today', 'Hari ini'), count: todayTasks.length },
              { id: 'upcoming', label: l('Upcoming', 'Mendatang'), count: upcomingTasks.length },
              { id: 'nodate', label: l('No date', 'Tanpa tanggal'), count: undatedTasks.length },
              { id: 'all', label: l('All open', 'Semua terbuka'), count: allOpenTasks.length },
              { id: 'skipped', label: l('Skipped', 'Dilewati'), count: skippedTasks.length },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={taskTab === tab.id}
              className={cx('task-tab-btn', taskTab === tab.id && 'active')}
              onClick={() => setTaskTab(tab.id)}
            >
              <span>{tab.label}</span>
              <small>{tab.count}</small>
            </button>
          ))}
        </div>

        {visibleTabTasks.length ? (
          <div className="task-table">
            {visibleTabTasks.map(task => {
              const hasTargetQty = typeof task.targetQuantity === 'number' && task.targetQuantity > 0;
              const completedQty = hasTargetQty
                ? Math.max(0, task.completedQuantity ?? (task.status === 'done' ? task.targetQuantity! : 0))
                : 0;
              return (
                <div className={cx('task-row', task.status === 'done' && 'is-done')} key={task.id}>
                  <button
                    type="button"
                    aria-label={
                      task.status === 'skipped'
                        ? l(`Restore ${task.title}`, `Pulihkan ${task.title}`)
                        : task.status === 'done'
                          ? l(`Reopen ${task.title}`, `Buka kembali ${task.title}`)
                          : l(`Complete ${task.title}`, `Selesaikan ${task.title}`)
                    }
                    className={cx('check-control', task.status === 'done' && 'checked')}
                    onClick={() => (task.status === 'skipped' ? onRestoreTask(task) : onToggleTask(task))}
                  >
                    {task.status === 'done' && <Check size={14} />}
                  </button>
                  <button type="button" className="task-title-button" onClick={() => onEditTask(task.id)}>
                    <b>{task.title}</b>
                    <small>
                      {projectName(task.projectId)}
                      {task.dueDate ? ` · ${task.dueDate === today ? l('Today', 'Hari ini') : shortDate(task.dueDate, locale)}` : ` · ${l('No date', 'Tanpa tanggal')}`}
                      {task.dueDate !== '' && task.dueDate < today && task.status === 'todo' ? ` (${l('Overdue', 'Terlambat')})` : ''}
                    </small>
                  </button>
                  {hasTargetQty && task.status !== 'skipped' && (
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
                  <span className={cx('priority-tag', task.priority)}>{priorityLabel(task.priority)}</span>
                  {task.status === 'skipped' ? (
                    <button type="button" className="move-today-btn" onClick={() => onRestoreTask(task)}>
                      {l('Restore', 'Pulihkan')}
                    </button>
                  ) : (
                    <button type="button" className="icon-btn subtle" aria-label={l(`Edit ${task.title}`, `Ubah ${task.title}`)} onClick={() => onEditTask(task.id)}>
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title={
              taskTab === 'today'
                ? l('A clear runway today.', 'Hari ini masih leluasa.')
                : taskTab === 'upcoming'
                  ? l('No upcoming tasks.', 'Tidak ada tugas mendatang.')
                  : taskTab === 'nodate'
                    ? l('No undated tasks.', 'Tidak ada tugas tanpa tanggal.')
                    : taskTab === 'all'
                      ? l('No open tasks.', 'Tidak ada tugas terbuka.')
                      : l('No skipped tasks.', 'Tidak ada tugas dilewati.')
            }
            body={
              taskTab === 'skipped'
                ? l('Tasks marked skipped appear here so you can restore them anytime.', 'Tugas yang dilewati muncul di sini agar bisa dipulihkan kapan saja.')
                : l('Add a task or switch tabs to view upcoming and undated work.', 'Tambah tugas atau pindah tab untuk melihat tugas mendatang dan tanpa tanggal.')
            }
            action={taskTab !== 'skipped' ? <Button variant="outline" onClick={onAddTask}><Plus size={15} /> {l('Create task', 'Buat tugas')}</Button> : undefined}
          />
        )}

        {overdueTasks.length > 0 && (
          <div className="overdue-block">
            <div className="overdue-head">
              <span className="eyebrow">{l('overdue · carry forward or complete', 'terlambat · lanjutkan atau selesaikan')}</span>
              <span className="overdue-count">{overdueTasks.length}</span>
            </div>
            {displayedOverdue.map(task => (
              <div className="task-row overdue-row" key={task.id}>
                <button
                  type="button"
                  aria-label={l(`Complete overdue task ${task.title}`, `Selesaikan tugas terlambat ${task.title}`)}
                  className="check-control"
                  onClick={() => onToggleTask(task)}
                />
                <button type="button" className="task-title-button" onClick={() => onEditTask(task.id)}>
                  <b>{task.title}</b>
                  <small>{projectName(task.projectId)} · {l('due', 'tenggat')} {shortDate(task.dueDate, locale)}</small>
                </button>
                <button type="button" className="move-today-btn" onClick={() => onMoveToToday(task.id)}>
                  {l('Move to today', 'Pindah ke hari ini')}
                </button>
              </div>
            ))}
            {overdueTasks.length > 6 && (
              <button
                type="button"
                className="clear-priorities"
                onClick={() => setShowAllOverdue(v => !v)}
              >
                {showAllOverdue ? l('Show fewer overdue tasks', 'Tampilkan lebih sedikit') : l(`Show all ${overdueTasks.length} overdue tasks`, `Tampilkan semua ${overdueTasks.length} tugas terlambat`)}
              </button>
            )}
          </div>
        )}
      </section>

      <div className="today-bottom">
        <span><span className="status-dot" /> {l(`${dailyTasksDone} tasks completed today`, `${dailyTasksDone} tugas selesai hari ini`)}</span>
        <button type="button" onClick={onReview}>{l('Reflect on today', 'Refleksi hari ini')} <ArrowUpRight size={14} /></button>
      </div>
    </div>
  );
}
