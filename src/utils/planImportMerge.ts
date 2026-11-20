import { createId } from '../services/appStore';
import type {
  AppData,
  Extraction,
  ExtractionHabit,
  Goal,
  Habit,
  PlanImportRecord,
  PlanPrinciple,
  Project,
  SuccessCriterion,
  Task,
  WeekdayKey,
} from '../types';
import { MAX_ACTIVE_PROJECTS } from './projectLimits';

const WEEKDAY_SET = new Set<WeekdayKey>(['mon', 'tue', 'wed', 'thu', 'fri']);
const WEEKEND_SET = new Set<WeekdayKey>(['sat', 'sun']);
const LAST_IMPORT_KEY_PREFIX = 'inpursuit.last_import.v1.';

function normKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function inferLegacyHabitFrequency(habit: Pick<ExtractionHabit, 'cadence' | 'days'>): Habit['frequency'] {
  if (habit.cadence === 'specific_days' && habit.days && habit.days.length > 0) {
    const unique = [...new Set(habit.days)];
    if (unique.length === 5 && unique.every(d => WEEKDAY_SET.has(d))) return 'weekdays';
    if (unique.length === 2 && unique.every(d => WEEKEND_SET.has(d))) return 'weekends';
  }
  return 'daily';
}

function isPhaseCurrent(start: string, end: string, today: string): boolean {
  if (start && start > today) return false;
  if (end && end < today) return false;
  return true;
}

export interface ApplyImportedPlanResult {
  nextData: AppData;
  record: PlanImportRecord;
}

export function applyImportedPlanToWorkspace(
  current: AppData,
  draft: Extraction,
  options: { today: string; importId?: string; nowIso?: string },
): ApplyImportedPlanResult {
  const importId = options.importId ?? `imp-${createId()}`;
  const nowIso = options.nowIso ?? new Date().toISOString();
  const today = options.today;

  const nextGoals: Goal[] = current.goals.map(goal => ({
    ...goal,
    successCriteria: goal.successCriteria ? [...goal.successCriteria] : undefined,
    principles: goal.principles ? [...goal.principles] : undefined,
  }));
  const nextProjects: Project[] = [...current.projects];
  const nextHabits: Habit[] = [...current.habits];
  const nextTasks: Task[] = [...current.tasks];

  const goalByTitle = new Map<string, Goal>();
  for (const goal of nextGoals) {
    goalByTitle.set(normKey(goal.title), goal);
  }

  const projectByTitle = new Map<string, Project>();
  for (const project of nextProjects) {
    projectByTitle.set(normKey(project.title), project);
  }

  const existingHabitNames = new Set(nextHabits.map(h => normKey(h.name)));
  const existingTaskKeys = new Set(
    nextTasks.map(t => `${normKey(t.title)}::${t.dueDate}::${t.projectId ?? ''}`),
  );

  let goalsAdded = 0;
  let phasesAdded = 0;
  let habitsAdded = 0;
  let tasksAdded = 0;
  let successCriteriaAdded = 0;
  let principlesAdded = 0;
  let deduped = 0;

  for (const item of draft.goals) {
    const key = normKey(item.title);
    if (!key) continue;
    const existing = goalByTitle.get(key);
    if (existing) {
      deduped += 1;
      continue;
    }

    const goal: Goal = {
      id: createId(),
      lifeAreaId: null,
      title: item.title.trim(),
      outcome: item.description?.trim() ?? '',
      targetDate: '',
      status: 'active',
      createdAt: nowIso,
      ...(typeof item.pillar_weight_pct === 'number' ? { pillarWeightPct: item.pillar_weight_pct } : {}),
      importId,
      sourceQuote: item.source_quote,
    };
    nextGoals.push(goal);
    goalByTitle.set(key, goal);
    goalsAdded += 1;
  }

  const resolveGoalId = (goalRef?: string): string | null => {
    if (goalRef) {
      const exact = goalByTitle.get(normKey(goalRef));
      if (exact) return exact.id;
      const partial = nextGoals.find(g => normKey(g.title).includes(normKey(goalRef)) || normKey(goalRef).includes(normKey(g.title)));
      if (partial) return partial.id;
    }
    return nextGoals.find(g => g.importId === importId)?.id ?? nextGoals.find(g => g.status === 'active')?.id ?? null;
  };

  let activeProjectCount = nextProjects.filter(p => p.status === 'active').length;
  for (const item of draft.phases) {
    const key = normKey(item.title);
    if (!key) continue;
    if (projectByTitle.has(key)) {
      deduped += 1;
      continue;
    }

    const activeEligible = isPhaseCurrent(item.start, item.end, today) && activeProjectCount < MAX_ACTIVE_PROJECTS;
    const status: Project['status'] = activeEligible ? 'active' : 'planned';
    if (status === 'active') activeProjectCount += 1;

    const project: Project = {
      id: createId(),
      goalId: resolveGoalId(),
      title: item.title.trim(),
      description: [item.theme?.trim(), item.exit_condition?.trim() ? `Exit: ${item.exit_condition.trim()}` : '']
        .filter(Boolean)
        .join(' · '),
      dueDate: item.end || '',
      status,
      createdAt: nowIso,
      ...(item.start ? { startDate: item.start } : {}),
      ...(item.theme?.trim() ? { theme: item.theme.trim() } : {}),
      ...(item.exit_condition?.trim() ? { exitCondition: item.exit_condition.trim() } : {}),
      isPhase: true,
      importId,
      sourceQuote: item.source_quote,
    };
    nextProjects.push(project);
    projectByTitle.set(key, project);
    phasesAdded += 1;
  }

  const resolveProjectId = (phaseRef?: string): string | null => {
    if (phaseRef) {
      const exact = projectByTitle.get(normKey(phaseRef));
      if (exact) return exact.id;
      const partial = nextProjects.find(
        p => normKey(p.title).includes(normKey(phaseRef)) || normKey(phaseRef).includes(normKey(p.title)),
      );
      if (partial) return partial.id;
    }
    return null;
  };

  for (const item of draft.habits) {
    const key = normKey(item.title);
    if (!key) continue;
    if (existingHabitNames.has(key)) {
      deduped += 1;
      continue;
    }

    const goalId = item.goal_ref ? resolveGoalId(item.goal_ref) : null;
    const habit: Habit = {
      id: createId(),
      name: item.title.trim(),
      frequency: inferLegacyHabitFrequency(item),
      active: true,
      createdAt: nowIso,
      cadence: item.cadence,
      ...(typeof item.target_count === 'number' ? { targetCount: item.target_count } : {}),
      ...(item.days?.length ? { days: [...new Set(item.days)] } : {}),
      ...(item.time_block ? { timeBlock: { start: item.time_block.start, end: item.time_block.end } } : {}),
      ...(item.minimum_version?.trim() ? { minimumVersion: item.minimum_version.trim() } : {}),
      ...(goalId ? { goalId } : {}),
      importId,
      sourceQuote: item.source_quote,
    };
    nextHabits.push(habit);
    existingHabitNames.add(key);
    habitsAdded += 1;
  }

  for (const item of draft.tasks) {
    const title = item.title.trim();
    if (!title) continue;
    const projectId = resolveProjectId(item.phase_ref);
    const dueDate = item.due?.trim() ?? '';
    const dedupeKey = `${normKey(title)}::${dueDate}::${projectId ?? ''}`;
    const looseKey = `${normKey(title)}::${dueDate}::`;
    if (existingTaskKeys.has(dedupeKey) || (!projectId && existingTaskKeys.has(looseKey))) {
      deduped += 1;
      continue;
    }

    const task: Task = {
      id: createId(),
      projectId,
      title,
      dueDate,
      priority: 'medium',
      status: 'todo',
      createdAt: nowIso,
      completedAt: null,
      ...(typeof item.target_quantity === 'number' ? { targetQuantity: item.target_quantity } : {}),
      importId,
      sourceQuote: item.source_quote,
    };
    nextTasks.push(task);
    existingTaskKeys.add(dedupeKey);
    tasksAdded += 1;
  }

  const ensureGoalTarget = (goalRef?: string): Goal | undefined => {
    const resolvedId = resolveGoalId(goalRef);
    return (resolvedId ? nextGoals.find(g => g.id === resolvedId) : undefined) ?? nextGoals[0];
  };

  for (const item of draft.success_criteria) {
    const text = item.text.trim();
    if (!text) continue;
    const targetGoal = ensureGoalTarget(item.goal_ref);
    if (!targetGoal) continue;

    const existing = targetGoal.successCriteria ?? [];
    if (existing.some(c => normKey(c.text) === normKey(text))) {
      deduped += 1;
      continue;
    }

    const criterion: SuccessCriterion = {
      id: createId(),
      text,
      done: false,
      importId,
      sourceQuote: item.source_quote,
    };
    targetGoal.successCriteria = [...existing, criterion];
    successCriteriaAdded += 1;
  }

  for (const item of draft.principles) {
    const text = item.text.trim();
    if (!text) continue;
    const targetGoal = ensureGoalTarget();
    if (!targetGoal) continue;

    const existing = targetGoal.principles ?? [];
    if (existing.some(p => normKey(p.text) === normKey(text))) {
      deduped += 1;
      continue;
    }

    const principle: PlanPrinciple = {
      id: createId(),
      text,
      importId,
      sourceQuote: item.source_quote,
    };
    targetGoal.principles = [...existing, principle];
    principlesAdded += 1;
  }

  return {
    nextData: {
      ...current,
      goals: nextGoals,
      projects: nextProjects,
      habits: nextHabits,
      tasks: nextTasks,
    },
    record: {
      importId,
      importedAt: nowIso,
      counts: {
        goals: goalsAdded,
        phases: phasesAdded,
        habits: habitsAdded,
        tasks: tasksAdded,
        successCriteria: successCriteriaAdded,
        principles: principlesAdded,
        deduped,
      },
    },
  };
}

export function undoImportedPlan(current: AppData, importId: string): AppData {
  if (!importId) return current;

  const removedGoalIds = new Set(current.goals.filter(g => g.importId === importId).map(g => g.id));
  const removedProjectIds = new Set(current.projects.filter(p => p.importId === importId).map(p => p.id));
  const removedTaskIds = new Set(current.tasks.filter(t => t.importId === importId).map(t => t.id));
  const removedHabitIds = new Set(current.habits.filter(h => h.importId === importId).map(h => h.id));

  const nextGoals = current.goals
    .filter(g => g.importId !== importId)
    .map(goal => ({
      ...goal,
      ...(goal.successCriteria
        ? { successCriteria: goal.successCriteria.filter(c => c.importId !== importId) }
        : {}),
      ...(goal.principles ? { principles: goal.principles.filter(p => p.importId !== importId) } : {}),
    }));

  const nextProjects = current.projects
    .filter(p => p.importId !== importId)
    .map(p => (p.goalId && removedGoalIds.has(p.goalId) ? { ...p, goalId: null } : p));

  const nextTasks = current.tasks
    .filter(t => t.importId !== importId)
    .map(t => (t.projectId && removedProjectIds.has(t.projectId) ? { ...t, projectId: null } : t));

  const nextHabits = current.habits
    .filter(h => h.importId !== importId)
    .map(h => (h.goalId && removedGoalIds.has(h.goalId) ? { ...h, goalId: null } : h));

  const nextHabitLogs = current.habitLogs.filter(l => !removedHabitIds.has(l.habitId));
  const nextDailyPlans = current.dailyPlans.map(plan => ({
    ...plan,
    priorityTaskIds: plan.priorityTaskIds.filter(id => !removedTaskIds.has(id)),
  }));

  return {
    ...current,
    goals: nextGoals,
    projects: nextProjects,
    tasks: nextTasks,
    habits: nextHabits,
    habitLogs: nextHabitLogs,
    dailyPlans: nextDailyPlans,
  };
}

export function workspaceHasImportId(data: AppData, importId: string): boolean {
  if (!importId) return false;
  if (data.goals.some(g => g.importId === importId)) return true;
  if (data.projects.some(p => p.importId === importId)) return true;
  if (data.tasks.some(t => t.importId === importId)) return true;
  if (data.habits.some(h => h.importId === importId)) return true;
  if (data.goals.some(g => g.successCriteria?.some(c => c.importId === importId))) return true;
  if (data.goals.some(g => g.principles?.some(p => p.importId === importId))) return true;
  return false;
}

export function readLastImportRecord(scope: string): PlanImportRecord | null {
  try {
    const raw = localStorage.getItem(`${LAST_IMPORT_KEY_PREFIX}${scope}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlanImportRecord;
    if (!parsed || typeof parsed.importId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastImportRecord(scope: string, record: PlanImportRecord | null): void {
  try {
    const key = `${LAST_IMPORT_KEY_PREFIX}${scope}`;
    if (!record) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Ignore storage quota errors
  }
}
