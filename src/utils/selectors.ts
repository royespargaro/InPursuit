import type { AppData, Goal, Habit, Project, Task } from '../types';
import { getTodayHabitCount, getWeeklyHabitCount } from './habitUtils';
import { getGoalProgress, type GoalProgress } from './intelligence';
import { buildTodaySchedule, type TodaySchedule } from './todayScheduler';

/**
 * Single source of truth for derived "what do I do now" data.
 * Today, Habits, Goals, Projects and the hero all read through these helpers
 * so the same tick is counted the same way on every page.
 */

export type TodayHabitStatus = 'done' | 'skipped' | 'open';

export interface TodayHabitItem {
  habit: Habit;
  status: TodayHabitStatus;
  weeklyCount: number;
  todayCount: number;
}

export interface TodaySelection {
  schedule: TodaySchedule;
  top3: Task[];
  habits: TodayHabitItem[];
  /** Scheduled tasks that are not already in the Top 3, open ones first. */
  others: Task[];
  /** Tasks that count toward the daily progress (overdue or due today). */
  committedOtherIds: Set<string>;
  suggestedIds: string[];
  done: number;
  total: number;
  percent: number;
}

function otherBucket(task: Task, today: string, activePhaseIds: Set<string>): number {
  if (task.dueDate !== '' && task.dueDate < today) return 0; // overdue
  if (task.dueDate === today) return 1; // due today
  if (task.projectId && activePhaseIds.has(task.projectId) && task.dueDate !== '') return 2; // this week, active phase
  return 3; // active phase, undated
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function getHabitTodayStatus(data: AppData, habitId: string, today: string): TodayHabitStatus {
  let skipped = false;
  for (const log of data.habitLogs) {
    if (log.habitId !== habitId || log.date !== today) continue;
    if (log.status === 'done') return 'done';
    if (log.status === 'skipped') skipped = true;
  }
  return skipped ? 'skipped' : 'open';
}

export function selectToday(data: AppData, today: string): TodaySelection {
  const schedule = buildTodaySchedule(data, today);
  const activePhaseIds = new Set(schedule.activePhaseProjects.map(p => p.id));

  const priorityIds = data.dailyPlans.find(p => p.date === today)?.priorityTaskIds ?? [];
  const top3 = priorityIds
    .map(id => data.tasks.find(t => t.id === id))
    .filter((t): t is Task => !!t && t.status !== 'skipped')
    .slice(0, 3);
  const top3Ids = new Set(top3.map(t => t.id));

  const habits: TodayHabitItem[] = schedule.scheduledHabits.map(habit => ({
    habit,
    status: getHabitTodayStatus(data, habit.id, today),
    weeklyCount: getWeeklyHabitCount(habit.id, data.habitLogs, today),
    todayCount: getTodayHabitCount(habit.id, data.habitLogs, today),
  }));

  const others = schedule.scheduledTasks
    .filter(t => !top3Ids.has(t.id))
    .sort((a, b) => {
      const doneDiff = Number(a.status === 'done') - Number(b.status === 'done');
      if (doneDiff !== 0) return doneDiff;
      const bucketDiff = otherBucket(a, today, activePhaseIds) - otherBucket(b, today, activePhaseIds);
      if (bucketDiff !== 0) return bucketDiff;
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });

  // Only overdue / due-today tasks are "committed". Undated active-phase tasks are optional extras.
  const committedOtherIds = new Set(
    others.filter(t => t.dueDate !== '' && t.dueDate <= today).map(t => t.id),
  );

  const activeHabitItems = habits.filter(h => h.status !== 'skipped');
  const committedOthers = others.filter(t => committedOtherIds.has(t.id));
  const total = top3.length + activeHabitItems.length + committedOthers.length;
  const done =
    top3.filter(t => t.status === 'done').length +
    activeHabitItems.filter(h => h.status === 'done').length +
    committedOthers.filter(t => t.status === 'done').length;

  const existing = new Set(priorityIds);
  const suggestedIds = schedule.suggestedPriorityIds.filter(id => !existing.has(id));

  return {
    schedule,
    top3,
    habits,
    others,
    committedOtherIds,
    suggestedIds,
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function selectGoalProgress(data: AppData, goal: Goal): GoalProgress {
  return getGoalProgress(goal, data.projects, data.tasks);
}

export function selectPhaseProgress(data: AppData, project: Project): { done: number; total: number; percent: number } {
  const tasks = data.tasks.filter(t => t.projectId === project.id && t.status !== 'skipped');
  const done = tasks.filter(t => t.status === 'done').length;
  return { done, total: tasks.length, percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100) };
}

/** Human labels for a task: which goal/phase it belongs to. */
export function selectTaskContext(data: AppData, task: Task): { phase: string | null; goal: string | null } {
  const project = task.projectId ? data.projects.find(p => p.id === task.projectId) : undefined;
  const goal = project?.goalId ? data.goals.find(g => g.id === project.goalId) : undefined;
  return { phase: project?.title ?? null, goal: goal?.title ?? null };
}
