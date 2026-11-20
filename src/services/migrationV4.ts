import { collection, doc, getDoc, getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import type {
  AppData,
  DailyPlan,
  DailyReview,
  Goal,
  Habit,
  HabitLog,
  HabitLogMonthDoc,
  LifeArea,
  Project,
  Task,
  WorkspaceMetaV4,
} from '../types';
import { buildBackupEnvelope, normalizeRemoteOrNull, sanitizeAppData } from './appStore';

export interface V4WorkspaceBundle {
  meta: WorkspaceMetaV4;
  lifeAreas: LifeArea[];
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  habits: Habit[];
  habitLogMonths: HabitLogMonthDoc[];
  dailyPlans: DailyPlan[];
  dailyReviews: DailyReview[];
}

export interface MigrationPlanReport {
  uid: string;
  dryRun: boolean;
  totalDocuments: number;
  counts: {
    lifeAreas: number;
    goals: number;
    projects: number;
    tasks: number;
    habits: number;
    habitLogMonths: number;
    dailyPlans: number;
    dailyReviews: number;
  };
  backupJson: string;
  migrated: boolean;
}

const MAX_BATCH_OPS = 400;

/**
 * Pure, deterministic conversion from monolithic v3 AppData to normalized v4 subcollection documents.
 * Safe to run repeatedly (idempotent) without mutating source data.
 */
export function buildV4DocumentsFromV3(source: AppData): V4WorkspaceBundle {
  const clean = sanitizeAppData(source);
  const updatedAt = (clean.updatedAt || new Date().toISOString()).slice(0, 40);

  const weeklyHabitIds = new Set(clean.habits.filter(h => h.cadence === 'weekly_count').map(h => h.id));
  const monthMap = new Map<string, Record<string, HabitLog>>();
  for (const log of clean.habitLogs) {
    const month = log.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    let bucket = monthMap.get(month);
    if (!bucket) {
      bucket = {};
      monthMap.set(month, bucket);
    }
    const entryKey =
      weeklyHabitIds.has(log.habitId) && log.status === 'done'
        ? `${log.habitId}_${log.date}_${log.id}`
        : `${log.habitId}_${log.date}`;
    bucket[entryKey] = {
      id: log.id,
      habitId: log.habitId,
      date: log.date,
      status: log.status,
    };
  }

  const habitLogMonths: HabitLogMonthDoc[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, logs]) => ({ month, logs, updatedAt }));

  return {
    meta: {
      schemaVersion: 4,
      migrationStatus: 'completed',
      migratedFromSchema: 3,
      updatedAt,
    },
    lifeAreas: clean.lifeAreas,
    goals: clean.goals,
    projects: clean.projects,
    tasks: clean.tasks,
    habits: clean.habits,
    habitLogMonths,
    dailyPlans: clean.dailyPlans,
    dailyReviews: clean.dailyReviews,
  };
}

/**
 * Reconstructs a full v3 AppData workspace from v4 subcollection documents (verified rollback path).
 */
export function reconstructV3FromV4(bundle: V4WorkspaceBundle): AppData {
  const habitLogs: HabitLog[] = [];
  for (const monthDoc of bundle.habitLogMonths) {
    for (const log of Object.values(monthDoc.logs)) {
      habitLogs.push(log);
    }
  }

  return sanitizeAppData({
    schemaVersion: 3,
    lifeAreas: bundle.lifeAreas,
    goals: bundle.goals,
    projects: bundle.projects,
    tasks: bundle.tasks,
    habits: bundle.habits,
    habitLogs,
    dailyPlans: bundle.dailyPlans,
    dailyReviews: bundle.dailyReviews,
    updatedAt: bundle.meta.updatedAt,
  });
}

/**
 * Versioned, idempotent v3 -> v4 migration helper.
 * Always creates a backup JSON snapshot before writing and preserves rollback capability.
 * Never executed automatically on boot; intended for explicit operator/opt-in execution.
 */
export async function migrateWorkspaceV3ToV4(
  firestore: Firestore,
  uid: string,
  options: { dryRun?: boolean } = {},
): Promise<MigrationPlanReport> {
  const dryRun = options.dryRun ?? true;
  const userRef = doc(firestore, 'users', uid);
  const rootSnap = await getDoc(userRef);

  if (!rootSnap.exists()) {
    throw new Error('Workspace root document does not exist for migration.');
  }

  const raw = rootSnap.data();
  if (raw?.schemaVersion === 4 && raw?.migrationStatus === 'completed') {
    const existingBundle = await loadV4BundleFromFirestore(firestore, uid, raw as WorkspaceMetaV4);
    const reconstructed = reconstructV3FromV4(existingBundle);
    return {
      uid,
      dryRun,
      totalDocuments: 0,
      counts: {
        lifeAreas: existingBundle.lifeAreas.length,
        goals: existingBundle.goals.length,
        projects: existingBundle.projects.length,
        tasks: existingBundle.tasks.length,
        habits: existingBundle.habits.length,
        habitLogMonths: existingBundle.habitLogMonths.length,
        dailyPlans: existingBundle.dailyPlans.length,
        dailyReviews: existingBundle.dailyReviews.length,
      },
      backupJson: JSON.stringify(buildBackupEnvelope(reconstructed)),
      migrated: false,
    };
  }

  const v3Data = normalizeRemoteOrNull(raw);
  if (!v3Data) {
    throw new Error('Root workspace document is not a valid v3 workspace.');
  }

  const backupJson = JSON.stringify(buildBackupEnvelope(v3Data));
  const bundle = buildV4DocumentsFromV3(v3Data);

  const ops: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [
    ...bundle.lifeAreas.map(item => ({ ref: doc(firestore, 'users', uid, 'lifeAreas', item.id), data: { ...item } })),
    ...bundle.goals.map(item => ({ ref: doc(firestore, 'users', uid, 'goals', item.id), data: { ...item } })),
    ...bundle.projects.map(item => ({ ref: doc(firestore, 'users', uid, 'projects', item.id), data: { ...item } })),
    ...bundle.tasks.map(item => ({ ref: doc(firestore, 'users', uid, 'tasks', item.id), data: { ...item } })),
    ...bundle.habits.map(item => ({ ref: doc(firestore, 'users', uid, 'habits', item.id), data: { ...item } })),
    ...bundle.habitLogMonths.map(item => ({ ref: doc(firestore, 'users', uid, 'habitLogMonths', item.month), data: { ...item } })),
    ...bundle.dailyPlans.map(item => ({ ref: doc(firestore, 'users', uid, 'dailyPlans', item.date), data: { ...item } })),
    ...bundle.dailyReviews.map(item => ({ ref: doc(firestore, 'users', uid, 'dailyReviews', item.date), data: { ...item } })),
  ];

  if (!dryRun) {
    for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
      const batch = writeBatch(firestore);
      for (const op of ops.slice(i, i + MAX_BATCH_OPS)) {
        batch.set(op.ref, op.data, { merge: true });
      }
      await batch.commit();
    }
    const metaBatch = writeBatch(firestore);
    metaBatch.set(userRef, bundle.meta);
    await metaBatch.commit();
  }

  return {
    uid,
    dryRun,
    totalDocuments: ops.length + 1,
    counts: {
      lifeAreas: bundle.lifeAreas.length,
      goals: bundle.goals.length,
      projects: bundle.projects.length,
      tasks: bundle.tasks.length,
      habits: bundle.habits.length,
      habitLogMonths: bundle.habitLogMonths.length,
      dailyPlans: bundle.dailyPlans.length,
      dailyReviews: bundle.dailyReviews.length,
    },
    backupJson,
    migrated: !dryRun,
  };
}

export async function loadV4BundleFromFirestore(
  firestore: Firestore,
  uid: string,
  meta: WorkspaceMetaV4,
): Promise<V4WorkspaceBundle> {
  const [lifeAreasSnap, goalsSnap, projectsSnap, tasksSnap, habitsSnap, monthsSnap, plansSnap, reviewsSnap] = await Promise.all([
    getDocs(collection(firestore, 'users', uid, 'lifeAreas')),
    getDocs(collection(firestore, 'users', uid, 'goals')),
    getDocs(collection(firestore, 'users', uid, 'projects')),
    getDocs(collection(firestore, 'users', uid, 'tasks')),
    getDocs(collection(firestore, 'users', uid, 'habits')),
    getDocs(collection(firestore, 'users', uid, 'habitLogMonths')),
    getDocs(collection(firestore, 'users', uid, 'dailyPlans')),
    getDocs(collection(firestore, 'users', uid, 'dailyReviews')),
  ]);

  return {
    meta,
    lifeAreas: lifeAreasSnap.docs.map(d => d.data() as LifeArea),
    goals: goalsSnap.docs.map(d => d.data() as Goal),
    projects: projectsSnap.docs.map(d => d.data() as Project),
    tasks: tasksSnap.docs.map(d => d.data() as Task),
    habits: habitsSnap.docs.map(d => d.data() as Habit),
    habitLogMonths: monthsSnap.docs.map(d => d.data() as HabitLogMonthDoc),
    dailyPlans: plansSnap.docs.map(d => d.data() as DailyPlan),
    dailyReviews: reviewsSnap.docs.map(d => d.data() as DailyReview),
  };
}

/**
 * Reverses a v4 migration back into the v3 monolithic workspace document (tested rollback strategy).
 */
export async function rollbackV4ToV3(firestore: Firestore, uid: string): Promise<AppData> {
  const userRef = doc(firestore, 'users', uid);
  const rootSnap = await getDoc(userRef);
  const meta = (rootSnap.data() as WorkspaceMetaV4 | undefined) ?? {
    schemaVersion: 4,
    migrationStatus: 'completed',
    updatedAt: new Date().toISOString(),
  };
  const bundle = await loadV4BundleFromFirestore(firestore, uid, meta);
  const v3Data = reconstructV3FromV4(bundle);

  const batch = writeBatch(firestore);
  batch.set(userRef, v3Data);
  await batch.commit();
  return v3Data;
}
