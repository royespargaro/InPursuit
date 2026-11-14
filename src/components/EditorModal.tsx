import { useState, type FormEvent } from 'react';
import type { AppData, DailyReview, Goal, Habit, Priority, Project, Status, Task } from '../types';
import { createId } from '../services/appStore';
import { canActivateProject, MAX_ACTIVE_PROJECTS } from '../utils/projectLimits';
import { Check } from './Icon';
import { Button, Field, Modal } from './ui';

interface EditorModalProps {
  kind: 'task' | 'goal' | 'project' | 'habit' | 'review';
  id: string | null;
  reviewDate: string;
  today: string;
  data: AppData;
  activeProjectCount: number;
  newTaskProjectId: string | null;
  onClose: () => void;
  onCreateLifeArea: (name: string) => string;
  onDeleteItem: (kind: 'task' | 'goal' | 'project' | 'habit', id: string, title: string) => void;
  onDeleteReview?: (date: string) => void;
  onSave: (kind: 'task' | 'goal' | 'project' | 'habit' | 'review', value: Task | Goal | Project | Habit | DailyReview) => void;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function EditorModal({
  kind,
  id,
  reviewDate,
  today,
  data,
  activeProjectCount,
  newTaskProjectId,
  onClose,
  onCreateLifeArea,
  onDeleteItem,
  onDeleteReview,
  onSave,
}: EditorModalProps) {
  const existingTask = data.tasks.find(x => x.id === id);
  const existingGoal = data.goals.find(x => x.id === id);
  const existingProject = data.projects.find(x => x.id === id);
  const existingHabit = data.habits.find(x => x.id === id);

  const initialReviewDate = reviewDate && reviewDate <= today ? reviewDate : today;
  const [selectedReviewDate, setSelectedReviewDate] = useState(initialReviewDate);
  const existingReview = data.dailyReviews.find(x => x.date === selectedReviewDate);

  // Only new tasks default to today; new goals and projects have optional empty deadlines unless edited
  const initialDueDate =
    kind === 'task'
      ? (existingTask ? existingTask.dueDate : today)
      : kind === 'project'
        ? (existingProject ? existingProject.dueDate : '')
        : (existingGoal ? existingGoal.targetDate : '');

  const [title, setTitle] = useState(existingTask?.title ?? existingGoal?.title ?? existingProject?.title ?? existingHabit?.name ?? '');
  const [description, setDescription] = useState(existingProject?.description ?? existingGoal?.outcome ?? '');
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [priority, setPriority] = useState<Priority>(existingTask?.priority ?? 'medium');
  const [projectId, setProjectId] = useState(existingTask?.projectId ?? newTaskProjectId ?? '');
  const [goalId, setGoalId] = useState(existingProject?.goalId ?? '');
  const [lifeAreaId, setLifeAreaId] = useState(existingGoal?.lifeAreaId ?? '');
  const [newAreaName, setNewAreaName] = useState('');
  const [addingArea, setAddingArea] = useState(false);
  const [status, setStatus] = useState(existingTask?.status ?? 'todo');
  const [goalStatus, setGoalStatus] = useState<Status>(existingGoal?.status ?? 'active');
  const [projectStatus, setProjectStatus] = useState<Project['status']>(existingProject?.status ?? 'active');
  const [formError, setFormError] = useState('');
  const [frequency, setFrequency] = useState<Habit['frequency']>(existingHabit?.frequency ?? 'daily');
  const [active, setActive] = useState(existingHabit?.active ?? true);
  const [wins, setWins] = useState(existingReview?.wins ?? '');
  const [blockers, setBlockers] = useState(existingReview?.blockers ?? '');
  const [notes, setNotes] = useState(existingReview?.notes ?? '');
  const [energy, setEnergy] = useState(existingReview?.energy ?? 3);

  const handleReviewDateChange = (nextDate: string) => {
    setSelectedReviewDate(nextDate);
    const match = data.dailyReviews.find(r => r.date === nextDate);
    setWins(match?.wins ?? '');
    setBlockers(match?.blockers ?? '');
    setNotes(match?.notes ?? '');
    setEnergy(match?.energy ?? 3);
    setFormError(nextDate > today ? 'Future-dated reviews are not allowed. Choose today or an earlier date.' : '');
  };

  // Preserve non-active currently assigned parents in dropdowns so editing doesn't erase relationships
  const selectableProjects = data.projects.filter(p => p.status === 'active' || p.id === projectId);
  const selectableGoals = data.goals.filter(g => g.status === 'active' || g.id === goalId);

  const isReview = kind === 'review';
  const heading = isReview ? 'Daily review' : `${id ? 'Edit' : 'Create'} ${kind}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const now = new Date().toISOString();

    if (kind === 'review') {
      if (!DATE_RE.test(selectedReviewDate)) {
        setFormError('Please select a valid review date.');
        return;
      }
      if (selectedReviewDate > today) {
        setFormError('Future-dated reviews cannot be saved. Select today or an earlier date.');
        return;
      }
      if (!wins.trim() && !blockers.trim() && !notes.trim()) {
        setFormError('Write at least one win, blocker, or adjustment before saving your review.');
        return;
      }
      onSave(kind, {
        date: selectedReviewDate,
        wins: wins.trim(),
        blockers: blockers.trim(),
        notes: notes.trim(),
        energy,
      });
      return;
    }

    if (!title.trim()) {
      setFormError('Title cannot be empty.');
      return;
    }

    if (kind === 'project' && projectStatus === 'active' && !canActivateProject(data.projects, existingProject?.id)) {
      setFormError(`The ${MAX_ACTIVE_PROJECTS}-project focus limit is reached. Complete or archive a project first.`);
      return;
    }

    if (kind === 'task') {
      onSave(kind, {
        id: existingTask?.id ?? createId(),
        title: title.trim(),
        projectId: projectId || null,
        dueDate,
        priority,
        status,
        createdAt: existingTask?.createdAt ?? now,
        completedAt: status === 'done' ? existingTask?.completedAt ?? now : null,
      });
    }
    if (kind === 'goal') {
      onSave(kind, {
        id: existingGoal?.id ?? createId(),
        lifeAreaId: lifeAreaId || null,
        title: title.trim(),
        outcome: description.trim(),
        targetDate: dueDate,
        status: goalStatus,
        createdAt: existingGoal?.createdAt ?? now,
      });
    }
    if (kind === 'project') {
      onSave(kind, {
        id: existingProject?.id ?? createId(),
        title: title.trim(),
        description: description.trim(),
        dueDate,
        goalId: goalId || null,
        status: projectStatus,
        createdAt: existingProject?.createdAt ?? now,
      });
    }
    if (kind === 'habit') {
      onSave(kind, {
        id: existingHabit?.id ?? createId(),
        name: title.trim(),
        frequency,
        active,
        createdAt: existingHabit?.createdAt ?? now,
      });
    }
  };

  return (
    <Modal title={heading} onClose={onClose}>
      <form className="editor-form" onSubmit={submit}>
        {kind !== 'review' && (
          <Field label={kind === 'habit' ? 'Habit name' : 'Title'}>
            <input
              autoFocus
              required
              maxLength={100}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={
                kind === 'task'
                  ? 'What needs to get done?'
                  : kind === 'goal'
                    ? 'What outcome are you aiming for?'
                    : kind === 'project'
                      ? 'Name this project'
                      : 'e.g. Read for 20 minutes'
              }
            />
          </Field>
        )}

        {(kind === 'goal' || kind === 'project') && (
          <Field label={kind === 'goal' ? 'What does success look like?' : 'Description'}>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Make the outcome concrete..."
            />
          </Field>
        )}

        {kind === 'goal' && (
          <>
            <Field label="Life area">
              <div className="inline-select-row">
                <select value={lifeAreaId} onChange={e => setLifeAreaId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {data.lifeAreas.map(area => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
                <button type="button" className="text-action" onClick={() => setAddingArea(v => !v)}>
                  {addingArea ? 'Cancel' : '+ Area'}
                </button>
              </div>
            </Field>
            {addingArea && (
              <div className="inline-create-area">
                <input
                  type="text"
                  maxLength={60}
                  value={newAreaName}
                  placeholder="New life area name"
                  onChange={e => setNewAreaName(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const createdId = onCreateLifeArea(newAreaName);
                    if (createdId) {
                      setLifeAreaId(createdId);
                      setNewAreaName('');
                      setAddingArea(false);
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            )}
            <Field label="Status">
              <select value={goalStatus} onChange={e => setGoalStatus(e.target.value as Status)}>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </>
        )}

        {(kind === 'task' || kind === 'goal' || kind === 'project') && (
          <Field label={kind === 'goal' ? 'Target date (optional)' : 'Due date (optional)'}>
            <div className="inline-select-row">
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              {dueDate && (
                <button type="button" className="text-action" onClick={() => setDueDate('')}>
                  Clear
                </button>
              )}
            </div>
          </Field>
        )}

        {kind === 'task' && (
          <>
            <Field label="Project">
              <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">Personal / unassigned</option>
                {selectableProjects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.status === 'active' ? p.title : `${p.title} (${p.status})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={e => setPriority(e.target.value as Priority)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={e => setStatus(e.target.value as typeof status)}>
                <option value="todo">To do</option>
                <option value="done">Completed</option>
                <option value="skipped">Skipped</option>
              </select>
            </Field>
          </>
        )}

        {kind === 'project' && (
          <>
            <Field label="Connect to a goal">
              <select value={goalId} onChange={e => setGoalId(e.target.value)}>
                <option value="">No linked goal</option>
                {selectableGoals.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.status === 'active' ? g.title : `${g.title} (${g.status})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={projectStatus}
                onChange={e => {
                  setProjectStatus(e.target.value as Project['status']);
                  setFormError('');
                }}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            {activeProjectCount >= MAX_ACTIVE_PROJECTS && projectStatus === 'active' && existingProject?.status !== 'active' && (
              <p className="form-error" role="status">
                {MAX_ACTIVE_PROJECTS} active projects max. Complete or archive one to activate this project.
              </p>
            )}
          </>
        )}

        {kind === 'habit' && (
          <>
            <Field label="Frequency">
              <select value={frequency} onChange={e => setFrequency(e.target.value as Habit['frequency'])}>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekends">Weekends</option>
              </select>
            </Field>
            <label className="toggle-field">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active habit
            </label>
          </>
        )}

        {kind === 'review' && (
          <>
            <div className="review-form-intro">
              <Field label="Review date">
                <input
                  type="date"
                  max={today}
                  value={selectedReviewDate}
                  onChange={e => handleReviewDateChange(e.target.value)}
                />
              </Field>
              <p>Be honest, not impressive. This is information, not a performance review.</p>
            </div>
            <Field label="What went well?">
              <textarea
                rows={3}
                value={wins}
                onChange={e => setWins(e.target.value)}
                placeholder="What did you actually move forward?"
              />
            </Field>
            <Field label="What got in the way?">
              <textarea
                rows={3}
                value={blockers}
                onChange={e => setBlockers(e.target.value)}
                placeholder="Where did reality differ from the plan?"
              />
            </Field>
            <Field label="What will you adjust tomorrow?">
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="One concrete adjustment..."
              />
            </Field>
            <Field label={`Energy level · ${energy}/5`}>
              <input type="range" min="1" max="5" value={energy} onChange={e => setEnergy(Number(e.target.value))} />
            </Field>
          </>
        )}

        {formError && <p className="form-error" role="alert">{formError}</p>}

        <div className="modal-actions">
          {id && kind !== 'review' && (
            <Button
              variant="danger"
              className="modal-delete-left"
              onClick={() => onDeleteItem(kind, id, title || 'this item')}
            >
              Delete
            </Button>
          )}
          {kind === 'review' && existingReview && onDeleteReview && (
            <Button
              variant="danger"
              className="modal-delete-left"
              onClick={() => onDeleteReview(selectedReviewDate)}
            >
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="solid" type="submit">
            <Check size={15} /> Save {kind === 'review' ? 'review' : kind}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
