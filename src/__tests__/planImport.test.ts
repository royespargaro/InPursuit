import { ThinkingLevel } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkUserRateLimit,
  handleImportPlanHttp,
  MAX_IMPORT_REQUEST_BYTES,
  resetRateLimitStore,
} from '../../api/_lib/importAuth';
import {
  createGeminiCaller,
  extractPlanWithGemini,
  GEMINI_PLAN_FALLBACK_MODEL,
  GEMINI_PLAN_MODEL,
  PlanImportError,
  refinePlanWithGemini,
  resolvePlanModelConfig,
} from '../../api/_lib/planImport';
import {
  createDefaultData,
  sanitizeAppData,
  threeWayMergeWorkspaceDetailed,
} from '../services/appStore';
import { buildV4DocumentsFromV3, reconstructV3FromV4 } from '../services/migrationV4';
import type { Extraction } from '../types';
import { getTodayHabitCount, getWeeklyHabitCount, isHabitScheduledOnDate } from '../utils/habitUtils';
import { applyImportedPlanToWorkspace, undoImportedPlan } from '../utils/planImportMerge';
import {
  ExtractionSchema,
  filterGroundedExtraction,
  filterGroundedExtractionWithStats,
  getMakassarDateKey,
  MAX_PLAN_TEXT_CHARS,
  normalizeWeeklyCountHabits,
  resolveRelativeDatesInCode,
} from '../utils/planImportSchema';
import { buildTodaySchedule } from '../utils/todayScheduler';

describe('planImport deterministic schema, grounding, and date resolution', () => {
  afterEach(() => {
    resetRateLimitStore();
  });

  it('computes Asia/Makassar current date deterministically', () => {
    // 2026-11-20T18:30:00Z is 2026-11-21 02:30 in Asia/Makassar (UTC+8)
    const key = getMakassarDateKey(new Date('2026-11-20T18:30:00Z'));
    expect(key).toBe('2026-11-21');
  });

  it('drops ungrounded items and accurately counts dropped items by kind', () => {
    const planText = 'Goal: Ship v1\n  Run 4 per week for stamina.';
    const raw: Extraction = {
      goals: [
        { title: 'Ship v1', source_quote: 'Goal:\n  Ship   v1' },
        { title: 'Hallucinated goal', source_quote: 'Learn Rust in 3 days' },
      ],
      phases: [],
      habits: [],
      tasks: [],
      success_criteria: [],
      principles: [],
      clarifications: [
        { question: 'Target date?', related_quote: 'Goal: Ship v1' },
        { question: 'Fake question?', related_quote: 'Invented quote' },
      ],
    };

    const grounded = filterGroundedExtraction(raw, planText);
    expect(grounded.goals.map(g => g.title)).toEqual(['Ship v1']);
    expect(grounded.clarifications).toHaveLength(1);

    const stats = filterGroundedExtractionWithStats(raw, planText);
    expect(stats.droppedCount).toBe(2);
    expect(stats.droppedByKind.goals).toBe(1);
    expect(stats.droppedByKind.clarifications).toBe(1);
  });

  it('treats X per week strictly as weekly_count and resolves Days/Week relative phrases in code', () => {
    const raw: Extraction = {
      goals: [],
      phases: [
        {
          title: 'Phase 1: Foundation',
          start: 'Days 1–30',
          end: 'Days 1–30',
          source_quote: 'Phase 1: Foundation (Days 1–30)',
        },
        {
          title: 'Phase 2: Acceleration',
          start: 'Week 2',
          end: 'Week 2',
          source_quote: 'Week 2 sprint',
        },
      ],
      habits: [
        {
          title: 'Strength training',
          cadence: 'daily', // intentionally wrong from model
          source_quote: 'Strength training 4 per week',
        },
      ],
      tasks: [
        {
          title: 'Publish checkpoint',
          due: 'Day 15',
          source_quote: 'Publish checkpoint by Day 15',
        },
      ],
      success_criteria: [],
      principles: [],
      clarifications: [],
    };

    const normalized = normalizeWeeklyCountHabits(raw);
    expect(normalized.habits[0].cadence).toBe('weekly_count');
    expect(normalized.habits[0].target_count).toBe(4);

    const resolved = resolveRelativeDatesInCode(normalized, '2026-11-20');
    expect(resolved.phases[0].start).toBe('2026-11-20');
    expect(resolved.phases[0].end).toBe('2026-12-19');
    expect(resolved.phases[1].start).toBe('2026-11-27');
    expect(resolved.phases[1].end).toBe('2026-12-03');
    expect(resolved.tasks[0].due).toBe('2026-12-04');
  });

  it('retries once on invalid JSON/Zod schema output, enforces temperature 0, tracks droppedCount, and applies Pass 2 verification', async () => {
    const planText = [
      'Goal: Launch SaaS MVP (60%)',
      'Phase 1: Build core (Days 1–30)',
      'Workout 4 per week 07:00-08:00',
      'Ship landing page on Day 15',
      'Criterion: 100 beta signups',
      'Principle: Focus on shipping daily',
    ].join('\n');

    const caller = vi
      .fn()
      // Attempt 1 Pass 1: invalid JSON -> triggers single retry
      .mockResolvedValueOnce('not-json')
      // Attempt 2 Pass 1: valid JSON (with 1 hallucinated task + wrong daily cadence)
      .mockResolvedValueOnce(
        JSON.stringify({
          goals: [{ title: 'Launch SaaS MVP', pillar_weight_pct: 60, source_quote: 'Goal: Launch SaaS MVP (60%)' }],
          phases: [
            {
              title: 'Phase 1: Build core',
              start: 'Days 1–30',
              end: 'Days 1–30',
              source_quote: 'Phase 1: Build core (Days 1–30)',
            },
          ],
          habits: [
            {
              title: 'Workout',
              cadence: 'daily',
              time_block: { start: '07:00', end: '08:00' },
              source_quote: 'Workout 4 per week 07:00-08:00',
            },
          ],
          tasks: [
            { title: 'Hallucinated item', source_quote: 'Totally invented quote' },
          ],
          success_criteria: [{ text: '100 beta signups', source_quote: 'Criterion: 100 beta signups' }],
          principles: [],
          clarifications: [],
        }),
      )
      // Pass 2 Verification: finds missed task and principle
      .mockResolvedValueOnce(
        JSON.stringify({
          missing: {
            goals: [],
            phases: [],
            habits: [],
            tasks: [{ title: 'Ship landing page', due: 'Day 15', source_quote: 'Ship landing page on Day 15' }],
            success_criteria: [],
            principles: [{ text: 'Focus on shipping daily', source_quote: 'Principle: Focus on shipping daily' }],
            clarifications: [],
          },
          updates: [],
          removals: [],
        }),
      );

    const result = await extractPlanWithGemini(planText, {
      now: new Date('2026-11-20T04:00:00Z'), // 2026-11-20 12:00 Asia/Makassar
      deepCheck: true,
      caller,
    });

    expect(caller).toHaveBeenCalledTimes(3);
    expect(caller.mock.calls[0][0].temperature).toBe(0);
    expect(caller.mock.calls[0][0].thinkingLevel).toBe(ThinkingLevel.LOW);
    expect(caller.mock.calls[0][0].systemInstruction).toContain('2026-11-20');
    expect(caller.mock.calls[0][0].systemInstruction).toContain('Asia/Makassar');
    expect(caller.mock.calls[0][0].systemInstruction).toContain('max 12 words');

    expect(result.verified).toBe(true);
    expect(result.droppedCount).toBe(1);
    expect(result.dailyHabitCount).toBe(0);
    expect(result.extraction.goals).toHaveLength(1);
    expect(result.extraction.phases[0]).toMatchObject({ start: '2026-11-20', end: '2026-12-19' });
    expect(result.extraction.habits[0]).toMatchObject({ cadence: 'weekly_count', target_count: 4 });
    expect(result.extraction.tasks.map(t => t.title)).toEqual(['Ship landing page']);
    expect(result.extraction.tasks[0].due).toBe('2026-12-04');
    expect(result.extraction.principles.map(p => p.text)).toEqual(['Focus on shipping daily']);
  });

  it('skips Pass-2 verification by default and supports deepCheck on an existing draft', async () => {
    const planText = [
      'Goal: Launch SaaS MVP',
      'Ship landing page on Day 15',
    ].join('\n');

    const caller = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          goals: [{ title: 'Launch SaaS MVP', source_quote: 'Goal: Launch SaaS MVP' }],
          phases: [],
          habits: [],
          tasks: [],
          success_criteria: [],
          principles: [],
          clarifications: [],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          missing: {
            goals: [],
            phases: [],
            habits: [],
            tasks: [{ title: 'Ship landing page', due: 'Day 15', source_quote: 'Ship landing page on Day 15' }],
            success_criteria: [],
            principles: [],
            clarifications: [],
          },
          updates: [],
          removals: [],
        }),
      );

    // Default extract runs only Pass 1 (relying on deterministic grounding)
    const fastResult = await extractPlanWithGemini(planText, {
      now: new Date('2026-11-20T04:00:00Z'),
      caller,
    });
    expect(caller).toHaveBeenCalledTimes(1);
    expect(fastResult.verified).toBe(false);
    expect(fastResult.extraction.goals).toHaveLength(1);
    expect(fastResult.extraction.tasks).toHaveLength(0);

    // Explicit deepCheck with currentDraft skips Pass 1 and runs Pass 2 verification only
    const verifiedResult = await extractPlanWithGemini(planText, {
      now: new Date('2026-11-20T04:00:00Z'),
      deepCheck: true,
      currentDraft: fastResult.extraction,
      caller,
    });
    expect(caller).toHaveBeenCalledTimes(2);
    expect(verifiedResult.verified).toBe(true);
    expect(verifiedResult.extraction.tasks.map(t => t.title)).toEqual(['Ship landing page']);
    expect(verifiedResult.extraction.tasks[0].due).toBe('2026-12-04');
  });

  it('resolves model, fallback model, and thinking level from env vars with safe defaults', () => {
    const prevModel = process.env.GEMINI_PLAN_MODEL;
    const prevFallback = process.env.GEMINI_PLAN_FALLBACK_MODEL;
    const prevLevel = process.env.GEMINI_PLAN_THINKING_LEVEL;

    try {
      delete process.env.GEMINI_PLAN_MODEL;
      delete process.env.GEMINI_PLAN_FALLBACK_MODEL;
      delete process.env.GEMINI_PLAN_THINKING_LEVEL;

      expect(resolvePlanModelConfig()).toEqual({
        model: GEMINI_PLAN_MODEL,
        fallbackModel: GEMINI_PLAN_FALLBACK_MODEL,
        thinkingLevel: ThinkingLevel.LOW,
      });

      process.env.GEMINI_PLAN_MODEL = 'gemini-4-custom';
      process.env.GEMINI_PLAN_FALLBACK_MODEL = 'gemini-3-flash-preview';
      process.env.GEMINI_PLAN_THINKING_LEVEL = 'medium';

      expect(resolvePlanModelConfig()).toEqual({
        model: 'gemini-4-custom',
        fallbackModel: 'gemini-3-flash-preview',
        thinkingLevel: ThinkingLevel.MEDIUM,
      });
    } finally {
      if (prevModel === undefined) delete process.env.GEMINI_PLAN_MODEL;
      else process.env.GEMINI_PLAN_MODEL = prevModel;
      if (prevFallback === undefined) delete process.env.GEMINI_PLAN_FALLBACK_MODEL;
      else process.env.GEMINI_PLAN_FALLBACK_MODEL = prevFallback;
      if (prevLevel === undefined) delete process.env.GEMINI_PLAN_THINKING_LEVEL;
      else process.env.GEMINI_PLAN_THINKING_LEVEL = prevLevel;
    }
  });

  it('retries 503 with backoff then succeeds on primary model with ThinkingLevel.LOW', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('503 Service Unavailable'), { status: 503 }))
      .mockResolvedValueOnce({ text: '{"ok":true}' });

    const caller = createGeminiCaller('test-key', {
      sleep,
      generateContent,
    });

    const raw = await caller({
      systemInstruction: 'sys',
      contents: 'user',
      responseSchema: {} as never,
      temperature: 0,
    });

    expect(raw).toBe('{"ok":true}');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(generateContent.mock.calls[0][0].model).toBe(GEMINI_PLAN_MODEL);
    expect(generateContent.mock.calls[0][0].config?.thinkingConfig).toEqual({
      thinkingLevel: ThinkingLevel.LOW,
    });
    expect(generateContent.mock.calls[0][0].config?.temperature).toBeUndefined();
  });

  it('falls back once to stable Flash model when all primary attempts return 503, and throws friendly AI_BUSY if fallback fails', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const err503 = Object.assign(new Error('Upstream raw stack: 503 UNAVAILABLE'), { status: 503 });

    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(err503)
      .mockRejectedValueOnce(err503)
      .mockRejectedValueOnce(err503)
      .mockResolvedValueOnce({ text: '{"fallback":true}' });

    const caller = createGeminiCaller('test-key', {
      sleep,
      generateContent,
    });

    const raw = await caller({
      systemInstruction: 'sys',
      contents: 'user',
      responseSchema: {} as never,
      temperature: 0,
    });

    expect(raw).toBe('{"fallback":true}');
    expect(generateContent).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(c => c[0])).toEqual([1000, 3000]);
    expect(generateContent.mock.calls[0][0].model).toBe(GEMINI_PLAN_MODEL);
    expect(generateContent.mock.calls[1][0].model).toBe(GEMINI_PLAN_MODEL);
    expect(generateContent.mock.calls[2][0].model).toBe(GEMINI_PLAN_MODEL);
    expect(generateContent.mock.calls[3][0].model).toBe(GEMINI_PLAN_FALLBACK_MODEL);

    // If fallback also returns 503, returns friendly retryable AI_BUSY error without raw text
    const alwaysBusy = vi.fn().mockRejectedValue(err503);
    const failingCaller = createGeminiCaller('test-key', {
      sleep: vi.fn().mockResolvedValue(undefined),
      generateContent: alwaysBusy,
    });

    await expect(
      failingCaller({
        systemInstruction: 'sys',
        contents: 'user',
        responseSchema: {} as never,
        temperature: 0,
      }),
    ).rejects.toMatchObject({
      name: 'PlanImportError',
      code: 'AI_BUSY',
      status: 503,
      retryable: true,
    });
  });

  it('aborts timed-out Gemini calls via AbortController and throws friendly AI_TIMEOUT', async () => {
    const observedSignals: AbortSignal[] = [];
    const generateContent = vi.fn(
      (params: { config?: { abortSignal?: AbortSignal } }) =>
        new Promise<{ text: string }>((_, reject) => {
          const signal = params.config?.abortSignal;
          if (signal) {
            observedSignals.push(signal);
            signal.addEventListener(
              'abort',
              () => {
                const abortErr = new Error('aborted');
                abortErr.name = 'AbortError';
                reject(abortErr);
              },
              { once: true },
            );
          }
        }),
    );

    const caller = createGeminiCaller('test-key', {
      timeoutMs: 20,
      retryDelaysMs: [10, 20],
      sleep: vi.fn().mockResolvedValue(undefined),
      generateContent,
    });

    await expect(
      caller({
        systemInstruction: 'sys',
        contents: 'user',
        responseSchema: {} as never,
        temperature: 0,
      }),
    ).rejects.toMatchObject({
      name: 'PlanImportError',
      code: 'AI_TIMEOUT',
      status: 504,
      retryable: true,
    });

    // Primary timed out once -> failed over once to fallback -> both AbortSignals aborted
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(observedSignals).toHaveLength(2);
    expect(observedSignals.every(s => s.aborted)).toBe(true);
  });

  it('never retries 400 or 401 errors and surfaces non-retryable friendly PlanImportError', async () => {
    for (const [status, expectedCode] of [
      [400, 'AI_INVALID_REQUEST'],
      [401, 'AI_UNCONFIGURED'],
    ] as const) {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const generateContent = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error(`HTTP ${status} raw detail`), { status }));

      const caller = createGeminiCaller('test-key', {
        sleep,
        generateContent,
      });

      let caught: unknown;
      try {
        await caller({
          systemInstruction: 'sys',
          contents: 'user',
          responseSchema: {} as never,
          temperature: 0,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(PlanImportError);
      expect(caught).toMatchObject({
        code: expectedCode,
        retryable: false,
      });
      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('supports refine mode with chat instruction while grounding quotes cleanly', async () => {
    const baseDraft: Extraction = {
      goals: [],
      phases: [],
      habits: [
        {
          title: 'Workout',
          cadence: 'weekly_count',
          target_count: 4,
          time_block: { start: '07:00', end: '08:00' },
          source_quote: 'Workout 4 per week 07:00-08:00',
        },
      ],
      tasks: [],
      success_criteria: [],
      principles: [],
      clarifications: [],
    };

    const caller = vi.fn().mockResolvedValueOnce(
      JSON.stringify({
        ...baseDraft,
        habits: [
          {
            title: 'Workout',
            cadence: 'weekly_count',
            target_count: 4,
            time_block: { start: '18:00', end: '19:00' },
            source_quote: 'move workouts to evenings',
          },
        ],
      }),
    );

    const refined = await refinePlanWithGemini(
      {
        planText: 'Workout 4 per week 07:00-08:00',
        currentDraft: baseDraft,
        instruction: 'move workouts to evenings',
      },
      { now: new Date('2026-11-20T04:00:00Z'), caller },
    );

    expect(refined.extraction.habits[0].time_block).toEqual({ start: '18:00', end: '19:00' });
    expect(refined.droppedCount).toBe(0);
  });

  it('enforces Firebase ID token auth, per-user rate limit, and input caps on /api/import-plan', async () => {
    // Missing Authorization -> 401
    const unauth = await handleImportPlanHttp({
      method: 'POST',
      body: { mode: 'extract', planText: 'Ship MVP' },
    });
    expect(unauth.status).toBe(401);

    // Invalid token -> 401
    const badAuth = await handleImportPlanHttp({
      method: 'POST',
      authorizationHeader: 'Bearer expired-token',
      body: { mode: 'extract', planText: 'Ship MVP' },
      verifyToken: async () => {
        throw new Error('Firebase ID token expired');
      },
    });
    expect(badAuth.status).toBe(401);

    // Oversized body -> 413
    const tooLargeBody = await handleImportPlanHttp({
      method: 'POST',
      authorizationHeader: 'Bearer valid-token',
      body: { mode: 'extract', planText: 'abc' },
      rawBodyBytes: MAX_IMPORT_REQUEST_BYTES + 1,
      verifyToken: async () => ({ uid: 'user-a' }),
    });
    expect(tooLargeBody.status).toBe(413);

    // Plan text exceeding MAX_PLAN_TEXT_CHARS -> 400
    const tooLongPlanText = await handleImportPlanHttp({
      method: 'POST',
      authorizationHeader: 'Bearer valid-token',
      body: { mode: 'extract', planText: 'x'.repeat(MAX_PLAN_TEXT_CHARS + 1) },
      rawBodyBytes: MAX_PLAN_TEXT_CHARS + 64,
      verifyToken: async () => ({ uid: 'user-a' }),
    });
    expect(tooLongPlanText.status).toBe(400);
    expect((tooLongPlanText.body as { error: string }).error).toContain('20,000');

    // Per-user rate limit -> allows configured quota then returns 429 with Retry-After, isolated per uid
    resetRateLimitStore();
    for (let i = 0; i < 3; i += 1) {
      expect(checkUserRateLimit('user-limit', 1000 + i * 10, { maxRequests: 3, windowMs: 60_000 }).allowed).toBe(true);
    }
    const blocked = checkUserRateLimit('user-limit', 1500, { maxRequests: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    const otherUser = checkUserRateLimit('user-other', 1500, { maxRequests: 3, windowMs: 60_000 });
    expect(otherUser.allowed).toBe(true);

    // End-to-end HTTP 429 + 200 verification
    const limitedResp = await handleImportPlanHttp({
      method: 'POST',
      authorizationHeader: 'Bearer valid-token',
      body: { mode: 'extract', planText: 'Run 4 per week' },
      nowMs: 1600,
      verifyToken: async () => ({ uid: 'user-limit' }),
      rateLimiter: (uid, now) => checkUserRateLimit(uid, now, { maxRequests: 3, windowMs: 60_000 }),
    });
    expect(limitedResp.status).toBe(429);
    expect(limitedResp.headers['Retry-After']).toBe('60');

    const extractSpy = vi.fn().mockResolvedValue({
      extraction: {
        goals: [],
        phases: [],
        habits: [{ title: 'Run', cadence: 'weekly_count', target_count: 4, source_quote: 'Run 4 per week' }],
        tasks: [],
        success_criteria: [],
        principles: [],
        clarifications: [],
      },
      anchorDate: '2026-11-20',
      timezone: 'Asia/Makassar',
      verified: false,
      droppedCount: 0,
      droppedByKind: { goals: 0, phases: 0, habits: 0, tasks: 0, success_criteria: 0, principles: 0, clarifications: 0 },
      dailyHabitCount: 0,
    });

    const okResp = await handleImportPlanHttp({
      method: 'POST',
      authorizationHeader: 'Bearer valid-token',
      body: { mode: 'extract', planText: 'Run 4 per week', deepCheck: true },
      nowMs: 1600,
      verifyToken: async () => ({ uid: 'user-fresh' }),
      extractPlan: extractSpy,
    });
    expect(okResp.status).toBe(200);
    expect(extractSpy).toHaveBeenCalledWith('Run 4 per week', { deepCheck: true, currentDraft: undefined });

    // Friendly error contract returned without leaking raw upstream text
    const busyResp = await handleImportPlanHttp({
      method: 'POST',
      authorizationHeader: 'Bearer valid-token',
      body: { mode: 'extract', planText: 'Run 4 per week' },
      nowMs: 1601,
      verifyToken: async () => ({ uid: 'user-fresh-2' }),
      extractPlan: async () => {
        throw new Error('SECRET_RAW_UPSTREAM_FAILURE');
      },
    });
    expect(busyResp.status).toBe(503);
    expect(busyResp.body).toEqual({
      error: 'The AI planner is temporarily busy. Please try again in a moment.',
      code: 'AI_BUSY',
      retryable: true,
    });
  });
});

describe('batch workspace merge, planned phases, multi-log weekly_count, scheduler, and undo import', () => {
  it('saves excess or future imported phases as planned (never archived or dropped), and cleanly undoes import', () => {
    const initial = createDefaultData();
    initial.goals.push({
      id: 'existing-g1',
      lifeAreaId: null,
      title: 'Launch SaaS MVP',
      outcome: 'Existing outcome',
      targetDate: '',
      status: 'active',
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    // Pre-populate 2 active projects so the 1st current imported phase takes slot 3 and the 2nd current phase exceeds 3-active cap
    initial.projects.push(
      {
        id: 'existing-p1',
        goalId: 'existing-g1',
        title: 'Existing Active 1',
        description: '',
        dueDate: '',
        status: 'active',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 'existing-p2',
        goalId: 'existing-g1',
        title: 'Existing Active 2',
        description: '',
        dueDate: '',
        status: 'active',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    );

    const draft: Extraction = {
      goals: [
        { title: 'Launch SaaS MVP', source_quote: 'Launch SaaS MVP' }, // duplicate -> deduped
        { title: 'Build Endurance', pillar_weight_pct: 40, source_quote: 'Build Endurance' },
      ],
      phases: [
        { title: 'Phase 1', start: '2026-11-20', end: '2026-12-19', source_quote: 'Phase 1' }, // active (3/3)
        { title: 'Phase 1B', start: '2026-11-20', end: '2026-12-19', source_quote: 'Phase 1B' }, // beyond 3 active -> planned
        { title: 'Phase 2', start: '2026-12-20', end: '2027-01-19', source_quote: 'Phase 2' }, // future -> planned
      ],
      habits: [
        {
          title: 'Run',
          goal_ref: 'Build Endurance',
          cadence: 'weekly_count',
          target_count: 5,
          source_quote: 'Run 5 per week',
        },
        {
          title: 'Mobility',
          cadence: 'specific_days',
          days: ['mon', 'wed', 'fri'],
          source_quote: 'Mobility Mon/Wed/Fri',
        },
      ],
      tasks: [
        {
          title: 'Write specs',
          phase_ref: 'Phase 1',
          due: '2026-11-20',
          target_quantity: 3,
          source_quote: 'Write specs',
        },
      ],
      success_criteria: [{ goal_ref: 'Build Endurance', text: 'Run 10k non-stop', source_quote: 'Run 10k non-stop' }],
      principles: [{ text: 'Never miss twice', source_quote: 'Never miss twice' }],
      clarifications: [],
    };

    const { nextData, record } = applyImportedPlanToWorkspace(initial, draft, {
      today: '2026-11-20',
      importId: 'imp-test-1',
    });

    expect(record.counts).toEqual({
      goals: 1,
      phases: 3,
      habits: 2,
      tasks: 1,
      successCriteria: 1,
      principles: 1,
      deduped: 1,
    });
    expect(nextData.projects.filter(p => p.status === 'active')).toHaveLength(3);
    expect(nextData.projects.find(p => p.title === 'Phase 1')?.status).toBe('active');
    expect(nextData.projects.find(p => p.title === 'Phase 1B')?.status).toBe('planned');
    expect(nextData.projects.find(p => p.title === 'Phase 2')?.status).toBe('planned');
    expect(nextData.tasks[0].projectId).toBe(nextData.projects.find(p => p.title === 'Phase 1')?.id);

    // Specific-days scheduling check (2026-11-20 is Friday -> scheduled; 2026-11-21 is Saturday -> not scheduled)
    const mobility = nextData.habits.find(h => h.name === 'Mobility')!;
    expect(isHabitScheduledOnDate(mobility, '2026-11-20')).toBe(true);
    expect(isHabitScheduledOnDate(mobility, '2026-11-21')).toBe(false);

    // Undo import restores exact pre-import entity sets and cleans dailyPlans/habitLogs
    const runHabit = nextData.habits.find(h => h.name === 'Run')!;
    const withDailyAndLog = {
      ...nextData,
      habitLogs: [
        { id: 'l1', habitId: runHabit.id, date: '2026-11-16', status: 'done' as const },
        { id: 'l2', habitId: runHabit.id, date: '2026-11-18', status: 'done' as const },
      ],
      dailyPlans: [{ date: '2026-11-20', priorityTaskIds: [nextData.tasks[0].id] }],
    };
    const undone = undoImportedPlan(withDailyAndLog, 'imp-test-1');
    expect(undone.goals).toHaveLength(1);
    expect(undone.projects).toHaveLength(initial.projects.length);
    expect(undone.tasks).toHaveLength(initial.tasks.length);
    expect(undone.habits).toHaveLength(initial.habits.length);
    expect(undone.habitLogs).toHaveLength(0);
    expect(undone.dailyPlans[0].priorityTaskIds).toEqual([]);
  });

  it('preserves multiple same-day done logs for weekly_count habits across counters, sanitize, 3-way merge, and v4 roundtrip', () => {
    const base = createDefaultData();
    base.habits.push({
      id: 'h-run',
      name: 'Run',
      frequency: 'daily',
      cadence: 'weekly_count',
      targetCount: 5,
      active: true,
      createdAt: '2026-11-01T00:00:00.000Z',
    });

    const withMultiDayLogs = sanitizeAppData({
      ...base,
      habitLogs: [
        { id: 'l-mon', habitId: 'h-run', date: '2026-11-16', status: 'done' },
        { id: 'l-fri-1', habitId: 'h-run', date: '2026-11-20', status: 'done' },
        { id: 'l-fri-2', habitId: 'h-run', date: '2026-11-20', status: 'done' },
      ],
    });

    expect(withMultiDayLogs.habitLogs).toHaveLength(3);
    expect(getWeeklyHabitCount('h-run', withMultiDayLogs.habitLogs, '2026-11-20')).toBe(3);
    expect(getTodayHabitCount('h-run', withMultiDayLogs.habitLogs, '2026-11-20')).toBe(2);

    // 3-way merge preserves concurrent same-day logs from two devices
    const remote = sanitizeAppData({
      ...base,
      habitLogs: [
        { id: 'l-mon', habitId: 'h-run', date: '2026-11-16', status: 'done' },
        { id: 'l-fri-remote', habitId: 'h-run', date: '2026-11-20', status: 'done' },
      ],
    });
    const merged = threeWayMergeWorkspaceDetailed(base, withMultiDayLogs, remote);
    expect(merged.data.habitLogs.filter(l => l.habitId === 'h-run' && l.date === '2026-11-20')).toHaveLength(3);

    // v4 migration roundtrip preserves multi-log entries
    const bundle = buildV4DocumentsFromV3(withMultiDayLogs);
    const roundtripped = reconstructV3FromV4(bundle);
    expect(roundtripped.habitLogs.filter(l => l.habitId === 'h-run' && l.date === '2026-11-20')).toHaveLength(2);
  });

  it('schedules active-phase undated + this-week tasks + overdue tasks and suggests 3 priorities cleanly', () => {
    const data = createDefaultData();
    data.projects.push(
      {
        id: 'p-active',
        goalId: null,
        title: 'Active Phase',
        description: '',
        startDate: '2026-11-10',
        dueDate: '2026-12-10',
        status: 'active',
        isPhase: true,
        createdAt: '2026-11-10T00:00:00.000Z',
      },
      {
        id: 'p-planned',
        goalId: null,
        title: 'Planned Phase',
        description: '',
        startDate: '2026-12-11',
        dueDate: '2027-01-10',
        status: 'planned',
        isPhase: true,
        createdAt: '2026-11-10T00:00:00.000Z',
      },
    );

    const today = '2026-11-18'; // Wednesday of week 2026-11-16 .. 2026-11-22
    data.tasks.push(
      {
        id: 't-overdue',
        projectId: null,
        title: 'Overdue Item',
        dueDate: '2026-11-15',
        priority: 'medium',
        status: 'todo',
        createdAt: '2026-11-01T00:00:00.000Z',
        completedAt: null,
      },
      {
        id: 't-this-week',
        projectId: 'p-active',
        title: 'This Week Active Phase',
        dueDate: '2026-11-21', // Saturday same week
        priority: 'high',
        status: 'todo',
        createdAt: '2026-11-10T00:00:00.000Z',
        completedAt: null,
      },
      {
        id: 't-undated-active',
        projectId: 'p-active',
        title: 'Undated Active Phase',
        dueDate: '',
        priority: 'medium',
        status: 'todo',
        createdAt: '2026-11-10T00:00:00.000Z',
        completedAt: null,
      },
      {
        id: 't-next-week-excluded',
        projectId: 'p-active',
        title: 'Next Week Excluded',
        dueDate: '2026-11-25',
        priority: 'high',
        status: 'todo',
        createdAt: '2026-11-10T00:00:00.000Z',
        completedAt: null,
      },
      {
        id: 't-planned-excluded',
        projectId: 'p-planned',
        title: 'Planned Phase Undated Excluded',
        dueDate: '',
        priority: 'high',
        status: 'todo',
        createdAt: '2026-11-10T00:00:00.000Z',
        completedAt: null,
      },
    );

    const schedule = buildTodaySchedule(data, today);
    expect(schedule.weekStart).toBe('2026-11-16');
    expect(schedule.weekEnd).toBe('2026-11-22');
    expect(schedule.scheduledTasks.map(t => t.id)).toEqual(['t-overdue', 't-this-week', 't-undated-active']);
    expect(schedule.suggestedPriorityIds).toEqual(['t-overdue', 't-this-week', 't-undated-active']);
  });

  it('creates or reuses LifeAreas case-insensitively from goal.life_area, preserves extracted task priority, and sanitizes task quantities', () => {
    const initial = createDefaultData();
    const healthArea = initial.lifeAreas.find(a => a.name === 'Health')!;

    const draft = ExtractionSchema.parse({
      goals: [
        {
          title: 'Run a half marathon',
          life_area: 'health', // case-insensitive match to existing "Health"
          source_quote: 'Run a half marathon',
        },
        {
          title: 'Launch Creative Studio',
          life_area: 'Creative Side Hustle', // new LifeArea to create
          source_quote: 'Launch Creative Studio',
        },
      ],
      phases: [],
      habits: [],
      tasks: [
        {
          title: 'Submit permit',
          priority: 'high',
          due: '2026-11-22',
          target_quantity: 30,
          source_quote: 'Submit permit ASAP',
        },
        {
          title: 'Clean inbox',
          priority: 'low',
          source_quote: 'Clean inbox eventually',
        },
        {
          title: 'Review contract',
          source_quote: 'Review contract',
        },
      ],
      success_criteria: [],
      principles: [],
      clarifications: [],
    });

    const { nextData } = applyImportedPlanToWorkspace(initial, draft, { today: '2026-11-20' });

    const marathonGoal = nextData.goals.find(g => g.title === 'Run a half marathon')!;
    const studioGoal = nextData.goals.find(g => g.title === 'Launch Creative Studio')!;
    const createdArea = nextData.lifeAreas.find(a => a.name === 'Creative Side Hustle');

    expect(marathonGoal.lifeAreaId).toBe(healthArea.id);
    expect(createdArea).toBeDefined();
    expect(studioGoal.lifeAreaId).toBe(createdArea?.id);
    // Reusing existing area should not duplicate "Health"
    expect(nextData.lifeAreas.filter(a => a.name.toLowerCase() === 'health')).toHaveLength(1);

    expect(nextData.tasks.find(t => t.title === 'Submit permit')?.priority).toBe('high');
    expect(nextData.tasks.find(t => t.title === 'Clean inbox')?.priority).toBe('low');
    expect(nextData.tasks.find(t => t.title === 'Review contract')?.priority).toBe('medium');

    // sanitizeAppData clamps completedQuantity safely to targetQuantity and strips undefined fields
    const sanitized = sanitizeAppData({
      ...nextData,
      tasks: nextData.tasks.map(t =>
        t.title === 'Submit permit' ? { ...t, completedQuantity: 45 } : t,
      ),
    });
    const permitTask = sanitized.tasks.find(t => t.title === 'Submit permit')!;
    expect(permitTask.targetQuantity).toBe(30);
    expect(permitTask.completedQuantity).toBe(30);
    const inboxTask = sanitized.tasks.find(t => t.title === 'Clean inbox')!;
    expect('completedQuantity' in inboxTask).toBe(false);
    expect('targetQuantity' in inboxTask).toBe(false);
  });
});
