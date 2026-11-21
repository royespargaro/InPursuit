import { useMemo, useState } from 'react';
import { FilmHeader, type HeroGoalSummary } from '../components/FilmHeader';
import { OnboardingCard, type StarterTemplateOption } from '../components/OnboardingCard';
import {
  ArrowDown, ArrowUp, ArrowUpRight, Check, Plus, RotateCcw, Sparkles, Target, X,
} from '../components/Icon';
import { Button, cx, Empty, prettyDate, Progress, shortDate } from '../components/ui';
import type { AppData, Habit, PlanImportRecord, Task } from '../types';
import { getGoalProgress } from '../utils/intelligence';
import { selectTaskContext, selectToday, type TodayHabitItem } from '../utils/selectors';

type TaskTab = 'today' | 'upcoming' | 'nodate' | 'all' | 'skipped';

interface TodayViewProps {
  data: AppData;
  today: string;
  showOnboarding: boolean;
  onDismissOnboarding: () => void;
  onApplyTemplate: (template: StarterTemplateOption) => void;
  onToggleHabit: (h: Habit) => void;
  onDecrementHabit?: (h: Habit) => void;
  onToggleSkipHabit: (h: Habit) => void;
  onToggleTask: (t: Task) => void;
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
  lastImportRecord?: PlanImportRecord | null;
  onUndoImport?: () => void;
  /** @deprecated Derived inside the view via selectToday(); kept so older callers still type-check. */
  todayTasks?: Task[];
  /** @deprecated */ overdueTasks?: Task[];
  /** @deprecated */ activeHabits?: Habit[];
  /** @deprecated */ completedHabitIds?: Set<string>;
  /** @deprecated */ skippedHabitIds?: Set<string>;
  /** @deprecated */ doneHabits?: number;
  /** @deprecated */ scheduledHabitsCount?: number;
  /** @deprecated */ priorityTasks?: Task[];
  /** @deprecated */ priorityIds?: string[];
}

/** Visible "Also today" rows before the "Show more" toggle. */
const ALSO_TODAY_CAP = 5;

export function TodayView({
  data,
  today,
  showOnboarding,
  onDismissOnboarding,
  onApplyTemplate,
  onToggleHabit,
  onDecrementHabit,
  onToggleSkipHabit,
  onToggleTask,
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
  lastImportRecord,
  onUndoImport,
}: TodayViewProps) {
  const [roughDay, setRoughDay] = useState(false);
  const [alsoExpanded, setAlsoExpanded] = useState(false);
  const [editTop3, setEditTop3] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [showTaskManager, setShowTaskManager] = useState(false);
  const [taskTab, setTaskTab] = useState<TaskTab>('today');

  const sel = useMemo(() => selectToday(data, today), [data, today]);
  const priorityIds = useMemo(() => sel.top3.map(t => t.id), [sel.top3]);
  const activePhaseIds = useMemo(
    () => new Set(sel.schedule.activePhaseProjects.map(p => p.id)),
    [sel.schedule.activePhaseProjects],
  );

  const visibleOthers = alsoExpanded ? sel.others : sel.others.slice(0, ALSO_TODAY_CAP);
  const hiddenOthers = Math.max(0, sel.others.length - ALSO_TODAY_CAP);

  const suggestedTasks = useMemo(
    () => sel.suggestedIds.map(id => data.tasks.find(t => t.id === id)).filter((t): t is Task => Boolean(t)),
    [data.tasks, sel.suggestedIds],
  );

  const pickerTasks = useMemo(
    () =>
      data.tasks.filter(
        t =>
          t.status === 'todo' &&
          !priorityIds.includes(t.id) &&
          (!pickerSearch || t.title.toLowerCase().includes(pickerSearch.toLowerCase())),
      ),
    [data.tasks, pickerSearch, priorityIds],
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

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
          const areaName = data.lifeAreas.find(a => a.id === goal.lifeAreaId)?.name ?? 'Direction';
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
    [data.goals, data.lifeAreas, data.projects, data.tasks],
  );

  const movePriority = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= priorityIds.length) return;
    const next = [...priorityIds];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onPriorities(next);
  };

  const fillTop3 = () => onPriorities([...new Set([...priorityIds, ...sel.suggestedIds])].slice(0, 3));

  const taskMeta = (task: Task): string => {
    const ctx = selectTaskContext(data, task);
    const isOverdue = task.status === 'todo' && task.dueDate !== '' && task.dueDate < today;
    const isActivePhase = Boolean(task.projectId && activePhaseIds.has(task.projectId));
    const when = isOverdue
      ? `Overdue · ${shortDate(task.dueDate)}`
      : task.dueDate === today
        ? 'Today'
        : task.dueDate
          ? shortDate(task.dueDate)
          : isActivePhase
            ? 'This phase'
            : 'No date';
    const parts = [ctx.phase ?? 'Personal', when];
    if (task.priority === 'high') parts.push('High');
    if (task.targetQuantity) parts.push(`Target ${task.targetQuantity}`);
    return parts.join(' · ');
  };

  const renderTaskRow = (task: Task, opts?: { number?: number; index?: number }) => {
    const done = task.status === 'done';
    return (
      <div className={cx('task-row', done && 'is-done')} key={task.id}>
        <button
          type="button"
          aria-label={done ? `Uncheck ${task.title}` : `Check ${task.title}`}
          className={cx('check-control', done && 'checked')}
          onClick={() => onToggleTask(task)}
        >
          {done && <Check size={14} />}
        </button>
        {opts?.number !== undefined && <span className="priority-number">0{opts.number}</span>}
        <button type="button" className="task-title-button" onClick={() => onEditTask(task.id)}>
          <b>{task.title}</b>
          <small>{taskMeta(task)}</small>
        </button>
        {editTop3 && opts?.index !== undefined && (
          <div className="priority-reorder">
            <button
              type="button"
              className="icon-btn subtle"
              disabled={opts.index === 0}
              aria-label={`Move ${task.title} higher`}
              onClick={() => movePriority(opts.index!, -1)}
            >
              <ArrowUp size={13} />
            </button>
            <button
              type="button"
              className="icon-btn subtle"
              disabled={opts.index === priorityIds.length - 1}
              aria-label={`Move ${task.title} lower`}
              onClick={() => movePriority(opts.index!, 1)}
            >
              <ArrowDown size={13} />
            </button>
            <button
              type="button"
              className="icon-btn subtle"
              aria-label={`Remove ${task.title} from top 3`}
              onClick={() => onPriorities(priorityIds.filter(id => id !== task.id))}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderHabitRow = (item: TodayHabitItem) => {
    const { habit, status, weeklyCount, todayCount } = item;
    const isWeeklyCount = habit.cadence === 'weekly_count';
    const done = status === 'done';
    const skipped = status === 'skipped';
    const label = roughDay ? habit.minimumVersion?.trim() || habit.name : habit.name;

    const meta: string[] = [];
    if (!roughDay) {
      if (isWeeklyCount && habit.targetCount) meta.push(`${weeklyCount}/${habit.targetCount} this week`);
      else if (habit.cadence === 'specific_days' && habit.days?.length) meta.push(habit.days.join(', '));
      else meta.push(habit.frequency);
      if (habit.timeBlock) meta.push(`${habit.timeBlock.start}–${habit.timeBlock.end}`);
      if (habit.minimumVersion) meta.push(`Min: ${habit.minimumVersion}`);
    }

    return (
      <div className={cx('task-row', done && !isWeeklyCount && 'is-done', skipped && 'is-skipped')} key={habit.id}>
        <button
          type="button"
          aria-label={done && !isWeeklyCount ? `Uncheck ${habit.name}` : `Check ${habit.name}`}
          className={cx('check-control', done && 'checked')}
          onClick={() => onToggleHabit(habit)}
        >
          {done ? <Check size={14} /> : skipped ? '–' : null}
        </button>
        <div className="task-title-button">
          <b>{label}</b>
          {meta.length > 0 && <small>{meta.join(' · ')}</small>}
        </div>
        {isWeeklyCount && (
          <div className="weekly-habit-actions">
            {todayCount > 0 && onDecrementHabit && (
              <button
                type="button"
                className="habit-mini-btn"
                aria-label={`Remove one log for ${habit.name} today`}
                onClick={() => onDecrementHabit(habit)}
              >
                -1
              </button>
            )}
            <button
              type="button"
              className="habit-mini-btn"
              aria-label={`Log ${habit.name} (+1)`}
              onClick={() => onToggleHabit(habit)}
            >
              +1
            </button>
            {habit.targetCount ? (
              <span className="weekly-counter">
                {weeklyCount}/{habit.targetCount}
                {todayCount > 0 ? ` (${todayCount} today)` : ''}
              </span>
            ) : null}
          </div>
        )}
        {!done && (
          <button
            type="button"
            className={cx('habit-skip-btn', skipped && 'active')}
            title={skipped ? 'Undo skip' : 'Skip for today without breaking the streak'}
            aria-label={skipped ? `Undo skip for ${habit.name}` : `Skip ${habit.name} today`}
            onClick={() => onToggleSkipHabit(habit)}
          >
            {skipped ? 'Undo' : 'Skip'}
          </button>
        )}
      </div>
    );
  };

  // ---- Full task manager (collapsed by default) -------------------------------------------------
  const taskManager = useMemo(() => {
    const dueToday = data.tasks.filter(t => t.dueDate === today && t.status !== 'skipped');
    const upcoming = data.tasks
      .filter(t => t.dueDate > today && t.status !== 'skipped')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const undated = data.tasks.filter(t => t.dueDate === '' && t.status !== 'skipped');
    const allOpen = data.tasks
      .filter(t => t.status === 'todo')
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.createdAt.localeCompare(b.createdAt);
      });
    const skippedTasks = data.tasks.filter(t => t.status === 'skipped');
    return { dueToday, upcoming, undated, allOpen, skippedTasks };
  }, [data.tasks, today]);

  const visibleTabTasks =
    taskTab === 'today'
      ? taskManager.dueToday
      : taskTab === 'upcoming'
        ? taskManager.upcoming
        : taskTab === 'nodate'
          ? taskManager.undated
          : taskTab === 'all'
            ? taskManager.allOpen
            : taskManager.skippedTasks;
  const projectName = (id: string | null) => data.projects.find(p => p.id === id)?.title ?? 'Personal';

  const hasAnything = sel.top3.length + sel.habits.length + sel.others.length > 0;
  const allDone = sel.total > 0 && sel.done === sel.total;
  const top3Done = sel.top3.length > 0 && sel.top3.every(t => t.status === 'done');

  return (
    <div className="view-stack">
      <FilmHeader
        eyebrow={prettyDate(today)}
        title={greeting.toLowerCase()}
        subtitle="Choose what matters. Then do the work."
        scene={`daily overview · take ${today}`}
        goals={heroGoals}
        onReview={onReview}
        onAddTask={onAddTask}
        onOpenGoals={onOpenGoals}
        onOpenGoal={onEditGoal}
        onAddGoal={onAddGoal}
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
            Imported {lastImportRecord.counts.goals} goals · {lastImportRecord.counts.phases} phases · {lastImportRecord.counts.habits} habits · {lastImportRecord.counts.tasks} tasks
            {lastImportRecord.counts.deduped > 0 ? ` (${lastImportRecord.counts.deduped} deduped)` : ''}
          </span>
          <button type="button" className="sync-retry-btn" onClick={onUndoImport}>
            <RotateCcw size={13} /> Undo import
          </button>
        </div>
      )}

      <section className="panel today-panel" aria-label="Today">
        <div className="panel-head">
          <div>
            <div className="eyebrow">{roughDay ? 'rough day · minimum versions' : `${sel.done} of ${sel.total} done`}</div>
            <h2>Today</h2>
          </div>
          <div className="project-title-actions">
            <button
              type="button"
              className={cx('rough-day-btn', roughDay && 'active')}
              aria-pressed={roughDay}
              onClick={() => setRoughDay(v => !v)}
            >
              Rough day
            </button>
            <span className="count-pill" aria-label="Daily progress">{sel.done}/{sel.total}</span>
          </div>
        </div>
        <Progress value={sel.percent} />

        {!hasAnything ? (
          <Empty
            title="Nothing scheduled for today yet."
            body="Import a plan or add a goal, and your tasks and habits will appear here automatically."
            action={
              onOpenImportPlan ? (
                <Button variant="outline" onClick={onOpenImportPlan}><Sparkles size={14} /> Import a plan</Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {allDone && <div className="today-banner" role="status">All done for today. Nice work.</div>}

            {/* Top 3 */}
            <div className="today-section">
              <div className="today-section-head">
                <span className="eyebrow">top 3{top3Done ? ' · done' : ''}</span>
                <div className="today-section-actions">
                  {sel.top3.length > 0 && (
                    <button type="button" className="text-action" onClick={() => setEditTop3(v => !v)}>
                      {editTop3 ? 'Done' : 'Edit'}
                    </button>
                  )}
                  {priorityIds.length < 3 && sel.suggestedIds.length > 0 && (
                    <button type="button" className="text-action" onClick={fillTop3}>
                      {priorityIds.length === 0 ? 'Apply 3 priorities' : 'Fill top 3'}
                    </button>
                  )}
                  {priorityIds.length < 3 && (
                    <button type="button" className="text-action" onClick={() => setShowPicker(v => !v)}>
                      {showPicker ? 'Close' : 'Choose'}
                    </button>
                  )}
                </div>
              </div>
              {sel.top3.length > 0 ? (
                <div className="today-list">
                  {sel.top3.map((task, index) => renderTaskRow(task, { number: index + 1, index }))}
                </div>
              ) : (
                <div className="priority-empty">
                  <Target size={18} />
                  <span>Pick up to three tasks that would make today count.</span>
                </div>
              )}
              {showPicker && (
                <div className="priority-picker">
                  <div className="picker-top">
                    <b>Choose your top 3</b>
                    <span>{priorityIds.length}/3 selected</span>
                  </div>
                  <input
                    className="search-input"
                    placeholder="Find an open task..."
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                  />
                  {pickerTasks.slice(0, 8).map(task => (
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
                  {pickerTasks.length === 0 && <div className="picker-empty">No matching open tasks available.</div>}
                  {suggestedTasks.length > 0 && priorityIds.length === 0 && (
                    <span className="eyebrow">or tap “Apply 3 priorities” above</span>
                  )}
                </div>
              )}
            </div>

            {/* Habits */}
            {sel.habits.length > 0 && (
              <div className="today-section">
                <div className="today-section-head">
                  <span className="eyebrow">habits</span>
                  <span className="today-section-count">
                    {sel.habits.filter(h => h.status === 'done').length}/{sel.habits.filter(h => h.status !== 'skipped').length}
                  </span>
                </div>
                <div className="today-list">{sel.habits.map(renderHabitRow)}</div>
              </div>
            )}

            {/* Also today */}
            {!roughDay && sel.others.length > 0 && (
              <div className="today-section">
                <div className="today-section-head">
                  <span className="eyebrow">also today</span>
                  <span className="today-section-count">{sel.others.length}</span>
                </div>
                <div className="today-list">
                  {visibleOthers.map(task => {
                    const overdue = task.status === 'todo' && task.dueDate !== '' && task.dueDate < today;
                    return overdue ? (
                      <div className="today-overdue-wrap" key={task.id}>
                        {renderTaskRow(task)}
                        <button type="button" className="move-today-btn" onClick={() => onMoveToToday(task.id)}>
                          Move to today
                        </button>
                      </div>
                    ) : (
                      renderTaskRow(task)
                    );
                  })}
                </div>
                {hiddenOthers > 0 && (
                  <button
                    type="button"
                    className="clear-priorities"
                    aria-expanded={alsoExpanded}
                    onClick={() => setAlsoExpanded(v => !v)}
                  >
                    {alsoExpanded ? 'Show fewer' : `Show ${hiddenOthers} more today items`}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        <div className="today-panel-foot">
          <button
            type="button"
            className="text-action"
            aria-expanded={showTaskManager}
            onClick={() => setShowTaskManager(v => !v)}
          >
            {showTaskManager ? 'Hide all tasks' : 'Browse all tasks'}
          </button>
          {onOpenImportPlan && hasAnything && (
            <button type="button" className="text-action" onClick={onOpenImportPlan}>Import plan</button>
          )}
        </div>
      </section>

      {showTaskManager && (
        <section className="panel tasks-panel" aria-label="All tasks">
          <div className="panel-head">
            <div><div className="eyebrow">upcoming · undated · skipped</div><h2>All tasks</h2></div>
            <Button variant="solid" onClick={onAddTask}><Plus size={15} /> Add task</Button>
          </div>

          <div className="task-tabs" role="tablist" aria-label="Filter tasks">
            {(
              [
                { id: 'today', label: 'Today', count: taskManager.dueToday.length },
                { id: 'upcoming', label: 'Upcoming', count: taskManager.upcoming.length },
                { id: 'nodate', label: 'No date', count: taskManager.undated.length },
                { id: 'all', label: 'All open', count: taskManager.allOpen.length },
                { id: 'skipped', label: 'Skipped', count: taskManager.skippedTasks.length },
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
              {visibleTabTasks.map(task => (
                <div className={cx('task-row', task.status === 'done' && 'is-done')} key={task.id}>
                  <button
                    type="button"
                    aria-label={
                      task.status === 'skipped'
                        ? `Restore ${task.title}`
                        : task.status === 'done'
                          ? `Reopen ${task.title}`
                          : `Complete ${task.title}`
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
                      {task.dueDate ? ` · ${task.dueDate === today ? 'Today' : shortDate(task.dueDate)}` : ' · No date'}
                      {task.dueDate !== '' && task.dueDate < today && task.status === 'todo' ? ' (Overdue)' : ''}
                    </small>
                  </button>
                  <span className={cx('priority-tag', task.priority)}>{task.priority}</span>
                  {task.status === 'skipped' ? (
                    <button type="button" className="move-today-btn" onClick={() => onRestoreTask(task)}>Restore</button>
                  ) : (
                    <button type="button" className="icon-btn subtle" aria-label={`Edit ${task.title}`} onClick={() => onEditTask(task.id)}>
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title={taskTab === 'today' ? 'A clear runway today.' : `No ${taskTab === 'nodate' ? 'undated' : taskTab} tasks.`}
              body={
                taskTab === 'skipped'
                  ? 'Tasks marked skipped appear here so you can restore them anytime.'
                  : 'Add a task or switch tabs to view upcoming and undated work.'
              }
              action={taskTab !== 'skipped' ? <Button variant="outline" onClick={onAddTask}><Plus size={15} /> Create task</Button> : undefined}
            />
          )}

        </section>
      )}
    </div>
  );
}
