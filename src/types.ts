export type ID = string;
export type Status = 'active' | 'completed' | 'archived';
export type ProjectStatus = Status | 'planned';
export type TaskStatus = 'todo' | 'done' | 'skipped';
export type Priority = 'high' | 'medium' | 'low';
export type SyncStatus = 'local' | 'hydrating' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict' | 'deleting';
export type AccountDeletionPhase =
  | 'idle'
  | 'reauthenticating'
  | 'deleting-firestore'
  | 'deleting-auth'
  | 'partial-failure'
  | 'completed';

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type HabitCadence = 'daily' | 'weekly_count' | 'specific_days';

export interface SuccessCriterion {
  id: ID;
  text: string;
  done?: boolean;
  importId?: string;
  sourceQuote?: string;
}

export interface PlanPrinciple {
  id: ID;
  text: string;
  importId?: string;
  sourceQuote?: string;
}

export interface LifeArea {
  id: ID;
  name: string;
  description: string;
  createdAt: string;
}

export interface Goal {
  id: ID;
  lifeAreaId: ID | null;
  title: string;
  outcome: string;
  targetDate: string;
  status: Status;
  createdAt: string;
  pillarWeightPct?: number;
  successCriteria?: SuccessCriterion[];
  principles?: PlanPrinciple[];
  importId?: string;
  sourceQuote?: string;
}

export interface Project {
  id: ID;
  goalId: ID | null;
  title: string;
  description: string;
  dueDate: string;
  status: ProjectStatus;
  createdAt: string;
  startDate?: string;
  theme?: string;
  exitCondition?: string;
  isPhase?: boolean;
  importId?: string;
  sourceQuote?: string;
}

export interface Task {
  id: ID;
  projectId: ID | null;
  title: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
  targetQuantity?: number;
  completedQuantity?: number;
  importId?: string;
  sourceQuote?: string;
}

export interface Habit {
  id: ID;
  name: string;
  frequency: 'daily' | 'weekdays' | 'weekends';
  active: boolean;
  createdAt: string;
  cadence?: HabitCadence;
  targetCount?: number;
  days?: WeekdayKey[];
  timeBlock?: { start: string; end: string };
  minimumVersion?: string;
  goalId?: ID | null;
  importId?: string;
  sourceQuote?: string;
}

export interface HabitLog {
  id: ID;
  habitId: ID;
  date: string;
  status: 'done' | 'skipped';
}

export interface DailyPlan {
  date: string;
  priorityTaskIds: ID[];
}

export interface DailyReview {
  date: string;
  wins: string;
  blockers: string;
  notes: string;
  energy: number;
}

export interface AppData {
  schemaVersion: 3;
  syncVersion?: number;
  lifeAreas: LifeArea[];
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  dailyPlans: DailyPlan[];
  dailyReviews: DailyReview[];
  updatedAt?: string;
}

export interface ExtractionGoal {
  title: string;
  life_area?: string;
  pillar_weight_pct?: number;
  description?: string;
  source_quote: string;
}

export interface ExtractionPhase {
  title: string;
  start: string;
  end: string;
  theme?: string;
  exit_condition?: string;
  source_quote: string;
}

export interface ExtractionHabit {
  title: string;
  goal_ref?: string;
  cadence: HabitCadence;
  target_count?: number;
  days?: WeekdayKey[];
  time_block?: { start: string; end: string };
  minimum_version?: string;
  source_quote: string;
}

export interface ExtractionTask {
  title: string;
  goal_ref?: string;
  phase_ref?: string;
  due?: string;
  priority?: Priority;
  target_quantity?: number;
  source_quote: string;
}

export interface ExtractionSuccessCriterion {
  goal_ref?: string;
  text: string;
  source_quote: string;
}

export interface ExtractionPrinciple {
  text: string;
  source_quote: string;
}

export interface ExtractionClarification {
  question: string;
  related_quote: string;
}

export interface Extraction {
  goals: ExtractionGoal[];
  phases: ExtractionPhase[];
  habits: ExtractionHabit[];
  tasks: ExtractionTask[];
  success_criteria: ExtractionSuccessCriterion[];
  principles: ExtractionPrinciple[];
  clarifications: ExtractionClarification[];
}

export interface PlanImportRecord {
  importId: string;
  importedAt: string;
  counts: {
    goals: number;
    phases: number;
    habits: number;
    tasks: number;
    successCriteria: number;
    principles: number;
    deduped: number;
  };
}

export interface WorkspaceMetaV4 {
  schemaVersion: 4;
  migrationStatus: 'pending' | 'completed';
  migratedFromSchema?: 3;
  updatedAt: string;
}

export interface HabitLogMonthDoc {
  month: string;
  logs: Record<string, HabitLog>;
  updatedAt?: string;
}

export interface BackupEnvelope {
  format: 'inpursuit-backup';
  backupVersion: 1;
  exportedAt: string;
  data: AppData;
}

export interface WorkspaceSummary {
  lifeAreas: number;
  goals: number;
  projects: number;
  tasks: number;
  habits: number;
  habitLogs: number;
  dailyReviews: number;
  updatedAt?: string;
}

export interface SyncMeta {
  pendingSync: boolean;
  lastSyncedAt: string | null;
  lastUpdatedByTab?: string | null;
  remoteSyncVersion?: number | null;
}

export type EntitlementTier = 'free' | 'pro';
export type EntitlementStatus = 'active' | 'expired' | 'revoked';

export interface UserEntitlement {
  tier: EntitlementTier;
  status: EntitlementStatus;
  expiresAt: string | null;
  planLabel?: string;
  paymentRef?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface EffectiveEntitlement {
  tier: EntitlementTier;
  status: EntitlementStatus;
  isPro: boolean;
  isExpired: boolean;
  expiresAt: string | null;
  planLabel: string;
}

export type PaymentPlan = 'monthly' | 'annual';
export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentRequest {
  id?: string;
  userId: string;
  plan: PaymentPlan;
  amountIdr: number;
  referenceCode: string;
  note?: string;
  status: PaymentRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNote?: string;
}

