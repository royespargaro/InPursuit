import type { Habit, HabitLog, WeekdayKey } from '../types';

export const localDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const shiftDateKey = (dateStr: string, deltaDays: number): string => {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return localDateKey(date);
};

export const mk = (year: number, month: number) => `${year}-${month + 1}`;
export const pad = (value: number) => String(value).padStart(2, '0');
export const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

const DAY_INDEX_TO_KEY: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const isHabitScheduledOnDate = (
  habit: Pick<Habit, 'frequency' | 'cadence' | 'days'>,
  dateStr: string,
): boolean => {
  if (habit.cadence === 'specific_days' && habit.days && habit.days.length > 0) {
    const dayKey = DAY_INDEX_TO_KEY[new Date(`${dateStr}T12:00:00`).getDay()];
    return habit.days.includes(dayKey);
  }
  if (habit.cadence === 'weekly_count') return true;
  if (habit.frequency === 'daily') return true;
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  const isWeekend = day === 0 || day === 6;
  return habit.frequency === 'weekends' ? isWeekend : !isWeekend;
};

export const getWeeklyHabitCount = (
  habitId: string,
  logs: readonly HabitLog[],
  todayStr: string,
): number => {
  const baseDate = new Date(`${todayStr}T12:00:00`);
  const mondayOffset = (baseDate.getDay() + 6) % 7;
  const weekStart = shiftDateKey(todayStr, -mondayOffset);
  const weekEnd = shiftDateKey(weekStart, 6);
  let count = 0;
  for (const log of logs) {
    if (log.habitId === habitId && log.status === 'done' && log.date >= weekStart && log.date <= weekEnd) {
      count += 1;
    }
  }
  return count;
};

export const getTodayHabitCount = (
  habitId: string,
  logs: readonly HabitLog[],
  todayStr: string,
): number => {
  let count = 0;
  for (const log of logs) {
    if (log.habitId === habitId && log.status === 'done' && log.date === todayStr) {
      count += 1;
    }
  }
  return count;
};

function resolveHabitRef(
  habitOrId: string | Pick<Habit, 'id' | 'frequency' | 'cadence' | 'days'>,
  frequency?: Habit['frequency'],
): Pick<Habit, 'id' | 'frequency' | 'cadence' | 'days'> {
  if (typeof habitOrId === 'string') {
    return { id: habitOrId, frequency: frequency ?? 'daily' };
  }
  return {
    id: habitOrId.id,
    frequency: habitOrId.frequency,
    cadence: habitOrId.cadence,
    days: habitOrId.days,
  };
}

export const getStreak = (
  habitOrId: string | Pick<Habit, 'id' | 'frequency'>,
  logs: readonly HabitLog[],
  now: Date,
  frequency?: Habit['frequency'],
): number => {
  const habit = resolveHabitRef(habitOrId, frequency);
  const byDate = new Map(logs.filter(log => log.habitId === habit.id).map(log => [log.date, log.status]));
  if (byDate.size === 0) return 0;

  const dates = [...byDate.keys()].sort();
  const earliestDate = dates[0];
  const todayKey = localDateKey(now);

  let streak = byDate.get(todayKey) === 'done' ? 1 : 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  cursor.setDate(cursor.getDate() - 1);

  while (true) {
    const dateKey = localDateKey(cursor);
    if (dateKey < earliestDate) break;

    const status = byDate.get(dateKey);
    if (status === 'done') {
      streak += 1;
    } else if (status !== 'skipped' && isHabitScheduledOnDate(habit, dateKey)) {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export const getBestStreak = (
  habitOrId: string | Pick<Habit, 'id' | 'frequency'>,
  logs: readonly HabitLog[],
  frequency?: Habit['frequency'],
): number => {
  const habit = resolveHabitRef(habitOrId, frequency);
  const byDate = new Map(logs.filter(log => log.habitId === habit.id).map(log => [log.date, log.status]));
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return 0;

  const cursor = new Date(`${dates[0]}T12:00:00`);
  const last = new Date(`${dates[dates.length - 1]}T12:00:00`);
  let current = 0;
  let best = 0;

  while (cursor <= last) {
    const dateKey = localDateKey(cursor);
    const status = byDate.get(dateKey);
    if (status === 'done') {
      current += 1;
      best = Math.max(best, current);
    } else if (status !== 'skipped' && isHabitScheduledOnDate(habit, dateKey)) {
      current = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
};
