import type { Firestore } from 'firebase-admin/firestore';
import {
  classifyRemoteSnapshot,
  createDefaultData,
  createId,
  isValidAppData,
  sanitizeAppData,
  WORKSPACE_LIMITS,
} from '../../src/services/appStore';
import type {
  AppData,
  DailyPlan,
  DailyReview,
  Goal,
  Habit,
  HabitLog,
  LifeArea,
  Priority,
  Project,
  Status,
  Task,
  TaskStatus,
  WorkspaceMetaV4,
} from '../../src/types';
import { canActivateProject, MAX_ACTIVE_PROJECTS } from '../../src/utils/projectLimits';
import { getAdminFirestore } from './firebaseAdmin';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MAX_TX_RETRIES = 3;

export const FIELD_LIMITS = {
  id: 128,
  lifeAreaName: 160,
  lifeAreaDescription: 1000,
  goalTitle: 240,
  goalOutcome: 2000,
  projectTitle: 240,
  projectDescription: 2000,
  taskTitle: 240,
  habitName: 160,
  date: 20,
  timestamp: 40,
  reviewText: 4000,
  dailyPlanMaxTasks: 3,
} as const;

export class WorkspaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceValidationError';
  }
}

export class WorkspaceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceNotFoundError';
  }
}

export class WorkspaceSchemaError extends Error {
  readonly schemaVersion: number;
  readonly meta: WorkspaceMetaV4;

  constructor(message: string, details: { schemaVersion: number; meta: WorkspaceMetaV4 }) {
    super(message);
    this.name = 'WorkspaceSchemaError';
    this.schemaVersion = details.schemaVersion;
    this.meta = details.meta;
  }
}

export class WorkspaceConflictError extends Error {
  readonly attempts: number;

  constructor(message: string, attempts: number) {
    super(message);
    this.name = 'WorkspaceConflictError';
    this.attempts = attempts;
  }
}

export interface WorkspaceReadResult {
  exists: boolean;
  syncVersion: number;
  data: AppData;
}

export interface WorkspaceWriteResult {
  syncVersion: number;
  updatedAt: string;
  data: AppData;
}

export interface WorkspaceOperationOptions {
  db?: Firestore;
  now?: Date;
  maxRetries?: number;
}

function assertValidUid(uid: string): string {
  const trimmed = typeof uid === 'string' ? uid.trim() : '';
  if (!trimmed || trimmed.includes('/')) {
    throw new WorkspaceValidationError('A valid user uid is required.');
  }
  return trimmed;
}

function assertValidDateKey(date: string, fieldName = 'date'): string {
  const trimmed = typeof date === 'string' ? date.trim() : '';
  if (!DATE_KEY_RE.test(trimmed)) {
    throw new WorkspaceValidationError(`${fieldName} must use YYYY-MM-DD format.`);
  }
  return trimmed;
}

function assertOptionalDateKey(date: string | undefined, fieldName: string): string {
  if (date === undefined || date.trim() === '') return '';
  return assertValidDateKey(date, fieldName);
}

function isRetryableTransactionError(error: unknown): boolean {
  if (
    error instanceof WorkspaceValidationError ||
    error instanceof WorkspaceNotFoundError ||
    error instanceof WorkspaceSchemaError ||
    error instanceof WorkspaceConflictError
  ) {
    return false;
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 10 || code === 9) return true; // gRPC ABORTED (10) / FAILED_PRECONDITION (9)
    if (typeof code === 'string') {
      const normalized = code.toLowerCase();
      if (normalized === 'aborted' || normalized === 'failed-precondition') {
        return true;
      }
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('aborted') ||
    message.includes('cross-transaction contention') ||
    message.includes('concurrent modification') ||
    message.includes('transaction conflict')
  );
}

/** Collapse duplicate (habitId, date) entries keeping the latest write before sanitizeAppData's first-wins pass. */
function dedupeHabitLogsKeepLatest(logs: readonly HabitLog[]): HabitLog[] {
  const seen = new Set<string>();
  const reversed: HabitLog[] = [];
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const entry = logs[i];
    const key = `${entry.habitId}:${entry.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reversed.push(entry);
  }
  return reversed.reverse();
}

function enforceActiveProjectsInvariant(previous: AppData, next: AppData): void {
  const nextActive = next.projects.filter(project => project.status === 'active');
  if (nextActive.length <= MAX_ACTIVE_PROJECTS) {
    return;
  }

  const prevActiveIds = new Set(
    previous.projects.filter(project => project.status === 'active').map(project => project.id),
  );
  const activatedNew = nextActive.some(project => !prevActiveIds.has(project.id));
  if (prevActiveIds.size <= MAX_ACTIVE_PROJECTS || activatedNew) {
    throw new WorkspaceValidationError(
      `The ${MAX_ACTIVE_PROJECTS}-project active limit is reached. Complete or archive an active project first.`,
    );
  }
}

function toFirestorePayload(data: AppData, syncVersion: number, updatedAt: string): AppData {
  const collapsedLogs = dedupeHabitLogsKeepLatest(data.habitLogs);
  const sanitized = sanitizeAppData({
    ...data,
    habitLogs: collapsedLogs,
    updatedAt,
  });

  const payload: AppData = {
    schemaVersion: 3,
    lifeAreas: sanitized.lifeAreas,
    goals: sanitized.goals,
    projects: sanitized.projects,
    tasks: sanitized.tasks,
    habits: sanitized.habits,
    habitLogs: sanitized.habitLogs,
    dailyPlans: sanitized.dailyPlans,
    dailyReviews: sanitized.dailyReviews,
    updatedAt: updatedAt.slice(0, FIELD_LIMITS.timestamp),
    syncVersion,
  };

  if (!isValidAppData(payload)) {
    throw new WorkspaceValidationError('Resulting workspace failed schema v3 validation.');
  }
  return payload;
}

export async function readWorkspace(uid: string, db: Firestore = getAdminFirestore()): Promise<WorkspaceReadResult> {
  const safeUid = assertValidUid(uid);
  const snap = await db.doc(`users/${safeUid}`).get();
  if (!snap.exists) {
    return {
      exists: false,
      syncVersion: 0,
      data: sanitizeAppData(createDefaultData()),
    };
  }

  const classified = classifyRemoteSnapshot(snap.data());
  if (classified.kind === 'incompatible-v4') {
    throw new WorkspaceSchemaError(
      `Cloud workspace uses schema v${classified.schemaVersion}, which cannot be read as v3.`,
      { schemaVersion: classified.schemaVersion, meta: classified.meta },
    );
  }
  if (classified.kind === 'invalid') {
    throw new WorkspaceValidationError('Cloud workspace contains an unsupported or invalid data format.');
  }

  return {
    exists: true,
    syncVersion: classified.syncVersion,
    data: classified.data,
  };
}

export async function mutateWorkspace(
  uid: string,
  mutator: (current: AppData) => AppData | Promise<AppData>,
  options: WorkspaceOperationOptions = {},
): Promise<WorkspaceWriteResult> {
  const safeUid = assertValidUid(uid);
  const db = options.db ?? getAdminFirestore();
  const maxRetries = Math.max(1, options.maxRetries ?? DEFAULT_MAX_TX_RETRIES);
  const userRef = db.doc(`users/${safeUid}`);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await db.runTransaction(async tx => {
        const snap = await tx.get(userRef);
        let currentData: AppData;
        let currentSyncVersion = 0;

        if (snap.exists) {
          const classified = classifyRemoteSnapshot(snap.data());
          if (classified.kind === 'incompatible-v4') {
            throw new WorkspaceSchemaError(
              `Cloud workspace uses schema v${classified.schemaVersion}, which cannot be modified by a v3 server writer.`,
              { schemaVersion: classified.schemaVersion, meta: classified.meta },
            );
          }
          if (classified.kind === 'invalid') {
            throw new WorkspaceValidationError(
              'Cloud workspace contains an unsupported or invalid data format; write aborted.',
            );
          }
          currentData = classified.data;
          currentSyncVersion = classified.syncVersion;
        } else {
          currentData = sanitizeAppData(createDefaultData());
        }

        const draft = structuredClone(currentData);
        const mutated = await mutator(draft);
        enforceActiveProjectsInvariant(currentData, mutated);

        const nextSyncVersion = currentSyncVersion + 1;
        const updatedAt = (options.now ?? new Date()).toISOString().slice(0, FIELD_LIMITS.timestamp);
        const payload = toFirestorePayload(mutated, nextSyncVersion, updatedAt);

        tx.set(userRef, payload);

        return {
          syncVersion: nextSyncVersion,
          updatedAt: payload.updatedAt!,
          data: payload,
        };
      });
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && isRetryableTransactionError(error)) {
        continue;
      }
      if (isRetryableTransactionError(error)) {
        throw new WorkspaceConflictError(
          `Workspace update conflicted across ${attempt} transaction attempts. Retry the operation.`,
          attempt,
        );
      }
      throw error;
    }
  }

  throw lastError;
}

export interface CreateLifeAreaInput {
  name: string;
  description?: string;
}

export async function createLifeArea(
  uid: string,
  input: CreateLifeAreaInput,
  options?: WorkspaceOperationOptions,
): Promise<{ area: LifeArea; write: WorkspaceWriteResult }> {
  const name = input.name.trim();
  if (!name) {
    throw new WorkspaceValidationError('Life area name is required.');
  }
  const nowIso = (options?.now ?? new Date()).toISOString().slice(0, FIELD_LIMITS.timestamp);
  let created!: LifeArea;

  const write = await mutateWorkspace(
    uid,
    current => {
      if (current.lifeAreas.length >= WORKSPACE_LIMITS.lifeAreas) {
        throw new WorkspaceValidationError(`Life areas limit (${WORKSPACE_LIMITS.lifeAreas}) reached.`);
      }
      created = {
        id: createId(),
        name: name.slice(0, FIELD_LIMITS.lifeAreaName),
        description: (input.description ?? '').trim().slice(0, FIELD_LIMITS.lifeAreaDescription),
        createdAt: nowIso,
      };
      return { ...current, lifeAreas: [...current.lifeAreas, created] };
    },
    options,
  );

  return { area: write.data.lifeAreas.find(a => a.id === created.id) ?? created, write };
}

export async function deleteLifeArea(
  uid: string,
  lifeAreaId: string,
  options?: WorkspaceOperationOptions,
): Promise<WorkspaceWriteResult> {
  return mutateWorkspace(
    uid,
    current => {
      if (!current.lifeAreas.some(a => a.id === lifeAreaId)) {
        throw new WorkspaceNotFoundError(`Life area '${lifeAreaId}' was not found.`);
      }
      return {
        ...current,
        lifeAreas: current.lifeAreas.filter(a => a.id !== lifeAreaId),
        goals: current.goals.map(g => (g.lifeAreaId === lifeAreaId ? { ...g, lifeAreaId: null } : g)),
      };
    },
    options,
  );
}

export interface CreateGoalInput {
  title: string;
  outcome?: string;
  targetDate?: string;
  lifeAreaId?: string | null;
  status?: Status;
}

export async function createGoal(
  uid: string,
  input: CreateGoalInput,
  options?: WorkspaceOperationOptions,
): Promise<{ goal: Goal; write: WorkspaceWriteResult }> {
  const title = input.title.trim();
  if (!title) {
    throw new WorkspaceValidationError('Goal title is required.');
  }
  const targetDate = assertOptionalDateKey(input.targetDate, 'targetDate');
  const nowIso = (options?.now ?? new Date()).toISOString().slice(0, FIELD_LIMITS.timestamp);
  let created!: Goal;

  const write = await mutateWorkspace(
    uid,
    current => {
      if (current.goals.length >= WORKSPACE_LIMITS.goals) {
        throw new WorkspaceValidationError(`Goals limit (${WORKSPACE_LIMITS.goals}) reached.`);
      }
      if (input.lifeAreaId && !current.lifeAreas.some(a => a.id === input.lifeAreaId)) {
        throw new WorkspaceNotFoundError(`Life area '${input.lifeAreaId}' was not found.`);
      }
      created = {
        id: createId(),
        lifeAreaId: input.lifeAreaId ?? null,
        title: title.slice(0, FIELD_LIMITS.goalTitle),
        outcome: (input.outcome ?? '').trim().slice(0, FIELD_LIMITS.goalOutcome),
        targetDate,
        status: input.status ?? 'active',
        createdAt: nowIso,
      };
      return { ...current, goals: [...current.goals, created] };
    },
    options,
  );

  return { goal: write.data.goals.find(g => g.id === created.id) ?? created, write };
}

export interface UpdateGoalInput {
  title?: string;
  outcome?: string;
  targetDate?: string;
  lifeAreaId?: string | null;
  status?: Status;
}

export async function updateGoal(
  uid: string,
  goalId: string,
  patch: UpdateGoalInput,
  options?: WorkspaceOperationOptions,
): Promise<{ goal: Goal; write: WorkspaceWriteResult }> {
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new WorkspaceValidationError('Goal title cannot be empty.');
  }
  const nextTargetDate = patch.targetDate !== undefined ? assertOptionalDateKey(patch.targetDate, 'targetDate') : undefined;

  const write = await mutateWorkspace(
    uid,
    current => {
      const existing = current.goals.find(g => g.id === goalId);
      if (!existing) {
        throw new WorkspaceNotFoundError(`Goal '${goalId}' was not found.`);
      }
      if (patch.lifeAreaId && !current.lifeAreas.some(a => a.id === patch.lifeAreaId)) {
        throw new WorkspaceNotFoundError(`Life area '${patch.lifeAreaId}' was not found.`);
      }
      return {
        ...current,
        goals: current.goals.map(g =>
          g.id === goalId
            ? {
                ...g,
                title: patch.title !== undefined ? patch.title.trim().slice(0, FIELD_LIMITS.goalTitle) : g.title,
                outcome: patch.outcome !== undefined ? patch.outcome.trim().slice(0, FIELD_LIMITS.goalOutcome) : g.outcome,
                targetDate: nextTargetDate !== undefined ? nextTargetDate : g.targetDate,
                lifeAreaId: patch.lifeAreaId !== undefined ? patch.lifeAreaId : g.lifeAreaId,
                status: patch.status ?? g.status,
              }
            : g,
        ),
      };
    },
    options,
  );

  const goal = write.data.goals.find(g => g.id === goalId)!;
  return { goal, write };
}

export async function deleteGoal(
  uid: string,
  goalId: string,
  options?: WorkspaceOperationOptions,
): Promise<WorkspaceWriteResult> {
  return mutateWorkspace(
    uid,
    current => {
      if (!current.goals.some(g => g.id === goalId)) {
        throw new WorkspaceNotFoundError(`Goal '${goalId}' was not found.`);
      }
      return {
        ...current,
        goals: current.goals.filter(g => g.id !== goalId),
        projects: current.projects.map(p => (p.goalId === goalId ? { ...p, goalId: null } : p)),
      };
    },
    options,
  );
}

export interface CreateProjectInput {
  title: string;
  description?: string;
  dueDate?: string;
  goalId?: string | null;
  status?: Status;
}

export async function createProject(
  uid: string,
  input: CreateProjectInput,
  options?: WorkspaceOperationOptions,
): Promise<{ project: Project; write: WorkspaceWriteResult }> {
  const title = input.title.trim();
  if (!title) {
    throw new WorkspaceValidationError('Project title is required.');
  }
  const dueDate = assertOptionalDateKey(input.dueDate, 'dueDate');
  const status: Status = input.status ?? 'active';
  const nowIso = (options?.now ?? new Date()).toISOString().slice(0, FIELD_LIMITS.timestamp);
  let created!: Project;

  const write = await mutateWorkspace(
    uid,
    current => {
      if (current.projects.length >= WORKSPACE_LIMITS.projects) {
        throw new WorkspaceValidationError(`Projects limit (${WORKSPACE_LIMITS.projects}) reached.`);
      }
      if (input.goalId && !current.goals.some(g => g.id === input.goalId)) {
        throw new WorkspaceNotFoundError(`Goal '${input.goalId}' was not found.`);
      }
      if (status === 'active' && !canActivateProject(current.projects)) {
        throw new WorkspaceValidationError(
          `The ${MAX_ACTIVE_PROJECTS}-project active limit is reached. Complete or archive an active project first.`,
        );
      }
      created = {
        id: createId(),
        goalId: input.goalId ?? null,
        title: title.slice(0, FIELD_LIMITS.projectTitle),
        description: (input.description ?? '').trim().slice(0, FIELD_LIMITS.projectDescription),
        dueDate,
        status,
        createdAt: nowIso,
      };
      return { ...current, projects: [...current.projects, created] };
    },
    options,
  );

  return { project: write.data.projects.find(p => p.id === created.id) ?? created, write };
}

export interface UpdateProjectInput {
  title?: string;
  description?: string;
  dueDate?: string;
  goalId?: string | null;
  status?: Status;
}

export async function updateProject(
  uid: string,
  projectId: string,
  patch: UpdateProjectInput,
  options?: WorkspaceOperationOptions,
): Promise<{ project: Project; write: WorkspaceWriteResult }> {
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new WorkspaceValidationError('Project title cannot be empty.');
  }
  const nextDueDate = patch.dueDate !== undefined ? assertOptionalDateKey(patch.dueDate, 'dueDate') : undefined;

  const write = await mutateWorkspace(
    uid,
    current => {
      const existing = current.projects.find(p => p.id === projectId);
      if (!existing) {
        throw new WorkspaceNotFoundError(`Project '${projectId}' was not found.`);
      }
      if (patch.goalId && !current.goals.some(g => g.id === patch.goalId)) {
        throw new WorkspaceNotFoundError(`Goal '${patch.goalId}' was not found.`);
      }
      const nextStatus = patch.status ?? existing.status;
      if (nextStatus === 'active' && !canActivateProject(current.projects, projectId)) {
        throw new WorkspaceValidationError(
          `The ${MAX_ACTIVE_PROJECTS}-project active limit is reached. Complete or archive an active project first.`,
        );
      }
      return {
        ...current,
        projects: current.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                title: patch.title !== undefined ? patch.title.trim().slice(0, FIELD_LIMITS.projectTitle) : p.title,
                description:
                  patch.description !== undefined
                    ? patch.description.trim().slice(0, FIELD_LIMITS.projectDescription)
                    : p.description,
                dueDate: nextDueDate !== undefined ? nextDueDate : p.dueDate,
                goalId: patch.goalId !== undefined ? patch.goalId : p.goalId,
                status: nextStatus,
              }
            : p,
        ),
      };
    },
    options,
  );

  const project = write.data.projects.find(p => p.id === projectId)!;
  return { project, write };
}

export async function deleteProject(
  uid: string,
  projectId: string,
  options?: WorkspaceOperationOptions,
): Promise<WorkspaceWriteResult> {
  return mutateWorkspace(
    uid,
    current => {
      if (!current.projects.some(p => p.id === projectId)) {
        throw new WorkspaceNotFoundError(`Project '${projectId}' was not found.`);
      }
      return {
        ...current,
        projects: current.projects.filter(p => p.id !== projectId),
        tasks: current.tasks.map(t => (t.projectId === projectId ? { ...t, projectId: null } : t)),
      };
    },
    options,
  );
}

export interface CreateTaskInput {
  title: string;
  projectId?: string | null;
  dueDate?: string;
  priority?: Priority;
  status?: TaskStatus;
}

export async function createTask(
  uid: string,
  input: CreateTaskInput,
  options?: WorkspaceOperationOptions,
): Promise<{ task: Task; write: WorkspaceWriteResult }> {
  const title = input.title.trim();
  if (!title) {
    throw new WorkspaceValidationError('Task title is required.');
  }
  const dueDate = assertOptionalDateKey(input.dueDate, 'dueDate');
  const status: TaskStatus = input.status ?? 'todo';
  const nowIso = (options?.now ?? new Date()).toISOString().slice(0, FIELD_LIMITS.timestamp);
  let created!: Task;

  const write = await mutateWorkspace(
    uid,
    current => {
      if (current.tasks.length >= WORKSPACE_LIMITS.tasks) {
        throw new WorkspaceValidationError(`Tasks limit (${WORKSPACE_LIMITS.tasks}) reached.`);
      }
      if (input.projectId && !current.projects.some(p => p.id === input.projectId)) {
        throw new WorkspaceNotFoundError(`Project '${input.projectId}' was not found.`);
      }
      created = {
        id: createId(),
        projectId: input.projectId ?? null,
        title: title.slice(0, FIELD_LIMITS.taskTitle),
        dueDate,
        priority: input.priority ?? 'medium',
        status,
        createdAt: nowIso,
        completedAt: status === 'done' ? nowIso : null,
      };
      return { ...current, tasks: [...current.tasks, created] };
    },
    options,
  );

  return { task: write.data.tasks.find(t => t.id === created.id) ?? created, write };
}

export interface UpdateTaskInput {
  title?: string;
  projectId?: string | null;
  dueDate?: string;
  priority?: Priority;
  status?: TaskStatus;
}

export async function updateTask(
  uid: string,
  taskId: string,
  patch: UpdateTaskInput,
  options?: WorkspaceOperationOptions,
): Promise<{ task: Task; write: WorkspaceWriteResult }> {
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new WorkspaceValidationError('Task title cannot be empty.');
  }
  const nextDueDate = patch.dueDate !== undefined ? assertOptionalDateKey(patch.dueDate, 'dueDate') : undefined;
  const nowIso = (options?.now ?? new Date()).toISOString().slice(0, FIELD_LIMITS.timestamp);

  const write = await mutateWorkspace(
    uid,
    current => {
      const existing = current.tasks.find(t => t.id === taskId);
      if (!existing) {
        throw new WorkspaceNotFoundError(`Task '${taskId}' was not found.`);
      }
      if (patch.projectId && !current.projects.some(p => p.id === patch.projectId)) {
        throw new WorkspaceNotFoundError(`Project '${patch.projectId}' was not found.`);
      }
      const nextStatus = patch.status ?? existing.status;
      const completedAt =
        patch.status === undefined
          ? existing.completedAt
          : nextStatus === 'done'
            ? existing.completedAt ?? nowIso
            : null;

      return {
        ...current,
        tasks: current.tasks.map(t =>
          t.id === taskId
            ? {
                ...t,
                title: patch.title !== undefined ? patch.title.trim().slice(0, FIELD_LIMITS.taskTitle) : t.title,
                projectId: patch.projectId !== undefined ? patch.projectId : t.projectId,
                dueDate: nextDueDate !== undefined ? nextDueDate : t.dueDate,
                priority: patch.priority ?? t.priority,
                status: nextStatus,
                completedAt,
              }
            : t,
        ),
      };
    },
    options,
  );

  const task = write.data.tasks.find(t => t.id === taskId)!;
  return { task, write };
}

export async function deleteTask(
  uid: string,
  taskId: string,
  options?: WorkspaceOperationOptions,
): Promise<WorkspaceWriteResult> {
  return mutateWorkspace(
    uid,
    current => {
      if (!current.tasks.some(t => t.id === taskId)) {
        throw new WorkspaceNotFoundError(`Task '${taskId}' was not found.`);
      }
      return {
        ...current,
        tasks: current.tasks.filter(t => t.id !== taskId),
        dailyPlans: current.dailyPlans.map(plan => ({
          ...plan,
          priorityTaskIds: plan.priorityTaskIds.filter(id => id !== taskId),
        })),
      };
    },
    options,
  );
}

export interface CreateHabitInput {
  name: string;
  frequency?: Habit['frequency'];
  active?: boolean;
}

export async function createHabit(
  uid: string,
  input: CreateHabitInput,
  options?: WorkspaceOperationOptions,
): Promise<{ habit: Habit; write: WorkspaceWriteResult }> {
  const name = input.name.trim();
  if (!name) {
    throw new WorkspaceValidationError('Habit name is required.');
  }
  const nowIso = (options?.now ?? new Date()).toISOString().slice(0, FIELD_LIMITS.timestamp);
  let created!: Habit;

  const write = await mutateWorkspace(
    uid,
    current => {
      if (current.habits.length >= WORKSPACE_LIMITS.habits) {
        throw new WorkspaceValidationError(`Habits limit (${WORKSPACE_LIMITS.habits}) reached.`);
      }
      created = {
        id: createId(),
        name: name.slice(0, FIELD_LIMITS.habitName),
        frequency: input.frequency ?? 'daily',
        active: input.active ?? true,
        createdAt: nowIso,
      };
      return { ...current, habits: [...current.habits, created] };
    },
    options,
  );

  return { habit: write.data.habits.find(h => h.id === created.id) ?? created, write };
}

export interface UpdateHabitInput {
  name?: string;
  frequency?: Habit['frequency'];
  active?: boolean;
}

export async function updateHabit(
  uid: string,
  habitId: string,
  patch: UpdateHabitInput,
  options?: WorkspaceOperationOptions,
): Promise<{ habit: Habit; write: WorkspaceWriteResult }> {
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new WorkspaceValidationError('Habit name cannot be empty.');
  }

  const write = await mutateWorkspace(
    uid,
    current => {
      const existing = current.habits.find(h => h.id === habitId);
      if (!existing) {
        throw new WorkspaceNotFoundError(`Habit '${habitId}' was not found.`);
      }
      return {
        ...current,
        habits: current.habits.map(h =>
          h.id === habitId
            ? {
                ...h,
                name: patch.name !== undefined ? patch.name.trim().slice(0, FIELD_LIMITS.habitName) : h.name,
                frequency: patch.frequency ?? h.frequency,
                active: patch.active ?? h.active,
              }
            : h,
        ),
      };
    },
    options,
  );

  const habit = write.data.habits.find(h => h.id === habitId)!;
  return { habit, write };
}

export async function deleteHabit(
  uid: string,
  habitId: string,
  options?: WorkspaceOperationOptions,
): Promise<WorkspaceWriteResult> {
  return mutateWorkspace(
    uid,
    current => {
      if (!current.habits.some(h => h.id === habitId)) {
        throw new WorkspaceNotFoundError(`Habit '${habitId}' was not found.`);
      }
      return {
        ...current,
        habits: current.habits.filter(h => h.id !== habitId),
        habitLogs: current.habitLogs.filter(log => log.habitId !== habitId),
      };
    },
    options,
  );
}

export interface LogHabitInput {
  habitId: string;
  date: string;
  status: 'done' | 'skipped' | 'clear';
}

export async function logHabit(
  uid: string,
  input: LogHabitInput,
  options?: WorkspaceOperationOptions,
): Promise<{ log: HabitLog | null; write: WorkspaceWriteResult }> {
  const date = assertValidDateKey(input.date, 'date');
  let createdOrUpdated: HabitLog | null = null;

  const write = await mutateWorkspace(
    uid,
    current => {
      if (!current.habits.some(h => h.id === input.habitId)) {
        throw new WorkspaceNotFoundError(`Habit '${input.habitId}' was not found.`);
      }
      const existing = current.habitLogs.find(l => l.habitId === input.habitId && l.date === date);
      const remaining = current.habitLogs.filter(l => !(l.habitId === input.habitId && l.date === date));

      if (input.status === 'clear') {
        createdOrUpdated = null;
        return { ...current, habitLogs: remaining };
      }

      createdOrUpdated = {
        id: existing?.id ?? createId(),
        habitId: input.habitId,
        date,
        status: input.status,
      };
      return {
        ...current,
        habitLogs: [...remaining, createdOrUpdated],
      };
    },
    options,
  );

  const persisted =
    input.status === 'clear'
      ? null
      : (write.data.habitLogs.find(l => l.habitId === input.habitId && l.date === date) ?? createdOrUpdated);

  return { log: persisted, write };
}

export interface SetDailyPlanInput {
  date: string;
  priorityTaskIds: readonly string[];
}

export async function setDailyPlan(
  uid: string,
  input: SetDailyPlanInput,
  options?: WorkspaceOperationOptions,
): Promise<{ plan: DailyPlan; write: WorkspaceWriteResult }> {
  const date = assertValidDateKey(input.date, 'date');

  const uniqueTaskIds: string[] = [];
  const seen = new Set<string>();
  for (const rawId of input.priorityTaskIds) {
    const cleanId = typeof rawId === 'string' ? rawId.trim() : '';
    if (!cleanId || seen.has(cleanId)) continue;
    seen.add(cleanId);
    uniqueTaskIds.push(cleanId);
  }

  if (uniqueTaskIds.length > FIELD_LIMITS.dailyPlanMaxTasks) {
    throw new WorkspaceValidationError(
      `A daily plan can have at most ${FIELD_LIMITS.dailyPlanMaxTasks} unique priority tasks.`,
    );
  }

  const write = await mutateWorkspace(
    uid,
    current => {
      const taskIdSet = new Set(current.tasks.map(t => t.id));
      const missing = uniqueTaskIds.filter(id => !taskIdSet.has(id));
      if (missing.length > 0) {
        throw new WorkspaceNotFoundError(`Task '${missing[0]}' was not found.`);
      }

      const plan: DailyPlan = { date, priorityTaskIds: uniqueTaskIds };
      return {
        ...current,
        dailyPlans: [...current.dailyPlans.filter(p => p.date !== date), plan],
      };
    },
    options,
  );

  const plan = write.data.dailyPlans.find(p => p.date === date) ?? { date, priorityTaskIds: uniqueTaskIds };
  return { plan, write };
}

export interface UpsertDailyReviewInput {
  date: string;
  wins?: string;
  blockers?: string;
  notes?: string;
  energy?: number;
}

export async function upsertDailyReview(
  uid: string,
  input: UpsertDailyReviewInput,
  options?: WorkspaceOperationOptions,
): Promise<{ review: DailyReview; write: WorkspaceWriteResult }> {
  const date = assertValidDateKey(input.date, 'date');

  const write = await mutateWorkspace(
    uid,
    current => {
      const existing = current.dailyReviews.find(r => r.date === date);
      const rawEnergy = input.energy ?? existing?.energy ?? 3;
      const energy = Math.min(5, Math.max(1, Math.round(rawEnergy)));

      const nextReview: DailyReview = {
        date,
        wins: (input.wins ?? existing?.wins ?? '').slice(0, FIELD_LIMITS.reviewText),
        blockers: (input.blockers ?? existing?.blockers ?? '').slice(0, FIELD_LIMITS.reviewText),
        notes: (input.notes ?? existing?.notes ?? '').slice(0, FIELD_LIMITS.reviewText),
        energy,
      };

      return {
        ...current,
        dailyReviews: [...current.dailyReviews.filter(r => r.date !== date), nextReview],
      };
    },
    options,
  );

  const review = write.data.dailyReviews.find(r => r.date === date)!;
  return { review, write };
}
