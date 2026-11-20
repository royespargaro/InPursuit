import type { ID, Project } from '../types';

export const MAX_ACTIVE_PROJECTS = 3;

export function canActivateProject(projects: readonly Project[], projectId?: ID | null): boolean {
  if (projectId) {
    const existing = projects.find(project => project.id === projectId);
    if (existing?.status === 'active') return true;
  }
  return projects.filter(project => project.status === 'active' && project.id !== projectId).length < MAX_ACTIVE_PROJECTS;
}

export function enforceActiveProjectLimit(projects: readonly Project[]): { projects: Project[]; archivedCount: number } {
  let activeSeen = 0;
  let archivedCount = 0;
  const normalized = projects.map(project => {
    if (project.status !== 'active') return project;
    activeSeen += 1;
    if (activeSeen <= MAX_ACTIVE_PROJECTS) return project;
    archivedCount += 1;
    return { ...project, status: 'archived' as const };
  });
  return { projects: normalized, archivedCount };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function promoteDuePlannedProjects(
  projects: readonly Project[],
  today: string,
): { projects: Project[]; promotedIds: string[] } {
  if (!ISO_DATE_RE.test(today)) {
    return { projects: [...projects], promotedIds: [] };
  }

  const activeCount = projects.filter(p => p.status === 'active').length;
  const availableSlots = MAX_ACTIVE_PROJECTS - activeCount;
  if (availableSlots <= 0) {
    return { projects: [...projects], promotedIds: [] };
  }

  const dueCandidates = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => {
      if (project.status !== 'planned') return false;
      const startDate = project.startDate?.trim() ?? '';
      if (!ISO_DATE_RE.test(startDate) || startDate > today) return false;
      const dueDate = project.dueDate?.trim() ?? '';
      if (ISO_DATE_RE.test(dueDate) && dueDate < today) return false;
      return true;
    })
    .sort((a, b) => {
      const startCmp = (a.project.startDate ?? '').localeCompare(b.project.startDate ?? '');
      return startCmp !== 0 ? startCmp : a.index - b.index;
    });

  if (dueCandidates.length === 0) {
    return { projects: [...projects], promotedIds: [] };
  }

  const promoteSet = new Set(dueCandidates.slice(0, availableSlots).map(c => c.project.id));
  const promotedIds: string[] = [];
  const nextProjects = projects.map(project => {
    if (!promoteSet.has(project.id)) return project;
    promotedIds.push(project.id);
    return { ...project, status: 'active' as const };
  });

  return { projects: nextProjects, promotedIds };
}