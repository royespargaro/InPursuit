import type { AppData, Habit, Priority, Project, Task } from '../types';
import { isHabitScheduledOnDate, shiftDateKey } from './habitUtils';

export interface TodaySchedule {
  weekStart: string;
  weekEnd: string;
  activePhaseProjects: Project[];
  scheduledHabits: Habit[];
  scheduledTasks: Task[];
  suggestedPriorityIds: string[];
}

const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function getWeekBounds(todayStr: string): { weekStart: string; weekEnd: string } {
  const baseDate = new Date(`${todayStr}T12:00:00`);
  const mondayOffset = (baseDate.getDay() + 6) % 7;
  const weekStart = shiftDateKey(todayStr, -mondayOffset);
  const weekEnd = shiftDateKey(weekStart, 6);
  return { weekStart, weekEnd };
}

export function getActivePhaseProjects(projects: readonly Project[], today: string): Project[] {
  return projects.filter(
    project => project.status === 'active' && (!project.startDate || project.startDate <= today),
  );
}

export function buildTodaySchedule(data: AppData, today: string): TodaySchedule {
  const { weekStart, weekEnd } = getWeekBounds(today);
  const activePhaseProjects = getActivePhaseProjects(data.projects, today);
  const activePhaseIds = new Set(activePhaseProjects.map(p => p.id));

  const scheduledHabits = data.habits.filter(h => h.active && isHabitScheduledOnDate(h, today));

  const scheduledTasks = data.tasks.filter(task => {
    if (task.status === 'skipped') return false;
    if (task.dueDate === today) return true;
    if (task.status === 'todo' && task.dueDate !== '' && task.dueDate < today) return true;
    if (task.projectId && activePhaseIds.has(task.projectId)) {
      if (task.dueDate === '') return true;
      if (task.dueDate >= weekStart && task.dueDate <= weekEnd) return true;
    }
    return false;
  });

  const bucketRank = (task: Task): number => {
    if (task.dueDate !== '' && task.dueDate < today) return 0; // overdue
    if (task.dueDate === today) return 1; // due today
    if (task.projectId && activePhaseIds.has(task.projectId) && task.dueDate !== '') return 2; // active phase due this week
    if (task.projectId && activePhaseIds.has(task.projectId)) return 3; // active phase undated
    return 4;
  };

  const openCandidates = scheduledTasks
    .filter(task => task.status === 'todo')
    .sort((a, b) => {
      const bucketDiff = bucketRank(a) - bucketRank(b);
      if (bucketDiff !== 0) return bucketDiff;
      const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });

  const suggestedPriorityIds = openCandidates.slice(0, 3).map(task => task.id);

  return {
    weekStart,
    weekEnd,
    activePhaseProjects,
    scheduledHabits,
    scheduledTasks,
    suggestedPriorityIds,
  };
}
