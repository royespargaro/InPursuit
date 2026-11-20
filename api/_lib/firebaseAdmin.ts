import { Buffer } from 'node:buffer';
import { cert, getApp, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

interface RawServiceAccountJson {
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
}

interface CachedFirebaseAdmin {
  app: App;
  db: Firestore;
  databaseId: string | null;
}

let cachedAdmin: CachedFirebaseAdmin | null = null;
let cachedTokenAuthApp: App | null = null;

function parseServiceAccountFromEnv(): { serviceAccount: ServiceAccount; projectId: string } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not configured.');
  }

  let decodedJson: string;
  try {
    decodedJson = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must be a valid base64-encoded JSON string.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodedJson);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT did not decode to valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must decode to a service account JSON object.');
  }

  const candidate = parsed as RawServiceAccountJson;
  if (
    typeof candidate.project_id !== 'string' ||
    !candidate.project_id.trim() ||
    typeof candidate.client_email !== 'string' ||
    !candidate.client_email.trim() ||
    typeof candidate.private_key !== 'string' ||
    !candidate.private_key.trim()
  ) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing required project_id, client_email, or private_key fields.');
  }

  return {
    serviceAccount: parsed as ServiceAccount,
    projectId: candidate.project_id.trim(),
  };
}

function resolveDatabaseId(): string | null {
  const raw = (process.env.FIREBASE_DATABASE_ID ?? firebaseConfig.firestoreDatabaseId ?? '').trim();
  if (!raw || raw === '(default)') {
    return null;
  }
  return raw;
}

function resolveProjectIdForTokenVerification(): string {
  const envProjectId = (process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? '').trim();
  const configuredProjectId = (firebaseConfig.projectId ?? '').trim();
  const resolved = envProjectId || configuredProjectId;
  if (!resolved || resolved === 'remixed-project-id') {
    throw new Error('Firebase projectId is not configured for ID token verification.');
  }
  return resolved;
}

export function getFirebaseAdmin(): CachedFirebaseAdmin {
  if (cachedAdmin) {
    return cachedAdmin;
  }

  const { serviceAccount, projectId } = parseServiceAccountFromEnv();
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert(serviceAccount),
          projectId: projectId || firebaseConfig.projectId,
        });

  const databaseId = resolveDatabaseId();
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

  cachedAdmin = { app, db, databaseId };
  return cachedAdmin;
}

/**
 * Returns a Firebase Admin Auth instance capable of calling verifyIdToken(token).
 * Works with explicit service account credentials when present, or with just projectId
 * (verifyIdToken uses public JWKS verification and requires no IAM roles).
 */
export function getTokenVerificationAuth(): Auth {
  if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) {
    return getAuth(getFirebaseAdmin().app);
  }
  if (!cachedTokenAuthApp) {
    const projectId = resolveProjectIdForTokenVerification();
    cachedTokenAuthApp =
      getApps().length > 0
        ? getApp()
        : initializeApp({
            projectId,
          });
  }
  return getAuth(cachedTokenAuthApp);
}

export function getAdminFirestore(): Firestore {
  return getFirebaseAdmin().db;
}
