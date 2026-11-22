import { z } from 'zod';
import type { Extraction, ExtractionClarification, ExtractionHabit, ExtractionPhase, ExtractionTask, WeekdayKey } from '../types';

export const WeekdayKeySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export const HabitCadenceSchema = z.enum(['daily', 'weekly_count', 'specific_days']);
export const PrioritySchema = z.enum(['high', 'medium', 'low']);

export const ExtractionGoalSchema = z.object({
  title: z.string().trim().min(1),
  life_area: z.string().optional(),
  pillar_weight_pct: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
  source_quote: z.string().trim().min(1),
});

export const ExtractionPhaseSchema = z.object({
  title: z.string().trim().min(1),
  start: z.string(),
  end: z.string(),
  theme: z.string().optional(),
  exit_condition: z.string().optional(),
  source_quote: z.string().trim().min(1),
});

export const ExtractionHabitSchema = z.object({
  title: z.string().trim().min(1),
  goal_ref: z.string().optional(),
  cadence: HabitCadenceSchema,
  target_count: z.number().int().positive().optional(),
  days: z.array(WeekdayKeySchema).optional(),
  time_block: z
    .object({
      start: z.string().trim().min(1),
      end: z.string().trim().min(1),
    })
    .optional(),
  minimum_version: z.string().optional(),
  source_quote: z.string().trim().min(1),
});

export const ExtractionTaskSchema = z.object({
  title: z.string().trim().min(1),
  goal_ref: z.string().optional(),
  phase_ref: z.string().optional(),
  due: z.string().optional(),
  priority: PrioritySchema.optional(),
  target_quantity: z.number().positive().optional(),
  source_quote: z.string().trim().min(1),
});

export const ExtractionSuccessCriterionSchema = z.object({
  goal_ref: z.string().optional(),
  text: z.string().trim().min(1),
  source_quote: z.string().trim().min(1),
});

export const ExtractionPrincipleSchema = z.object({
  text: z.string().trim().min(1),
  source_quote: z.string().trim().min(1),
});

export const ExtractionClarificationSchema = z.object({
  question: z.string().trim().min(1),
  related_quote: z.string().trim().min(1),
});

export const ExtractionSchema = z.object({
  goals: z.array(ExtractionGoalSchema),
  phases: z.array(ExtractionPhaseSchema),
  habits: z.array(ExtractionHabitSchema),
  tasks: z.array(ExtractionTaskSchema),
  success_criteria: z.array(ExtractionSuccessCriterionSchema),
  principles: z.array(ExtractionPrincipleSchema),
  clarifications: z.array(ExtractionClarificationSchema),
});

export const VerificationUpdateSchema = z.object({
  kind: z.enum(['goals', 'phases', 'habits', 'tasks', 'success_criteria', 'principles']),
  match_title_or_text: z.string().trim().min(1),
  source_quote: z.string().trim().min(1),
  title: z.string().optional(),
  text: z.string().optional(),
  life_area: z.string().optional(),
  description: z.string().optional(),
  pillar_weight_pct: z.number().min(0).max(100).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  theme: z.string().optional(),
  exit_condition: z.string().optional(),
  goal_ref: z.string().optional(),
  phase_ref: z.string().optional(),
  cadence: HabitCadenceSchema.optional(),
  target_count: z.number().int().positive().optional(),
  days: z.array(WeekdayKeySchema).optional(),
  time_block: z
    .object({
      start: z.string().trim().min(1),
      end: z.string().trim().min(1),
    })
    .optional(),
  minimum_version: z.string().optional(),
  due: z.string().optional(),
  priority: PrioritySchema.optional(),
  target_quantity: z.number().positive().optional(),
});

export const VerificationRemovalSchema = z.object({
  kind: z.enum(['goals', 'phases', 'habits', 'tasks', 'success_criteria', 'principles', 'clarifications']),
  match_title_or_text: z.string().trim().min(1),
  reason: z.string().optional(),
});

export const VerificationPassSchema = z.object({
  missing: ExtractionSchema,
  updates: z.array(VerificationUpdateSchema),
  removals: z.array(VerificationRemovalSchema),
});

export type VerificationPass = z.infer<typeof VerificationPassSchema>;

export const MAX_PLAN_TEXT_CHARS = 20000;
export const MAX_INSTRUCTION_CHARS = 1000;
export const MAX_ANSWERS_COUNT = 20;
export const MAX_ANSWER_CHARS = 500;

export const ImportPlanRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('extract').optional().default('extract'),
    planText: z.string().trim().min(1).max(MAX_PLAN_TEXT_CHARS),
    deepCheck: z.boolean().optional().default(false),
    currentDraft: ExtractionSchema.optional(),
  }),
  z.object({
    mode: z.literal('refine'),
    planText: z.string().trim().min(1).max(MAX_PLAN_TEXT_CHARS),
    currentDraft: ExtractionSchema,
    instruction: z.string().trim().max(MAX_INSTRUCTION_CHARS).optional().default(''),
    answers: z
      .array(
        z.object({
          question: z.string().max(500),
          related_quote: z.string().max(1000),
          answer: z.string().max(MAX_ANSWER_CHARS),
        }),
      )
      .max(MAX_ANSWERS_COUNT)
      .optional()
      .default([]),
  }),
]);

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PLAN_TIMEZONE = 'Asia/Makassar';

export function getMakassarDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function isGroundedQuote(sourceText: string, quote: string): boolean {
  const normalizedSource = normalizeWhitespace(sourceText);
  const normalizedQuote = normalizeWhitespace(quote);
  if (!normalizedQuote) return false;
  return normalizedSource.includes(normalizedQuote);
}

export interface GroundingStats {
  goals: number;
  phases: number;
  habits: number;
  tasks: number;
  success_criteria: number;
  principles: number;
  clarifications: number;
}

export interface GroundedFilterResult {
  extraction: Extraction;
  droppedCount: number;
  droppedByKind: GroundingStats;
}

export function filterGroundedExtractionWithStats(extraction: Extraction, sourceText: string): GroundedFilterResult {
  const goals = extraction.goals.filter(item => isGroundedQuote(sourceText, item.source_quote));
  const phases = extraction.phases.filter(item => isGroundedQuote(sourceText, item.source_quote));
  const habits = extraction.habits.filter(item => isGroundedQuote(sourceText, item.source_quote));
  const tasks = extraction.tasks.filter(item => isGroundedQuote(sourceText, item.source_quote));
  const success_criteria = extraction.success_criteria.filter(item => isGroundedQuote(sourceText, item.source_quote));
  const principles = extraction.principles.filter(item => isGroundedQuote(sourceText, item.source_quote));
  const clarifications = extraction.clarifications.filter((item: ExtractionClarification) =>
    isGroundedQuote(sourceText, item.related_quote),
  );

  const droppedByKind: GroundingStats = {
    goals: extraction.goals.length - goals.length,
    phases: extraction.phases.length - phases.length,
    habits: extraction.habits.length - habits.length,
    tasks: extraction.tasks.length - tasks.length,
    success_criteria: extraction.success_criteria.length - success_criteria.length,
    principles: extraction.principles.length - principles.length,
    clarifications: extraction.clarifications.length - clarifications.length,
  };

  const droppedCount =
    droppedByKind.goals +
    droppedByKind.phases +
    droppedByKind.habits +
    droppedByKind.tasks +
    droppedByKind.success_criteria +
    droppedByKind.principles +
    droppedByKind.clarifications;

  return {
    extraction: {
      goals,
      phases,
      habits,
      tasks,
      success_criteria,
      principles,
      clarifications,
    },
    droppedCount,
    droppedByKind,
  };
}

export function filterGroundedExtraction(extraction: Extraction, sourceText: string): Extraction {
  return filterGroundedExtractionWithStats(extraction, sourceText).extraction;
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  if (!ISO_DATE_RE.test(isoDate)) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const WORD_NUMBERS: Record<string, number> = {
  once: 1,
  one: 1,
  sekali: 1,
  satu: 1,
  twice: 2,
  two: 2,
  dua: 2,
  thrice: 3,
  three: 3,
  tiga: 3,
  four: 4,
  empat: 4,
  five: 5,
  lima: 5,
  six: 6,
  enam: 6,
  seven: 7,
  tujuh: 7,
};

function parseWeeklyCount(text: string): number | null {
  const numericMatch = text.match(
    /\b(\d+)\s*(?:x|kali|hari|sesi|latihan|malam|pagi|times?|days?|sessions?|nights?|mornings?|workouts?)?\s*(?:(?:per|a|\/)\s*(?:week|wk|minggu|mgg|pekan)|(?:tiap|setiap)\s+(?:minggu|mgg|pekan)|seminggu|sepekan)\b/i,
  );
  if (numericMatch) {
    const count = Number(numericMatch[1]);
    if (Number.isInteger(count) && count >= 1 && count <= 14) return count;
  }

  const xWeekMatch = text.match(
    /\b(\d+)x\s*(?:per\s+|a\s+|tiap\s+|setiap\s+|\/)?(?:week|wk|minggu|mgg|pekan|seminggu|sepekan)\b/i,
  );
  if (xWeekMatch) {
    const count = Number(xWeekMatch[1]);
    if (Number.isInteger(count) && count >= 1 && count <= 14) return count;
  }

  const indonesianPrefixMatch = text.match(
    /\b(?:seminggu|sepekan|(?:per|tiap|setiap)\s+(?:minggu|pekan))\s+(\d+)\s*(?:x|kali|hari|sesi|latihan)\b/i,
  );
  if (indonesianPrefixMatch) {
    const count = Number(indonesianPrefixMatch[1]);
    if (Number.isInteger(count) && count >= 1 && count <= 14) return count;
  }

  const wordMatch = text.match(
    /\b(once|twice|thrice|one|two|three|four|five|six|seven|sekali|satu|dua|tiga|empat|lima|enam|tujuh)\s*(?:kali|hari|sesi|latihan|times?|days?|sessions?)?\s*(?:(?:per|a|\/)\s*(?:week|wk|minggu|mgg|pekan)|(?:tiap|setiap)\s+(?:minggu|mgg|pekan)|seminggu|sepekan)?\b/i,
  );
  if (
    wordMatch &&
    (wordMatch[1].toLowerCase() === 'sekali'
      ? /\b(?:seminggu|sepekan|(?:per|tiap|setiap)\s+(?:minggu|mgg|pekan)|week|wk)\b/i.test(text)
      : /\b(?:week|wk|minggu|mgg|pekan|seminggu|sepekan)\b/i.test(wordMatch[0]))
  ) {
    const count = WORD_NUMBERS[wordMatch[1].toLowerCase()];
    if (count) return count;
  }

  return null;
}

const WEEKDAY_TOKENS: Array<{ re: RegExp; key: WeekdayKey }> = [
  { re: /\b(?:mon|monday|senin)s?\b/i, key: 'mon' },
  { re: /\b(?:tue|tues|tuesday|selasa)s?\b/i, key: 'tue' },
  { re: /\b(?:wed|weds|wednesday|rabu)s?\b/i, key: 'wed' },
  { re: /\b(?:thu|thur|thurs|thursday|kamis)s?\b/i, key: 'thu' },
  { re: /\b(?:fri|friday|jumat|jum'at|jum’at)s?\b/i, key: 'fri' },
  { re: /\b(?:sat|saturday|sabtu)s?\b/i, key: 'sat' },
  { re: /\b(?:sun|sunday|hari\s+minggu|ahad)s?\b/i, key: 'sun' },
];

function parseExplicitDays(text: string): WeekdayKey[] {
  const days: WeekdayKey[] = [];
  for (const token of WEEKDAY_TOKENS) {
    if (token.re.test(text)) days.push(token.key);
  }
  if (!days.includes('sun') && days.length > 0) {
    // Disambiguate Indonesian "Minggu" (Sunday vs week) by stripping week-unit phrases first
    const withoutWeekPhrases = text
      .replace(/\b(?:seminggu|sepekan)\b/gi, '')
      .replace(/\b(?:per|tiap|setiap|\/)\s*minggu\b/gi, '')
      .replace(/\bminggu\s+(?:ke-?\s*\d+|\d+|depan|ini)\b/gi, '');
    if (/\bminggu\b/i.test(withoutWeekPhrases)) {
      days.push('sun');
    }
  }
  return days;
}

export function normalizeHabitCadence(habit: ExtractionHabit): ExtractionHabit {
  const combined = `${habit.title} ${habit.source_quote}`;
  const weeklyCount = parseWeeklyCount(combined);
  if (weeklyCount !== null) {
    return {
      ...habit,
      cadence: 'weekly_count',
      target_count: habit.target_count && habit.target_count > 0 ? habit.target_count : weeklyCount,
      days: undefined,
    };
  }

  const explicitDays = habit.days?.length ? habit.days : parseExplicitDays(combined);
  if (habit.cadence === 'specific_days' && explicitDays.length > 0) {
    return {
      ...habit,
      days: [...new Set(explicitDays)],
    };
  }

  if (habit.cadence === 'weekly_count') {
    return {
      ...habit,
      target_count: habit.target_count && habit.target_count > 0 ? habit.target_count : 1,
      days: undefined,
    };
  }

  return habit;
}

export function normalizeWeeklyCountHabits(extraction: Extraction): Extraction {
  return {
    ...extraction,
    habits: extraction.habits.map(normalizeHabitCadence),
  };
}

interface DateRangeResolution {
  start: string;
  end: string;
}

export function resolveRelativeRangePhrase(phrase: string, anchorDateKey: string): DateRangeResolution | null {
  const clean = normalizeWhitespace(phrase);
  if (!clean) return null;

  if (ISO_DATE_RE.test(clean)) {
    return { start: clean, end: clean };
  }

  const daysRange = clean.match(
    /\b(?:days?|hari(?:\s+ke-?)?)\s*(\d{1,3})\s*(?:[-–—]|to|s\/?d|sampai(?:\s+dengan)?|hingga)\s*(?:(?:days?|hari(?:\s+ke-?)?)\s*)?(\d{1,3})\b/i,
  );
  if (daysRange) {
    const startDay = Number(daysRange[1]);
    const endDay = Number(daysRange[2]);
    if (startDay >= 1 && endDay >= startDay) {
      return {
        start: shiftIsoDate(anchorDateKey, startDay - 1),
        end: shiftIsoDate(anchorDateKey, endDay - 1),
      };
    }
  }

  const firstNextDays = clean.match(
    /\b(?:(?:first|next)\s+(\d{1,3})\s+days?|(\d{1,3})\s+hari\s+(?:pertama|berikutnya|ke\s*depan))\b/i,
  );
  if (firstNextDays) {
    const count = Number(firstNextDays[1] ?? firstNextDays[2]);
    if (count >= 1) {
      return {
        start: anchorDateKey,
        end: shiftIsoDate(anchorDateKey, count - 1),
      };
    }
  }

  const singleDay = clean.match(/\b(?:day|hari(?:\s+ke-?)?)\s*(\d{1,3})\b/i);
  if (singleDay) {
    const dayNum = Number(singleDay[1]);
    if (dayNum >= 1) {
      const resolved = shiftIsoDate(anchorDateKey, dayNum - 1);
      return { start: resolved, end: resolved };
    }
  }

  const weeksRange = clean.match(
    /\b(?:weeks?|minggu(?:\s+ke-?)?|pekan(?:\s+ke-?)?)\s*(\d{1,2})\s*(?:[-–—]|to|s\/?d|sampai(?:\s+dengan)?|hingga)\s*(?:(?:weeks?|minggu(?:\s+ke-?)?|pekan(?:\s+ke-?)?)\s*)?(\d{1,2})\b/i,
  );
  if (weeksRange) {
    const startWeek = Number(weeksRange[1]);
    const endWeek = Number(weeksRange[2]);
    if (startWeek >= 1 && endWeek >= startWeek) {
      return {
        start: shiftIsoDate(anchorDateKey, (startWeek - 1) * 7),
        end: shiftIsoDate(anchorDateKey, endWeek * 7 - 1),
      };
    }
  }

  const nextWeeks = clean.match(
    /\b(?:(?:first|next)\s+(\d{1,2})\s+weeks?|(\d{1,2})\s+(?:minggu|pekan)\s+(?:pertama|berikutnya|ke\s*depan))\b/i,
  );
  if (nextWeeks) {
    const count = Number(nextWeeks[1] ?? nextWeeks[2]);
    if (count >= 1) {
      return {
        start: anchorDateKey,
        end: shiftIsoDate(anchorDateKey, count * 7 - 1),
      };
    }
  }

  const singleWeek = clean.match(/\b(?:week|minggu(?:\s+ke-?)?|pekan(?:\s+ke-?)?)\s*(\d{1,2})\b/i);
  if (singleWeek) {
    const weekNum = Number(singleWeek[1]);
    if (weekNum >= 1) {
      return {
        start: shiftIsoDate(anchorDateKey, (weekNum - 1) * 7),
        end: shiftIsoDate(anchorDateKey, weekNum * 7 - 1),
      };
    }
  }

  const monthsRange = clean.match(
    /\b(?:months?|bulan(?:\s+ke-?)?)\s*(\d{1,2})\s*(?:[-–—]|to|s\/?d|sampai(?:\s+dengan)?|hingga)\s*(?:(?:months?|bulan(?:\s+ke-?)?)\s*)?(\d{1,2})\b/i,
  );
  if (monthsRange) {
    const startMonth = Number(monthsRange[1]);
    const endMonth = Number(monthsRange[2]);
    if (startMonth >= 1 && endMonth >= startMonth) {
      return {
        start: shiftIsoDate(anchorDateKey, (startMonth - 1) * 30),
        end: shiftIsoDate(anchorDateKey, endMonth * 30 - 1),
      };
    }
  }

  const singleMonth = clean.match(/\b(?:month|bulan(?:\s+ke-?)?)\s*(\d{1,2})\b/i);
  if (singleMonth) {
    const monthNum = Number(singleMonth[1]);
    if (monthNum >= 1) {
      return {
        start: shiftIsoDate(anchorDateKey, (monthNum - 1) * 30),
        end: shiftIsoDate(anchorDateKey, monthNum * 30 - 1),
      };
    }
  }

  if (/\b(?:today|hari\s+ini)\b/i.test(clean)) {
    return { start: anchorDateKey, end: anchorDateKey };
  }
  if (/\b(?:tomorrow|besok|esok)\b/i.test(clean)) {
    const tomorrow = shiftIsoDate(anchorDateKey, 1);
    return { start: tomorrow, end: tomorrow };
  }
  if (/\blusa\b/i.test(clean)) {
    const dayAfterTomorrow = shiftIsoDate(anchorDateKey, 2);
    return { start: dayAfterTomorrow, end: dayAfterTomorrow };
  }
  if (/\b(?:next\s+week|minggu\s+depan|pekan\s+depan)\b/i.test(clean)) {
    const nextWeek = shiftIsoDate(anchorDateKey, 7);
    return { start: nextWeek, end: shiftIsoDate(anchorDateKey, 13) };
  }

  return null;
}

function resolveSingleRelativeDate(text: string, anchorDateKey: string, preferEnd = false): string {
  const clean = normalizeWhitespace(text);
  if (!clean) return '';
  if (ISO_DATE_RE.test(clean)) return clean;

  const range = resolveRelativeRangePhrase(clean, anchorDateKey);
  if (!range) return '';
  return preferEnd ? range.end : range.start;
}

function resolvePhaseDates(phase: ExtractionPhase, anchorDateKey: string): ExtractionPhase {
  const combinedSource = `${phase.start} ${phase.end} ${phase.title} ${phase.source_quote}`;
  const explicitStart = ISO_DATE_RE.test(phase.start.trim()) ? phase.start.trim() : '';
  const explicitEnd = ISO_DATE_RE.test(phase.end.trim()) ? phase.end.trim() : '';

  if (explicitStart && explicitEnd) {
    return { ...phase, start: explicitStart, end: explicitEnd };
  }

  const fromCombined =
    resolveRelativeRangePhrase(`${phase.start} - ${phase.end}`, anchorDateKey) ??
    resolveRelativeRangePhrase(phase.title, anchorDateKey) ??
    resolveRelativeRangePhrase(phase.source_quote, anchorDateKey) ??
    resolveRelativeRangePhrase(combinedSource, anchorDateKey);

  const start = explicitStart || resolveSingleRelativeDate(phase.start, anchorDateKey, false) || fromCombined?.start || '';
  const end = explicitEnd || resolveSingleRelativeDate(phase.end, anchorDateKey, true) || fromCombined?.end || '';

  return {
    ...phase,
    start: ISO_DATE_RE.test(start) ? start : '',
    end: ISO_DATE_RE.test(end) ? end : '',
  };
}

function resolveTaskDue(task: ExtractionTask, phases: ExtractionPhase[], anchorDateKey: string): ExtractionTask {
  const rawDue = task.due?.trim() ?? '';
  if (rawDue && ISO_DATE_RE.test(rawDue)) {
    return { ...task, due: rawDue };
  }

  if (rawDue) {
    const fromDueField = resolveSingleRelativeDate(rawDue, anchorDateKey, /\b(?:to|[-–—]|end|by|s\/?d|sampai|hingga)\b/i.test(rawDue));
    if (fromDueField) {
      return { ...task, due: fromDueField };
    }
  }

  const fromQuote = resolveRelativeRangePhrase(`${task.title} ${task.source_quote}`, anchorDateKey);
  if (fromQuote) {
    return { ...task, due: fromQuote.end };
  }

  if (task.phase_ref) {
    const matchingPhase = phases.find(p => p.title.toLowerCase() === task.phase_ref?.toLowerCase());
    if (matchingPhase && ISO_DATE_RE.test(matchingPhase.end)) {
      return { ...task, due: matchingPhase.end };
    }
  }

  return {
    ...task,
    due: undefined,
  };
}

export function resolveRelativeDatesInCode(extraction: Extraction, anchorDateKey: string): Extraction {
  const resolvedPhases = extraction.phases.map(phase => resolvePhaseDates(phase, anchorDateKey));
  const resolvedTasks = extraction.tasks.map(task => resolveTaskDue(task, resolvedPhases, anchorDateKey));

  return {
    ...extraction,
    phases: resolvedPhases,
    tasks: resolvedTasks,
  };
}

const sameText = (a?: string, b?: string) => normalizeWhitespace(a ?? '').toLowerCase() === normalizeWhitespace(b ?? '').toLowerCase();

export function mergeVerificationPassWithStats(
  base: Extraction,
  verification: VerificationPass,
  allowedSourceText: string,
): { extraction: Extraction; droppedCount: number } {
  const groundedMissingResult = filterGroundedExtractionWithStats(verification.missing, allowedSourceText);
  const groundedMissing = groundedMissingResult.extraction;
  let droppedCount = groundedMissingResult.droppedCount;
  const next: Extraction = {
    goals: [...base.goals],
    phases: [...base.phases],
    habits: [...base.habits],
    tasks: [...base.tasks],
    success_criteria: [...base.success_criteria],
    principles: [...base.principles],
    clarifications: [...base.clarifications],
  };

  for (const removal of verification.removals) {
    const target = removal.match_title_or_text;
    if (removal.kind === 'goals') next.goals = next.goals.filter(item => !sameText(item.title, target));
    else if (removal.kind === 'phases') next.phases = next.phases.filter(item => !sameText(item.title, target));
    else if (removal.kind === 'habits') next.habits = next.habits.filter(item => !sameText(item.title, target));
    else if (removal.kind === 'tasks') next.tasks = next.tasks.filter(item => !sameText(item.title, target));
    else if (removal.kind === 'success_criteria') {
      next.success_criteria = next.success_criteria.filter(item => !sameText(item.text, target));
    } else if (removal.kind === 'principles') {
      next.principles = next.principles.filter(item => !sameText(item.text, target));
    } else if (removal.kind === 'clarifications') {
      next.clarifications = next.clarifications.filter(item => !sameText(item.question, target));
    }
  }

  for (const update of verification.updates) {
    if (!isGroundedQuote(allowedSourceText, update.source_quote)) {
      droppedCount += 1;
      continue;
    }
    const target = update.match_title_or_text;

    if (update.kind === 'goals') {
      next.goals = next.goals.map(item =>
        sameText(item.title, target)
          ? {
              ...item,
              title: update.title?.trim() || item.title,
              life_area: update.life_area ?? item.life_area,
              description: update.description ?? item.description,
              pillar_weight_pct: update.pillar_weight_pct ?? item.pillar_weight_pct,
              source_quote: update.source_quote,
            }
          : item,
      );
    } else if (update.kind === 'phases') {
      next.phases = next.phases.map(item =>
        sameText(item.title, target)
          ? {
              ...item,
              title: update.title?.trim() || item.title,
              start: update.start ?? item.start,
              end: update.end ?? item.end,
              theme: update.theme ?? item.theme,
              exit_condition: update.exit_condition ?? item.exit_condition,
              source_quote: update.source_quote,
            }
          : item,
      );
    } else if (update.kind === 'habits') {
      next.habits = next.habits.map(item =>
        sameText(item.title, target)
          ? {
              ...item,
              title: update.title?.trim() || item.title,
              goal_ref: update.goal_ref ?? item.goal_ref,
              cadence: update.cadence ?? item.cadence,
              target_count: update.target_count ?? item.target_count,
              days: update.days ?? item.days,
              time_block: update.time_block ?? item.time_block,
              minimum_version: update.minimum_version ?? item.minimum_version,
              source_quote: update.source_quote,
            }
          : item,
      );
    } else if (update.kind === 'tasks') {
      next.tasks = next.tasks.map(item =>
        sameText(item.title, target)
          ? {
              ...item,
              title: update.title?.trim() || item.title,
              goal_ref: update.goal_ref ?? item.goal_ref,
              phase_ref: update.phase_ref ?? item.phase_ref,
              due: update.due ?? item.due,
              priority: update.priority ?? item.priority,
              target_quantity: update.target_quantity ?? item.target_quantity,
              source_quote: update.source_quote,
            }
          : item,
      );
    } else if (update.kind === 'success_criteria') {
      next.success_criteria = next.success_criteria.map(item =>
        sameText(item.text, target)
          ? {
              ...item,
              text: update.text?.trim() || item.text,
              goal_ref: update.goal_ref ?? item.goal_ref,
              source_quote: update.source_quote,
            }
          : item,
      );
    } else if (update.kind === 'principles') {
      next.principles = next.principles.map(item =>
        sameText(item.text, target)
          ? {
              ...item,
              text: update.text?.trim() || item.text,
              source_quote: update.source_quote,
            }
          : item,
      );
    }
  }

  for (const goal of groundedMissing.goals) {
    if (!next.goals.some(existing => sameText(existing.title, goal.title))) next.goals.push(goal);
  }
  for (const phase of groundedMissing.phases) {
    if (!next.phases.some(existing => sameText(existing.title, phase.title))) next.phases.push(phase);
  }
  for (const habit of groundedMissing.habits) {
    if (!next.habits.some(existing => sameText(existing.title, habit.title))) next.habits.push(habit);
  }
  for (const task of groundedMissing.tasks) {
    if (!next.tasks.some(existing => sameText(existing.title, task.title))) next.tasks.push(task);
  }
  for (const criterion of groundedMissing.success_criteria) {
    if (!next.success_criteria.some(existing => sameText(existing.text, criterion.text))) {
      next.success_criteria.push(criterion);
    }
  }
  for (const principle of groundedMissing.principles) {
    if (!next.principles.some(existing => sameText(existing.text, principle.text))) {
      next.principles.push(principle);
    }
  }
  for (const clarification of groundedMissing.clarifications) {
    if (!next.clarifications.some(existing => sameText(existing.question, clarification.question))) {
      next.clarifications.push(clarification);
    }
  }

  return {
    extraction: next,
    droppedCount,
  };
}

export function mergeVerificationPass(
  base: Extraction,
  verification: VerificationPass,
  allowedSourceText: string,
): Extraction {
  return mergeVerificationPassWithStats(base, verification, allowedSourceText).extraction;
}
