import type { Extraction } from '../../src/types';
import { ImportPlanRequestSchema, MAX_PLAN_TEXT_CHARS } from '../../src/utils/planImportSchema';
import { getTokenVerificationAuth } from './firebaseAdmin';
import {
  extractPlanWithGemini,
  PlanImportError,
  refinePlanWithGemini,
  type ImportPlanResult,
  type PlanImportServiceOptions,
} from './planImport';

export const MAX_IMPORT_REQUEST_BYTES = 128 * 1024;
export const DEFAULT_IMPORT_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 10 * 60 * 1000,
};
const MAX_TRACKED_USERS = 5000;

export interface AuthenticatedImportUser {
  uid: string;
  email?: string;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class ImportHttpError extends Error {
  status: number;
  headers?: Record<string, string>;

  constructor(status: number, message: string, headers?: Record<string, string>) {
    super(message);
    this.name = 'ImportHttpError';
    this.status = status;
    this.headers = headers;
  }
}

const rateLimitStore = new Map<string, number[]>();

export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}

export function checkUserRateLimit(
  uid: string,
  nowMs = Date.now(),
  config: RateLimitConfig = DEFAULT_IMPORT_RATE_LIMIT,
): RateLimitDecision {
  const windowStart = nowMs - config.windowMs;
  const existing = rateLimitStore.get(uid) ?? [];
  const active = existing.filter(ts => ts > windowStart);

  if (active.length >= config.maxRequests) {
    const oldest = active[0] ?? nowMs;
    const retryAfterMs = Math.max(1000, oldest + config.windowMs - nowMs);
    rateLimitStore.set(uid, active);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  active.push(nowMs);
  rateLimitStore.set(uid, active);

  // Opportunistic bounded cleanup so long-lived instances do not grow indefinitely
  if (rateLimitStore.size > MAX_TRACKED_USERS) {
    for (const [key, timestamps] of rateLimitStore.entries()) {
      const valid = timestamps.filter(ts => ts > windowStart);
      if (valid.length === 0) {
        rateLimitStore.delete(key);
      } else {
        rateLimitStore.set(key, valid);
      }
      if (rateLimitStore.size <= MAX_TRACKED_USERS) break;
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - active.length),
    retryAfterSeconds: 0,
  };
}

export type TokenVerifier = (idToken: string) => Promise<AuthenticatedImportUser>;

async function defaultVerifyToken(idToken: string): Promise<AuthenticatedImportUser> {
  const decoded = await getTokenVerificationAuth().verifyIdToken(idToken);
  if (!decoded.uid) {
    throw new ImportHttpError(401, 'Authenticated user ID missing from token.');
  }
  return {
    uid: decoded.uid,
    email: decoded.email,
  };
}

export async function verifyImportRequestAuth(
  authorizationHeader?: string,
  verifyToken: TokenVerifier = defaultVerifyToken,
): Promise<AuthenticatedImportUser> {
  const header = authorizationHeader?.trim() ?? '';
  if (!header) {
    throw new ImportHttpError(401, 'Sign in required. Missing Authorization Bearer token.');
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? '';
  if (!token) {
    throw new ImportHttpError(401, 'Invalid Authorization header. Expected Bearer token.');
  }

  try {
    return await verifyToken(token);
  } catch (err) {
    if (err instanceof ImportHttpError) throw err;
    throw new ImportHttpError(401, 'Invalid or expired authentication token. Please sign in again.');
  }
}

export interface HandleImportPlanParams {
  method?: string;
  authorizationHeader?: string;
  body: unknown;
  rawBodyBytes?: number;
  nowMs?: number;
  verifyToken?: TokenVerifier;
  rateLimiter?: (uid: string, nowMs: number) => RateLimitDecision;
  extractPlan?: (
    planText: string,
    options?: Pick<PlanImportServiceOptions, 'deepCheck' | 'currentDraft'>,
  ) => Promise<ImportPlanResult>;
  refinePlan?: (params: {
    planText: string;
    currentDraft: Extraction;
    instruction?: string;
    answers?: Parameters<typeof refinePlanWithGemini>[0]['answers'];
  }) => Promise<ImportPlanResult>;
}

export interface HttpResponseResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export async function handleImportPlanHttp(params: HandleImportPlanParams): Promise<HttpResponseResult> {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
  };

  if (params.method !== 'POST') {
    return {
      status: 405,
      headers: { ...headers, Allow: 'POST' },
      body: { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', retryable: false },
    };
  }

  let authUser: AuthenticatedImportUser;
  try {
    authUser = await verifyImportRequestAuth(params.authorizationHeader, params.verifyToken);
  } catch (err) {
    const status = err instanceof ImportHttpError ? err.status : 401;
    const message = err instanceof Error ? err.message : 'Unauthorized.';
    return {
      status,
      headers,
      body: { error: message, code: 'UNAUTHORIZED', retryable: false },
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const limitDecision = (params.rateLimiter ?? ((uid, ts) => checkUserRateLimit(uid, ts)))(authUser.uid, nowMs);
  if (!limitDecision.allowed) {
    return {
      status: 429,
      headers: {
        ...headers,
        'Retry-After': String(limitDecision.retryAfterSeconds),
      },
      body: {
        error: `Too many plan imports. Please wait ${limitDecision.retryAfterSeconds} seconds before trying again.`,
        code: 'AI_RATE_LIMITED',
        retryable: true,
      },
    };
  }

  const bodyBytes =
    params.rawBodyBytes ??
    (params.body !== undefined ? Buffer.byteLength(typeof params.body === 'string' ? params.body : JSON.stringify(params.body), 'utf8') : 0);

  if (bodyBytes > MAX_IMPORT_REQUEST_BYTES) {
    return {
      status: 413,
      headers,
      body: {
        error: `Request payload too large. Maximum size is ${Math.round(MAX_IMPORT_REQUEST_BYTES / 1024)}KB.`,
        code: 'PAYLOAD_TOO_LARGE',
        retryable: false,
      },
    };
  }

  // Enforce explicit planText cap cleanly with user-friendly message
  if (
    params.body &&
    typeof params.body === 'object' &&
    !Array.isArray(params.body) &&
    typeof (params.body as Record<string, unknown>).planText === 'string' &&
    ((params.body as Record<string, unknown>).planText as string).trim().length > MAX_PLAN_TEXT_CHARS
  ) {
    return {
      status: 400,
      headers,
      body: {
        error: `Plan text is too long. Limit is ${MAX_PLAN_TEXT_CHARS.toLocaleString()} characters.`,
        code: 'PLAN_TOO_LONG',
        retryable: false,
      },
    };
  }

  const parsed = ImportPlanRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    return {
      status: 400,
      headers,
      body: {
        error: parsed.error.issues[0]?.message ?? 'Invalid import plan request payload.',
        code: 'INVALID_REQUEST',
        retryable: false,
      },
    };
  }

  try {
    const payload = parsed.data;
    const result =
      payload.mode === 'refine'
        ? await (params.refinePlan ?? refinePlanWithGemini)({
            planText: payload.planText,
            currentDraft: payload.currentDraft,
            instruction: payload.instruction,
            answers: payload.answers,
          })
        : await (params.extractPlan ?? extractPlanWithGemini)(payload.planText, {
            deepCheck: payload.deepCheck,
            currentDraft: payload.currentDraft,
          });

    return {
      status: 200,
      headers,
      body: result,
    };
  } catch (error) {
    if (error instanceof PlanImportError) {
      return {
        status: error.status,
        headers,
        body: {
          error: error.userMessage,
          code: error.code,
          retryable: error.retryable,
        },
      };
    }
    const rawMessage = error instanceof Error ? error.message : '';
    if (rawMessage.includes('GEMINI_API_KEY')) {
      return {
        status: 503,
        headers,
        body: {
          error: 'Plan import is not configured on the server yet.',
          code: 'AI_UNCONFIGURED',
          retryable: false,
        },
      };
    }
    return {
      status: 503,
      headers,
      body: {
        error: 'The AI planner is temporarily busy. Please try again in a moment.',
        code: 'AI_BUSY',
        retryable: true,
      },
    };
  }
}
