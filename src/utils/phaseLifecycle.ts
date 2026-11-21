import type { AppData } from '../types';
import { MAX_ACTIVE_PROJECTS } from './projectLimits';

/**
 * Promote `planned` phases to `active` once their start date arrives.
 * - Respects the active-project cap.
 * - Never promotes a phase whose end date has already passed.
 * - Returns the SAME object when nothing changes so callers can cheaply detect a no-op.
 */
export function promoteDuePhases(data: AppData, today: string): AppData {
  let activeCount = data.projects.filter(p => p.status === 'active').length;
  if (activeCount >= MAX_ACTIVE_PROJECTS) return data;

  const due = data.projects
    .filter(
      p =>
        p.status === 'planned' &&
        !!p.startDate &&
        p.startDate <= today &&
        (!p.dueDate || p.dueDate >= today),
    )
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  if (due.length === 0) return data;

  const promoteIds = new Set<string>();
  for (const project of due) {
    if (activeCount >= MAX_ACTIVE_PROJECTS) break;
    promoteIds.add(project.id);
    activeCount += 1;
  }
  if (promoteIds.size === 0) return data;

  return {
    ...data,
    projects: data.projects.map(p => (promoteIds.has(p.id) ? { ...p, status: 'active' as const } : p)),
  };
}
