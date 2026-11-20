import type { Extraction } from '../../src/types';
import {
  ExtractionSchema,
  filterGroundedExtractionWithStats,
  getMakassarDateKey,
  mergeVerificationPassWithStats,
  normalizeWeeklyCountHabits,
  PLAN_TIMEZONE,
  resolveRelativeDatesInCode,
  VerificationPassSchema,
  type GroundingStats,
} from '../../src/utils/planImportSchema';
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Schema,
} from '@google/genai';
import { z } from 'zod';

export const GEMINI_PLAN_MODEL = 'gemini-4-hydrogen';
export const GEMINI_PLAN_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_CALL_TIMEOUT_MS = 40_000;
export const GEMINI_RETRY_BACKOFFS_MS = [1000, 3000] as const;

export type PlanImportErrorCode =
  | 'AI_BUSY'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_UNCONFIGURED'
  | 'AI_INVALID_REQUEST'
  | 'AI_OUTPUT_INVALID';

export class PlanImportError extends Error {
  readonly code: PlanImportErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly userMessage: string;

  constructor(params: {
    code: PlanImportErrorCode;
    status: number;
    retryable: boolean;
    message: string;
  }) {
    super(params.message);
    this.name = 'PlanImportError';
    this.code = params.code;
    this.status = params.status;
    this.retryable = params.retryable;
    this.userMessage = params.message;
  }
}

export interface PlanModelConfig {
  model: string;
  fallbackModel: string;
  thinkingLevel: ThinkingLevel;
}

export function parseThinkingLevel(raw?: string): ThinkingLevel {
  const normalized = (raw ?? '').trim().toUpperCase();
  if (normalized === 'MINIMAL') return ThinkingLevel.MINIMAL;
  if (normalized === 'MEDIUM') return ThinkingLevel.MEDIUM;
  if (normalized === 'HIGH') return ThinkingLevel.HIGH;
  if (normalized === 'XHIGH') return 'XHIGH' as ThinkingLevel;
  return ThinkingLevel.LOW;
}

export function resolvePlanModelConfig(overrides?: {
  model?: string;
  fallbackModel?: string;
  thinkingLevel?: ThinkingLevel | string;
}): PlanModelConfig {
  const model = overrides?.model?.trim() || process.env.GEMINI_PLAN_MODEL?.trim() || GEMINI_PLAN_MODEL;
  const fallbackModel =
    overrides?.fallbackModel?.trim() || process.env.GEMINI_PLAN_FALLBACK_MODEL?.trim() || GEMINI_PLAN_FALLBACK_MODEL;
  const thinkingLevel = parseThinkingLevel(
    overrides?.thinkingLevel ?? process.env.GEMINI_PLAN_THINKING_LEVEL,
  );
  return { model, fallbackModel, thinkingLevel };
}

const EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    goals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          life_area: { type: Type.STRING },
          pillar_weight_pct: { type: Type.NUMBER },
          description: { type: Type.STRING },
          source_quote: { type: Type.STRING },
        },
        required: ['title', 'source_quote'],
      },
    },
    phases: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          start: { type: Type.STRING },
          end: { type: Type.STRING },
          theme: { type: Type.STRING },
          exit_condition: { type: Type.STRING },
          source_quote: { type: Type.STRING },
        },
        required: ['title', 'start', 'end', 'source_quote'],
      },
    },
    habits: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          goal_ref: { type: Type.STRING },
          cadence: { type: Type.STRING, enum: ['daily', 'weekly_count', 'specific_days'] },
          target_count: { type: Type.INTEGER },
          days: {
            type: Type.ARRAY,
            items: { type: Type.STRING, enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
          },
          time_block: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.STRING },
              end: { type: Type.STRING },
            },
            required: ['start', 'end'],
          },
          minimum_version: { type: Type.STRING },
          source_quote: { type: Type.STRING },
        },
        required: ['title', 'cadence', 'source_quote'],
      },
    },
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          goal_ref: { type: Type.STRING },
          phase_ref: { type: Type.STRING },
          due: { type: Type.STRING },
          priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          target_quantity: { type: Type.NUMBER },
          source_quote: { type: Type.STRING },
        },
        required: ['title', 'source_quote'],
      },
    },
    success_criteria: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          goal_ref: { type: Type.STRING },
          text: { type: Type.STRING },
          source_quote: { type: Type.STRING },
        },
        required: ['text', 'source_quote'],
      },
    },
    principles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          source_quote: { type: Type.STRING },
        },
        required: ['text', 'source_quote'],
      },
    },
    clarifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          related_quote: { type: Type.STRING },
        },
        required: ['question', 'related_quote'],
      },
    },
  },
  required: ['goals', 'phases', 'habits', 'tasks', 'success_criteria', 'principles', 'clarifications'],
};

const VERIFICATION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    missing: EXTRACTION_RESPONSE_SCHEMA,
    updates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: ['goals', 'phases', 'habits', 'tasks', 'success_criteria', 'principles'],
          },
          match_title_or_text: { type: Type.STRING },
          source_quote: { type: Type.STRING },
          title: { type: Type.STRING },
          text: { type: Type.STRING },
          life_area: { type: Type.STRING },
          description: { type: Type.STRING },
          pillar_weight_pct: { type: Type.NUMBER },
          start: { type: Type.STRING },
          end: { type: Type.STRING },
          theme: { type: Type.STRING },
          exit_condition: { type: Type.STRING },
          goal_ref: { type: Type.STRING },
          phase_ref: { type: Type.STRING },
          cadence: { type: Type.STRING, enum: ['daily', 'weekly_count', 'specific_days'] },
          target_count: { type: Type.INTEGER },
          days: {
            type: Type.ARRAY,
            items: { type: Type.STRING, enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
          },
          time_block: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.STRING },
              end: { type: Type.STRING },
            },
            required: ['start', 'end'],
          },
          minimum_version: { type: Type.STRING },
          due: { type: Type.STRING },
          priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          target_quantity: { type: Type.NUMBER },
        },
        required: ['kind', 'match_title_or_text', 'source_quote'],
      },
    },
    removals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: ['goals', 'phases', 'habits', 'tasks', 'success_criteria', 'principles', 'clarifications'],
          },
          match_title_or_text: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['kind', 'match_title_or_text'],
      },
    },
  },
  required: ['missing', 'updates', 'removals'],
};

export interface StructuredModelCaller {
  (params: {
    systemInstruction: string;
    contents: string;
    responseSchema: Schema;
    temperature: number;
    thinkingLevel?: ThinkingLevel;
  }): Promise<string>;
}

export interface PlanImportServiceOptions {
  apiKey?: string;
  now?: Date;
  deepCheck?: boolean;
  currentDraft?: Extraction;
  model?: string;
  fallbackModel?: string;
  thinkingLevel?: ThinkingLevel | string;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
  caller?: StructuredModelCaller;
}

export interface GeminiCallerOptions {
  model?: string;
  fallbackModel?: string;
  thinkingLevel?: ThinkingLevel | string;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  generateContent?: (params: GenerateContentParameters) => Promise<Pick<GenerateContentResponse, 'text'>>;
}

export interface ImportPlanResult {
  extraction: Extraction;
  anchorDate: string;
  timezone: string;
  verified: boolean;
  droppedCount: number;
  droppedByKind: GroundingStats;
  dailyHabitCount: number;
}

function buildSystemPrompt(anchorDate: string): string {
  return [
    'You are an exact structured plan extractor for a personal execution workspace.',
    `Current date: ${anchorDate}. Timezone: ${PLAN_TIMEZONE}.`,
    'Rules:',
    '1. Extract ONLY what is explicitly present in the user text.',
    '2. Every extracted item MUST include an exact verbatim `source_quote` copied directly from the input text (and clarifications MUST include an exact verbatim `related_quote`). Each quote MUST be the shortest unique verbatim snippet, max 12 words — never copy long sentences or paragraphs, and never paraphrase or alter words.',
    '3. NEVER invent dates, numbers, metrics, priorities, habits, tasks, or goals.',
    '4. Put anything ambiguous, underspecified, or missing key execution details (like unclear cadence, missing target date, ambiguous metric) into `clarifications`.',
    '5. Return ISO calendar dates (`YYYY-MM-DD`) when explicit calendar dates appear in the text. If the text uses relative phrases such as "Days 1–30", "Day 15", "Week 2", or "Months 1-2", preserve the exact relative phrase in `start`/`end`/`due` (or leave empty string `""` for missing phase boundaries) instead of doing mental calendar arithmetic.',
    '6. Treat frequencies written as "X per week", "X times a week", "X days/week", or "Xx/week" strictly as `cadence: "weekly_count"` with `target_count: X` — NEVER as `"daily"`. Use `"specific_days"` only when explicit days of the week (e.g., Mon/Wed/Fri) are stated.',
    '7. Keep titles concise and faithful to the text. Set `pillar_weight_pct` only if percentage weights are explicitly stated. Set goal `life_area` only when a life area/domain (e.g. Health, Career, Business, Wealth, Education) is explicitly mentioned. Set task `priority` ("high", "medium", or "low") only when urgency/priority is explicitly indicated in the text.',
  ].join('\n');
}

function buildVerificationPrompt(anchorDate: string): string {
  return [
    'You are auditing a structured plan extraction against the original free-text plan.',
    `Current date: ${anchorDate}. Timezone: ${PLAN_TIMEZONE}.`,
    'Compare the original text and the Pass-1 JSON extraction carefully:',
    '1. List ONLY items explicitly present in the original text that are missing from Pass-1 under `missing`. Keep every `source_quote` / `related_quote` as the shortest unique verbatim snippet from the original text, max 12 words.',
    '2. List ONLY items in Pass-1 that have wrong fields (e.g. a "X per week" habit marked "daily", wrong target_count, missing time_block/minimum_version/exit_condition explicitly stated in the text) under `updates` with the shortest unique verbatim `source_quote` (max 12 words).',
    '3. List ONLY hallucinated or unsupported items that are NOT explicitly in the original text under `removals`.',
    '4. If Pass-1 is already complete and accurate, return empty arrays for every field. Never invent dates, numbers, or items.',
  ].join('\n');
}

function buildRefinePrompt(anchorDate: string): string {
  return [
    'You are updating an existing structured plan draft based on the original plan, user clarification answers, and a user refinement instruction.',
    `Current date: ${anchorDate}. Timezone: ${PLAN_TIMEZONE}.`,
    'Rules:',
    '1. Apply the user instruction and clarification answers faithfully to the current draft.',
    '2. Preserve valid untouched items from the current draft along with their exact `source_quote`.',
    '3. For newly added or modified items requested in the instruction/answers, use the shortest unique verbatim `source_quote` (max 12 words) copied from the instruction, clarification answer, or original plan text.',
    '4. Remove any clarified ambiguity from `clarifications` once resolved; keep unresolved ones.',
    '5. Treat "X per week" / "X times a week" strictly as `cadence: "weekly_count"` with `target_count: X`, NOT `"daily"`. Return ISO dates (`YYYY-MM-DD`) for explicit dates and preserve relative phrases like "Day 15" cleanly.',
  ].join('\n');
}

function isTemperatureRejectedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('temperature') && (message.includes('400') || message.includes('invalid') || message.includes('unsupported'));
}

function extractHttpStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.status === 'number' && Number.isFinite(obj.status)) return obj.status;
    if (typeof obj.statusCode === 'number' && Number.isFinite(obj.statusCode)) return obj.statusCode;
    if (typeof obj.code === 'number' && obj.code >= 400 && obj.code <= 599) return obj.code;
  }

  const msg = error instanceof Error ? error.message : String(error);
  const jsonCodeMatch = msg.match(/"(?:code|status)"\s*:\s*(\d{3})\b/);
  if (jsonCodeMatch) return Number(jsonCodeMatch[1]);

  const httpStatusMatch = msg.match(/\b(400|401|403|404|408|429|500|502|503|504)\b/);
  if (httpStatusMatch) return Number(httpStatusMatch[1]);

  const upper = msg.toUpperCase();
  if (upper.includes('RESOURCE_EXHAUSTED')) return 429;
  if (upper.includes('UNAVAILABLE')) return 503;
  if (upper.includes('DEADLINE_EXCEEDED')) return 504;
  if (upper.includes('INTERNAL')) return 500;
  if (upper.includes('UNAUTHENTICATED')) return 401;
  if (upper.includes('PERMISSION_DENIED')) return 403;
  if (upper.includes('INVALID_ARGUMENT')) return 400;

  return null;
}

function isAbortOrTimeoutError(error: unknown, timedOut: boolean): boolean {
  if (timedOut) return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes('timed out') || msg.includes('timeout') || msg.includes('aborted');
}

function isRetryableStatus(status: number | null): boolean {
  return status === 429 || status === 500 || status === 503 || status === 504;
}

function isNonRetryableClientStatus(status: number | null): boolean {
  return status === 400 || status === 401 || status === 403 || status === 404;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function supportsThinkingConfig(model: string): boolean {
  return model.startsWith('gemini-3') || model.startsWith('gemini-4');
}

function toFriendlyUpstreamError(error: unknown, timedOut: boolean): PlanImportError {
  if (error instanceof PlanImportError) return error;

  if (isAbortOrTimeoutError(error, timedOut)) {
    return new PlanImportError({
      code: 'AI_TIMEOUT',
      status: 504,
      retryable: true,
      message: 'Plan extraction timed out. Please try again or shorten your pasted text.',
    });
  }

  const status = extractHttpStatus(error);
  if (status === 400) {
    return new PlanImportError({
      code: 'AI_INVALID_REQUEST',
      status: 400,
      retryable: false,
      message: 'The plan could not be processed as formatted. Adjust your text and try again.',
    });
  }
  if (status === 401 || status === 403) {
    return new PlanImportError({
      code: 'AI_UNCONFIGURED',
      status: 503,
      retryable: false,
      message: 'The AI planner is temporarily unavailable due to server credentials.',
    });
  }

  return new PlanImportError({
    code: 'AI_BUSY',
    status: 503,
    retryable: true,
    message: 'The AI planner is temporarily busy. Please try again in a moment.',
  });
}

async function runSingleAttemptWithTimeout(
  generate: (params: GenerateContentParameters) => Promise<Pick<GenerateContentResponse, 'text'>>,
  params: Omit<GenerateContentParameters, 'config'> & { config: GenerateContentConfig },
  timeoutMs: number,
): Promise<{ text: string }> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Gemini request timed out.'));
  }, timeoutMs);

  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      reject(
        new PlanImportError({
          code: 'AI_TIMEOUT',
          status: 504,
          retryable: true,
          message: 'Plan extraction timed out. Please try again or shorten your pasted text.',
        }),
      );
    };
    if (controller.signal.aborted) {
      onAbort();
      return;
    }
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    const callConfig: GenerateContentConfig = {
      ...params.config,
      abortSignal: controller.signal,
    };

    let response: Pick<GenerateContentResponse, 'text'>;
    try {
      response = await Promise.race([
        generate({ model: params.model, contents: params.contents, config: callConfig }),
        abortPromise,
      ]);
    } catch (error) {
      if (isTemperatureRejectedError(error) && 'temperature' in callConfig) {
        const { temperature: _ignored, ...withoutTemp } = callConfig;
        response = await Promise.race([
          generate({ model: params.model, contents: params.contents, config: withoutTemp }),
          abortPromise,
        ]);
      } else {
        throw error;
      }
    }

    const text = response.text?.trim();
    if (!text) {
      throw new PlanImportError({
        code: 'AI_OUTPUT_INVALID',
        status: 502,
        retryable: true,
        message: 'The AI planner returned an empty response. Please try again.',
      });
    }
    return { text };
  } catch (error) {
    if (error instanceof PlanImportError) throw error;
    if (isAbortOrTimeoutError(error, timedOut)) {
      throw toFriendlyUpstreamError(error, true);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function createGeminiCaller(apiKey: string, options: GeminiCallerOptions = {}): StructuredModelCaller {
  const resolvedConfig = resolvePlanModelConfig({
    model: options.model,
    fallbackModel: options.fallbackModel,
    thinkingLevel: options.thinkingLevel,
  });
  const timeoutMs = options.timeoutMs ?? GEMINI_CALL_TIMEOUT_MS;
  const retryDelaysMs = options.retryDelaysMs ?? GEMINI_RETRY_BACKOFFS_MS;
  const sleep = options.sleep ?? defaultSleep;

  const generateContent =
    options.generateContent ??
    (() => {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      return (req: GenerateContentParameters) => ai.models.generateContent(req);
    })();

  const buildModelConfig = (
    modelName: string,
    params: {
      systemInstruction: string;
      responseSchema: Schema;
      temperature: number;
      thinkingLevel?: ThinkingLevel;
    },
  ): GenerateContentConfig => {
    const level = params.thinkingLevel ?? resolvedConfig.thinkingLevel;
    const config: GenerateContentConfig = {
      systemInstruction: params.systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: params.responseSchema,
    };
    if (supportsThinkingConfig(modelName)) {
      config.thinkingConfig = { thinkingLevel: level };
    }
    if (!modelName.startsWith('gemini-4-')) {
      config.temperature = params.temperature;
    }
    return config;
  };

  return async ({ systemInstruction, contents, responseSchema, temperature, thinkingLevel }) => {
    const primaryModel = resolvedConfig.model;
    const fallbackModel = resolvedConfig.fallbackModel;
    const maxPrimaryAttempts = 1 + retryDelaysMs.length;

    let lastError: unknown = null;
    let primaryTimedOut = false;

    for (let attempt = 0; attempt < maxPrimaryAttempts; attempt += 1) {
      try {
        const { text } = await runSingleAttemptWithTimeout(
          generateContent,
          {
            model: primaryModel,
            contents,
            config: buildModelConfig(primaryModel, {
              systemInstruction,
              responseSchema,
              temperature,
              thinkingLevel,
            }),
          },
          timeoutMs,
        );
        return text;
      } catch (error) {
        lastError = error;

        if (error instanceof PlanImportError) {
          if (error.code === 'AI_TIMEOUT') {
            primaryTimedOut = true;
            // A full call timeout already spent the budget on primaryModel; fail over to faster fallback immediately.
            break;
          }
          if (!error.retryable) {
            throw error;
          }
        } else {
          const status = extractHttpStatus(error);
          if (isNonRetryableClientStatus(status)) {
            throw toFriendlyUpstreamError(error, false);
          }
          const isTimeout = isAbortOrTimeoutError(error, false);
          if (isTimeout) {
            primaryTimedOut = true;
            break;
          }
          const isNetwork =
            status === null &&
            error instanceof Error &&
            /network|fetch|econnreset|etimedout|socket|unavailable/i.test(error.message);
          if (!isRetryableStatus(status) && !isNetwork) {
            throw toFriendlyUpstreamError(error, false);
          }
        }

        if (attempt < retryDelaysMs.length) {
          const delayMs = retryDelaysMs[attempt] ?? 0;
          if (delayMs > 0) {
            await sleep(delayMs);
          }
        }
      }
    }

    // Primary exhausted with retryable/timeout failure -> fall back once to faster stable Flash model
    if (fallbackModel && fallbackModel !== primaryModel) {
      try {
        const { text } = await runSingleAttemptWithTimeout(
          generateContent,
          {
            model: fallbackModel,
            contents,
            config: buildModelConfig(fallbackModel, {
              systemInstruction,
              responseSchema,
              temperature,
              thinkingLevel,
            }),
          },
          timeoutMs,
        );
        return text;
      } catch (fallbackError) {
        throw toFriendlyUpstreamError(fallbackError, isAbortOrTimeoutError(fallbackError, false));
      }
    }

    throw toFriendlyUpstreamError(lastError, primaryTimedOut);
  };
}

function stripJsonCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function runWithSingleSchemaRetry<T>(
  schema: z.ZodType<T>,
  invoke: (repairHint?: string) => Promise<string>,
): Promise<T> {
  let lastError = 'Invalid structured output.';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repairHint =
      attempt === 0
        ? undefined
        : `Previous output failed JSON/schema validation (${lastError}). Return ONLY valid JSON matching the schema strictly.`;
    const raw = await invoke(repairHint);
    const cleaned = stripJsonCodeFence(raw);
    try {
      const parsedJson = JSON.parse(cleaned);
      const checked = schema.safeParse(parsedJson);
      if (checked.success) return checked.data;
      lastError = checked.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Malformed JSON';
    }
  }
  throw new PlanImportError({
    code: 'AI_OUTPUT_INVALID',
    status: 502,
    retryable: true,
    message: 'The AI returned an incomplete plan structure. Please try extracting again.',
  });
}

function addStats(a: GroundingStats, b: GroundingStats): GroundingStats {
  return {
    goals: a.goals + b.goals,
    phases: a.phases + b.phases,
    habits: a.habits + b.habits,
    tasks: a.tasks + b.tasks,
    success_criteria: a.success_criteria + b.success_criteria,
    principles: a.principles + b.principles,
    clarifications: a.clarifications + b.clarifications,
  };
}

function resolveCaller(options: PlanImportServiceOptions): { caller: StructuredModelCaller; thinkingLevel: ThinkingLevel } {
  const modelConfig = resolvePlanModelConfig({
    model: options.model,
    fallbackModel: options.fallbackModel,
    thinkingLevel: options.thinkingLevel,
  });

  if (options.caller) {
    return { caller: options.caller, thinkingLevel: modelConfig.thinkingLevel };
  }

  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new PlanImportError({
      code: 'AI_UNCONFIGURED',
      status: 503,
      retryable: false,
      message: 'Plan import is not configured on the server yet.',
    });
  }

  return {
    caller: createGeminiCaller(apiKey, {
      model: modelConfig.model,
      fallbackModel: modelConfig.fallbackModel,
      thinkingLevel: modelConfig.thinkingLevel,
      timeoutMs: options.timeoutMs,
      retryDelaysMs: options.retryDelaysMs,
    }),
    thinkingLevel: modelConfig.thinkingLevel,
  };
}

export async function extractPlanWithGemini(
  planText: string,
  options: PlanImportServiceOptions = {},
): Promise<ImportPlanResult> {
  const anchorDate = getMakassarDateKey(options.now);
  const { caller, thinkingLevel } = resolveCaller(options);
  const deepCheck = options.deepCheck === true;

  let pass1Grounded: Extraction;
  let droppedCount = 0;
  let droppedByKind: GroundingStats = {
    goals: 0,
    phases: 0,
    habits: 0,
    tasks: 0,
    success_criteria: 0,
    principles: 0,
    clarifications: 0,
  };

  if (options.currentDraft && deepCheck) {
    const existingGrounded = filterGroundedExtractionWithStats(options.currentDraft, planText);
    pass1Grounded = resolveRelativeDatesInCode(
      normalizeWeeklyCountHabits(existingGrounded.extraction),
      anchorDate,
    );
    droppedCount = existingGrounded.droppedCount;
    droppedByKind = { ...existingGrounded.droppedByKind };
  } else {
    const pass1Raw = await runWithSingleSchemaRetry(ExtractionSchema, repairHint =>
      caller({
        systemInstruction: buildSystemPrompt(anchorDate),
        contents: repairHint ? `${repairHint}\n\nPLAN TEXT:\n${planText}` : `PLAN TEXT:\n${planText}`,
        responseSchema: EXTRACTION_RESPONSE_SCHEMA,
        temperature: 0,
        thinkingLevel,
      }),
    );

    const pass1GroundedStats = filterGroundedExtractionWithStats(pass1Raw, planText);
    pass1Grounded = resolveRelativeDatesInCode(
      normalizeWeeklyCountHabits(pass1GroundedStats.extraction),
      anchorDate,
    );
    droppedCount = pass1GroundedStats.droppedCount;
    droppedByKind = { ...pass1GroundedStats.droppedByKind };
  }

  let verified = false;
  let finalExtraction = pass1Grounded;

  if (deepCheck) {
    const runVerification = async () => {
      const verification = await runWithSingleSchemaRetry(VerificationPassSchema, repairHint =>
        caller({
          systemInstruction: buildVerificationPrompt(anchorDate),
          contents: [
            repairHint ?? '',
            'ORIGINAL PLAN TEXT:',
            planText,
            '',
            'PASS-1 EXTRACTION JSON:',
            JSON.stringify(pass1Grounded),
          ]
            .filter(Boolean)
            .join('\n'),
          responseSchema: VERIFICATION_RESPONSE_SCHEMA,
          temperature: 0,
          thinkingLevel,
        }),
      );

      const mergeResult = mergeVerificationPassWithStats(pass1Grounded, verification, planText);
      const pass2GroundedStats = filterGroundedExtractionWithStats(mergeResult.extraction, planText);
      finalExtraction = resolveRelativeDatesInCode(
        normalizeWeeklyCountHabits(pass2GroundedStats.extraction),
        anchorDate,
      );
      droppedCount += mergeResult.droppedCount + pass2GroundedStats.droppedCount;
      droppedByKind = addStats(droppedByKind, pass2GroundedStats.droppedByKind);
      verified = true;
    };

    if (options.currentDraft) {
      // Explicit Deep check button on review screen should surface actionable errors rather than falsely marking verified
      await runVerification();
    } else {
      try {
        await runVerification();
      } catch {
        // Keep validated & grounded Pass 1 extraction if optional Pass 2 fails after initial Pass 1 succeeded
        finalExtraction = pass1Grounded;
        verified = false;
      }
    }
  }

  const dailyHabitCount = finalExtraction.habits.filter(h => h.cadence === 'daily').length;

  return {
    extraction: finalExtraction,
    anchorDate,
    timezone: PLAN_TIMEZONE,
    verified,
    droppedCount,
    droppedByKind,
    dailyHabitCount,
  };
}

export async function refinePlanWithGemini(
  params: {
    planText: string;
    currentDraft: Extraction;
    instruction?: string;
    answers?: Array<{ question: string; related_quote: string; answer: string }>;
  },
  options: PlanImportServiceOptions = {},
): Promise<ImportPlanResult> {
  const anchorDate = getMakassarDateKey(options.now);
  const { caller, thinkingLevel } = resolveCaller(options);

  const instruction = params.instruction?.trim() ?? '';
  const answers = (params.answers ?? []).filter(a => a.answer.trim().length > 0);
  const answersBlock = answers
    .map(a => `Question: ${a.question}\nRelated quote: ${a.related_quote}\nAnswer: ${a.answer.trim()}`)
    .join('\n\n');

  const draftQuotes = [
    ...params.currentDraft.goals.map(g => g.source_quote),
    ...params.currentDraft.phases.map(p => p.source_quote),
    ...params.currentDraft.habits.map(h => h.source_quote),
    ...params.currentDraft.tasks.map(t => t.source_quote),
    ...params.currentDraft.success_criteria.map(s => s.source_quote),
    ...params.currentDraft.principles.map(p => p.source_quote),
    ...params.currentDraft.clarifications.map(c => c.related_quote),
  ].join('\n');

  const allowedCorpus = [params.planText, instruction, answersBlock, draftQuotes].filter(Boolean).join('\n');

  const refinedRaw = await runWithSingleSchemaRetry(ExtractionSchema, repairHint =>
    caller({
      systemInstruction: buildRefinePrompt(anchorDate),
      contents: [
        repairHint ?? '',
        'ORIGINAL PLAN TEXT:',
        params.planText,
        '',
        'CURRENT DRAFT JSON:',
        JSON.stringify(params.currentDraft),
        answersBlock ? `\nCLARIFICATION ANSWERS:\n${answersBlock}` : '',
        instruction ? `\nREFINEMENT INSTRUCTION:\n${instruction}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      responseSchema: EXTRACTION_RESPONSE_SCHEMA,
      temperature: 0,
      thinkingLevel,
    }),
  );

  const groundedStats = filterGroundedExtractionWithStats(refinedRaw, allowedCorpus);
  const refinedExtraction = resolveRelativeDatesInCode(
    normalizeWeeklyCountHabits(groundedStats.extraction),
    anchorDate,
  );
  const dailyHabitCount = refinedExtraction.habits.filter(h => h.cadence === 'daily').length;

  return {
    extraction: refinedExtraction,
    anchorDate,
    timezone: PLAN_TIMEZONE,
    verified: true,
    droppedCount: groundedStats.droppedCount,
    droppedByKind: groundedStats.droppedByKind,
    dailyHabitCount,
  };
}
