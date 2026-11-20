import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, User } from './components/Icon';
import Icon from './components/Icon';
import type { StarterTemplateOption } from './components/OnboardingCard';
import { SyncIndicator } from './components/SyncIndicator';
import { cx, prettyDate } from './components/ui';
import { useHabits } from './context/HabitContext';
import {
  createId,
  exportData,
  inspectBackupText,
  LOCAL_MODE_STORAGE_KEY,
  ONBOARDING_KEY_PREFIX,
  type ParsedBackup,
} from './services/appStore';
import type { DailyReview, Extraction, Goal, Habit, LifeArea, PlanImportRecord, Project, Task } from './types';
import { isHabitScheduledOnDate, localDateKey } from './utils/habitUtils';
import {
  applyImportedPlanToWorkspace,
  readLastImportRecord,
  undoImportedPlan,
  workspaceHasImportId,
  writeLastImportRecord,
} from './utils/planImportMerge';
import { canActivateProject, MAX_ACTIVE_PROJECTS, promoteDuePlannedProjects } from './utils/projectLimits';
import { TodayView } from './views/TodayView';

const GoalsView = lazy(() => import('./views/GoalsView').then(m => ({ default: m.GoalsView })));
const ProjectsView = lazy(() => import('./views/ProjectsView').then(m => ({ default: m.ProjectsView })));
const HabitsView = lazy(() => import('./views/HabitsView').then(m => ({ default: m.HabitsView })));
const ReviewView = lazy(() => import('./views/ReviewView').then(m => ({ default: m.ReviewView })));
const EditorModal = lazy(() => import('./components/EditorModal').then(m => ({ default: m.EditorModal })));
const LifeAreasModal = lazy(() => import('./components/LifeAreasModal').then(m => ({ default: m.LifeAreasModal })));
const ConfirmModal = lazy(() => import('./components/ConfirmModal').then(m => ({ default: m.ConfirmModal })));
const ConflictModal = lazy(() => import('./components/ConflictModal').then(m => ({ default: m.ConflictModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const SignInPage = lazy(() => import('./components/SignInPage').then(m => ({ default: m.SignInPage })));
const PlanImportModal = lazy(() => import('./components/PlanImportModal').then(m => ({ default: m.PlanImportModal })));

type View = 'today' | 'goals' | 'projects' | 'habits' | 'review';
type DeleteTarget =
  | { kind: 'task' | 'goal' | 'project' | 'habit'; id: string; title: string }
  | { kind: 'lifeArea'; id: string; title: string; linkedGoals: number }
  | { kind: 'review'; id: string; title: string };

const uid = createId;

function readLocalModeFlag(): boolean {
  try {
    return localStorage.getItem(LOCAL_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeLocalModeFlag(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(LOCAL_MODE_STORAGE_KEY, '1');
    else localStorage.removeItem(LOCAL_MODE_STORAGE_KEY);
  } catch {
    // Ignore restricted localStorage
  }
}

function readOnboardingDismissed(scope: string): boolean {
  try {
    return localStorage.getItem(`${ONBOARDING_KEY_PREFIX}${scope}`) === '1';
  } catch {
    return false;
  }
}

function writeOnboardingDismissed(scope: string, dismissed: boolean) {
  try {
    const key = `${ONBOARDING_KEY_PREFIX}${scope}`;
    if (dismissed) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Ignore storage quota restrictions
  }
}

export default function App() {
  const {
    data,
    updateData,
    saveData,
    user,
    authReady,
    syncStatus,
    lastSyncedAt,
    pendingSync,
    conflict,
    resolveConflict,
    retrySync,
    storageNotice,
    incompatibleSchema,
    exportRecoveryBackup,
  } = useHabits();

  const [localWorkspaceActive, setLocalWorkspaceActive] = useState<boolean>(readLocalModeFlag);
  const [today, setToday] = useState<string>(() => localDateKey());
  const [view, setView] = useState<View>('today');
  const [modal, setModal] = useState<'task' | 'goal' | 'project' | 'habit' | 'review' | 'settings' | 'areas' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviewDate, setReviewDate] = useState<string>(() => localDateKey());
  const [toast, setToast] = useState('');
  const [newTaskProjectId, setNewTaskProjectId] = useState<string | null>(null);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [pendingRestore, setPendingRestore] = useState<ParsedBackup | null>(null);
  const [showPlanImport, setShowPlanImport] = useState(false);

  const onboardingScope = user?.uid ?? 'guest';
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(() => readOnboardingDismissed('guest'));
  const [onboardingPinned, setOnboardingPinned] = useState(false);
  const [lastImportRecord, setLastImportRecord] = useState<PlanImportRecord | null>(() => readLastImportRecord('guest'));

  const importRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setOnboardingDismissed(readOnboardingDismissed(onboardingScope));
    setOnboardingPinned(false);
    setLastImportRecord(readLastImportRecord(onboardingScope));
  }, [onboardingScope]);

  // Clear local mode flag once signed in with Firebase
  useEffect(() => {
    if (user) {
      writeLocalModeFlag(false);
      setLocalWorkspaceActive(false);
    }
  }, [user]);

  // Midnight & tab-focus date transition check
  useEffect(() => {
    const syncDate = () => {
      const current = localDateKey();
      setToday(prev => (prev === current ? prev : current));
    };
    const interval = window.setInterval(syncDate, 60_000);
    window.addEventListener('visibilitychange', syncDate);
    window.addEventListener('focus', syncDate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('visibilitychange', syncDate);
      window.removeEventListener('focus', syncDate);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Automatically promote planned projects/phases when their startDate arrives (respecting 3-active limit)
  useEffect(() => {
    if (!authReady) return;
    const { promotedIds } = promoteDuePlannedProjects(data.projects, today);
    if (promotedIds.length === 0) return;
    updateData(current => {
      const next = promoteDuePlannedProjects(current.projects, today);
      if (next.promotedIds.length === 0) return current;
      return { ...current, projects: next.projects };
    });
  }, [authReady, today, data.projects, updateData]);

  const avatarPhotoUrl = user?.photoURL && user.photoURL !== failedPhotoUrl ? user.photoURL : null;

  const todayPlan = useMemo(
    () => data.dailyPlans.find(p => p.date === today) ?? { date: today, priorityTaskIds: [] },
    [data.dailyPlans, today],
  );
  const todayTasks = useMemo(
    () => data.tasks.filter(t => t.dueDate === today && t.status !== 'skipped'),
    [data.tasks, today],
  );
  const overdueTasks = useMemo(
    () => data.tasks.filter(t => t.status === 'todo' && t.dueDate !== '' && t.dueDate < today),
    [data.tasks, today],
  );
  const activeHabits = useMemo(
    () => data.habits.filter(h => h.active && isHabitScheduledOnDate(h, today)),
    [data.habits, today],
  );
  const todayHabitLogMap = useMemo(
    () => new Map(data.habitLogs.filter(l => l.date === today).map(l => [l.habitId, l.status])),
    [data.habitLogs, today],
  );
  const completedHabitIds = useMemo(
    () => new Set(activeHabits.filter(h => todayHabitLogMap.get(h.id) === 'done').map(h => h.id)),
    [activeHabits, todayHabitLogMap],
  );
  const skippedHabitIds = useMemo(
    () => new Set(activeHabits.filter(h => todayHabitLogMap.get(h.id) === 'skipped').map(h => h.id)),
    [activeHabits, todayHabitLogMap],
  );
  const doneHabits = completedHabitIds.size;
  const scheduledNonSkippedHabits = useMemo(
    () => activeHabits.filter(h => !skippedHabitIds.has(h.id)).length,
    [activeHabits, skippedHabitIds],
  );
  const priorityTasks = useMemo(
    () =>
      todayPlan.priorityTaskIds
        .map(id => data.tasks.find(t => t.id === id))
        .filter((t): t is Task => !!t && t.status !== 'skipped'),
    [data.tasks, todayPlan.priorityTaskIds],
  );
  const activeGoals = useMemo(() => data.goals.filter(g => g.status === 'active'), [data.goals]);
  const activeProjects = useMemo(() => data.projects.filter(p => p.status === 'active'), [data.projects]);

  const showOnboarding =
    onboardingPinned || (!onboardingDismissed && data.goals.length === 0 && data.projects.length === 0 && data.tasks.length === 0);

  const notify = (message: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast('');
    }, 2600);
  };

  const dismissOnboarding = () => {
    writeOnboardingDismissed(onboardingScope, true);
    setOnboardingDismissed(true);
    setOnboardingPinned(false);
  };

  const activeLastImport = useMemo(
    () => (lastImportRecord && workspaceHasImportId(data, lastImportRecord.importId) ? lastImportRecord : null),
    [data, lastImportRecord],
  );

  const handleApprovePlanImport = (draft: Extraction) => {
    let createdRecord: PlanImportRecord | null = null;
    updateData(current => {
      const result = applyImportedPlanToWorkspace(current, draft, { today });
      createdRecord = result.record;
      return result.nextData;
    });
    if (createdRecord) {
      writeLastImportRecord(onboardingScope, createdRecord);
      setLastImportRecord(createdRecord);
      const counts = (createdRecord as PlanImportRecord).counts;
      notify(
        `Imported ${counts.goals} goals, ${counts.phases} phases, ${counts.habits} habits, ${counts.tasks} tasks` +
          (counts.deduped > 0 ? ` (${counts.deduped} deduped)` : ''),
      );
    }
    dismissOnboarding();
    setShowPlanImport(false);
  };

  const handleUndoPlanImport = () => {
    if (!activeLastImport) return;
    const importId = activeLastImport.importId;
    updateData(current => undoImportedPlan(current, importId));
    writeLastImportRecord(onboardingScope, null);
    setLastImportRecord(null);
    notify('Last plan import undone');
  };

  const toggleGoalCriterion = (goalId: string, criterionId: string) => {
    updateData(current => ({
      ...current,
      goals: current.goals.map(goal =>
        goal.id === goalId && goal.successCriteria
          ? {
              ...goal,
              successCriteria: goal.successCriteria.map(c =>
                c.id === criterionId ? { ...c, done: !c.done } : c,
              ),
            }
          : goal,
      ),
    }));
  };

  const applyStarterTemplate = (template: StarterTemplateOption) => {
    const now = new Date().toISOString();
    const canActivate = activeProjects.length < MAX_ACTIVE_PROJECTS;

    updateData(current => {
      let lifeArea = current.lifeAreas.find(a => a.name.toLocaleLowerCase() === template.areaName.toLocaleLowerCase());
      const nextLifeAreas = [...current.lifeAreas];
      if (!lifeArea) {
        lifeArea = { id: uid(), name: template.areaName, description: '', createdAt: now };
        nextLifeAreas.push(lifeArea);
      }

      const goalId = uid();
      const projectId = uid();
      const projectStatus: Project['status'] = current.projects.filter(p => p.status === 'active').length < MAX_ACTIVE_PROJECTS ? 'active' : 'archived';

      const newTasks: Task[] = template.tasks.map((title, idx) => ({
        id: uid(),
        projectId,
        title,
        dueDate: idx < 2 ? today : '',
        priority: idx === 0 ? 'high' : 'medium',
        status: 'todo',
        createdAt: now,
        completedAt: null,
      }));

      return {
        ...current,
        lifeAreas: nextLifeAreas,
        goals: [
          ...current.goals,
          {
            id: goalId,
            lifeAreaId: lifeArea.id,
            title: template.goalTitle,
            outcome: template.goalOutcome,
            targetDate: '',
            status: 'active',
            createdAt: now,
          },
        ],
        projects: [
          ...current.projects,
          {
            id: projectId,
            goalId,
            title: template.projectTitle,
            description: template.projectDescription,
            dueDate: '',
            status: projectStatus,
            createdAt: now,
          },
        ],
        tasks: [...current.tasks, ...newTasks],
      };
    });

    dismissOnboarding();
    notify(
      canActivate
        ? `Added "${template.label}" starter workspace`
        : `Added template (project saved archived since ${MAX_ACTIVE_PROJECTS} projects are already active)`,
    );
  };

  const setHabitStatusOnDate = (habit: Habit, date: string, nextStatus: 'done' | 'skipped' | 'clear') => {
    updateData(current => {
      if (date > today) return current;
      const filtered = current.habitLogs.filter(l => !(l.habitId === habit.id && l.date === date));
      if (nextStatus === 'clear') return { ...current, habitLogs: filtered };
      return { ...current, habitLogs: [...filtered, { id: uid(), habitId: habit.id, date, status: nextStatus }] };
    });
  };

  const addWeeklyHabitLogOnDate = (habit: Habit, date: string) => {
    updateData(current => {
      if (date > today) return current;
      // Clear any skipped marker on that date while keeping existing done completions intact
      const kept = current.habitLogs.filter(
        l => !(l.habitId === habit.id && l.date === date && l.status === 'skipped'),
      );
      return { ...current, habitLogs: [...kept, { id: uid(), habitId: habit.id, date, status: 'done' }] };
    });
  };

  const removeLastDoneHabitLogOnDate = (habit: Habit, date: string) => {
    updateData(current => {
      let targetIdx = -1;
      for (let i = current.habitLogs.length - 1; i >= 0; i -= 1) {
        const log = current.habitLogs[i];
        if (log.habitId === habit.id && log.date === date && log.status === 'done') {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx === -1) return current;
      return {
        ...current,
        habitLogs: current.habitLogs.filter((_, idx) => idx !== targetIdx),
      };
    });
  };

  const toggleHabit = (habit: Habit) => {
    if (habit.cadence === 'weekly_count') {
      addWeeklyHabitLogOnDate(habit, today);
      return;
    }
    const currentStatus = todayHabitLogMap.get(habit.id);
    setHabitStatusOnDate(habit, today, currentStatus === 'done' ? 'clear' : 'done');
  };

  const decrementHabitToday = (habit: Habit) => {
    removeLastDoneHabitLogOnDate(habit, today);
  };

  const toggleSkipHabit = (habit: Habit) => {
    const currentStatus = todayHabitLogMap.get(habit.id);
    setHabitStatusOnDate(habit, today, currentStatus === 'skipped' ? 'clear' : 'skipped');
  };

  const cycleHabitMatrixDay = (habit: Habit, date: string) => {
    if (habit.cadence === 'weekly_count') {
      const doneOnDate = data.habitLogs.filter(
        l => l.habitId === habit.id && l.date === date && l.status === 'done',
      ).length;
      if (doneOnDate < 3) {
        addWeeklyHabitLogOnDate(habit, date);
      } else {
        setHabitStatusOnDate(habit, date, 'clear');
      }
      return;
    }
    const current = data.habitLogs.find(l => l.habitId === habit.id && l.date === date)?.status;
    if (!current) setHabitStatusOnDate(habit, date, 'done');
    else if (current === 'done') setHabitStatusOnDate(habit, date, 'skipped');
    else setHabitStatusOnDate(habit, date, 'clear');
  };

  const toggleTask = (task: Task) =>
    updateData(current => ({
      ...current,
      tasks: current.tasks.map(t => {
        if (t.id !== task.id) return t;
        const nextDone = t.status !== 'done';
        const hasTarget = typeof t.targetQuantity === 'number' && t.targetQuantity > 0;
        const nextQty = hasTarget
          ? nextDone
            ? t.targetQuantity
            : t.completedQuantity === t.targetQuantity
              ? 0
              : t.completedQuantity
          : t.completedQuantity;
        return {
          ...t,
          status: nextDone ? 'done' : 'todo',
          completedAt: nextDone ? new Date().toISOString() : null,
          ...(typeof nextQty === 'number' ? { completedQuantity: nextQty } : {}),
        };
      }),
    }));

  const adjustTaskQuantity = (task: Task, delta: 1 | -1) => {
    const nowIso = new Date().toISOString();
    updateData(current => ({
      ...current,
      tasks: current.tasks.map(t => {
        if (t.id !== task.id) return t;
        const target = typeof t.targetQuantity === 'number' && t.targetQuantity > 0 ? t.targetQuantity : 0;
        const base =
          typeof t.completedQuantity === 'number'
            ? t.completedQuantity
            : t.status === 'done' && target > 0
              ? target
              : 0;
        const nextQty = target > 0 ? Math.max(0, Math.min(target, base + delta)) : Math.max(0, base + delta);
        if (target > 0) {
          const reachedTarget = nextQty >= target;
          return {
            ...t,
            completedQuantity: nextQty,
            status: reachedTarget ? 'done' : 'todo',
            completedAt: reachedTarget ? (t.completedAt ?? nowIso) : null,
          };
        }
        return {
          ...t,
          completedQuantity: nextQty,
        };
      }),
    }));
  };

  const startPhase = (projectId: string) => {
    if (!canActivateProject(data.projects, projectId)) {
      notify(`Active project limit reached (${MAX_ACTIVE_PROJECTS}). Complete or archive a project first.`);
      return;
    }
    let startedTitle = '';
    updateData(current => {
      if (!canActivateProject(current.projects, projectId)) return current;
      return {
        ...current,
        projects: current.projects.map(p => {
          if (p.id !== projectId || p.status !== 'planned') return p;
          startedTitle = p.title;
          return {
            ...p,
            status: 'active' as const,
            ...(!p.startDate || p.startDate > today ? { startDate: today } : {}),
          };
        }),
      };
    });
    if (startedTitle) {
      notify(`Started phase "${startedTitle}"`);
    }
  };

  const restoreTask = (task: Task) => {
    updateData(current => ({
      ...current,
      tasks: current.tasks.map(t => (t.id === task.id ? { ...t, status: 'todo', completedAt: null } : t)),
    }));
    notify('Task restored to active list');
  };

  const moveTaskToToday = (taskId: string) => {
    updateData(current => ({
      ...current,
      tasks: current.tasks.map(t => (t.id === taskId ? { ...t, dueDate: today } : t)),
    }));
    notify('Moved task to today');
  };

  const setPriorities = (ids: string[]) =>
    updateData(current => ({
      ...current,
      dailyPlans: [...current.dailyPlans.filter(p => p.date !== today), { date: today, priorityTaskIds: [...new Set(ids)].slice(0, 3) }],
    }));

  const openModal = (kind: NonNullable<typeof modal>, id?: string, targetReviewDate?: string) => {
    setEditingId(id ?? null);
    if (kind === 'review') setReviewDate(targetReviewDate ?? today);
    setModal(kind);
  };

  const closeModal = () => {
    setModal(null);
    setEditingId(null);
    setNewTaskProjectId(null);
  };

  const requestDelete = (kind: 'task' | 'goal' | 'project' | 'habit', id: string, title: string) => {
    setDeleteTarget({ kind, id, title });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    updateData(current => {
      if (target.kind === 'task') {
        return {
          ...current,
          tasks: current.tasks.filter(x => x.id !== target.id),
          dailyPlans: current.dailyPlans.map(p => ({ ...p, priorityTaskIds: p.priorityTaskIds.filter(x => x !== target.id) })),
        };
      }
      if (target.kind === 'goal') {
        return {
          ...current,
          goals: current.goals.filter(x => x.id !== target.id),
          projects: current.projects.map(p => (p.goalId === target.id ? { ...p, goalId: null } : p)),
        };
      }
      if (target.kind === 'project') {
        return {
          ...current,
          projects: current.projects.filter(x => x.id !== target.id),
          tasks: current.tasks.map(t => (t.projectId === target.id ? { ...t, projectId: null } : t)),
        };
      }
      if (target.kind === 'lifeArea') {
        return {
          ...current,
          lifeAreas: current.lifeAreas.filter(a => a.id !== target.id),
          goals: current.goals.map(g => (g.lifeAreaId === target.id ? { ...g, lifeAreaId: null } : g)),
        };
      }
      if (target.kind === 'review') {
        return {
          ...current,
          dailyReviews: current.dailyReviews.filter(r => r.date !== target.id),
        };
      }
      return {
        ...current,
        habits: current.habits.filter(x => x.id !== target.id),
        habitLogs: current.habitLogs.filter(x => x.habitId !== target.id),
      };
    });
    setDeleteTarget(null);
    notify(
      target.kind === 'lifeArea'
        ? 'Life area deleted'
        : target.kind === 'review'
          ? 'Review deleted'
          : `${target.kind[0].toUpperCase() + target.kind.slice(1)} deleted`,
    );
  };

  const handleImportSelect = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = inspectBackupText(await file.text());
      setPendingRestore(parsed);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Backup file could not be read');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const confirmRestoreBackup = () => {
    if (!pendingRestore) return;
    const archivedNote =
      pendingRestore.archivedExcessProjects > 0
        ? ` (${pendingRestore.archivedExcessProjects} excess active projects archived to keep focus limit ${MAX_ACTIVE_PROJECTS})`
        : '';
    saveData(pendingRestore.data);
    setPendingRestore(null);
    notify(`Backup restored successfully${archivedNote}`);
  };

  const nav = [
    { id: 'today' as const, label: 'Today', icon: 'today' as const },
    { id: 'goals' as const, label: 'Goals', icon: 'goals' as const, count: activeGoals.length },
    { id: 'projects' as const, label: 'Projects', icon: 'projects' as const, count: activeProjects.length },
    { id: 'habits' as const, label: 'Habits', icon: 'habits' as const },
    { id: 'review' as const, label: 'Review', icon: 'review' as const },
  ];
  const currentTitle = nav.find(n => n.id === view)?.label ?? 'Today';

  if (!authReady) {
    return (
      <div className="auth-boot-shell" aria-busy="true">
        <div className="auth-boot-mark">
          <img className="brand-mark" src="/inpursuit-mark.svg" alt="InPursuit" />
        </div>
      </div>
    );
  }

  if (!user && !localWorkspaceActive) {
    return (
      <Suspense
        fallback={(
          <div className="auth-boot-shell" aria-busy="true">
            <div className="auth-boot-mark">
              <img className="brand-mark" src="/inpursuit-mark.svg" alt="InPursuit" />
            </div>
          </div>
        )}
      >
        <SignInPage
          onContinueLocal={() => {
            writeLocalModeFlag(true);
            setLocalWorkspaceActive(true);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="InPursuit home" onClick={e => { e.preventDefault(); setView('today'); }}>
          <img className="brand-mark" src="/inpursuit-mark.svg" alt="" />
          <img className="brand-wordmark" src="/inpursuit-wordmark.svg" alt="InPursuit" />
        </a>
        <div className="side-label">workspace</div>
        <nav className="side-nav" aria-label="Workspace views">
          {nav.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={cx('nav-item', view === item.id && 'active')}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <span className="nav-item-icon"><Icon name={item.icon} size={17} /></span>
              <span className="nav-item-label">{item.label}</span>
              {item.count !== undefined && <small>{item.count}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="focus-card">
            <div className="focus-icon"><Icon name="zap" size={15} /></div>
            <div>
              <strong>Make it happen.</strong>
              <p>Small actions. Real evidence.</p>
            </div>
          </div>
          <div className="sidebar-actions">
            <button type="button" onClick={() => setShowPlanImport(true)}>
              <Icon name="spark" size={15} /> Import plan
            </button>
            <button type="button" onClick={() => exportData(data)}>
              <Icon name="download" size={15} /> Export backup
            </button>
            <button type="button" onClick={() => importRef.current?.click()}>
              <Icon name="upload" size={15} /> Restore backup
            </button>
          </div>
          <SyncIndicator
            syncStatus={syncStatus}
            lastSyncedAt={lastSyncedAt}
            pendingSync={pendingSync}
            onRetry={() => void retrySync()}
            onOpenSettings={() => setModal('settings')}
          />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand">
            <img className="brand-mark" src="/inpursuit-mark.svg" alt="" />
            <img className="brand-wordmark" src="/inpursuit-wordmark.svg" alt="InPursuit" />
          </div>
          <div className="breadcrumbs">
            workspace <Icon name="chevron-right" size={13} /> <strong>{currentTitle}</strong>
          </div>
          <div className="topbar-right">
            {!user && (
              <button
                type="button"
                className="local-badge-btn"
                onClick={() => setModal('settings')}
                title="Local device storage only — sign in via Settings for cloud sync"
              >
                Local only
              </button>
            )}
            <span className="date-chip">
              <Icon name="calendar" size={14} />
              {prettyDate(today, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <button className="avatar" type="button" onClick={() => setModal('settings')} aria-label="Open settings">
              {avatarPhotoUrl ? (
                <img
                  className="avatar-img"
                  src={avatarPhotoUrl}
                  alt={user?.displayName ?? user?.email ?? 'Account profile'}
                  referrerPolicy="no-referrer"
                  onError={() => setFailedPhotoUrl(avatarPhotoUrl)}
                />
              ) : (
                <User size={16} />
              )}
            </button>
          </div>
        </header>

        <input ref={importRef} type="file" accept="application/json" hidden onChange={e => void handleImportSelect(e.target.files?.[0])} />
        <div className="content-wrap">
          {user && incompatibleSchema !== null && (
            <div className="schema-recovery-banner" role="alert">
              <div>
                <strong>Cloud workspace locked (schema v{incompatibleSchema})</strong>
                <p>
                  This account has already been upgraded past v3. Editing and cloud writes are disabled to protect your data—export a recovery backup to inspect or preserve everything.
                </p>
              </div>
              <button
                type="button"
                className="sync-retry-btn"
                onClick={() => {
                  void exportRecoveryBackup()
                    .then(() => notify('Recovery backup exported'))
                    .catch(err => notify(err instanceof Error ? err.message : 'Recovery export failed'));
                }}
              >
                Export recovery backup
              </button>
            </div>
          )}

          {user && incompatibleSchema === null && (syncStatus === 'error' || (syncStatus === 'offline' && pendingSync)) && (
            <div className="mobile-sync-banner" role="status">
              <span>
                {syncStatus === 'error'
                  ? 'Cloud sync failed · changes saved on this device'
                  : 'Offline · changes queued for upload'}
              </span>
              <button type="button" className="sync-retry-btn" onClick={() => void retrySync()}>
                Retry
              </button>
            </div>
          )}

          {view === 'today' && (
            <TodayView
              data={data}
              today={today}
              todayTasks={todayTasks}
              overdueTasks={overdueTasks}
              activeHabits={activeHabits}
              completedHabitIds={completedHabitIds}
              skippedHabitIds={skippedHabitIds}
              doneHabits={doneHabits}
              scheduledHabitsCount={scheduledNonSkippedHabits}
              priorityTasks={priorityTasks}
              priorityIds={todayPlan.priorityTaskIds}
              showOnboarding={showOnboarding}
              onDismissOnboarding={dismissOnboarding}
              onApplyTemplate={applyStarterTemplate}
              onToggleHabit={toggleHabit}
              onDecrementHabit={decrementHabitToday}
              onToggleSkipHabit={toggleSkipHabit}
              onToggleTask={toggleTask}
              onAdjustTaskQuantity={adjustTaskQuantity}
              onRestoreTask={restoreTask}
              onMoveToToday={moveTaskToToday}
              onPriorities={setPriorities}
              onAddTask={() => openModal('task')}
              onEditTask={id => openModal('task', id)}
              onReview={() => openModal('review', undefined, today)}
              onOpenGoals={() => setView('goals')}
              onEditGoal={id => openModal('goal', id)}
              onAddGoal={() => openModal('goal')}
              onOpenImportPlan={() => setShowPlanImport(true)}
              lastImportRecord={activeLastImport}
              onUndoImport={handleUndoPlanImport}
            />
          )}

          <Suspense fallback={null}>
            {view === 'goals' && (
              <GoalsView
                goals={data.goals}
                lifeAreas={data.lifeAreas}
                projects={data.projects}
                tasks={data.tasks}
                onAdd={() => openModal('goal')}
                onEdit={id => openModal('goal', id)}
                onDelete={(id, title) => requestDelete('goal', id, title)}
                onManageAreas={() => setModal('areas')}
                onOpenImportPlan={() => setShowPlanImport(true)}
                onToggleCriterion={toggleGoalCriterion}
              />
            )}
            {view === 'projects' && (
              <ProjectsView
                projects={data.projects}
                goals={data.goals}
                tasks={data.tasks}
                onAdd={() => openModal('project')}
                onEdit={id => openModal('project', id)}
                onDelete={(id, title) => requestDelete('project', id, title)}
                onAddTask={id => {
                  setNewTaskProjectId(id);
                  openModal('task');
                }}
                onToggleTask={toggleTask}
                onAdjustTaskQuantity={adjustTaskQuantity}
                onStartPhase={startPhase}
                onEditTask={id => openModal('task', id)}
              />
            )}
            {view === 'habits' && (
              <HabitsView
                habits={data.habits}
                logs={data.habitLogs}
                completedHabitIds={completedHabitIds}
                scheduledActiveCount={activeHabits.length}
                today={today}
                onAdd={() => openModal('habit')}
                onEdit={id => openModal('habit', id)}
                onDelete={(id, title) => requestDelete('habit', id, title)}
                onToggle={cycleHabitMatrixDay}
              />
            )}
            {view === 'review' && (
              <ReviewView
                data={data}
                today={today}
                onWrite={(targetDate?: string) => openModal('review', undefined, targetDate ?? today)}
                onDeleteReview={date => setDeleteTarget({ kind: 'review', id: date, title: prettyDate(date) })}
              />
            )}
          </Suspense>
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {nav.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={cx('mobile-nav-item', view === item.id && 'active')}
            aria-current={view === item.id ? 'page' : undefined}
          >
            <span className="mobile-nav-icon"><Icon name={item.icon} size={19} /></span>
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <Suspense fallback={null}>
        {modal && modal !== 'settings' && modal !== 'areas' && (
          <EditorModal
            key={`${modal}:${editingId ?? 'new'}:${newTaskProjectId ?? ''}`}
            kind={modal}
            id={editingId}
            reviewDate={reviewDate}
            today={today}
            data={data}
            activeProjectCount={activeProjects.length}
            newTaskProjectId={newTaskProjectId}
            onClose={closeModal}
            onCreateLifeArea={name => {
              const trimmed = name.trim();
              if (!trimmed) return '';
              const existing = data.lifeAreas.find(a => a.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
              if (existing) return existing.id;
              const createdId = uid();
              updateData(current => ({
                ...current,
                lifeAreas: [...current.lifeAreas, { id: createdId, name: trimmed, description: '', createdAt: new Date().toISOString() }],
              }));
              return createdId;
            }}
            onDeleteItem={(kind, id, title) => {
              closeModal();
              requestDelete(kind, id, title);
            }}
            onDeleteReview={date => {
              closeModal();
              setDeleteTarget({ kind: 'review', id: date, title: prettyDate(date) });
            }}
            onSave={(kind, value) => {
              if (kind === 'project') {
                const project = value as Project;
                if (project.status === 'active' && !canActivateProject(data.projects, project.id)) {
                  notify(`Active project limit reached (${MAX_ACTIVE_PROJECTS}). Complete or archive a project first.`);
                  return;
                }
              }
              updateData(current => {
                if (kind === 'task') {
                  const item = value as Task;
                  return {
                    ...current,
                    tasks: current.tasks.some(x => x.id === item.id) ? current.tasks.map(x => (x.id === item.id ? item : x)) : [...current.tasks, item],
                  };
                }
                if (kind === 'goal') {
                  const item = value as Goal;
                  return {
                    ...current,
                    goals: current.goals.some(x => x.id === item.id) ? current.goals.map(x => (x.id === item.id ? item : x)) : [...current.goals, item],
                  };
                }
                if (kind === 'project') {
                  const item = value as Project;
                  return {
                    ...current,
                    projects: current.projects.some(x => x.id === item.id)
                      ? current.projects.map(x => (x.id === item.id ? item : x))
                      : [...current.projects, item],
                  };
                }
                if (kind === 'habit') {
                  const item = value as Habit;
                  return {
                    ...current,
                    habits: current.habits.some(x => x.id === item.id) ? current.habits.map(x => (x.id === item.id ? item : x)) : [...current.habits, item],
                  };
                }
                const item = value as DailyReview;
                return { ...current, dailyReviews: [...current.dailyReviews.filter(x => x.date !== item.date), item] };
              });
              closeModal();
              notify('Saved');
            }}
          />
        )}

        {modal === 'areas' && (
          <LifeAreasModal
            lifeAreas={data.lifeAreas}
            goals={data.goals}
            onClose={closeModal}
            onAddArea={(name, description) => {
              updateData(current => ({
                ...current,
                lifeAreas: [...current.lifeAreas, { id: uid(), name, description, createdAt: new Date().toISOString() }],
              }));
              notify('Life area created');
            }}
            onUpdateArea={(areaId, name, description) => {
              updateData(current => ({
                ...current,
                lifeAreas: current.lifeAreas.map(a => (a.id === areaId ? { ...a, name, description } : a)),
              }));
              notify('Life area updated');
            }}
            onRequestDeleteArea={(area: LifeArea, linkedGoals: number) => {
              setDeleteTarget({ kind: 'lifeArea', id: area.id, title: area.name, linkedGoals });
            }}
          />
        )}

        {modal === 'settings' && (
          <SettingsModal
            onClose={closeModal}
            onExportBackup={() => exportData(data)}
            onRestoreBackup={() => importRef.current?.click()}
            onShowOnboarding={() => {
              writeOnboardingDismissed(onboardingScope, false);
              setOnboardingDismissed(false);
              setOnboardingPinned(true);
              setView('today');
            }}
            onOpenSignIn={() => {
              writeLocalModeFlag(false);
              setLocalWorkspaceActive(false);
            }}
          />
        )}

        {deleteTarget && (
          <ConfirmModal
            eyebrow={deleteTarget.kind === 'lifeArea' ? 'delete life area' : `delete ${deleteTarget.kind}`}
            title={`Delete "${deleteTarget.title}"?`}
            body={
              deleteTarget.kind === 'goal'
                ? 'Linked projects will be unlinked (kept intact). This cannot be undone.'
                : deleteTarget.kind === 'project'
                  ? 'Linked tasks will become personal/unassigned tasks. This cannot be undone.'
                  : deleteTarget.kind === 'habit'
                    ? 'All historical completion logs for this habit will also be removed.'
                    : deleteTarget.kind === 'lifeArea'
                      ? `${deleteTarget.linkedGoals} linked goal(s) will remain active as Unassigned. This cannot be undone.`
                      : deleteTarget.kind === 'review'
                        ? 'This daily reflection entry will be permanently deleted.'
                        : 'This task will be removed from your workspace and any daily plans.'
            }
            confirmLabel={
              deleteTarget.kind === 'lifeArea' ? 'Delete area' : `Delete ${deleteTarget.kind}`
            }
            tone="danger"
            onConfirm={confirmDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}

        {pendingRestore && (
          <ConfirmModal
            eyebrow="restore backup"
            title="Replace current workspace with backup?"
            body={
              pendingRestore.exportedAt
                ? `Backup exported on ${new Date(pendingRestore.exportedAt).toLocaleString()}. Continuing will replace your current workspace.`
                : 'Continuing will replace your current workspace with this backup file.'
            }
            details={[
              `${pendingRestore.summary.goals} goals · ${pendingRestore.summary.projects} projects · ${pendingRestore.summary.tasks} tasks`,
              `${pendingRestore.summary.habits} habits · ${pendingRestore.summary.habitLogs} logs · ${pendingRestore.summary.dailyReviews} reviews`,
              ...(pendingRestore.rekeyedDuplicateIds > 0
                ? [`${pendingRestore.rekeyedDuplicateIds} colliding record ID(s) will be reassigned fresh IDs so nothing is lost.`]
                : []),
              ...(pendingRestore.archivedExcessProjects > 0
                ? [`${pendingRestore.archivedExcessProjects} excess active project(s) will be archived to keep the ${MAX_ACTIVE_PROJECTS}-project focus limit.`]
                : []),
            ]}
            confirmLabel="Restore backup"
            tone="solid"
            onConfirm={confirmRestoreBackup}
            onCancel={() => setPendingRestore(null)}
          />
        )}

        {conflict && <ConflictModal conflict={conflict} onResolve={resolveConflict} />}

        {showPlanImport && (
          <PlanImportModal
            today={today}
            user={user}
            lastImportRecord={activeLastImport}
            onClose={() => setShowPlanImport(false)}
            onOpenSettings={() => {
              setShowPlanImport(false);
              setModal('settings');
            }}
            onApproveImport={handleApprovePlanImport}
            onUndoLastImport={handleUndoPlanImport}
          />
        )}
      </Suspense>

      {toast && <div className="toast" role="status"><CheckCircle2 size={16} />{toast}</div>}
      {storageNotice && <div className="storage-warning" role="status">{storageNotice}</div>}
    </div>
  );
}
