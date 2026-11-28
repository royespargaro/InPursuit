import type { AppData, Goal, Project, Task } from '../types';

export interface DailyBriefing {
  focusTask: Task | null;
  project: Project | null;
  goal: Goal | null;
  overdueCount: number;
  habitCompletion: number;
  completedHabits: number;
  scheduledHabits: number;
  recommendation: 'resolve_overdue' | 'protect_focus' | 'choose_focus';
}

/**
 * Builds a small daily briefing from user-selected priorities and canonical
 * workspace data. It never invents a priority or treats activity as an outcome.
 */
export function buildDailyBriefing(
  data: AppData,
  priorityTasks: Task[],
  overdueTasks: Task[],
  completedHabits: number,
  scheduledHabits: number,
): DailyBriefing {
  const focusTask = priorityTasks.find((task) => task.status !== 'done') ?? null;
  const project = focusTask?.projectId
    ? data.projects.find((item) => item.id === focusTask.projectId) ?? null
    : null;
  const goal: Goal | null = project?.goalId
    ? data.goals.find((item) => item.id === project.goalId) ?? null
    : null;
  const safeScheduled = Math.max(0, scheduledHabits);
  const safeCompleted = Math.max(0, Math.min(completedHabits, safeScheduled));
  return {
    focusTask,
    project,
    goal,
    overdueCount: overdueTasks.length,
    habitCompletion: safeScheduled === 0 ? 0 : Math.round((safeCompleted / safeScheduled) * 100),
    completedHabits: safeCompleted,
    scheduledHabits: safeScheduled,
    recommendation: overdueTasks.length > 0
      ? 'resolve_overdue'
      : focusTask
        ? 'protect_focus'
        : 'choose_focus',
  };
}
