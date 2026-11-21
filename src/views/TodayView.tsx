import { useMemo, useState } from 'react';
import { FilmHeader, type HeroGoalSummary } from '../components/FilmHeader';
import { OnboardingCard, type StarterTemplateOption } from '../components/OnboardingCard';
import {
  Activity, ArrowDown, ArrowUp, ArrowUpRight, Check, Flag, FolderKanban, Plus, RotateCcw, Sparkles, Target, X,
} from '../components/Icon';
import { Button, cx, Empty, prettyDate, Progress, shortDate } from '../components/ui';
import type { AppData, Habit, PlanImportRecord, Task } from '../types';
import { getTodayHabitCount, getWeeklyHabitCount } from '../utils/habitUtils';
import { getGoalProgress } from '../utils/intelligence';
import { MAX_ACTIVE_PROJECTS } from '../utils/projectLimits';
import { buildTodaySchedule } from '../utils/todayScheduler';

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
  lastImportRecord,
  onUndoImport,
}: TodayViewProps) {
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
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const projectName = (id: string | null) => data.projects.find(p => p.id === id)?.title ?? 'Personal';

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

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top"><span>Daily progress</span><Activity size={16} /></div>
          <div className="stat-value">{completion}<small>%</small></div>
          <Progress value={completion} />
          <div className="stat-foot">{doneActions} of {totalActions} actions completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Priority wins</span><Flag size={16} /></div>
          <div className="stat-value">{priorityTasks.filter(t => t.status === 'done').length}<small>/{priorityTasks.length}</small></div>
          <div className="stat-foot">Your three most important outcomes</div>
          <div className="stat-mini"><span style={{ width: `${priorityTasks.length ? (priorityTasks.filter(t => t.status === 'done').length / priorityTasks.length) * 100 : 0}%` }} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Active projects</span><FolderKanban size={16} /></div>
          <div className="stat-value">{data.projects.filter(p => p.status === 'active').length.toString().padStart(2, '0')}</div>
          <div className="stat-foot">{data.tasks.filter(t => t.status === 'todo').length} open tasks across your projects</div>
          <div className="stat-quiet"><span />Max {MAX_ACTIVE_PROJECTS} active for focus</div>
        </div>
      </div>

      <section className="panel today-queue-panel" aria-label="Today's execution queue">
        <div className="panel-head">
          <div>
            <div className="eyebrow">auto-scheduled · {schedule.weekStart} to {schedule.weekEnd}</div>
            <h2>Today&apos;s focus queue</h2>
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
            {onOpenImportPlan && (
              <Button variant="outline" onClick={onOpenImportPlan}>
                <Sparkles size={14} /> Import plan
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
                const metaParts: string[] = ['Habit'];
                if (!roughDay) {
                  if (isWeeklyCount && habit.targetCount) {
                    metaParts.push(`${weeklyCount}/${habit.targetCount} this week`);
                  } else if (habit.cadence === 'specific_days' && habit.days?.length) {
                    metaParts.push(habit.days.join(', '));
                  } else {
                    metaParts.push(habit.frequency);
                  }
                  if (habit.timeBlock) metaParts.push(`${habit.timeBlock.start}–${habit.timeBlock.end}`);
                  if (habit.minimumVersion) metaParts.push(`Min: ${habit.minimumVersion}`);
                }

                return (
                  <div className={cx('task-row', done && !isWeeklyCount && 'is-done')} key={item.key}>
                    <button
                      type="button"
                      aria-label={done && !isWeeklyCount ? `Uncheck ${habit.name}` : `Check ${habit.name}`}
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
                        {habit.targetCount && (
                          <span className="weekly-counter">
                            {weeklyCount}/{habit.targetCount}
                            {todayCount > 0 ? ` (${todayCount} today)` : ''}
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
                ? `Overdue · ${shortDate(task.dueDate)}`
                : task.dueDate === today
                  ? 'Due today'
                  : isActivePhase && task.dueDate
                    ? `Active phase · ${shortDate(task.dueDate)}`
                    : isActivePhase
                      ? 'Active phase · Undated'
                      : task.dueDate
                        ? shortDate(task.dueDate)
                        : 'Undated';

              const hasTargetQty = typeof task.targetQuantity === 'number' && task.targetQuantity > 0;
              const completedQty = hasTargetQty
                ? Math.max(0, task.completedQuantity ?? (task.status === 'done' ? task.targetQuantity! : 0))
                : 0;
              const metaParts = [projectName(task.projectId), scheduleNote, `${task.priority} priority`];
              if (hasTargetQty) metaParts.push(`${completedQty}/${task.targetQuantity}`);

              return (
                <div className={cx('task-row', done && 'is-done')} key={item.key}>
                  <button
                    type="button"
                    aria-label={done ? `Uncheck ${task.title}` : `Check ${task.title}`}
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
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Nothing scheduled for today yet."
            body="Tasks from your active phase, overdue work, and habits scheduled today appear here automatically."
            action={onOpenImportPlan ? <Button variant="outline" onClick={onOpenImportPlan}><Sparkles size={14} /> Import a plan</Button> : undefined}
          />
        )}
        {hiddenQueueCount > 0 && (
          <button
            type="button"
            className="clear-priorities"
            aria-expanded={queueExpanded}
            onClick={() => setQueueExpanded(v => !v)}
          >
            {queueExpanded ? `Collapse to top ${TODAY_QUEUE_CAP}` : `Show ${hiddenQueueCount} more today items`}
          </button>
        )}
      </section>

      <div className="today-columns">
        <section className="panel priorities-panel">
          <div className="panel-head">
            <div><div className="eyebrow">the essential</div><h2>Today&apos;s priorities</h2></div>
            <span className="count-pill">{priorityTasks.length}/3</span>
          </div>
          {priorityTasks.length ? (
            <div className="priority-list">
              {priorityTasks.map((task, index) => (
                <div className={cx('priority-row', task.status === 'done' && 'is-done')} key={task.id}>
                  <button
                    type="button"
                    aria-label={task.status === 'done' ? `Reopen ${task.title}` : `Complete ${task.title}`}
                    className={cx('check-control', task.status === 'done' && 'checked')}
                    onClick={() => onToggleTask(task)}
                  >
                    {task.status === 'done' && <Check size={14} />}
                  </button>
                  <span className="priority-number">0{index + 1}</span>
                  <button type="button" className="task-title-button" onClick={() => onEditTask(task.id)}>
                    <b>{task.title}</b>
                    <small>
                      {projectName(task.projectId)} · {task.priority} priority
                      {task.dueDate && task.dueDate !== today ? ` · ${shortDate(task.dueDate)}` : ''}
                    </small>
                  </button>
                  {priorityTasks.length > 1 && (
                    <div className="priority-reorder">
                      <button
                        type="button"
                        className="icon-btn subtle"
                        disabled={index === 0}
                        aria-label={`Move ${task.title} higher`}
                        title="Move up"
                        onClick={() => movePriority(index, -1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn subtle"
                        disabled={index === priorityTasks.length - 1}
                        aria-label={`Move ${task.title} lower`}
                        title="Move down"
                        onClick={() => movePriority(index, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="icon-btn subtle"
                    title="Remove from today's priorities"
                    aria-label={`Remove ${task.title} from priorities`}
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
              <p>Nothing is in your top three yet.</p>
              <span>Pick up to three tasks that would make today count.</span>
            </div>
          )}

          {priorityIds.length < 3 && suggestedPriorityTasks.length > 0 && (
            <div className="priority-suggestions" aria-label="Suggested top 3 priorities">
              <div className="priority-suggestions-head">
                <span className="eyebrow">suggested from overdue · today · active phase</span>
                <button type="button" className="text-action" onClick={applySuggestedPriorities}>
                  {priorityIds.length === 0 ? 'Apply 3 priorities' : 'Fill top 3'}
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
                    <small>{task.dueDate ? shortDate(task.dueDate) : 'Active phase'}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="panel-foot">
            <Button variant="outline" onClick={() => setShowPriorityPicker(v => !v)}>
              <Plus size={15} />{showPriorityPicker ? 'Done selecting' : 'Set priorities'}
            </Button>
            <span>Limit yourself to three.</span>
          </div>
          {showPriorityPicker && (
            <div className="priority-picker">
              <div className="picker-top">
                <b>Choose your priorities</b>
                <span>{priorityIds.length}/3 selected</span>
              </div>
              <input
                className="search-input"
                placeholder="Find an open task..."
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
              {available.length === 0 && <div className="picker-empty">No matching open tasks available.</div>}
              {priorityIds.length > 0 && (
                <button type="button" className="clear-priorities" onClick={() => onPriorities([])}>
                  Clear today&apos;s priorities
                </button>
              )}
            </div>
          )}
        </section>

        <section className="panel habits-panel" aria-label="Habits">
          <div className="panel-head">
            <div><div className="eyebrow">{roughDay ? 'rough day · minimum versions' : 'show up daily'}</div><h2>Habits</h2></div>
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
                      ? 'done'
                      : skipped
                        ? 'skipped'
                        : 'open';
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
                            aria-label={`Undo one ${habit.name} log today`}
                            onClick={() => onDecrementHabit(habit)}
                          >
                            -1
                          </button>
                        )}
                        <button
                          type="button"
                          className="habit-mini-btn"
                          aria-label={`Add completion for ${habit.name}`}
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
                        title={skipped ? 'Undo skip' : 'Skip for today without breaking streak'}
                        aria-label={skipped ? `Undo skip for ${habit.name}` : `Skip ${habit.name} today`}
                        onClick={() => onToggleSkipHabit(habit)}
                      >
                        {skipped ? 'Undo' : 'Skip'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title="No scheduled habits today" body="Add repeatable actions or check your habit schedule in Habits." />
          )}
          <div className="habits-progress">
            <Progress value={scheduledHabitsCount ? (doneHabits / scheduledHabitsCount) * 100 : 0} />
            <span>{scheduledHabitsCount ? Math.round((doneHabits / scheduledHabitsCount) * 100) : 0}% complete</span>
          </div>
        </section>
      </div>

      <section className="panel tasks-panel">
        <div className="panel-head">
          <div><div className="eyebrow">make progress visible</div><h2>Tasks</h2></div>
          <Button variant="solid" onClick={onAddTask}><Plus size={15} /> Add task</Button>
        </div>

        <div className="task-tabs" role="tablist" aria-label="Filter tasks">
          {(
            [
              { id: 'today', label: 'Today', count: todayTasks.length },
              { id: 'upcoming', label: 'Upcoming', count: upcomingTasks.length },
              { id: 'nodate', label: 'No date', count: undatedTasks.length },
              { id: 'all', label: 'All open', count: allOpenTasks.length },
              { id: 'skipped', label: 'Skipped', count: skippedTasks.length },
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
                  {hasTargetQty && task.status !== 'skipped' && (
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
                  <span className={cx('priority-tag', task.priority)}>{task.priority}</span>
                  {task.status === 'skipped' ? (
                    <button type="button" className="move-today-btn" onClick={() => onRestoreTask(task)}>
                      Restore
                    </button>
                  ) : (
                    <button type="button" className="icon-btn subtle" aria-label={`Edit ${task.title}`} onClick={() => onEditTask(task.id)}>
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </div>
              );
            })}
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

        {overdueTasks.length > 0 && (
          <div className="overdue-block">
            <div className="overdue-head">
              <span className="eyebrow">overdue · carry forward or complete</span>
              <span className="overdue-count">{overdueTasks.length}</span>
            </div>
            {displayedOverdue.map(task => (
              <div className="task-row overdue-row" key={task.id}>
                <button
                  type="button"
                  aria-label={`Complete overdue task ${task.title}`}
                  className="check-control"
                  onClick={() => onToggleTask(task)}
                />
                <button type="button" className="task-title-button" onClick={() => onEditTask(task.id)}>
                  <b>{task.title}</b>
                  <small>{projectName(task.projectId)} · due {shortDate(task.dueDate)}</small>
                </button>
                <button type="button" className="move-today-btn" onClick={() => onMoveToToday(task.id)}>
                  Move to today
                </button>
              </div>
            ))}
            {overdueTasks.length > 6 && (
              <button
                type="button"
                className="clear-priorities"
                onClick={() => setShowAllOverdue(v => !v)}
              >
                {showAllOverdue ? 'Show fewer overdue tasks' : `Show all ${overdueTasks.length} overdue tasks`}
              </button>
            )}
          </div>
        )}
      </section>

      <div className="today-bottom">
        <span><span className="status-dot" /> {dailyTasksDone} tasks completed today</span>
        <button type="button" onClick={onReview}>Reflect on today <ArrowUpRight size={14} /></button>
      </div>
    </div>
  );
}
