import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FREE_ENTITLEMENT,
  MANUAL_PAYMENT_REQUESTS_ENABLED,
  resolveEffectiveEntitlement,
  submitManualPaymentRequest,
} from '../services/entitlementService';

describe('entitlementService', () => {
  it('fails closed to Free tier when entitlement record is missing or null', () => {
    expect(resolveEffectiveEntitlement(null)).toEqual(DEFAULT_FREE_ENTITLEMENT);
    expect(resolveEffectiveEntitlement(undefined)).toEqual(DEFAULT_FREE_ENTITLEMENT);
    expect(resolveEffectiveEntitlement({ tier: 'free', status: 'active' })).toEqual(DEFAULT_FREE_ENTITLEMENT);
  });

  it('grants Pro access when active and unexpired', () => {
    const now = Date.parse('2026-11-14T00:00:00.000Z');
    const result = resolveEffectiveEntitlement(
      {
        tier: 'pro',
        status: 'active',
        expiresAt: '2026-12-14T00:00:00.000Z',
        planLabel: 'Pro Monthly',
      },
      now,
    );

    expect(result.isPro).toBe(true);
    expect(result.tier).toBe('pro');
    expect(result.isExpired).toBe(false);
    expect(result.planLabel).toBe('Pro Monthly');
  });

  it('downgrades cleanly to Free when Pro subscription timestamp has expired', () => {
    const now = Date.parse('2026-12-15T00:00:00.000Z');
    const result = resolveEffectiveEntitlement(
      {
        tier: 'pro',
        status: 'active',
        expiresAt: '2026-12-14T00:00:00.000Z',
        planLabel: 'Pro Monthly',
      },
      now,
    );

    expect(result.isPro).toBe(false);
    expect(result.tier).toBe('free');
    expect(result.isExpired).toBe(true);
    expect(result.status).toBe('expired');
  });

  it('revokes Pro access immediately when status is revoked regardless of expiration date', () => {
    const now = Date.parse('2026-11-14T00:00:00.000Z');
    const result = resolveEffectiveEntitlement(
      {
        tier: 'pro',
        status: 'revoked',
        expiresAt: '2027-11-14T00:00:00.000Z',
      },
      now,
    );

    expect(result.isPro).toBe(false);
    expect(result.status).toBe('revoked');
  });

  it('handles Firestore Timestamp-like objects cleanly', () => {
    const now = Date.parse('2026-11-14T00:00:00.000Z');
    const result = resolveEffectiveEntitlement(
      {
        tier: 'pro',
        status: 'active',
        expiresAt: { toDate: () => new Date('2027-01-01T00:00:00.000Z') },
        planLabel: 'Annual Pro',
      },
      now,
    );

    expect(result.isPro).toBe(true);
    expect(result.expiresAt).toBe('2027-01-01T00:00:00.000Z');
  });

  it('fails closed on client-initiated manual payment submissions', async () => {
    expect(MANUAL_PAYMENT_REQUESTS_ENABLED).toBe(false);
    await expect(
      submitManualPaymentRequest('uid-1', { plan: 'monthly', referenceCode: 'TRX-123' }),
    ).rejects.toThrow('disabled');
  });
});

