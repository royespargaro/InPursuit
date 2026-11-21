// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlanImportModal } from '../components/PlanImportModal';
import { ProjectsView } from '../views/ProjectsView';
import { TodayView } from '../views/TodayView';
import type { AppData, Extraction } from '../types';
import { MAX_PLAN_TEXT_CHARS } from '../utils/planImportSchema';


const noop = () => {};
function renderToday(data: AppData, today: string, overrides: Partial<React.ComponentProps<typeof TodayView>> = {}) {
  return render(
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
      {...overrides}
    />,
  );
}

describe('Today auto-generated queue, Rough day mode, weekly multi-log, and Import Plan UI flow', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows ONE Today checklist from today scheduled habits and tasks, with weekly counters (2/5), no duplicates, and rough-day minimum versions', () => {
    const today = '2026-11-20'; // Friday
    const data: AppData = {
      schemaVersion: 3,
      lifeAreas: [],
      goals: [],
      projects: [],
      tasks: [
        {
          id: 't1',
          projectId: null,
          title: 'Today Task 1',
          dueDate: today,
          priority: 'high',
          status: 'todo',
          createdAt: '2026-11-20T00:00:00.000Z',
          completedAt: null,
        },
        {
          id: 't2',
          projectId: null,
          title: 'Today Task 2',
          dueDate: today,
          priority: 'medium',
          status: 'todo',
          createdAt: '2026-11-20T00:00:00.000Z',
          completedAt: null,
        },
        {
          id: 't3',
          projectId: null,
          title: 'Today Task 3',
          dueDate: today,
          priority: 'medium',
          status: 'todo',
          createdAt: '2026-11-20T00:00:00.000Z',
          completedAt: null,
        },
        {
          id: 't-future',
          projectId: null,
          title: 'Future Task Excluded',
          dueDate: '2026-11-25',
          priority: 'high',
          status: 'todo',
          createdAt: '2026-11-20T00:00:00.000Z',
          completedAt: null,
        },
      ],
      habits: [
        {
          id: 'h-weekly',
          name: 'Strength Workout',
          frequency: 'daily',
          cadence: 'weekly_count',
          targetCount: 5,
          minimumVersion: '10 pushups',
          active: true,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'h-daily-1',
          name: 'Morning Read',
          frequency: 'daily',
          minimumVersion: 'Read 1 page',
          active: true,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'h-daily-2',
          name: 'Evening Shutdown',
          frequency: 'daily',
          active: true,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'h-daily-3',
          name: 'Deep Stretch',
          frequency: 'daily',
          active: true,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      habitLogs: [
        { id: 'l1', habitId: 'h-weekly', date: '2026-11-16', status: 'done' },
        { id: 'l2', habitId: 'h-weekly', date: '2026-11-18', status: 'done' },
      ],
      dailyPlans: [],
      dailyReviews: [],
    };

    const onToggleTask = vi.fn();
    const onToggleHabit = vi.fn();
    const onDecrementHabit = vi.fn();
    const onPriorities = vi.fn();

    renderToday(data, today, { onToggleTask, onToggleHabit, onDecrementHabit, onPriorities });

    const queue = screen.getByLabelText('Today');
    // Weekly counter 2/5 rendered
    expect(queue.textContent).toContain('2/5');
    // Future task excluded
    expect(queue.textContent).not.toContain('Future Task Excluded');
    // 3 tasks due today + 4 habits = 7 committed items, none done yet
    expect(screen.getByLabelText('Daily progress').textContent).toBe('0/7');
    // Each item appears exactly once (no duplicate Habits/Tasks panels)
    expect(screen.getAllByText('Strength Workout')).toHaveLength(1);
    expect(screen.getAllByText('Today Task 1')).toHaveLength(1);

    // Checkboxes trigger real task/habit toggles & +1 weekly_count action logs again
    fireEvent.click(screen.getByRole('button', { name: 'Check Today Task 1' }));
    expect(onToggleTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Check Strength Workout' }));
    expect(onToggleHabit).toHaveBeenCalledWith(expect.objectContaining({ id: 'h-weekly' }));

    fireEvent.click(screen.getByRole('button', { name: 'Log Strength Workout (+1)' }));
    expect(onToggleHabit).toHaveBeenCalledTimes(2);

    // Suggested Top 3 priorities apply cleanly
    fireEvent.click(screen.getByRole('button', { name: 'Apply 3 priorities' }));
    expect(onPriorities).toHaveBeenCalledWith(['t1', 't2', 't3']);

    // Rough day toggle shows only minimumVersion for habits that define one
    const roughToggle = screen.getByRole('button', { name: 'Rough day' });
    expect(roughToggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(roughToggle);
    expect(roughToggle.getAttribute('aria-pressed')).toBe('true');

    const habitsPanel = screen.getByLabelText('Today');
    expect(habitsPanel.textContent).toContain('10 pushups');
    expect(habitsPanel.textContent).toContain('Read 1 page');
    expect(habitsPanel.textContent).not.toContain('Strength Workout');
    expect(habitsPanel.textContent).not.toContain('Morning Read');
  });

  it('includes active-phase undated + this-week tasks and overdue tasks in the Today checklist, and supports multi-log same-day undo (-1)', () => {
    const today = '2026-11-18'; // Wednesday
    const data: AppData = {
      schemaVersion: 3,
      lifeAreas: [],
      goals: [],
      projects: [
        {
          id: 'p1',
          goalId: null,
          title: 'Phase 1',
          description: '',
          startDate: '2026-11-01',
          dueDate: '2026-11-30',
          status: 'active',
          isPhase: true,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      tasks: [
        {
          id: 't-over',
          projectId: null,
          title: 'Overdue Task',
          dueDate: '2026-11-15',
          priority: 'high',
          status: 'todo',
          createdAt: '2026-11-01T00:00:00.000Z',
          completedAt: null,
        },
        {
          id: 't-week',
          projectId: 'p1',
          title: 'Active Phase Weekly Task',
          dueDate: '2026-11-21',
          priority: 'medium',
          status: 'todo',
          createdAt: '2026-11-01T00:00:00.000Z',
          completedAt: null,
        },
        {
          id: 't-nodate',
          projectId: 'p1',
          title: 'Active Phase Undated Task',
          dueDate: '',
          priority: 'low',
          status: 'todo',
          createdAt: '2026-11-01T00:00:00.000Z',
          completedAt: null,
        },
      ],
      habits: [
        {
          id: 'h-w',
          name: 'Mobility',
          frequency: 'daily',
          cadence: 'weekly_count',
          targetCount: 5,
          active: true,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      habitLogs: [
        { id: 'l1', habitId: 'h-w', date: '2026-11-16', status: 'done' },
        { id: 'l2', habitId: 'h-w', date: today, status: 'done' },
        { id: 'l3', habitId: 'h-w', date: today, status: 'done' },
      ],
      dailyPlans: [],
      dailyReviews: [],
    };

    const onDecrementHabit = vi.fn();
    renderToday(data, today, { onDecrementHabit });

    const queue = screen.getByLabelText('Today');
    expect(queue.textContent).toContain('Overdue Task');
    expect(queue.textContent).toContain('Active Phase Weekly Task');
    expect(queue.textContent).toContain('Active Phase Undated Task');
    expect(queue.textContent).toContain('3/5 (2 today)');

    fireEvent.click(screen.getByRole('button', { name: 'Remove one log for Mobility today' }));
    expect(onDecrementHabit).toHaveBeenCalledWith(expect.objectContaining({ id: 'h-w' }));
  });


  it('caps "Also today" at 5 rows with a show-more toggle and keeps the progress count honest', () => {
    const today = '2026-11-20';
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i}`,
      projectId: null,
      title: `Due task ${i}`,
      dueDate: today,
      priority: 'medium' as const,
      status: 'todo' as const,
      createdAt: `2026-11-0${(i % 8) + 1}T00:00:00.000Z`,
      completedAt: null,
    }));
    const data: AppData = {
      schemaVersion: 3, lifeAreas: [], goals: [], projects: [], tasks, habits: [], habitLogs: [], dailyPlans: [], dailyReviews: [],
    };
    renderToday(data, today);
    expect(screen.getByLabelText('Daily progress').textContent).toBe('0/8');
    const expand = screen.getByRole('button', { name: 'Show 3 more today items' });
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Due task 7')).toBeNull();
    fireEvent.click(expand);
    expect(screen.getByText('Due task 7')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show fewer' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('pins Top 3 first, rough day shows only top 3 and minimum versions, and the old stat/habits/tasks panels are gone', () => {
    const today = '2026-11-20';
    const mk = (id: string, title: string) => ({
      id, projectId: null, title, dueDate: today, priority: 'medium' as const, status: 'todo' as const,
      createdAt: '2026-11-01T00:00:00.000Z', completedAt: null,
    });
    const data: AppData = {
      schemaVersion: 3, lifeAreas: [], goals: [], projects: [],
      tasks: [mk('a', 'Pinned task'), mk('b', 'Other task')],
      habits: [{ id: 'h', name: 'Prayer', frequency: 'daily', minimumVersion: 'One short prayer', active: true, createdAt: '2026-11-01T00:00:00.000Z' }],
      habitLogs: [], dailyPlans: [{ date: today, priorityTaskIds: ['a'] }], dailyReviews: [],
    };
    renderToday(data, today);
    expect(screen.getByText('Pinned task')).toBeTruthy();
    expect(screen.queryByLabelText('Habits')).toBeNull();
    expect(screen.queryByText("Today's priorities")).toBeNull();
    expect(screen.queryByText('Daily progress')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rough day' }));
    expect(screen.getByText('Pinned task')).toBeTruthy();
    expect(screen.getByText('One short prayer')).toBeTruthy();
    expect(screen.queryByText('Other task')).toBeNull();
  });

  it('sends Bearer ID token, shows unverified dropped count, warns on >6 daily habits, enforces input cap, and blocks unauthenticated extract in PlanImportModal', async () => {
    const mockUser = {
      uid: 'u-1',
      email: 'u1@example.com',
      getIdToken: vi.fn().mockResolvedValue('id-token-xyz'),
    };

    // Unauthenticated view prompts sign-in and disables extract
    const { unmount } = render(
      <PlanImportModal
        today="2026-11-20"
        user={null}
        lastImportRecord={null}
        onClose={() => {}}
        onApproveImport={() => {}}
        onUndoLastImport={() => {}}
      />,
    );
    expect(screen.getByText(/Sign in via Settings/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Extract plan/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Free-text plan/i) as HTMLTextAreaElement).maxLength).toBe(MAX_PLAN_TEXT_CHARS);
    unmount();

    const extractedWith7DailyHabits: Extraction = {
      goals: [{ title: 'Fitness Reset', source_quote: 'Fitness Reset' }],
      phases: [{ title: 'Phase 1', start: '2026-11-20', end: '2026-12-19', source_quote: 'Days 1–30' }],
      habits: [
        ...Array.from({ length: 7 }, (_, i) => ({
          title: `Daily Habit ${i + 1}`,
          cadence: 'daily' as const,
          source_quote: `Daily Habit ${i + 1}`,
        })),
        {
          title: 'Workout',
          cadence: 'weekly_count',
          target_count: 4,
          time_block: { start: '07:00', end: '08:00' },
          source_quote: 'Workout 4 per week 07:00-08:00',
        },
      ],
      tasks: [{ title: 'Buy shoes', due: '2026-11-21', source_quote: 'Buy shoes tomorrow' }],
      success_criteria: [{ text: 'Complete 16 workouts', source_quote: 'Complete 16 workouts' }],
      principles: [{ text: 'Sleep 8 hours', source_quote: 'Sleep 8 hours' }],
      clarifications: [{ question: 'Gym or home?', related_quote: 'Workout 4 per week 07:00-08:00' }],
    };

    const refined: Extraction = {
      ...extractedWith7DailyHabits,
      habits: extractedWith7DailyHabits.habits.map(h =>
        h.title === 'Workout' ? { ...h, time_block: { start: '18:00', end: '19:00' } } : h,
      ),
      clarifications: [],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          extraction: extractedWith7DailyHabits,
          anchorDate: '2026-11-20',
          timezone: 'Asia/Makassar',
          verified: true,
          droppedCount: 2,
          dailyHabitCount: 7,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          extraction: refined,
          anchorDate: '2026-11-20',
          timezone: 'Asia/Makassar',
          verified: true,
          droppedCount: 0,
          dailyHabitCount: 7,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const onApproveImport = vi.fn();
    render(
      <PlanImportModal
        today="2026-11-20"
        user={mockUser}
        lastImportRecord={null}
        onClose={() => {}}
        onApproveImport={onApproveImport}
        onUndoLastImport={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Free-text plan/i), {
      target: { value: 'Fitness Reset\nDays 1–30\nWorkout 4 per week 07:00-08:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Extract plan/i }));

    await waitFor(() => expect(screen.getByText('Review extracted plan')).toBeTruthy());

    // Sent Bearer ID token
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer id-token-xyz');

    // Displays dropped unverified item count and >6 daily habit warning
    expect(screen.getByText(/2 unverified dropped/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('7 daily habits');

    // Refine by chat
    fireEvent.change(screen.getByPlaceholderText(/Refine by chat/i), {
      target: { value: 'move workouts to evenings' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refine' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Habit time start 8') as HTMLInputElement).value).toBe('18:00'),
    );

    // Inline edit goal title & delete task
    fireEvent.change(screen.getByLabelText('Goal title 1'), { target: { value: 'Total Fitness Reset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete task Buy shoes' }));

    // Approve all
    fireEvent.click(screen.getByRole('button', { name: /Approve all/i }));
    expect(onApproveImport).toHaveBeenCalledTimes(1);
    const approvedDraft = onApproveImport.mock.calls[0][0] as Extraction;
    expect(approvedDraft.goals[0].title).toBe('Total Fitness Reset');
    expect(approvedDraft.tasks).toHaveLength(0);
    expect(approvedDraft.habits.find(h => h.title === 'Workout')?.time_block).toEqual({ start: '18:00', end: '19:00' });
  });

  it('displays planned phases under Planned filter in ProjectsView', () => {
    render(
      <ProjectsView
        projects={[
          {
            id: 'p-act',
            goalId: null,
            title: 'Active Phase 1',
            description: 'Now',
            dueDate: '2026-12-19',
            status: 'active',
            createdAt: '2026-11-20T00:00:00.000Z',
          },
          {
            id: 'p-plan',
            goalId: null,
            title: 'Future Phase 2',
            description: 'Later',
            dueDate: '2027-01-19',
            status: 'planned',
            theme: 'Scale',
            exitCondition: '100 users',
            createdAt: '2026-11-20T00:00:00.000Z',
          },
        ]}
        goals={[]}
        tasks={[]}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onAddTask={() => {}}
        onToggleTask={() => {}}
        onEditTask={() => {}}
      />,
    );

    expect(screen.getByText('Active Phase 1')).toBeTruthy();
    expect(screen.queryByText('Future Phase 2')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Planned \(1\)/ }));
    expect(screen.getByText('Future Phase 2')).toBeTruthy();
    expect(screen.getByText(/Exit: 100 users/)).toBeTruthy();
  });
});
