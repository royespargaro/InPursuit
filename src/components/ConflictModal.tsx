import { useEffect, useRef, useState } from 'react';
import type { ConflictState } from '../context/HabitContext';
import { useModalFocus } from '../hooks/useModalFocus';
import { MAX_ACTIVE_PROJECTS } from '../utils/projectLimits';
import { Sparkles } from './Icon';

interface ConflictModalProps {
  conflict: ConflictState;
  onResolve: (
    strategy: 'keep-cloud' | 'use-local' | 'merge',
    selectedActiveProjectIds?: readonly string[],
  ) => Promise<void>;
}

export function ConflictModal({ conflict, onResolve }: ConflictModalProps) {
  const candidates = conflict.activeProjectCandidates ?? [];
  const hasProjectPicker = candidates.length > MAX_ACTIVE_PROJECTS;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(() =>
    candidates.slice(0, MAX_ACTIVE_PROJECTS).map(p => p.id),
  );

  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(modalRef);

  useEffect(() => {
    setSelectedProjectIds((conflict.activeProjectCandidates ?? []).slice(0, MAX_ACTIVE_PROJECTS).map(p => p.id));
    setError('');
  }, [conflict]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds(current => {
      if (current.includes(projectId)) {
        return current.filter(id => id !== projectId);
      }
      if (current.length >= MAX_ACTIVE_PROJECTS) {
        return current;
      }
      return [...current, projectId];
    });
  };

  const pick = async (strategy: 'keep-cloud' | 'use-local' | 'merge') => {
    setBusy(true);
    setError('');
    try {
      const selected = hasProjectPicker && strategy === 'merge' ? selectedProjectIds : undefined;
      await onResolve(strategy, selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve conflict right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const isOfflineDivergence = conflict.reason === 'offline-divergence';
  const isActiveProjectLimit = conflict.reason === 'active-project-limit';

  return (
    <div className="modal-backdrop">
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal conflict-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              {isActiveProjectLimit ? 'active project limit reached' : 'sync conflict detected'}
            </div>
            <h2 id="conflict-title">
              {isActiveProjectLimit
                ? `Choose up to ${MAX_ACTIVE_PROJECTS} active projects`
                : 'Choose how to combine your workspaces'}
            </h2>
          </div>
          <span className="focus-icon">
            <Sparkles size={15} />
          </span>
        </div>

        <p className="confirm-body">
          {isActiveProjectLimit
            ? `Combining your device and cloud changes gives ${candidates.length} active projects. Pick up to ${MAX_ACTIVE_PROJECTS} to stay active; the rest will be safely archived with all tasks preserved.`
            : isOfflineDivergence
              ? 'This device has unsynced offline edits, and your cloud account also received newer changes. Nothing has been overwritten yet.'
              : 'You created local changes before signing in, and your cloud account already has saved data. Nothing has been overwritten yet.'}
        </p>

        <div className="conflict-grid">
          <div className="conflict-card">
            <div className="eyebrow">this device</div>
            <ul>
              <li>{conflict.localSummary.goals} goals</li>
              <li>{conflict.localSummary.projects} projects</li>
              <li>{conflict.localSummary.tasks} tasks</li>
              <li>{conflict.localSummary.habits} habits · {conflict.localSummary.habitLogs} logs</li>
            </ul>
          </div>
          <div className="conflict-card">
            <div className="eyebrow">cloud account</div>
            <ul>
              <li>{conflict.cloudSummary.goals} goals</li>
              <li>{conflict.cloudSummary.projects} projects</li>
              <li>{conflict.cloudSummary.tasks} tasks</li>
              <li>{conflict.cloudSummary.habits} habits · {conflict.cloudSummary.habitLogs} logs</li>
            </ul>
          </div>
        </div>

        {hasProjectPicker && (
          <div className="conflict-project-picker">
            <div className="conflict-picker-head">
              <div className="eyebrow">active projects to keep</div>
              <span className="active-project-count">
                {selectedProjectIds.length} / {MAX_ACTIVE_PROJECTS} selected
              </span>
            </div>
            <div className="conflict-project-list">
              {candidates.map(project => {
                const checked = selectedProjectIds.includes(project.id);
                const atLimit = !checked && selectedProjectIds.length >= MAX_ACTIVE_PROJECTS;
                return (
                  <label key={project.id} className={`conflict-project-option ${checked ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy || atLimit}
                      onChange={() => toggleProject(project.id)}
                    />
                    <span>{project.title}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}

        <div className="conflict-actions">
          <button
            type="button"
            className="ui-btn ui-btn-solid"
            disabled={busy || (hasProjectPicker && selectedProjectIds.length === 0)}
            onClick={() => void pick('merge')}
          >
            {hasProjectPicker ? 'Merge with selected' : 'Merge both (Recommended)'}
          </button>
          <button type="button" className="ui-btn ui-btn-outline" disabled={busy} onClick={() => void pick('keep-cloud')}>
            Keep cloud data
          </button>
          <button type="button" className="ui-btn ui-btn-danger" disabled={busy} onClick={() => void pick('use-local')}>
            Replace cloud with local
          </button>
        </div>
      </div>
    </div>
  );
}
