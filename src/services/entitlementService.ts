import { doc, onSnapshot } from 'firebase/firestore';
import type { EffectiveEntitlement, PaymentPlan, UserEntitlement } from '../types';
import { db } from './firebase';

export const FREE_TIER_MONTHLY_IDR = 0;
export const PRO_TIER_MONTHLY_IDR = 29_000;
export const PRO_TIER_ANNUAL_IDR = 249_000;
export const MANUAL_PAYMENT_REQUESTS_ENABLED = false;

export const DEFAULT_FREE_ENTITLEMENT: EffectiveEntitlement = {
  tier: 'free',
  status: 'active',
  isPro: false,
  isExpired: false,
  expiresAt: null,
  planLabel: 'Free · Rp0',
};

function parseTimestampIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export function resolveEffectiveEntitlement(
  raw: Partial<Record<keyof UserEntitlement, unknown>> | null | undefined,
  nowMs = Date.now(),
): EffectiveEntitlement {
  if (!raw || raw.tier !== 'pro') {
    return DEFAULT_FREE_ENTITLEMENT;
  }

  const expiresAt = parseTimestampIso(raw.expiresAt);
  const expiresMs = expiresAt ? Date.parse(expiresAt) : null;
  const status = raw.status === 'active' || raw.status === 'expired' || raw.status === 'revoked' ? raw.status : 'expired';
  const timeExpired = expiresMs !== null && expiresMs <= nowMs;
  const isPro = status === 'active' && !timeExpired;
  const isExpired = status === 'expired' || timeExpired;

  if (!isPro) {
    return {
      tier: 'free',
      status: isExpired ? 'expired' : status,
      isPro: false,
      isExpired,
      expiresAt,
      planLabel: isExpired ? 'Pro expired · Free tier active' : 'Free · Rp0',
    };
  }

  return {
    tier: 'pro',
    status: 'active',
    isPro: true,
    isExpired: false,
    expiresAt,
    planLabel: typeof raw.planLabel === 'string' && raw.planLabel ? raw.planLabel : 'Pro',
  };
}

export function subscribeToEntitlement(
  uid: string,
  onUpdate: (entitlement: EffectiveEntitlement) => void,
): () => void {
  return onSnapshot(
    doc(db, 'entitlements', uid),
    snapshot => {
      if (!snapshot.exists()) {
        onUpdate(DEFAULT_FREE_ENTITLEMENT);
        return;
      }
      onUpdate(resolveEffectiveEntitlement(snapshot.data() as Partial<Record<keyof UserEntitlement, unknown>>));
    },
    error => {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code !== 'permission-denied') {
        console.warn('Entitlement subscription fell back to Free tier:', code || (error instanceof Error ? error.message : 'unknown'));
      }
      // Fail-closed to Free tier on missing rules, permission error, or network error
      onUpdate(DEFAULT_FREE_ENTITLEMENT);
    },
  );
}

export async function submitManualPaymentRequest(
  _uid: string,
  _input: { plan: PaymentPlan; referenceCode: string; note?: string },
): Promise<never> {
  // Fail-closed: client-initiated payment requests are disabled until a trusted server/Cloud Function
  // backend enforces referenceCode uniqueness, rate limiting, and server-side plan verification.
  throw new Error('Pro checkout and manual payment verification are not active yet. Client payment submissions are disabled.');
}
