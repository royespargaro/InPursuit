// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HabitsView } from '../views/HabitsView';
import { TodayView } from '../views/TodayView';
import type { AppData } from '../types';

const noop = () => {};
const today = '2026-11-20';
const data: AppData = {
  schemaVersion: 3,
  lifeAreas: [],
  goals: [{ id: 'g1', lifeAreaId: null, title: 'Income', outcome: '', targetDate: '', status: 'active', createdAt: '2026-11-01T00:00:00.000Z' }],
  projects: [],
  tasks: [],
  habits: [
    { id: 'w', name: 'Applications', frequency: 'daily', cadence: 'weekly_count', targetCount: 5, goalId: 'g1', active: true, createdAt: '2026-11-01T00:00:00.000Z' },
  ],
  habitLogs: [
    { id: 'a', habitId: 'w', date: '2026-11-16', status: 'done' },
    { id: 'b', habitId: 'w', date: today, status: 'done' },
  ],
  dailyPlans: [],
  dailyReviews: [],
};

describe('Today and Habits read the same data', () => {
  afterEach(cleanup);

  it('shows the same weekly counter on both pages, and the habit appears once on Today', () => {
    const { unmount } = render(
      <TodayView
        data={data}
        today={today}
        showOnboarding={false}
        onDismissOnboarding={noop}
        onApplyTemplate={noop}
        onToggleHabit={noop}
        onToggleSkipHabit={noop}
        onToggleTask={noop}
        onRestoreTask={noop}
        onMoveToToday={noop}
        onPriorities={noop}
        onAddTask={noop}
        onEditTask={noop}
        onReview={noop}
        onOpenGoals={noop}
        onEditGoal={noop}
        onAddGoal={noop}
      />,
    );
    expect(screen.getAllByText('Applications')).toHaveLength(1);
    expect(screen.getByLabelText('Today').textContent).toContain('2/5');
    unmount();

    render(
      <HabitsView
        habits={data.habits}
        logs={data.habitLogs}
        completedHabitIds={new Set(['w'])}
        scheduledActiveCount={1}
        today={today}
        onAdd={noop}
        onEdit={noop}
        onDelete={noop}
        onToggle={noop}
      />,
    );
    expect(document.body.textContent).toContain('2/5 this week');
  });
});
