// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlanImportModal } from '../components/PlanImportModal';
import { ProjectsView } from '../views/ProjectsView';
import { TodayView } from '../views/TodayView';
import type { AppData, Extraction } from '../types';
import { MAX_PLAN_TEXT_CHARS } from '../utils/planImportSchema';

describe('Today auto-generated queue, Rough day mode, weekly multi-log, and Import Plan UI flow', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('auto-generates Today focus queue from only today scheduled habits and today tasks, shows weekly counters (2/5), and caps visible list at 5 with collapse toggle', () => {
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

    const todayTasks = data.tasks.filter(t => t.dueDate === today);
    const activeHabits = data.habits;
    const onToggleTask = vi.fn();
    const onToggleHabit = vi.fn();
    const onDecrementHabit = vi.fn();
    const onPriorities = vi.fn();

    render(
      <TodayView
        data={data}
        today={today}
        todayTasks={todayTasks}
        overdueTasks={[]}
        activeHabits={activeHabits}
        completedHabitIds={new Set()}
        skippedHabitIds={new Set()}
        doneHabits={0}
        scheduledHabitsCount={activeHabits.length}
        priorityTasks={[]}
        priorityIds={[]}
        showOnboarding={false}
        onDismissOnboarding={() => {}}
        onApplyTemplate={() => {}}
        onToggleHabit={onToggleHabit}
        onDecrementHabit={onDecrementHabit}
        onToggleSkipHabit={() => {}}
        onToggleTask={onToggleTask}
        onRestoreTask={() => {}}
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

    const queue = screen.getByLabelText("Today's execution queue");
    // Weekly counter 2/5 rendered
    expect(queue.textContent).toContain('2/5');
    // Future task excluded
    expect(queue.textContent).not.toContain('Future Task Excluded');
    // 5 items visible out of 7 total (3 tasks + 4 habits) -> 2 collapsed
    expect(queue.textContent).toContain('5/7');
    const expandBtn = screen.getByRole('button', { name: 'Show 2 more today items' });
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(expandBtn);
    expect(screen.getByRole('button', { name: 'Collapse to top 5' }).getAttribute('aria-expanded')).toBe('true');

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

    const habitsPanel = screen.getByLabelText('Habits');
    expect(habitsPanel.textContent).toContain('10 pushups');
    expect(habitsPanel.textContent).toContain('Read 1 page');
    expect(habitsPanel.textContent).not.toContain('Strength Workout');
    expect(habitsPanel.textContent).not.toContain('Morning Read');
  });

  it('includes active-phase undated + this-week tasks and overdue tasks in Today focus queue, and supports multi-log same-day undo (-1)', () => {
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
    render(
      <TodayView
        data={data}
        today={today}
        todayTasks={[]}
        overdueTasks={[data.tasks[0]]}
        activeHabits={data.habits}
        completedHabitIds={new Set(['h-w'])}
        skippedHabitIds={new Set()}
        doneHabits={1}
        scheduledHabitsCount={1}
        priorityTasks={[]}
        priorityIds={[]}
        showOnboarding={false}
        onDismissOnboarding={() => {}}
        onApplyTemplate={() => {}}
        onToggleHabit={() => {}}
        onDecrementHabit={onDecrementHabit}
        onToggleSkipHabit={() => {}}
        onToggleTask={() => {}}
        onRestoreTask={() => {}}
        onMoveToToday={() => {}}
        onPriorities={() => {}}
        onAddTask={() => {}}
        onEditTask={() => {}}
        onReview={() => {}}
        onOpenGoals={() => {}}
        onEditGoal={() => {}}
        onAddGoal={() => {}}
      />,
    );

    const queue = screen.getByLabelText("Today's execution queue");
    expect(queue.textContent).toContain('Overdue Task');
    expect(queue.textContent).toContain('Active Phase Weekly Task');
    expect(queue.textContent).toContain('Active Phase Undated Task');
    expect(queue.textContent).toContain('3/5 (2 today)');

    fireEvent.click(screen.getByRole('button', { name: 'Remove one log for Mobility today' }));
    expect(onDecrementHabit).toHaveBeenCalledWith(expect.objectContaining({ id: 'h-w' }));
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

    // Deep check button triggers Pass-2 verification explicitly with currentDraft
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        extraction: {
          ...refined,
          tasks: [...refined.tasks, { title: 'Schedule doctor checkup', source_quote: 'Fitness Reset' }],
        },
        anchorDate: '2026-11-20',
        timezone: 'Asia/Makassar',
        verified: true,
        droppedCount: 0,
        dailyHabitCount: 7,
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Deep check/i }));
    await waitFor(() => expect(screen.getByText(/deep check verified/i)).toBeTruthy());
    const deepCheckBody = JSON.parse(fetchMock.mock.calls[2][1].body as string) as {
      deepCheck?: boolean;
      currentDraft?: Extraction;
    };
    expect(deepCheckBody.deepCheck).toBe(true);
    expect(deepCheckBody.currentDraft?.habits).toHaveLength(8);

    // Inline edit goal title & delete task
    fireEvent.change(screen.getByLabelText('Goal title 1'), { target: { value: 'Total Fitness Reset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete task Buy shoes' }));

    // Approve all
    fireEvent.click(screen.getByRole('button', { name: /Approve all/i }));
    expect(onApproveImport).toHaveBeenCalledTimes(1);
    const approvedDraft = onApproveImport.mock.calls[0][0] as Extraction;
    expect(approvedDraft.goals[0].title).toBe('Total Fitness Reset');
    expect(approvedDraft.tasks.some(t => t.title === 'Buy shoes')).toBe(false);
    expect(approvedDraft.habits.find(h => h.title === 'Workout')?.time_block).toEqual({ start: '18:00', end: '19:00' });
  });

  it('shows staged progress, supports Cancel and Retry, and keeps pasted text on errors', async () => {
    const mockUser = {
      uid: 'u-1',
      email: 'u1@example.com',
      getIdToken: vi.fn().mockResolvedValue('id-token-xyz'),
    };

    let abortedSignal: AbortSignal | null | undefined;
    const fetchMock = vi
      .fn()
      // First attempt hangs until aborted by Cancel button
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        abortedSignal = init?.signal;
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      })
      // Second attempt returns friendly retryable 503 AI_BUSY
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: 'The AI planner is temporarily busy. Please try again in a moment.',
          code: 'AI_BUSY',
          retryable: true,
        }),
      })
      // Third attempt (via Retry button) succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          extraction: {
            goals: [{ title: 'Keep Shipping', source_quote: 'Goal: Keep Shipping' }],
            phases: [],
            habits: [],
            tasks: [],
            success_criteria: [],
            principles: [],
            clarifications: [],
          },
          anchorDate: '2026-11-20',
          timezone: 'Asia/Makassar',
          verified: false,
          droppedCount: 0,
          dailyHabitCount: 0,
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <PlanImportModal
        today="2026-11-20"
        user={mockUser}
        lastImportRecord={null}
        onClose={() => {}}
        onApproveImport={() => {}}
        onUndoLastImport={() => {}}
      />,
    );

    const textarea = screen.getByLabelText(/Free-text plan/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Goal: Keep Shipping' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract plan/i }));

    // Staged progress & Cancel button visible while request is in flight
    await waitFor(() => expect(screen.getByText(/Step 1\/3/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(abortedSignal?.aborted).toBe(true));
    expect(screen.getByText(/Cancelled\. Your pasted text is preserved\./i)).toBeTruthy();
    expect((screen.getByLabelText(/Free-text plan/i) as HTMLTextAreaElement).value).toBe('Goal: Keep Shipping');

    // Submit again -> receives retryable AI_BUSY error while keeping pasted text
    fireEvent.click(screen.getByRole('button', { name: /Extract plan/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('The AI planner is temporarily busy'),
    );
    expect(screen.getByRole('alert').textContent).toContain('Your pasted text is preserved');
    expect((screen.getByLabelText(/Free-text plan/i) as HTMLTextAreaElement).value).toBe('Goal: Keep Shipping');

    // Click Retry button -> succeeds and moves to review screen
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('Review extracted plan')).toBeTruthy());
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

  it('supports one-tap Start phase in ProjectsView and disables it when 3 active projects exist', () => {
    const onStartPhase = vi.fn();
    const { rerender } = render(
      <ProjectsView
        projects={[
          {
            id: 'p-act-1',
            goalId: null,
            title: 'Active 1',
            description: '',
            dueDate: '',
            status: 'active',
            createdAt: '2026-11-20T00:00:00.000Z',
          },
          {
            id: 'p-plan-1',
            goalId: null,
            title: 'Planned Phase Next',
            description: '',
            startDate: '2026-11-25',
            dueDate: '2026-12-25',
            status: 'planned',
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
        onStartPhase={onStartPhase}
        onEditTask={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Planned \(1\)/ }));
    const startBtn = screen.getByRole('button', { name: 'Start phase' }) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(false);
    fireEvent.click(startBtn);
    expect(onStartPhase).toHaveBeenCalledWith('p-plan-1');

    // At 3 active projects, Start phase button is disabled to enforce cap
    rerender(
      <ProjectsView
        projects={[
          { id: 'a1', goalId: null, title: 'Active 1', description: '', dueDate: '', status: 'active', createdAt: '' },
          { id: 'a2', goalId: null, title: 'Active 2', description: '', dueDate: '', status: 'active', createdAt: '' },
          { id: 'a3', goalId: null, title: 'Active 3', description: '', dueDate: '', status: 'active', createdAt: '' },
          { id: 'p-plan-1', goalId: null, title: 'Planned Phase Next', description: '', dueDate: '', status: 'planned', createdAt: '' },
        ]}
        goals={[]}
        tasks={[]}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onAddTask={() => {}}
        onToggleTask={() => {}}
        onStartPhase={onStartPhase}
        onEditTask={() => {}}
      />,
    );
    expect((screen.getByRole('button', { name: 'Start phase' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('warns about tasks without phase or due date in PlanImportModal and allows assigning phase, priority, and goal life_area', async () => {
    const mockUser = {
      uid: 'u-1',
      email: 'u1@example.com',
      getIdToken: vi.fn().mockResolvedValue('id-token-xyz'),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        extraction: {
          goals: [{ title: 'Ship Product', life_area: 'Business', source_quote: 'Ship Product' }],
          phases: [
            { title: 'Phase 1', start: '2026-11-20', end: '2026-12-20', source_quote: 'Phase 1' },
          ],
          habits: [],
          tasks: [
            { title: 'Write landing copy', priority: 'medium', source_quote: 'Write landing copy' },
          ],
          success_criteria: [],
          principles: [],
          clarifications: [],
        },
        anchorDate: '2026-11-20',
        timezone: 'Asia/Makassar',
        verified: false,
        droppedCount: 0,
        dailyHabitCount: 0,
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
      target: { value: 'Ship Product\nPhase 1\nWrite landing copy' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Extract plan/i }));

    await waitFor(() => expect(screen.getByText('Review extracted plan')).toBeTruthy());

    // Warning shown for task missing both phase and due date
    expect(screen.getByLabelText('Unassigned tasks warning').textContent).toContain('1 task has no phase and no due date');
    expect(screen.getByText('No phase or due date assigned')).toBeTruthy();

    // Assign phase, priority, and edit life area
    fireEvent.change(screen.getByLabelText('Task phase 1'), { target: { value: 'Phase 1' } });
    fireEvent.change(screen.getByLabelText('Task priority 1'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('Goal life area 1'), { target: { value: 'Career' } });

    // Warning clears immediately once phase is assigned
    expect(screen.queryByLabelText('Unassigned tasks warning')).toBeNull();
    expect(screen.queryByText('No phase or due date assigned')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Approve all/i }));
    expect(onApproveImport).toHaveBeenCalledTimes(1);
    const approved = onApproveImport.mock.calls[0][0] as Extraction;
    expect(approved.goals[0].life_area).toBe('Career');
    expect(approved.tasks[0].phase_ref).toBe('Phase 1');
    expect(approved.tasks[0].priority).toBe('high');
  });

  it('displays targetQuantity progress counter (e.g. 12/30) with +1/-1 buttons in TodayView and ProjectsView', () => {
    const today = '2026-11-20';
    const task: AppData['tasks'][number] = {
      id: 't-qty',
      projectId: 'p1',
      title: 'Apply to jobs',
      dueDate: today,
      priority: 'high',
      status: 'todo',
      targetQuantity: 30,
      completedQuantity: 12,
      createdAt: '2026-11-01T00:00:00.000Z',
      completedAt: null,
    };
    const project: AppData['projects'][number] = {
      id: 'p1',
      goalId: null,
      title: 'Job Search Sprint',
      description: '',
      dueDate: '2026-12-20',
      status: 'active',
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    const data: AppData = {
      schemaVersion: 3,
      lifeAreas: [],
      goals: [],
      projects: [project],
      tasks: [task],
      habits: [],
      habitLogs: [],
      dailyPlans: [],
      dailyReviews: [],
    };

    const onAdjustTaskQuantity = vi.fn();
    const { unmount } = render(
      <TodayView
        data={data}
        today={today}
        todayTasks={[task]}
        overdueTasks={[]}
        activeHabits={[]}
        completedHabitIds={new Set()}
        skippedHabitIds={new Set()}
        doneHabits={0}
        scheduledHabitsCount={0}
        priorityTasks={[]}
        priorityIds={[]}
        showOnboarding={false}
        onDismissOnboarding={() => {}}
        onApplyTemplate={() => {}}
        onToggleHabit={() => {}}
        onToggleSkipHabit={() => {}}
        onToggleTask={() => {}}
        onAdjustTaskQuantity={onAdjustTaskQuantity}
        onRestoreTask={() => {}}
        onMoveToToday={() => {}}
        onPriorities={() => {}}
        onAddTask={() => {}}
        onEditTask={() => {}}
        onReview={() => {}}
        onOpenGoals={() => {}}
        onEditGoal={() => {}}
        onAddGoal={() => {}}
      />,
    );

    const queue = screen.getByLabelText("Today's execution queue");
    expect(queue.textContent).toContain('12/30');
    fireEvent.click(screen.getAllByRole('button', { name: 'Increase progress for Apply to jobs (+1)' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Decrease progress for Apply to jobs (-1)' })[0]);
    expect(onAdjustTaskQuantity).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 't-qty' }), 1);
    expect(onAdjustTaskQuantity).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 't-qty' }), -1);
    unmount();

    const onAdjustProjectTask = vi.fn();
    render(
      <ProjectsView
        projects={[project]}
        goals={[]}
        tasks={[task]}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onAddTask={() => {}}
        onToggleTask={() => {}}
        onAdjustTaskQuantity={onAdjustProjectTask}
        onEditTask={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tasks (1)' }));
    expect(screen.getByText('12/30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Increase progress for Apply to jobs (+1)' }));
    expect(onAdjustProjectTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't-qty' }), 1);
  });
});
