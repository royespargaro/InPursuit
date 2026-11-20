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
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { z } from 'zod';

export const GEMINI_PLAN_MODEL = 'gemini-4-hydrogen';

const EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    goals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
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
  }): Promise<string>;
}

export interface PlanImportServiceOptions {
  apiKey?: string;
  now?: Date;
  caller?: StructuredModelCaller;
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
    '2. Every extracted item MUST include an exact verbatim `source_quote` substring copied directly from the input text (and clarifications MUST include an exact verbatim `related_quote`). Do not paraphrase or alter punctuation/words inside quotes.',
    '3. NEVER invent dates, numbers, metrics, priorities, habits, tasks, or goals.',
    '4. Put anything ambiguous, underspecified, or missing key execution details (like unclear cadence, missing target date, ambiguous metric) into `clarifications`.',
    '5. Return ISO calendar dates (`YYYY-MM-DD`) when explicit calendar dates appear in the text. If the text uses relative phrases such as "Days 1–30", "Day 15", "Week 2", or "Months 1-2", preserve the exact relative phrase in `start`/`end`/`due` (or leave empty string `""` for missing phase boundaries) instead of doing mental calendar arithmetic.',
    '6. Treat frequencies written as "X per week", "X times a week", "X days/week", or "Xx/week" strictly as `cadence: "weekly_count"` with `target_count: X` — NEVER as `"daily"`. Use `"specific_days"` only when explicit days of the week (e.g., Mon/Wed/Fri) are stated.',
    '7. Keep titles concise and faithful to the text. Set `pillar_weight_pct` only if percentage weights are explicitly stated.',
  ].join('\n');
}

function buildVerificationPrompt(anchorDate: string): string {
  return [
    'You are auditing a structured plan extraction against the original free-text plan.',
    `Current date: ${anchorDate}. Timezone: ${PLAN_TIMEZONE}.`,
    'Compare the original text and the Pass-1 JSON extraction carefully:',
    '1. List ONLY items explicitly present in the original text that are missing from Pass-1 under `missing` (each with exact verbatim `source_quote` from the original text).',
    '2. List ONLY items in Pass-1 that have wrong fields (e.g. a "X per week" habit marked "daily", wrong target_count, missing time_block/minimum_version/exit_condition explicitly stated in the text) under `updates` with exact verbatim `source_quote`.',
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
    '3. For newly added or modified items requested in the instruction/answers, use an exact verbatim `source_quote` copied from the instruction, clarification answer, or original plan text.',
    '4. Remove any clarified ambiguity from `clarifications` once resolved; keep unresolved ones.',
    '5. Treat "X per week" / "X times a week" strictly as `cadence: "weekly_count"` with `target_count: X`, NOT `"daily"`. Return ISO dates (`YYYY-MM-DD`) for explicit dates and preserve relative phrases like "Day 15" cleanly.',
  ].join('\n');
}

function isTemperatureRejectedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('temperature') && (message.includes('400') || message.includes('invalid') || message.includes('unsupported'));
}

export function createGeminiCaller(apiKey: string): StructuredModelCaller {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  return async ({ systemInstruction, contents, responseSchema, temperature }) => {
    const baseConfig = {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema,
      temperature,
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_PLAN_MODEL,
        contents,
        config: baseConfig,
      });
    } catch (error) {
      if (!isTemperatureRejectedError(error)) throw error;
      const { temperature: _ignored, ...withoutTemp } = baseConfig;
      response = await ai.models.generateContent({
        model: GEMINI_PLAN_MODEL,
        contents,
        config: withoutTemp,
      });
    }

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Model returned an empty response.');
    }
    return text;
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
  throw new Error(`Structured plan extraction failed schema validation after retry: ${lastError}`);
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

export async function extractPlanWithGemini(
  planText: string,
  options: PlanImportServiceOptions = {},
): Promise<ImportPlanResult> {
  const anchorDate = getMakassarDateKey(options.now);
  const caller =
    options.caller ??
    (() => {
      const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured on the server.');
      }
      return createGeminiCaller(apiKey);
    })();

  const pass1Raw = await runWithSingleSchemaRetry(ExtractionSchema, repairHint =>
    caller({
      systemInstruction: buildSystemPrompt(anchorDate),
      contents: repairHint ? `${repairHint}\n\nPLAN TEXT:\n${planText}` : `PLAN TEXT:\n${planText}`,
      responseSchema: EXTRACTION_RESPONSE_SCHEMA,
      temperature: 0,
    }),
  );

  const pass1GroundedStats = filterGroundedExtractionWithStats(pass1Raw, planText);
  const pass1Grounded = resolveRelativeDatesInCode(
    normalizeWeeklyCountHabits(pass1GroundedStats.extraction),
    anchorDate,
  );

  let verified = false;
  let finalExtraction = pass1Grounded;
  let droppedCount = pass1GroundedStats.droppedCount;
  let droppedByKind = { ...pass1GroundedStats.droppedByKind };

  try {
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
  } catch {
    // Keep validated & grounded Pass 1 extraction if the verification pass errors after retry
    finalExtraction = pass1Grounded;
    verified = false;
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
  const caller =
    options.caller ??
    (() => {
      const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured on the server.');
      }
      return createGeminiCaller(apiKey);
    })();

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
