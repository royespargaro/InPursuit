import type {
  AppData,
  BackupEnvelope,
  DailyPlan,
  DailyReview,
  Habit,
  HabitLog,
  LifeArea,
  Priority,
  Project,
  ProjectStatus,
  PersonalOSData,
  Status,
  SyncMeta,
  TaskStatus,
  WorkspaceMetaV4,
  WorkspaceSummary,
} from '../types';
import { localDateKey } from '../utils/habitUtils';
import { enforceActiveProjectLimit, MAX_ACTIVE_PROJECTS } from '../utils/projectLimits';

export const STORAGE_KEY = 'habitloop.execution.v2';
export const LEGACY_KEY = 'habitmatrix.v1';
export const RECOVERY_KEY = `${STORAGE_KEY}.recovery`;
export const ACCOUNT_KEY_PREFIX = 'inpursuit.account.v3.';
export const SYNC_META_PREFIX = 'inpursuit.syncmeta.v3.';
export const SYNC_BASE_PREFIX = 'inpursuit.syncbase.v3.';
export const GUEST_DIRTY_KEY = 'inpursuit.guest_dirty.v1';
export const LOCAL_MODE_STORAGE_KEY = 'inpursuit.local_mode';
export const ONBOARDING_KEY_PREFIX = 'inpursuit.onboarding.v1.';
export const ACCOUNT_DELETION_STATE_KEY = 'inpursuit.deletion_state.v1';

let recoveryNotice = '';

export const WORKSPACE_LIMITS = {
  lifeAreas: 50,
  goals: 200,
  projects: 200,
  tasks: 1000,
  habits: 100,
  habitLogs: 10000,
  dailyPlans: 1000,
  dailyReviews: 1000,
} as const;

const STARTER_HABIT_NAMES = [
  'Wake up on time',
  'Plan top priorities',
  'Move my body',
  'Focused deep work',
  'Read or learn',
  'Evening wind-down',
] as const;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const id = () => globalThis.crypto?.randomUUID?.() ?? `hl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const createId = id;

export function consumeLoadWarning(): string {
  const notice = recoveryNotice;
  recoveryNotice = '';
  return notice;
}

function createDefaultLifeAreas(): LifeArea[] {
  const now = new Date().toISOString();
  return [
    { name: 'Career', description: 'Professional growth and meaningful work.' },
    { name: 'Business', description: 'Build and operate durable ventures.' },
    { name: 'Education', description: 'Learning, research, and academic milestones.' },
    { name: 'Wealth', description: 'Financial resilience and long-term assets.' },
    { name: 'Health', description: 'Physical and mental wellbeing.' },
  ].map(area => ({ id: id(), ...area, createdAt: now }));
}

export function createDefaultData(): AppData {
  const now = new Date().toISOString();
  const starterHabits: Habit[] = STARTER_HABIT_NAMES.map(name => ({
    id: id(),
    name,
    frequency: 'daily',
    active: true,
    createdAt: now,
  }));
  return {
    schemaVersion: 3,
    lifeAreas: createDefaultLifeAreas(),
    goals: [],
    projects: [],
    tasks: [],
    habits: starterHabits,
    habitLogs: [],
    dailyPlans: [],
    dailyReviews: [],
    personalOS: { principles: [], decisions: [], claims: [], reflections: [], capacity: { dailyMinutes: 360, focusMinutes: 90, taskEstimates: {} } },
  };
}

function migrateLegacy(): Partial<AppData> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const createdAt = new Date().toISOString();
    const habits: Habit[] = Array.isArray(parsed.habits)
      ? parsed.habits
          .filter((habit): habit is Record<string, unknown> => isRecord(habit) && isString(habit.name) && habit.name.trim().length > 0)
          .map(habit => ({
            id: isString(habit.id) && habit.id ? habit.id : id(),
            name: (habit.name as string).trim(),
            frequency: 'daily' as const,
            active: true,
            createdAt,
          }))
      : [];
    const logs: HabitLog[] = [];
    if (isRecord(parsed.checks)) {
      for (const [habitId, months] of Object.entries(parsed.checks)) {
        if (!isRecord(months)) continue;
        for (const [monthKey, days] of Object.entries(months)) {
          if (!Array.isArray(days)) continue;
          const match = /^(\d{4})-(\d{1,2})$/.exec(monthKey);
          if (!match) continue;
          const month = Number(match[2]);
          if (month < 1 || month > 12) continue;
          const monthEnd = new Date(0);
          monthEnd.setUTCFullYear(Number(match[1]), month, 0);
          const daysInMonth = monthEnd.getUTCDate();
          for (const day of days) {
            const n = typeof day === 'number' || typeof day === 'string' ? Number(day) : Number.NaN;
            if (Number.isInteger(n) && n >= 1 && n <= daysInMonth) {
              const date = `${match[1]}-${match[2].padStart(2, '0')}-${String(n).padStart(2, '0')}`;
              logs.push({ id: id(), habitId: String(habitId), date, status: 'done' });
            }
          }
        }
      }
    }
    return { ...(habits.length ? { habits } : {}), habitLogs: logs };
  } catch {
    return {};
  }
}

type StoredGoal = Omit<AppData['goals'][number], 'lifeAreaId'> & { lifeAreaId?: string | null };
type StoredAppData = Omit<AppData, 'schemaVersion' | 'lifeAreas' | 'goals'> & {
  schemaVersion: 2 | 3;
  lifeAreas?: unknown[];
  goals: StoredGoal[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
const isStatus = (value: unknown): value is Status => value === 'active' || value === 'completed' || value === 'archived';
const isProjectStatus = (value: unknown): value is ProjectStatus => isStatus(value) || value === 'planned';
const isTaskStatus = (value: unknown): value is TaskStatus => value === 'todo' || value === 'done' || value === 'skipped';
const isPriority = (value: unknown): value is Priority => value === 'high' || value === 'medium' || value === 'low';

function isLifeArea(value: unknown): value is LifeArea {
  return isRecord(value) && isString(value.id) && isString(value.name) && isString(value.description) && isString(value.createdAt);
}

function isGoal(value: unknown, allowMissingLifeArea: boolean): value is StoredGoal {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.outcome) &&
    isString(value.targetDate) &&
    isStatus(value.status) &&
    isString(value.createdAt) &&
    (allowMissingLifeArea ? value.lifeAreaId === undefined || isNullableString(value.lifeAreaId) : isNullableString(value.lifeAreaId))
  );
}

function isProject(value: unknown): value is AppData['projects'][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isNullableString(value.goalId) &&
    isString(value.title) &&
    isString(value.description) &&
    isString(value.dueDate) &&
    isProjectStatus(value.status) &&
    isString(value.createdAt)
  );
}

function isTask(value: unknown): value is AppData['tasks'][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isNullableString(value.projectId) &&
    isString(value.title) &&
    isString(value.dueDate) &&
    isPriority(value.priority) &&
    isTaskStatus(value.status) &&
    isString(value.createdAt) &&
    isNullableString(value.completedAt)
  );
}

function isHabit(value: unknown): value is Habit {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    (value.frequency === 'daily' || value.frequency === 'weekdays' || value.frequency === 'weekends') &&
    typeof value.active === 'boolean' &&
    isString(value.createdAt)
  );
}

function isHabitLog(value: unknown): value is HabitLog {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.habitId) &&
    isString(value.date) &&
    (value.status === 'done' || value.status === 'skipped')
  );
}

function isDailyPlan(value: unknown): value is DailyPlan {
  return isRecord(value) && isString(value.date) && Array.isArray(value.priorityTaskIds) && value.priorityTaskIds.every(isString);
}

function isDailyReview(value: unknown): value is DailyReview {
  return (
    isRecord(value) &&
    isString(value.date) &&
    isString(value.wins) &&
    isString(value.blockers) &&
    isString(value.notes) &&
    Number.isInteger(value.energy) &&
    Number(value.energy) >= 1 &&
    Number(value.energy) <= 5
  );
}

function isValidData(value: unknown): value is StoredAppData {
  if (!isRecord(value) || (value.schemaVersion !== 2 && value.schemaVersion !== 3)) return false;
  const isV2 = value.schemaVersion === 2;
  return (
    (isV2 || (Array.isArray(value.lifeAreas) && value.lifeAreas.every(isLifeArea))) &&
    Array.isArray(value.goals) &&
    value.goals.every(goal => isGoal(goal, isV2)) &&
    Array.isArray(value.projects) &&
    value.projects.every(isProject) &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isTask) &&
    Array.isArray(value.habits) &&
    value.habits.every(isHabit) &&
    Array.isArray(value.habitLogs) &&
    value.habitLogs.every(isHabitLog) &&
    Array.isArray(value.dailyPlans) &&
    value.dailyPlans.every(isDailyPlan) &&
    Array.isArray(value.dailyReviews) &&
    value.dailyReviews.every(isDailyReview) &&
    (value.updatedAt === undefined || isString(value.updatedAt)) &&
    (value.syncVersion === undefined || (typeof value.syncVersion === 'number' && Number.isInteger(value.syncVersion) && value.syncVersion >= 0))
  );
}

export const isValidAppData = (value: unknown): value is AppData => isValidData(value) && value.schemaVersion === 3;

function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

const clampStr = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}


function sanitizePersonalOS(value: PersonalOSData | undefined): PersonalOSData {
  const raw = value && typeof value === 'object' ? value : {} as PersonalOSData;
  const cleanList = <T extends { id: string }>(items: unknown, mapper: (item: Record<string, unknown>) => T): T[] =>
    (Array.isArray(items) ? items : [])
      .filter((item): item is Record<string, unknown> => isRecord(item) && isString(item.id))
      .slice(-500)
      .map(mapper);
  const capacity = isRecord(raw.capacity) ? raw.capacity : {};
  const estimates = isRecord(capacity.taskEstimates) ? capacity.taskEstimates : {};
  const taskEstimates = Object.fromEntries(Object.entries(estimates)
    .filter(([key, n]) => isString(key) && typeof n === 'number' && Number.isFinite(n))
    .slice(0, 1000)
    .map(([key, n]) => [key, Math.max(5, Math.min(1440, Math.round(n as number)))]));
  return {
    principles: cleanList(raw.principles, item => ({
      id: clampStr(String(item.id), 128), title: clampStr(String(item.title ?? ''), 160),
      statement: clampStr(String(item.statement ?? ''), 2000), reason: clampStr(String(item.reason ?? ''), 2000),
      behaviors: clampStr(String(item.behaviors ?? ''), 2000), contradictions: clampStr(String(item.contradictions ?? ''), 2000),
      createdAt: clampStr(String(item.createdAt ?? ''), 40), updatedAt: clampStr(String(item.updatedAt ?? ''), 40),
    })),
    decisions: cleanList(raw.decisions, item => ({
      id: clampStr(String(item.id), 128), title: clampStr(String(item.title ?? ''), 240),
      context: clampStr(String(item.context ?? ''), 3000), options: clampStr(String(item.options ?? ''), 3000),
      choice: clampStr(String(item.choice ?? ''), 2000), assumptions: clampStr(String(item.assumptions ?? ''), 3000),
      prediction: clampStr(String(item.prediction ?? ''), 2000), reviewAt: clampStr(String(item.reviewAt ?? ''), 20),
      outcome: clampStr(String(item.outcome ?? ''), 3000), createdAt: clampStr(String(item.createdAt ?? ''), 40),
      ...(isString(item.reviewedAt) ? { reviewedAt: clampStr(item.reviewedAt, 40) } : {}),
    })),
    claims: cleanList(raw.claims, item => ({
      id: clampStr(String(item.id), 128), claim: clampStr(String(item.claim ?? ''), 2000),
      domain: clampStr(String(item.domain ?? ''), 120), source: clampStr(String(item.source ?? ''), 500),
      evidence: clampStr(String(item.evidence ?? ''), 3000),
      confidence: Math.max(0, Math.min(100, Math.round(typeof item.confidence === 'number' ? item.confidence : 0))),
      status: item.status === 'confirmed' || item.status === 'disputed' || item.status === 'outdated' ? item.status : 'provisional',
      createdAt: clampStr(String(item.createdAt ?? ''), 40),
      ...(isString(item.verifiedAt) ? { verifiedAt: clampStr(item.verifiedAt, 40) } : {}),
    })),
    reflections: cleanList(raw.reflections, item => ({
      id: clampStr(String(item.id), 128), date: clampStr(String(item.date ?? ''), 20),
      prompt: clampStr(String(item.prompt ?? ''), 1000), answer: clampStr(String(item.answer ?? ''), 4000),
      interpretation: clampStr(String(item.interpretation ?? ''), 2000),
      interpretationStatus: item.interpretationStatus === 'user-confirmed' || item.interpretationStatus === 'rejected' ? item.interpretationStatus : 'hypothesis',
      createdAt: clampStr(String(item.createdAt ?? ''), 40),
    })),
    capacity: {
      dailyMinutes: Math.max(30, Math.min(1440, Math.round(typeof capacity.dailyMinutes === 'number' ? capacity.dailyMinutes : 360))),
      focusMinutes: Math.max(15, Math.min(240, Math.round(typeof capacity.focusMinutes === 'number' ? capacity.focusMinutes : 90))),
      taskEstimates,
    },
  };
}

export function sanitizeAppData(data: AppData): AppData {
  const lifeAreas = dedupeById(data.lifeAreas)
    .slice(0, WORKSPACE_LIMITS.lifeAreas)
    .map(area => ({
      ...area,
      id: clampStr(area.id, 128),
      name: clampStr(area.name, 160),
      description: clampStr(area.description, 1000),
      createdAt: clampStr(area.createdAt, 40),
    }));
  const lifeAreaIds = new Set(lifeAreas.map(a => a.id));

  const goals = dedupeById(data.goals)
    .slice(0, WORKSPACE_LIMITS.goals)
    .map(goal => ({
      ...goal,
      id: clampStr(goal.id, 128),
      lifeAreaId: goal.lifeAreaId && lifeAreaIds.has(goal.lifeAreaId) ? goal.lifeAreaId : null,
      title: clampStr(goal.title, 240),
      outcome: clampStr(goal.outcome, 2000),
      targetDate: clampStr(goal.targetDate, 20),
      createdAt: clampStr(goal.createdAt, 40),
    }));
  const goalIds = new Set(goals.map(g => g.id));

  const projects = dedupeById(data.projects)
    .slice(0, WORKSPACE_LIMITS.projects)
    .map(project => ({
      ...project,
      id: clampStr(project.id, 128),
      goalId: project.goalId && goalIds.has(project.goalId) ? project.goalId : null,
      title: clampStr(project.title, 240),
      description: clampStr(project.description, 2000),
      dueDate: clampStr(project.dueDate, 20),
      createdAt: clampStr(project.createdAt, 40),
    }));
  const projectIds = new Set(projects.map(p => p.id));

  const tasks = dedupeById(data.tasks)
    .slice(0, WORKSPACE_LIMITS.tasks)
    .map(task => {
      const targetQuantity =
        typeof task.targetQuantity === 'number' && Number.isFinite(task.targetQuantity) && task.targetQuantity > 0
          ? Math.max(1, Math.round(task.targetQuantity))
          : undefined;
      const rawCompleted =
        typeof task.completedQuantity === 'number' && Number.isFinite(task.completedQuantity) && task.completedQuantity >= 0
          ? Math.round(task.completedQuantity)
          : undefined;
      const completedQuantity =
        rawCompleted !== undefined
          ? targetQuantity !== undefined
            ? Math.min(targetQuantity, rawCompleted)
            : rawCompleted
          : undefined;
      const cleanTask = {
        ...task,
        id: clampStr(task.id, 128),
        projectId: task.projectId && projectIds.has(task.projectId) ? task.projectId : null,
        title: clampStr(task.title, 240),
        dueDate: clampStr(task.dueDate, 20),
        createdAt: clampStr(task.createdAt, 40),
        completedAt: task.completedAt ? clampStr(task.completedAt, 40) : null,
      ...(typeof task.estimatedMinutes === 'number' && Number.isFinite(task.estimatedMinutes) ? { estimatedMinutes: Math.max(5, Math.min(1440, Math.round(task.estimatedMinutes))) } : {}),
      };
      if (targetQuantity !== undefined) cleanTask.targetQuantity = targetQuantity;
      else delete cleanTask.targetQuantity;
      if (completedQuantity !== undefined) cleanTask.completedQuantity = completedQuantity;
      else delete cleanTask.completedQuantity;
      return cleanTask;
    });
  const taskIds = new Set(tasks.map(t => t.id));

  const habits = dedupeById(data.habits)
    .slice(0, WORKSPACE_LIMITS.habits)
    .map(habit => ({
      ...habit,
      id: clampStr(habit.id, 128),
      name: clampStr(habit.name, 160),
      createdAt: clampStr(habit.createdAt, 40),
    }));
  const habitById = new Map(habits.map(h => [h.id, h]));

  const seenLogs = new Set<string>();
  const seenWeeklyIds = new Set<string>();
  const habitLogs: HabitLog[] = [];
  for (const log of data.habitLogs) {
    const habit = habitById.get(log.habitId);
    if (!habit) continue;
    const dateKey = clampStr(log.date, 20);
    if (!DATE_KEY_RE.test(dateKey)) continue;
    const logId = clampStr(log.id, 128);
    if (habit.cadence === 'weekly_count' && log.status === 'done') {
      if (!logId || seenWeeklyIds.has(logId)) continue;
      seenWeeklyIds.add(logId);
    } else {
      const key = `${log.habitId}:${dateKey}`;
      if (seenLogs.has(key)) continue;
      seenLogs.add(key);
    }
    habitLogs.push({
      ...log,
      id: logId,
      habitId: clampStr(log.habitId, 128),
      date: dateKey,
    });
    if (habitLogs.length >= WORKSPACE_LIMITS.habitLogs) break;
  }

  const planByDate = new Map<string, DailyPlan>();
  for (const plan of data.dailyPlans) {
    const dateKey = clampStr(plan.date, 20);
    if (!DATE_KEY_RE.test(dateKey)) continue;
    const validIds: string[] = [];
    const seenIds = new Set<string>();
    for (const taskId of plan.priorityTaskIds) {
      if (taskIds.has(taskId) && !seenIds.has(taskId)) {
        seenIds.add(taskId);
        validIds.push(taskId);
      }
      if (validIds.length >= 3) break;
    }
    planByDate.set(dateKey, { date: dateKey, priorityTaskIds: validIds });
  }
  const dailyPlans = [...planByDate.values()].slice(-WORKSPACE_LIMITS.dailyPlans);

  const reviewByDate = new Map<string, DailyReview>();
  for (const review of data.dailyReviews) {
    const dateKey = clampStr(review.date, 20);
    if (!DATE_KEY_RE.test(dateKey)) continue;
    const existing = reviewByDate.get(dateKey);
    const hasText = Boolean(review.wins.trim() || review.blockers.trim() || review.notes.trim());
    if (!existing || hasText) {
      reviewByDate.set(dateKey, {
        date: dateKey,
        wins: clampStr(review.wins, 4000),
        blockers: clampStr(review.blockers, 4000),
        notes: clampStr(review.notes, 4000),
        energy: Math.min(5, Math.max(1, Math.round(review.energy))),
      });
    }
  }
  const dailyReviews = [...reviewByDate.values()].slice(-WORKSPACE_LIMITS.dailyReviews);

  const normalized: AppData = {
    schemaVersion: 3,
    lifeAreas,
    goals,
    projects,
    tasks,
    habits,
    habitLogs,
    dailyPlans,
    dailyReviews,
    personalOS: sanitizePersonalOS(data.personalOS),
  };
  if (typeof data.syncVersion === 'number' && Number.isInteger(data.syncVersion) && data.syncVersion >= 0) {
    normalized.syncVersion = data.syncVersion;
  }
  if (typeof data.updatedAt === 'string' && data.updatedAt) {
    normalized.updatedAt = data.updatedAt.slice(0, 40);
  }
  return stripUndefinedDeep(normalized);
}

export function normalizeStoredData(data: StoredAppData): AppData {
  const upgraded: AppData = {
    ...data,
    schemaVersion: 3,
    lifeAreas: data.schemaVersion === 3 ? (data.lifeAreas as LifeArea[]) : createDefaultLifeAreas(),
    goals: data.goals.map(goal => ({ ...goal, lifeAreaId: goal.lifeAreaId ?? null })),
  };
  return sanitizeAppData(upgraded);
}

export function normalizeRemoteOrNull(value: unknown): AppData | null {
  if (!isValidData(value)) return null;
  return normalizeStoredData(value);
}

export type RemoteSnapshotClassification =
  | { kind: 'valid-v3'; data: AppData; syncVersion: number }
  | { kind: 'incompatible-v4'; schemaVersion: number; meta: WorkspaceMetaV4 }
  | { kind: 'invalid' };

export function classifyRemoteSnapshot(value: unknown): RemoteSnapshotClassification {
  if (isRecord(value) && typeof value.schemaVersion === 'number' && value.schemaVersion >= 4) {
    const meta: WorkspaceMetaV4 = {
      schemaVersion: 4,
      migrationStatus: value.migrationStatus === 'pending' ? 'pending' : 'completed',
      migratedFromSchema: value.migratedFromSchema === 3 ? 3 : undefined,
      updatedAt: isString(value.updatedAt) ? value.updatedAt.slice(0, 40) : new Date().toISOString(),
    };
    return { kind: 'incompatible-v4', schemaVersion: value.schemaVersion, meta };
  }
  const normalized = normalizeRemoteOrNull(value);
  if (!normalized) return { kind: 'invalid' };
  const syncVersion =
    typeof normalized.syncVersion === 'number' && Number.isInteger(normalized.syncVersion) && normalized.syncVersion >= 0
      ? normalized.syncVersion
      : 0;
  return { kind: 'valid-v3', data: normalized, syncVersion };
}

export function computeWorkspaceHash(data: AppData): string {
  const { updatedAt: _omitUpdated, syncVersion: _omitVersion, ...content } = sanitizeAppData(data);
  return JSON.stringify(content);
}

function preserveForRecovery(raw: string, recoveryKey = RECOVERY_KEY): void {
  try {
    localStorage.setItem(recoveryKey, raw);
    recoveryNotice = 'Saved data could not be read. A recovery copy was preserved in this browser; the app opened with safe defaults.';
  } catch {
    recoveryNotice = 'Saved data could not be read or preserved. The app opened with safe defaults; export data regularly.';
    console.warn('Could not preserve the previous InPursuit data for recovery.');
  }
}

export function loadData(): AppData {
  recoveryNotice = '';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isValidData(parsed)) return normalizeStoredData(parsed);
      } catch {
        // Preserve invalid data before loading a clean default state.
      }
      preserveForRecovery(raw);
    }
  } catch {
    // Unavailable storage should not prevent the app from opening.
  }
  const defaults = createDefaultData();
  const legacy = migrateLegacy();
  return sanitizeAppData({ ...defaults, ...legacy });
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeAppData(data)));
}

export function isGuestDirty(): boolean {
  try {
    return localStorage.getItem(GUEST_DIRTY_KEY) === '1';
  } catch {
    return false;
  }
}

export function setGuestDirty(dirty: boolean): void {
  try {
    if (dirty) localStorage.setItem(GUEST_DIRTY_KEY, '1');
    else localStorage.removeItem(GUEST_DIRTY_KEY);
  } catch {
    // Ignore storage quota/restriction
  }
}

export function clearGuestWorkspace(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(GUEST_DIRTY_KEY);
  } catch {
    // Ignore storage restriction
  }
}

export function loadAccountData(uid: string): AppData | null {
  try {
    const key = `${ACCOUNT_KEY_PREFIX}${uid}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isValidData(parsed)) return normalizeStoredData(parsed);
    } catch {
      // Preserve invalid account cache before returning null.
    }
    preserveForRecovery(raw, `${key}.recovery`);
    return null;
  } catch {
    return null;
  }
}

export function saveAccountData(uid: string, data: AppData): void {
  localStorage.setItem(`${ACCOUNT_KEY_PREFIX}${uid}`, JSON.stringify(sanitizeAppData(data)));
}

export function loadSyncBase(uid: string): AppData | null {
  try {
    const raw = localStorage.getItem(`${SYNC_BASE_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidData(parsed) ? normalizeStoredData(parsed) : null;
  } catch {
    return null;
  }
}

export function saveSyncBase(uid: string, data: AppData): void {
  try {
    localStorage.setItem(`${SYNC_BASE_PREFIX}${uid}`, JSON.stringify(sanitizeAppData(data)));
  } catch {
    // Best-effort sync base snapshot
  }
}

export function loadSyncMeta(uid: string): SyncMeta {
  try {
    const raw = localStorage.getItem(`${SYNC_META_PREFIX}${uid}`);
    if (!raw) return { pendingSync: false, lastSyncedAt: null, lastUpdatedByTab: null, remoteSyncVersion: null };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { pendingSync: false, lastSyncedAt: null, lastUpdatedByTab: null, remoteSyncVersion: null };
    return {
      pendingSync: parsed.pendingSync === true,
      lastSyncedAt: isString(parsed.lastSyncedAt) ? parsed.lastSyncedAt : null,
      lastUpdatedByTab: isString(parsed.lastUpdatedByTab) ? parsed.lastUpdatedByTab : null,
      remoteSyncVersion:
        typeof parsed.remoteSyncVersion === 'number' && Number.isInteger(parsed.remoteSyncVersion) && parsed.remoteSyncVersion >= 0
          ? parsed.remoteSyncVersion
          : null,
    };
  } catch {
    return { pendingSync: false, lastSyncedAt: null, lastUpdatedByTab: null, remoteSyncVersion: null };
  }
}

export function saveSyncMeta(uid: string, meta: SyncMeta): void {
  try {
    localStorage.setItem(`${SYNC_META_PREFIX}${uid}`, JSON.stringify(meta));
  } catch {
    // Best-effort sync metadata persistence.
  }
}

export interface DeletionBroadcastRecord {
  uid: string;
  phase: 'deleting' | 'deleted' | 'partial-failure';
  updatedAt: string;
}

export function readDeletionBroadcast(): DeletionBroadcastRecord | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_DELETION_STATE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      !isString(parsed.uid) ||
      (parsed.phase !== 'deleting' && parsed.phase !== 'deleted' && parsed.phase !== 'partial-failure')
    ) {
      return null;
    }
    return {
      uid: parsed.uid,
      phase: parsed.phase,
      updatedAt: isString(parsed.updatedAt) ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

export function writeDeletionBroadcast(uid: string, phase: DeletionBroadcastRecord['phase']): void {
  try {
    localStorage.setItem(
      ACCOUNT_DELETION_STATE_KEY,
      JSON.stringify({ uid, phase, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Best-effort cross-tab broadcast
  }
}

export function clearDeletionBroadcast(uid?: string): void {
  try {
    if (uid) {
      const current = readDeletionBroadcast();
      if (!current || current.uid !== uid) return;
    }
    localStorage.removeItem(ACCOUNT_DELETION_STATE_KEY);
  } catch {
    // Ignore storage cleanup restrictions
  }
}

export function clearAccountStorage(uid: string, options?: { preserveRecoveryCopy?: boolean }): void {
  try {
    if (options?.preserveRecoveryCopy) {
      const existing = localStorage.getItem(`${ACCOUNT_KEY_PREFIX}${uid}`);
      if (existing) localStorage.setItem(`${ACCOUNT_KEY_PREFIX}${uid}.recovery`, existing);
    } else {
      localStorage.removeItem(`${ACCOUNT_KEY_PREFIX}${uid}.recovery`);
    }
    localStorage.removeItem(`${ACCOUNT_KEY_PREFIX}${uid}`);
    localStorage.removeItem(`${SYNC_META_PREFIX}${uid}`);
    localStorage.removeItem(`${SYNC_BASE_PREFIX}${uid}`);
    localStorage.removeItem(`${ONBOARDING_KEY_PREFIX}${uid}`);
  } catch {
    // Ignore storage cleanup restrictions
  }
}

export function summarizeWorkspace(data: AppData): WorkspaceSummary {
  return {
    lifeAreas: data.lifeAreas.length,
    goals: data.goals.length,
    projects: data.projects.length,
    tasks: data.tasks.length,
    habits: data.habits.length,
    habitLogs: data.habitLogs.length,
    dailyReviews: data.dailyReviews.length,
    updatedAt: data.updatedAt,
  };
}

export function hasMeaningfulWorkspaceData(data: AppData): boolean {
  if (
    data.goals.length > 0 ||
    data.projects.length > 0 ||
    data.tasks.length > 0 ||
    data.habitLogs.length > 0 ||
    data.dailyPlans.length > 0 ||
    data.dailyReviews.length > 0
  ) {
    return true;
  }
  const starterSet = new Set<string>(STARTER_HABIT_NAMES);
  if (data.habits.length !== starterSet.size) return true;
  return data.habits.some(h => !starterSet.has(h.name));
}

function mergeKeyedCollection<T>(
  baseItems: readonly T[],
  localItems: readonly T[],
  remoteItems: readonly T[],
  keyOf: (item: T) => string,
  preferLocalOnConflict: boolean,
): T[] {
  const baseMap = new Map(baseItems.map(item => [keyOf(item), item]));
  const localMap = new Map(localItems.map(item => [keyOf(item), item]));
  const remoteMap = new Map(remoteItems.map(item => [keyOf(item), item]));

  const allKeys: string[] = [];
  const seen = new Set<string>();
  for (const list of [remoteItems, localItems]) {
    for (const item of list) {
      const k = keyOf(item);
      if (!seen.has(k)) {
        seen.add(k);
        allKeys.push(k);
      }
    }
  }

  const out: T[] = [];
  for (const key of allKeys) {
    const b = baseMap.get(key);
    const l = localMap.get(key);
    const r = remoteMap.get(key);
    const bJson = b ? JSON.stringify(b) : null;
    const lJson = l ? JSON.stringify(l) : null;
    const rJson = r ? JSON.stringify(r) : null;

    if (l && r) {
      if (lJson === rJson) {
        out.push(r);
      } else if (bJson && lJson === bJson) {
        out.push(r); // Local unchanged, remote updated
      } else if (bJson && rJson === bJson) {
        out.push(l); // Remote unchanged, local updated
      } else {
        out.push(preferLocalOnConflict ? l : r);
      }
    } else if (l && !r) {
      // Present locally, absent remotely: keep if newly added or edited locally vs deleted remotely when preferLocal
      if (!b || (lJson !== bJson && preferLocalOnConflict)) {
        out.push(l);
      }
    } else if (!l && r) {
      // Present remotely, absent locally: keep if newly added remotely or edited remotely vs deleted locally
      if (!b || (rJson !== bJson && !preferLocalOnConflict)) {
        out.push(r);
      }
    }
  }
  return out;
}

function mergeReviewFields(primary: DailyReview, secondary: DailyReview): DailyReview {
  const combineText = (a: string, b: string, label: string, max = 4000): string => {
    const cleanA = a.trim();
    const cleanB = b.trim();
    if (!cleanA) return clampStr(b, max);
    if (!cleanB || cleanA === cleanB) return clampStr(a, max);
    if (cleanA.includes(cleanB)) return clampStr(a, max);
    if (cleanB.includes(cleanA)) return clampStr(b, max);
    return clampStr(`${a}\n\n[${label}]\n${b}`, max);
  };

  return {
    date: primary.date,
    wins: combineText(primary.wins, secondary.wins, 'Merged entry'),
    blockers: combineText(primary.blockers, secondary.blockers, 'Merged entry'),
    notes: combineText(primary.notes, secondary.notes, 'Merged entry'),
    energy: Math.min(5, Math.max(1, Math.round((primary.energy + secondary.energy) / 2))),
  };
}

export function applySelectedActiveProjects(
  projects: readonly Project[],
  selectedActiveProjectIds?: readonly string[],
): { projects: Project[]; archivedCount: number } {
  if (!selectedActiveProjectIds || selectedActiveProjectIds.length === 0) {
    return enforceActiveProjectLimit(projects);
  }
  const chosenSet = new Set(selectedActiveProjectIds.slice(0, MAX_ACTIVE_PROJECTS));
  let archivedCount = 0;
  const updated = projects.map(project => {
    if (project.status !== 'active') return project;
    if (chosenSet.has(project.id)) return project;
    archivedCount += 1;
    return { ...project, status: 'archived' as const };
  });
  return enforceActiveProjectLimit(updated).archivedCount > 0
    ? { ...enforceActiveProjectLimit(updated), archivedCount: archivedCount + enforceActiveProjectLimit(updated).archivedCount }
    : { projects: updated, archivedCount };
}

export interface DetailedMergeResult {
  data: AppData;
  uncappedProjects: Project[];
  activeProjects: Project[];
  exceedsProjectLimit: boolean;
  archivedExcessCount: number;
}


function mergePersonalOS(base: PersonalOSData | undefined, local: PersonalOSData | undefined, remote: PersonalOSData | undefined, preferLocal: boolean): PersonalOSData {
  const empty: PersonalOSData = { principles: [], decisions: [], claims: [], reflections: [], capacity: { dailyMinutes: 360, focusMinutes: 90, taskEstimates: {} } };
  const b = base ?? empty, l = local ?? empty, r = remote ?? empty;
  const choose = <T>(bv: T, lv: T, rv: T): T => {
    if (JSON.stringify(lv) === JSON.stringify(rv)) return lv;
    if (JSON.stringify(lv) === JSON.stringify(bv)) return rv;
    if (JSON.stringify(rv) === JSON.stringify(bv)) return lv;
    return preferLocal ? lv : rv;
  };
  const taskKeys = new Set([...Object.keys(b.capacity.taskEstimates), ...Object.keys(l.capacity.taskEstimates), ...Object.keys(r.capacity.taskEstimates)]);
  const taskEstimates: Record<string, number> = {};
  for (const key of taskKeys) {
    const value = choose(b.capacity.taskEstimates[key], l.capacity.taskEstimates[key], r.capacity.taskEstimates[key]);
    if (typeof value === 'number') taskEstimates[key] = value;
  }
  return {
    principles: mergeKeyedCollection(b.principles, l.principles, r.principles, x => x.id, preferLocal),
    decisions: mergeKeyedCollection(b.decisions, l.decisions, r.decisions, x => x.id, preferLocal),
    claims: mergeKeyedCollection(b.claims, l.claims, r.claims, x => x.id, preferLocal),
    reflections: mergeKeyedCollection(b.reflections, l.reflections, r.reflections, x => x.id, preferLocal),
    capacity: {
      dailyMinutes: choose(b.capacity.dailyMinutes, l.capacity.dailyMinutes, r.capacity.dailyMinutes),
      focusMinutes: choose(b.capacity.focusMinutes, l.capacity.focusMinutes, r.capacity.focusMinutes),
      taskEstimates,
    },
  };
}

export function threeWayMergeWorkspaceDetailed(
  base: AppData,
  local: AppData,
  remote: AppData,
  preferLocalOnConflict = true,
  selectedActiveProjectIds?: readonly string[],
): DetailedMergeResult {
  const lifeAreas = mergeKeyedCollection(base.lifeAreas, local.lifeAreas, remote.lifeAreas, x => x.id, preferLocalOnConflict);
  const goals = mergeKeyedCollection(base.goals, local.goals, remote.goals, x => x.id, preferLocalOnConflict);
  const rawProjects = mergeKeyedCollection(base.projects, local.projects, remote.projects, x => x.id, preferLocalOnConflict);
  const tasks = mergeKeyedCollection(base.tasks, local.tasks, remote.tasks, x => x.id, preferLocalOnConflict);
  const habits = mergeKeyedCollection(base.habits, local.habits, remote.habits, x => x.id, preferLocalOnConflict);
  const weeklyHabitIds = new Set(habits.filter(h => h.cadence === 'weekly_count').map(h => h.id));
  const habitLogs = mergeKeyedCollection(
    base.habitLogs,
    local.habitLogs,
    remote.habitLogs,
    x => (weeklyHabitIds.has(x.habitId) && x.status === 'done' ? `id:${x.id}` : `${x.habitId}:${x.date}`),
    preferLocalOnConflict,
  );
  const dailyPlans = mergeKeyedCollection(base.dailyPlans, local.dailyPlans, remote.dailyPlans, x => x.date, preferLocalOnConflict);

  // Merge conflicting same-date DailyReview edits cleanly rather than silently dropping one side
  const baseReviewMap = new Map(base.dailyReviews.map(r => [r.date, r]));
  const localReviewMap = new Map(local.dailyReviews.map(r => [r.date, r]));
  const remoteReviewMap = new Map(remote.dailyReviews.map(r => [r.date, r]));
  const reviewDates = [...new Set([...remote.dailyReviews.map(r => r.date), ...local.dailyReviews.map(r => r.date)])];
  const dailyReviews: DailyReview[] = [];
  for (const date of reviewDates) {
    const b = baseReviewMap.get(date);
    const l = localReviewMap.get(date);
    const r = remoteReviewMap.get(date);
    if (l && r) {
      const bJson = b ? JSON.stringify(b) : null;
      const lJson = JSON.stringify(l);
      const rJson = JSON.stringify(r);
      if (lJson === rJson) dailyReviews.push(r);
      else if (bJson && lJson === bJson) dailyReviews.push(r);
      else if (bJson && rJson === bJson) dailyReviews.push(l);
      else dailyReviews.push(mergeReviewFields(preferLocalOnConflict ? l : r, preferLocalOnConflict ? r : l));
    } else if (l && !r) {
      if (!b || JSON.stringify(l) !== JSON.stringify(b)) dailyReviews.push(l);
    } else if (!l && r) {
      if (!b || JSON.stringify(r) !== JSON.stringify(b)) dailyReviews.push(r);
    }
  }

  const uncappedActive = rawProjects.filter(p => p.status === 'active');
  const applied = applySelectedActiveProjects(rawProjects, selectedActiveProjectIds);

  const data = sanitizeAppData({
    schemaVersion: 3,
    lifeAreas,
    goals,
    projects: applied.projects,
    tasks,
    habits,
    habitLogs,
    dailyPlans,
    dailyReviews,
    personalOS: mergePersonalOS(base.personalOS, local.personalOS, remote.personalOS, preferLocalOnConflict),
    updatedAt: new Date().toISOString(),
  });

  return {
    data,
    uncappedProjects: rawProjects,
    activeProjects: uncappedActive,
    exceedsProjectLimit: uncappedActive.length > MAX_ACTIVE_PROJECTS,
    archivedExcessCount: applied.archivedCount,
  };
}

export function threeWayMergeWorkspace(
  base: AppData,
  local: AppData,
  remote: AppData,
  preferLocalOnConflict = true,
): AppData {
  return threeWayMergeWorkspaceDetailed(base, local, remote, preferLocalOnConflict).data;
}

function makeUniqueLabeledTitle(baseTitle: string, usedLowerTitles: Set<string>, suffix = '(Local)'): string {
  const clean = baseTitle.trim() || 'Untitled';
  const candidate1 = `${clean} ${suffix}`;
  if (!usedLowerTitles.has(candidate1.toLocaleLowerCase())) return candidate1;
  let counter = 2;
  while (usedLowerTitles.has(`${clean} ${suffix} ${counter}`.toLocaleLowerCase())) {
    counter += 1;
  }
  return `${clean} ${suffix} ${counter}`;
}

export function mergeWorkspaceDataDetailed(
  cloud: AppData,
  local: AppData,
  selectedActiveProjectIds?: readonly string[],
): DetailedMergeResult {
  const keyOf = (s: string) => s.trim().toLocaleLowerCase();

  const lifeAreas = [...cloud.lifeAreas];
  const areaById = new Map(lifeAreas.map(a => [a.id, a]));
  const areaByName = new Map(lifeAreas.map(a => [keyOf(a.name), a]));
  const areaNamesUsed = new Set(lifeAreas.map(a => keyOf(a.name)));
  const areaIdMap = new Map<string, string>();
  for (const area of local.lifeAreas) {
    const matched = areaByName.get(keyOf(area.name)) ?? areaById.get(area.id);
    if (matched) {
      areaIdMap.set(area.id, matched.id);
      if (area.description.trim() && area.description.trim() !== matched.description.trim()) {
        const mergedDesc = matched.description.trim()
          ? clampStr(`${matched.description.trim()} · ${area.description.trim()}`, 1000)
          : clampStr(area.description, 1000);
        const idx = lifeAreas.findIndex(a => a.id === matched.id);
        if (idx >= 0) lifeAreas[idx] = { ...lifeAreas[idx], description: mergedDesc };
      }
    } else {
      const nextId = areaById.has(area.id) ? id() : area.id;
      const nextName = areaNamesUsed.has(keyOf(area.name)) ? makeUniqueLabeledTitle(area.name, areaNamesUsed) : area.name;
      const added = { ...area, id: nextId, name: clampStr(nextName, 160) };
      lifeAreas.push(added);
      areaById.set(added.id, added);
      areaByName.set(keyOf(added.name), added);
      areaNamesUsed.add(keyOf(added.name));
      areaIdMap.set(area.id, added.id);
    }
  }

  const goals = [...cloud.goals];
  const goalById = new Map(goals.map(g => [g.id, g]));
  const goalByTitle = new Map(goals.map(g => [keyOf(g.title), g]));
  const goalTitlesUsed = new Set(goals.map(g => keyOf(g.title)));
  const goalIdMap = new Map<string, string>();
  for (const goal of local.goals) {
    const mappedAreaId = goal.lifeAreaId ? (areaIdMap.get(goal.lifeAreaId) ?? goal.lifeAreaId) : null;
    const matched = goalByTitle.get(keyOf(goal.title)) ?? goalById.get(goal.id);
    const sameMeaning =
      matched &&
      keyOf(matched.title) === keyOf(goal.title) &&
      matched.outcome.trim() === goal.outcome.trim() &&
      matched.targetDate === goal.targetDate &&
      matched.status === goal.status;

    if (matched && sameMeaning) {
      goalIdMap.set(goal.id, matched.id);
    } else {
      const nextId = goalById.has(goal.id) ? id() : goal.id;
      const nextTitle = goalTitlesUsed.has(keyOf(goal.title)) ? makeUniqueLabeledTitle(goal.title, goalTitlesUsed) : goal.title;
      const added = {
        ...goal,
        id: nextId,
        title: clampStr(nextTitle, 240),
        lifeAreaId: mappedAreaId,
      };
      goals.push(added);
      goalById.set(added.id, added);
      goalByTitle.set(keyOf(added.title), added);
      goalTitlesUsed.add(keyOf(added.title));
      goalIdMap.set(goal.id, added.id);
    }
  }

  const rawProjects = [...cloud.projects];
  const projectById = new Map(rawProjects.map(p => [p.id, p]));
  const projectByTitle = new Map(rawProjects.map(p => [keyOf(p.title), p]));
  const projectTitlesUsed = new Set(rawProjects.map(p => keyOf(p.title)));
  const projectIdMap = new Map<string, string>();
  for (const project of local.projects) {
    const mappedGoalId = project.goalId ? (goalIdMap.get(project.goalId) ?? project.goalId) : null;
    const matched = projectByTitle.get(keyOf(project.title)) ?? projectById.get(project.id);
    const sameMeaning =
      matched &&
      keyOf(matched.title) === keyOf(project.title) &&
      matched.description.trim() === project.description.trim() &&
      matched.dueDate === project.dueDate &&
      matched.status === project.status &&
      (matched.goalId ?? null) === (mappedGoalId ?? null);

    if (matched && sameMeaning) {
      projectIdMap.set(project.id, matched.id);
    } else {
      const nextId = projectById.has(project.id) ? id() : project.id;
      const nextTitle = projectTitlesUsed.has(keyOf(project.title))
        ? makeUniqueLabeledTitle(project.title, projectTitlesUsed)
        : project.title;
      const added: Project = {
        ...project,
        id: nextId,
        title: clampStr(nextTitle, 240),
        goalId: mappedGoalId,
      };
      rawProjects.push(added);
      projectById.set(added.id, added);
      projectByTitle.set(keyOf(added.title), added);
      projectTitlesUsed.add(keyOf(added.title));
      projectIdMap.set(project.id, added.id);
    }
  }

  const tasks = [...cloud.tasks];
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const taskIdSet = new Set(tasks.map(t => t.id));
  const taskSigMap = new Map(tasks.map(t => [`${keyOf(t.title)}:${t.projectId ?? ''}:${t.dueDate}:${t.status}:${t.priority}`, t]));
  const taskIdMap = new Map<string, string>();
  for (const task of local.tasks) {
    const mappedProjectId = task.projectId ? (projectIdMap.get(task.projectId) ?? task.projectId) : null;
    const sig = `${keyOf(task.title)}:${mappedProjectId ?? ''}:${task.dueDate}:${task.status}:${task.priority}`;
    const matchedBySig = taskSigMap.get(sig);
    const matchedById = taskById.get(task.id);
    if (matchedBySig) {
      taskIdMap.set(task.id, matchedBySig.id);
    } else if (
      matchedById &&
      keyOf(matchedById.title) === keyOf(task.title) &&
      matchedById.status === task.status &&
      matchedById.dueDate === task.dueDate
    ) {
      taskIdMap.set(task.id, matchedById.id);
    } else {
      const nextId = taskIdSet.has(task.id) ? id() : task.id;
      const added = { ...task, id: nextId, projectId: mappedProjectId };
      tasks.push(added);
      taskById.set(added.id, added);
      taskIdSet.add(added.id);
      taskSigMap.set(sig, added);
      taskIdMap.set(task.id, added.id);
    }
  }

  const habits = [...cloud.habits];
  const habitById = new Map(habits.map(h => [h.id, h]));
  const habitByName = new Map(habits.map(h => [keyOf(h.name), h]));
  const habitNamesUsed = new Set(habits.map(h => keyOf(h.name)));
  const habitIdMap = new Map<string, string>();
  for (const habit of local.habits) {
    const matched = habitByName.get(keyOf(habit.name)) ?? habitById.get(habit.id);
    const sameMeaning =
      matched &&
      keyOf(matched.name) === keyOf(habit.name) &&
      matched.frequency === habit.frequency &&
      matched.active === habit.active;

    if (matched && sameMeaning) {
      habitIdMap.set(habit.id, matched.id);
    } else {
      const nextId = habitById.has(habit.id) ? id() : habit.id;
      const nextName = habitNamesUsed.has(keyOf(habit.name))
        ? makeUniqueLabeledTitle(habit.name, habitNamesUsed)
        : habit.name;
      const added = { ...habit, id: nextId, name: clampStr(nextName, 160) };
      habits.push(added);
      habitById.set(added.id, added);
      habitByName.set(keyOf(added.name), added);
      habitNamesUsed.add(keyOf(added.name));
      habitIdMap.set(habit.id, added.id);
    }
  }

  const weeklyHabitIdSet = new Set(habits.filter(h => h.cadence === 'weekly_count').map(h => h.id));
  const habitLogs = [...cloud.habitLogs];
  const logIndexByKey = new Map(
    habitLogs.map((l, idx) => [
      weeklyHabitIdSet.has(l.habitId) && l.status === 'done' ? `id:${l.id}` : `${l.habitId}:${l.date}`,
      idx,
    ]),
  );
  for (const log of local.habitLogs) {
    const mappedHabitId = habitIdMap.get(log.habitId) ?? log.habitId;
    const isWeeklyDone = weeklyHabitIdSet.has(mappedHabitId) && log.status === 'done';
    const key = isWeeklyDone ? `id:${log.id}` : `${mappedHabitId}:${log.date}`;
    const existingIdx = logIndexByKey.get(key);
    if (existingIdx === undefined) {
      habitLogs.push({ ...log, habitId: mappedHabitId });
      logIndexByKey.set(key, habitLogs.length - 1);
    } else if (!isWeeklyDone && habitLogs[existingIdx].status === 'skipped' && log.status === 'done') {
      // Preserve actual completion ('done') over 'skipped' on same-day conflict
      habitLogs[existingIdx] = { ...habitLogs[existingIdx], status: 'done' };
    }
  }

  const planMap = new Map(cloud.dailyPlans.map(p => [p.date, p]));
  for (const plan of local.dailyPlans) {
    const existing = planMap.get(plan.date);
    const mappedIds = plan.priorityTaskIds.map(tid => taskIdMap.get(tid) ?? tid);
    if (!existing) {
      planMap.set(plan.date, { date: plan.date, priorityTaskIds: mappedIds.slice(0, 3) });
    } else {
      const mergedIds = [...new Set([...existing.priorityTaskIds, ...mappedIds])].slice(0, 3);
      planMap.set(plan.date, { date: plan.date, priorityTaskIds: mergedIds });
    }
  }

  const reviewMap = new Map(cloud.dailyReviews.map(r => [r.date, r]));
  for (const review of local.dailyReviews) {
    const existing = reviewMap.get(review.date);
    if (!existing) {
      reviewMap.set(review.date, review);
    } else if (JSON.stringify(existing) !== JSON.stringify(review)) {
      reviewMap.set(review.date, mergeReviewFields(existing, review));
    }
  }

  const uncappedActive = rawProjects.filter(p => p.status === 'active');
  const applied = applySelectedActiveProjects(rawProjects, selectedActiveProjectIds);

  const data = sanitizeAppData({
    schemaVersion: 3,
    lifeAreas,
    goals,
    projects: applied.projects,
    tasks,
    habits,
    habitLogs,
    dailyPlans: [...planMap.values()],
    dailyReviews: [...reviewMap.values()],
    personalOS: mergePersonalOS(cloud.personalOS, local.personalOS, cloud.personalOS, true),
    updatedAt: new Date().toISOString(),
  });

  return {
    data,
    uncappedProjects: rawProjects,
    activeProjects: uncappedActive,
    exceedsProjectLimit: uncappedActive.length > MAX_ACTIVE_PROJECTS,
    archivedExcessCount: applied.archivedCount,
  };
}

export function mergeWorkspaceData(cloud: AppData, local: AppData): AppData {
  return mergeWorkspaceDataDetailed(cloud, local).data;
}

export function buildBackupEnvelope(data: AppData): BackupEnvelope {
  const clean = sanitizeAppData(data);
  const { syncVersion: _omitVersion, ...portableData } = clean;
  return {
    format: 'inpursuit-backup',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    data: portableData,
  };
}

export function exportData(data: AppData): void {
  const envelope = buildBackupEnvelope(data);
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `inpursuit-backup-${localDateKey()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface ParsedBackup {
  data: AppData;
  exportedAt: string | null;
  backupVersion: number | null;
  summary: WorkspaceSummary;
  archivedExcessProjects: number;
  rekeyedDuplicateIds: number;
}

function rekeyBackupDuplicateIds(data: StoredAppData): { data: StoredAppData; rekeyedCount: number } {
  let rekeyedCount = 0;
  const rekeyList = <T extends { id: string }>(items: readonly T[]): T[] => {
    const seen = new Map<string, string>();
    return items.map(item => {
      const serialized = JSON.stringify(item);
      const prev = seen.get(item.id);
      if (!prev) {
        seen.set(item.id, serialized);
        return item;
      }
      if (prev === serialized) {
        return item;
      }
      rekeyedCount += 1;
      const freshId = id();
      seen.set(freshId, JSON.stringify({ ...item, id: freshId }));
      return { ...item, id: freshId };
    });
  };

  return {
    data: {
      ...data,
      lifeAreas: Array.isArray(data.lifeAreas) ? rekeyList(data.lifeAreas as LifeArea[]) : data.lifeAreas,
      goals: rekeyList(data.goals),
      projects: rekeyList(data.projects),
      tasks: rekeyList(data.tasks),
      habits: rekeyList(data.habits),
    },
    rekeyedCount,
  };
}

export function inspectBackupText(rawText: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('This backup is not valid JSON.');
  }

  let candidate: unknown = parsed;
  let exportedAt: string | null = null;
  let backupVersion: number | null = null;

  if (isRecord(parsed) && parsed.format === 'inpursuit-backup') {
    if (typeof parsed.backupVersion !== 'number' || parsed.backupVersion > 1) {
      throw new Error(`This backup format (v${String(parsed.backupVersion)}) is newer than this version of InPursuit.`);
    }
    backupVersion = parsed.backupVersion;
    exportedAt = isString(parsed.exportedAt) ? parsed.exportedAt : null;
    candidate = parsed.data;
  }

  if (isRecord(candidate) && typeof candidate.schemaVersion === 'number' && candidate.schemaVersion > 3) {
    throw new Error(`This backup uses workspace schema v${candidate.schemaVersion}, which is not compatible with this version of InPursuit.`);
  }

  if (!isValidData(candidate)) {
    throw new Error('This file is not a valid InPursuit backup.');
  }

  const rekeyed = rekeyBackupDuplicateIds(candidate);
  const normalized = normalizeStoredData(rekeyed.data);
  const enforced = enforceActiveProjectLimit(normalized.projects);
  const finalData: AppData = enforced.archivedCount > 0 ? { ...normalized, projects: enforced.projects } : normalized;
  return {
    data: finalData,
    exportedAt,
    backupVersion,
    summary: summarizeWorkspace(finalData),
    archivedExcessProjects: enforced.archivedCount,
    rekeyedDuplicateIds: rekeyed.rekeyedCount,
  };
}

export async function importData(file: File): Promise<AppData> {
  return inspectBackupText(await file.text()).data;
}
