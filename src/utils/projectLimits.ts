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