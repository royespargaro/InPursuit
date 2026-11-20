import { describe, expect, it } from 'vitest';
import type { Project } from '../types';
import { canActivateProject, MAX_ACTIVE_PROJECTS, promoteDuePlannedProjects } from '../utils/projectLimits';

const project = (id: string, status: Project['status'] = 'active', startDate?: string, dueDate = ''): Project => ({
  id,
  goalId: null,
  title: `Project ${id}`,
  description: '',
  dueDate,
  status,
  ...(startDate ? { startDate } : {}),
  createdAt: '',
});

describe('projectLimits', () => {
  it('allows active projects below the cap', () => {
    expect(canActivateProject(Array.from({ length: MAX_ACTIVE_PROJECTS - 1 }, (_, index) => project(String(index))))).toBe(true);
  });

  it('blocks new active projects at the cap', () => {
    expect(canActivateProject(Array.from({ length: MAX_ACTIVE_PROJECTS }, (_, index) => project(String(index))))).toBe(false);
  });

  it('allows editing a project that already occupies an active slot', () => {
    const projects = Array.from({ length: MAX_ACTIVE_PROJECTS }, (_, index) => project(String(index)));
    expect(canActivateProject(projects, projects[0].id)).toBe(true);
  });

  it('promotes planned projects whose startDate has arrived up to the 3-active cap', () => {
    const today = '2026-11-20';
    const items: Project[] = [
      project('active-1', 'active', '2026-11-01', '2026-12-01'),
      project('active-2', 'active', '2026-11-05', '2026-12-05'),
      project('future-planned', 'planned', '2026-12-01', '2026-12-31'),
      project('expired-planned', 'planned', '2026-10-01', '2026-10-31'),
      project('due-later', 'planned', '2026-11-20', '2026-12-20'),
      project('due-earlier', 'planned', '2026-11-18', '2026-12-18'),
    ];

    // 2 active -> only 1 slot remaining -> earliest eligible planned project ('due-earlier') promoted
    const { projects: promotedOnce, promotedIds } = promoteDuePlannedProjects(items, today);
    expect(promotedIds).toEqual(['due-earlier']);
    expect(promotedOnce.find(p => p.id === 'due-earlier')?.status).toBe('active');
    expect(promotedOnce.find(p => p.id === 'due-later')?.status).toBe('planned');
    expect(promotedOnce.find(p => p.id === 'future-planned')?.status).toBe('planned');
    expect(promotedOnce.find(p => p.id === 'expired-planned')?.status).toBe('planned');
    expect(promotedOnce.filter(p => p.status === 'active')).toHaveLength(3);

    // Already at cap (3 active) -> no further promotion
    const secondRun = promoteDuePlannedProjects(promotedOnce, today);
    expect(secondRun.promotedIds).toEqual([]);
    expect(secondRun.projects.find(p => p.id === 'due-later')?.status).toBe('planned');
  });
});