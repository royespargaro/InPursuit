import { collection, deleteDoc, doc, getDocs, onSnapshot, runTransaction, writeBatch } from 'firebase/firestore';
import type { AppData, WorkspaceMetaV4 } from '../types';
import { classifyRemoteSnapshot, isValidAppData, sanitizeAppData } from './appStore';
import { auth, db } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authState: {
    authenticated: boolean;
    emailVerified: boolean;
  };
}

export interface RemoteSnapshotEvent {
  data: AppData | null;
  syncVersion?: number;
  incompatibleSchema?: number;
  v4Meta?: WorkspaceMetaV4;
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export interface SyncWriteResult {
  syncVersion: number;
  updatedAt: string;
}

export class SyncConflictError extends Error {
  readonly remoteData: AppData;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(
    message: string,
    details: { remoteData: AppData; expectedVersion: number; actualVersion: number },
  ) {
    super(message);
    this.name = 'SyncConflictError';
    this.remoteData = details.remoteData;
    this.expectedVersion = details.expectedVersion;
    this.actualVersion = details.actualVersion;
  }
}

export class IncompatibleSchemaError extends Error {
  readonly schemaVersion: number;
  readonly meta: WorkspaceMetaV4;

  constructor(message: string, details: { schemaVersion: number; meta: WorkspaceMetaV4 }) {
    super(message);
    this.name = 'IncompatibleSchemaError';
    this.schemaVersion = details.schemaVersion;
    this.meta = details.meta;
  }
}

export function isOfflineError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    code === 'unavailable' ||
    message.includes('client is offline') ||
    message.includes('network') ||
    message.includes('unavailable') ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  );
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): Error {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authState: {
      authenticated: Boolean(auth.currentUser),
      emailVerified: Boolean(auth.currentUser?.emailVerified),
    },
    operationType,
    path,
  };
  console.error('Firestore operation failed:', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

export function prepareFirestorePayload(data: AppData, syncVersion?: number): AppData {
  const sanitized = sanitizeAppData(data);
  const updatedAt = (sanitized.updatedAt || new Date().toISOString()).slice(0, 40);
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
    updatedAt,
  };
  if (typeof syncVersion === 'number' && Number.isInteger(syncVersion) && syncVersion >= 0) {
    payload.syncVersion = syncVersion;
  }
  return payload;
}

export const subscribeToFirestore = (
  uid: string,
  callback: (event: RemoteSnapshotEvent) => void,
  onError: (error: Error, offline: boolean) => void = error => console.error('InPursuit cloud sync failed:', error),
) => {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    { includeMetadataChanges: true },
    snapshot => {
      const fromCache = snapshot.metadata.fromCache;
      const hasPendingWrites = snapshot.metadata.hasPendingWrites;
      if (!snapshot.exists()) {
        callback({ data: null, fromCache, hasPendingWrites });
        return;
      }
      const raw: unknown = snapshot.data();
      const classified = classifyRemoteSnapshot(raw);
      if (classified.kind === 'valid-v3') {
        callback({
          data: classified.data,
          syncVersion: classified.syncVersion,
          fromCache,
          hasPendingWrites,
        });
      } else if (classified.kind === 'incompatible-v4') {
        callback({
          data: null,
          incompatibleSchema: classified.schemaVersion,
          v4Meta: classified.meta,
          fromCache,
          hasPendingWrites,
        });
      } else {
        onError(new Error('The cloud backup has an unsupported or invalid data format. Your local data was left untouched.'), false);
      }
    },
    error => {
      const offline = isOfflineError(error);
      const wrapped = handleFirestoreError(error, OperationType.GET, path);
      onError(wrapped, offline);
    },
  );
};

export interface SyncToFirestoreOptions {
  expectedSyncVersion?: number | null;
}

export const syncToFirestore = async (
  uid: string,
  data: AppData,
  options?: SyncToFirestoreOptions,
): Promise<SyncWriteResult> => {
  const path = `users/${uid}`;
  const initialPayload = prepareFirestorePayload(data);
  if (!isValidAppData(initialPayload)) {
    throw new Error('Cannot sync invalid workspace data.');
  }
  try {
    return await runTransaction(db, async transaction => {
      const userRef = doc(db, 'users', uid);
      const remoteSnap = await transaction.get(userRef);
      let nextVersion = 1;

      if (remoteSnap.exists()) {
        const classified = classifyRemoteSnapshot(remoteSnap.data());
        if (classified.kind === 'incompatible-v4') {
          throw new IncompatibleSchemaError(
            `Cloud workspace uses schema v${classified.schemaVersion}, which cannot be overwritten by a v3 client.`,
            { schemaVersion: classified.schemaVersion, meta: classified.meta },
          );
        }
        if (classified.kind === 'invalid') {
          throw new Error('Cloud workspace contains an unsupported or invalid data format; sync aborted to protect remote data.');
        }

        const remoteVersion = classified.syncVersion;
        if (
          typeof options?.expectedSyncVersion === 'number' &&
          remoteVersion !== options.expectedSyncVersion
        ) {
          throw new SyncConflictError(
            'Cloud workspace changed on another device since your last sync.',
            {
              remoteData: classified.data,
              expectedVersion: options.expectedSyncVersion,
              actualVersion: remoteVersion,
            },
          );
        }
        nextVersion = remoteVersion + 1;
      }

      const payload = prepareFirestorePayload(data, nextVersion);
      if (!isValidAppData(payload)) {
        throw new Error('Cannot sync invalid workspace data.');
      }
      transaction.set(userRef, payload);
      return {
        syncVersion: nextVersion,
        updatedAt: payload.updatedAt!,
      };
    });
  } catch (error) {
    if (error instanceof SyncConflictError || error instanceof IncompatibleSchemaError) {
      throw error;
    }
    throw handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const V4_SUBCOLLECTIONS = [
  'lifeAreas',
  'goals',
  'projects',
  'tasks',
  'habits',
  'habitLogMonths',
  'dailyPlans',
  'dailyReviews',
] as const;

export interface DeleteWorkspaceResult {
  deletedSubcollectionDocs: number;
  deletedRootDoc: boolean;
}

export class WorkspaceDeletionError extends Error {
  readonly path: string;
  readonly partial: boolean;
  readonly deletedSubcollectionDocs: number;

  constructor(message: string, details: { path: string; partial: boolean; deletedSubcollectionDocs: number }) {
    super(message);
    this.name = 'WorkspaceDeletionError';
    this.path = details.path;
    this.partial = details.partial;
    this.deletedSubcollectionDocs = details.deletedSubcollectionDocs;
  }
}

export const deleteUserWorkspaceDoc = async (uid: string): Promise<DeleteWorkspaceResult> => {
  let deletedSubcollectionDocs = 0;
  let currentPath = `users/${uid}`;
  try {
    // Delete all 8 v4 subcollections cleanly in <=400-op batches, then delete root workspace doc.
    // Never touches /admins, /entitlements, /paymentRequests, or any other user's path.
    for (const sub of V4_SUBCOLLECTIONS) {
      currentPath = `users/${uid}/${sub}`;
      const snap = await getDocs(collection(db, 'users', uid, sub));
      if (!snap.empty) {
        for (let i = 0; i < snap.docs.length; i += 400) {
          const slice = snap.docs.slice(i, i + 400);
          const batch = writeBatch(db);
          for (const d of slice) {
            batch.delete(d.ref);
          }
          await batch.commit();
          deletedSubcollectionDocs += slice.length;
        }
      }
    }
    currentPath = `users/${uid}`;
    await deleteDoc(doc(db, 'users', uid));
    return { deletedSubcollectionDocs, deletedRootDoc: true };
  } catch (error) {
    const wrapped = handleFirestoreError(error, OperationType.DELETE, currentPath);
    throw new WorkspaceDeletionError(wrapped.message, {
      path: currentPath,
      partial: deletedSubcollectionDocs > 0,
      deletedSubcollectionDocs,
    });
  }
};
