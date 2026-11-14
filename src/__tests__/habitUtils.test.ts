import { describe, expect, it } from 'vitest';
import { getBestStreak, getStreak } from '../utils/habitUtils';
import type { Habit, HabitLog } from '../types';

const log = (date: string, status: HabitLog['status'] = 'done'): HabitLog => ({ id: date, habitId: 'h1', date, status });

describe('habitUtils', () => {
  it('calculates a current streak from the new habit log schema', () => {
    const logs = ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'].map(date => log(date));
    expect(getStreak('h1', logs, new Date(2026, 9, 25))).toBe(4);
  });

  it('keeps the previous streak when today is not completed yet', () => {
    const logs = ['2026-10-22', '2026-10-23', '2026-10-24'].map(date => log(date));
    expect(getStreak('h1', logs, new Date(2026, 9, 25))).toBe(3);
  });

  it('allows skipped days without counting them as completed days', () => {
    const logs = [log('2026-10-22'), log('2026-10-23', 'skipped'), log('2026-10-24'), log('2026-10-25')];
    expect(getStreak('h1', logs, new Date(2026, 9, 25))).toBe(3);
  });

  it('calculates the best streak across recorded history', () => {
    const logs = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'].map(date => log(date));
    expect(getBestStreak('h1', logs)).toBe(3);
  });

  it('preserves weekday habit streaks across unscheduled weekends', () => {
    const weekdayHabit: Pick<Habit, 'id' | 'frequency'> = { id: 'h1', frequency: 'weekdays' };
    // Thu Oct 22, Fri Oct 23, Mon Oct 26, Tue Oct 27 -> Sat 24 & Sun 25 unscheduled
    const logs = ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27'].map(date => log(date));

    expect(getStreak(weekdayHabit, logs, new Date(2026, 9, 27))).toBe(4);
    expect(getBestStreak(weekdayHabit, logs)).toBe(4);
    // Checked on Sunday Oct 25 before Monday -> Thu+Fri still intact (2)
    expect(getStreak(weekdayHabit, logs.slice(0, 2), new Date(2026, 9, 25))).toBe(2);
  });

  it('preserves weekend habit streaks across unscheduled weekdays', () => {
    const weekendHabit: Pick<Habit, 'id' | 'frequency'> = { id: 'h1', frequency: 'weekends' };
    // Sat Oct 17, Sun Oct 18, Sat Oct 24, Sun Oct 25
    const logs = ['2026-10-17', '2026-10-18', '2026-10-24', '2026-10-25'].map(date => log(date));

    // Checked Wednesday Oct 28 -> weekend streak remains 4
    expect(getStreak(weekendHabit, logs, new Date(2026, 9, 28))).toBe(4);
    expect(getBestStreak(weekendHabit, logs)).toBe(4);
  });
});
