export type ID = string;
export type Status = 'active' | 'completed' | 'archived';
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
}

export interface Project {
  id: ID;
  goalId: ID | null;
  title: string;
  description: string;
  dueDate: string;
  status: Status;
  createdAt: string;
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
}

export interface Habit {
  id: ID;
  name: string;
  frequency: 'daily' | 'weekdays' | 'weekends';
  active: boolean;
  createdAt: string;
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
