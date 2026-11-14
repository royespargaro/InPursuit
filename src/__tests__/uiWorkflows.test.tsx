// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditorModal } from '../components/EditorModal';
import { TodayView } from '../views/TodayView';
import { HabitsView } from '../views/HabitsView';
import type { AppData, Goal, Habit, Task } from '../types';

const baseData = (): AppData => ({
  schemaVersion: 3,
  lifeAreas: [{ id: 'la-1', name: 'Work', description: 'Main craft', createdAt: '2026-11-01T00:00:00.000Z' }],
  goals: [
    {
      id: 'g-arch',
      lifeAreaId: 'la-1',
      title: 'Archived Goal Parent',
      outcome: 'Outcome',
      targetDate: '',
      status: 'archived',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ],
  projects: [
    {
      id: 'p-arch',
      goalId: 'g-arch',
      title: 'Archived Project Parent',
      description: '',
      dueDate: '',
      status: 'archived',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ],
  tasks: [
    {
      id: 't-future',
      projectId: 'p-arch',
      title: 'Future Top3 Task',
      dueDate: '2026-11-20',
      priority: 'high',
      status: 'todo',
      createdAt: '2026-11-10T00:00:00.000Z',
      completedAt: null,
    },
    {
      id: 't-nodate',
      projectId: null,
      title: 'Undated Task',
      dueDate: '',
      priority: 'medium',
      status: 'todo',
      createdAt: '2026-11-10T00:00:00.000Z',
      completedAt: null,
    },
    {
      id: 't-skipped',
      projectId: null,
      title: 'Skipped Task',
      dueDate: '2026-11-14',
      priority: 'low',
      status: 'skipped',
      createdAt: '2026-11-10T00:00:00.000Z',
      completedAt: null,
    },
    ...Array.from({ length: 8 }, (_, i): Task => ({
      id: `overdue-${i}`,
      projectId: null,
      title: `Overdue ${i + 1}`,
      dueDate: '2026-11-01',
      priority: 'medium',
      status: 'todo',
      createdAt: '2026-11-01T00:00:00.000Z',
      completedAt: null,
    })),
  ],
  habits: [
    { id: 'h-week', name: 'Deep Work', frequency: 'weekdays', active: true, createdAt: '2026-11-01T00:00:00.000Z' },
  ],
  habitLogs: [
    { id: 'l1', habitId: 'h-week', date: '2026-11-12', status: 'done' },
    { id: 'l2', habitId: 'h-week', date: '2026-11-13', status: 'done' },
  ],
  dailyPlans: [{ date: '2026-11-14', priorityTaskIds: ['t-future', 't-nodate'] }],
  dailyReviews: [{ date: '2026-11-14', wins: 'Moved tasks', blockers: '', notes: '', energy: 4 }],
});

describe('UI workflow & regression tests', () => {
  afterEach(() => {
    cleanup();
  });

  it('defaults new goals and projects to empty optional deadlines while preserving archived parents when editing', () => {
    const data = baseData();
    const onSave = vi.fn();

    render(
      <EditorModal
        kind="goal"
        id={null}
        reviewDate="2026-11-14"
        today="2026-11-14"
        data={data}
        activeProjectCount={0}
        newTaskProjectId={null}
        onClose={() => {}}
        onCreateLifeArea={() => ''}
        onDeleteItem={() => {}}
        onSave={onSave}
      />,
    );

    const goalDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(goalDateInput.value).toBe('');

    fireEvent.change(screen.getByPlaceholderText('What outcome are you aiming for?'), { target: { value: 'Ship launch' } });
    fireEvent.submit(document.querySelector('form')!);
    expect((onSave.mock.calls[0][1] as Goal).targetDate).toBe('');

    // Editing a project linked to an archived goal keeps the archived goal selectable
    cleanup();
    render(
      <EditorModal
        kind="project"
        id="p-arch"
        reviewDate="2026-11-14"
        today="2026-11-14"
        data={data}
        activeProjectCount={0}
        newTaskProjectId={null}
        onClose={() => {}}
        onCreateLifeArea={() => ''}
        onDeleteItem={() => {}}
        onSave={onSave}
      />,
    );
    expect(screen.getByText('Archived Goal Parent (archived)')).toBeTruthy();

    // Editing a task linked to an archived project keeps the archived project selectable
    cleanup();
    render(
      <EditorModal
        kind="task"
        id="t-future"
        reviewDate="2026-11-14"
        today="2026-11-14"
        data={data}
        activeProjectCount={0}
        newTaskProjectId={null}
        onClose={() => {}}
        onCreateLifeArea={() => ''}
        onDeleteItem={() => {}}
        onSave={onSave}
      />,
    );
    expect(screen.getByText('Archived Project Parent (archived)')).toBeTruthy();
  });

  it('blocks future-dated daily reviews cleanly and exposes delete review trigger', () => {
    const data = baseData();
    const onSave = vi.fn();
    const onDeleteReview = vi.fn();

    render(
      <EditorModal
        kind="review"
        id={null}
        reviewDate="2026-11-14"
        today="2026-11-14"
        data={data}
        activeProjectCount={0}
        newTaskProjectId={null}
        onClose={() => {}}
        onCreateLifeArea={() => ''}
        onDeleteItem={() => {}}
        onDeleteReview={onDeleteReview}
        onSave={onSave}
      />,
    );

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2099-01-01' } });
    fireEvent.change(screen.getByPlaceholderText('What did you actually move forward?'), { target: { value: 'Future win' } });
    fireEvent.submit(document.querySelector('form')!);

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Future-dated reviews');

    fireEvent.change(dateInput, { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteReview).toHaveBeenCalledWith('2026-11-14');
  });

  it('TodayView supports upcoming/undated/skipped tabs, priority reordering, expandable overdue tasks, and onboarding skip', () => {
    const data = baseData();
    const onPriorities = vi.fn();
    const onRestoreTask = vi.fn();
    const onDismissOnboarding = vi.fn();

    render(
      <TodayView
        data={data}
        today="2026-11-14"
        todayTasks={[]}
        overdueTasks={data.tasks.filter(t => t.dueDate < '2026-11-14' && t.dueDate !== '' && t.status === 'todo')}
        activeHabits={data.habits}
        completedHabitIds={new Set()}
        skippedHabitIds={new Set()}
        doneHabits={0}
        scheduledHabitsCount={0}
        priorityTasks={[data.tasks[0], data.tasks[1]]}
        priorityIds={['t-future', 't-nodate']}
        showOnboarding={true}
        onDismissOnboarding={onDismissOnboarding}
        onApplyTemplate={() => {}}
        onToggleHabit={() => {}}
        onToggleSkipHabit={() => {}}
        onToggleTask={() => {}}
        onRestoreTask={onRestoreTask}
        onMoveToToday={() => {}}
        onPriorities={onPriorities}
        onAddTask={() => {}}
        onEditTask={() => {}}
        onReview={() => {}}
        onOpenGoals={() => {}}
        onEditGoal={() => {}}
        onAddGoal={() => {}}
      />,
    );

    // Reorder priority item 2 up to position 1
    fireEvent.click(screen.getByRole('button', { name: 'Move Undated Task higher' }));
    expect(onPriorities).toHaveBeenCalledWith(['t-nodate', 't-future']);

    // Switch to Upcoming tab
    fireEvent.click(screen.getByRole('tab', { name: /Upcoming/ }));
    expect(screen.getAllByText('Future Top3 Task').length).toBeGreaterThan(0);

    // Switch to No date tab
    fireEvent.click(screen.getByRole('tab', { name: /No date/ }));
    expect(screen.getAllByText('Undated Task').length).toBeGreaterThan(0);

    // Switch to Skipped tab and restore task
    fireEvent.click(screen.getByRole('tab', { name: /Skipped/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestoreTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't-skipped' }));

    // Expand overdue tasks beyond 6
    expect(screen.queryByText('Overdue 8')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 8 overdue tasks' }));
    expect(screen.getByText('Overdue 8')).toBeTruthy();

    // Skip onboarding
    fireEvent.click(screen.getByRole('button', { name: 'Skip guide' }));
    expect(onDismissOnboarding).toHaveBeenCalledTimes(1);
  });

  it('HabitsView passes habit schedule to streak computation and toggles 7-day / Month views', () => {
    const weekdayHabit: Habit = {
      id: 'h-week',
      name: 'Deep Work',
      frequency: 'weekdays',
      active: true,
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    const logs = [
      { id: 'l1', habitId: 'h-week', date: '2026-11-12', status: 'done' as const },
      { id: 'l2', habitId: 'h-week', date: '2026-11-13', status: 'done' as const },
    ];

    // 2026-11-14 is Saturday -> weekday habit Thu+Fri streak (2d) stays intact!
    render(
      <HabitsView
        habits={[weekdayHabit]}
        logs={logs}
        completedHabitIds={new Set()}
        scheduledActiveCount={0}
        today="2026-11-14"
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onToggle={() => {}}
      />,
    );

    expect(screen.getByText(/weekdays · 2d \(best 2d\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByText('Last 7 days')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByText('November 2026')).toBeTruthy();
  });
});
