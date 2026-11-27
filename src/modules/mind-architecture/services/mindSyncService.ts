import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../services/firebase';
import {
  isOfflineError,
  isQuotaExceededError,
  OperationType,
} from '../../../services/syncService';
import type { MindWorkspaceRecord } from '../types/knowledge';
import {
  prepareFirestoreMindPayload,
  sanitizeMindWorkspaceRecord,
} from './mindStore';

export const MIND_DOC_ID = 'default';

interface MindFirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authState: {
    authenticated: boolean;
    emailVerified: boolean;
  };
}

function handleMindFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): Error {
  const errInfo: MindFirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authState: {
      authenticated: Boolean(auth.currentUser),
      emailVerified: Boolean(auth.currentUser?.emailVerified),
    },
    operationType,
    path,
  };
  console.error('Firestore Mind Architecture error:', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

export interface RemoteMindSnapshot {
  record: MindWorkspaceRecord | null;
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export function subscribeToMindWorkspace(
  uid: string,
  ownerName: string | undefined,
  onData: (event: RemoteMindSnapshot) => void,
  onError: (error: Error) => void
): () => void {
  const path = `users/${uid}/mindArchitecture/${MIND_DOC_ID}`;
  const ref = doc(db, 'users', uid, 'mindArchitecture', MIND_DOC_ID);

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData({
          record: null,
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        });
        return;
      }

      const raw = snapshot.data();
      onData({
        record: sanitizeMindWorkspaceRecord(raw, ownerName),
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      });
    },
    (error) => {
      onError(handleMindFirestoreError(error, OperationType.GET, path));
    }
  );
}

export async function pushMindWorkspaceToFirestore(
  uid: string,
  record: MindWorkspaceRecord
): Promise<void> {
  const path = `users/${uid}/mindArchitecture/${MIND_DOC_ID}`;
  const ref = doc(db, 'users', uid, 'mindArchitecture', MIND_DOC_ID);
  try {
    const payload = prepareFirestoreMindPayload(record);
    await setDoc(ref, payload);
  } catch (error) {
    throw handleMindFirestoreError(error, OperationType.WRITE, path);
  }
}

export { isOfflineError, isQuotaExceededError };
