import { useEffect, useRef, useState } from 'react';
import type { ConflictState } from '../context/HabitContext';
import { useLanguage } from '../context/LanguageContext';
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
  const { l } = useLanguage();
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
      setError(err instanceof Error ? err.message : l('Could not resolve conflict right now. Please try again.', 'Belum bisa menyelesaikan konflik saat ini. Silakan coba lagi.'));
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
              {isActiveProjectLimit
                ? l('active project limit reached', 'batas proyek aktif tercapai')
                : l('sync conflict detected', 'konflik sinkronisasi terdeteksi')}
            </div>
            <h2 id="conflict-title">
              {isActiveProjectLimit
                ? l(`Choose up to ${MAX_ACTIVE_PROJECTS} active projects`, `Pilih maksimal ${MAX_ACTIVE_PROJECTS} proyek aktif`)
                : l('Choose how to combine your workspaces', 'Pilih cara menggabungkan ruang kerja Anda')}
            </h2>
          </div>
          <span className="focus-icon">
            <Sparkles size={15} />
          </span>
        </div>

        <p className="confirm-body">
          {isActiveProjectLimit
            ? l(
                `Combining your device and cloud changes gives ${candidates.length} active projects. Pick up to ${MAX_ACTIVE_PROJECTS} to stay active; the rest will be safely archived with all tasks preserved.`,
                `Menggabungkan perubahan perangkat dan cloud menghasilkan ${candidates.length} proyek aktif. Pilih maksimal ${MAX_ACTIVE_PROJECTS} agar tetap aktif; sisanya akan diarsipkan dengan aman tanpa kehilangan tugas.`,
              )
            : isOfflineDivergence
              ? l(
                  'This device has unsynced offline edits, and your cloud account also received newer changes. Nothing has been overwritten yet.',
                  'Perangkat ini memiliki perubahan luring yang belum tersinkron, sementara akun cloud juga menerima perubahan baru. Belum ada data yang tertimpa.',
                )
              : l(
                  'You created local changes before signing in, and your cloud account already has saved data. Nothing has been overwritten yet.',
                  'Anda membuat perubahan lokal sebelum masuk, sementara akun cloud sudah memiliki data tersimpan. Belum ada data yang tertimpa.',
                )}
        </p>

        <div className="conflict-grid">
          <div className="conflict-card">
            <div className="eyebrow">{l('this device', 'perangkat ini')}</div>
            <ul>
              <li>{conflict.localSummary.goals} {l('goals', 'tujuan')}</li>
              <li>{conflict.localSummary.projects} {l('projects', 'proyek')}</li>
              <li>{conflict.localSummary.tasks} {l('tasks', 'tugas')}</li>
              <li>{conflict.localSummary.habits} {l('habits', 'kebiasaan')} · {conflict.localSummary.habitLogs} {l('logs', 'catatan')}</li>
            </ul>
          </div>
          <div className="conflict-card">
            <div className="eyebrow">{l('cloud account', 'akun cloud')}</div>
            <ul>
              <li>{conflict.cloudSummary.goals} {l('goals', 'tujuan')}</li>
              <li>{conflict.cloudSummary.projects} {l('projects', 'proyek')}</li>
              <li>{conflict.cloudSummary.tasks} {l('tasks', 'tugas')}</li>
              <li>{conflict.cloudSummary.habits} {l('habits', 'kebiasaan')} · {conflict.cloudSummary.habitLogs} {l('logs', 'catatan')}</li>
            </ul>
          </div>
        </div>

        {hasProjectPicker && (
          <div className="conflict-project-picker">
            <div className="conflict-picker-head">
              <div className="eyebrow">{l('active projects to keep', 'proyek aktif yang dipertahankan')}</div>
              <span className="active-project-count">
                {selectedProjectIds.length} / {MAX_ACTIVE_PROJECTS} {l('selected', 'dipilih')}
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
            {hasProjectPicker ? l('Merge with selected', 'Gabungkan dengan pilihan') : l('Merge both (Recommended)', 'Gabungkan keduanya (Disarankan)')}
          </button>
          <button type="button" className="ui-btn ui-btn-outline" disabled={busy} onClick={() => void pick('keep-cloud')}>
            {l('Keep cloud data', 'Simpan data cloud')}
          </button>
          <button type="button" className="ui-btn ui-btn-danger" disabled={busy} onClick={() => void pick('use-local')}>
            {l('Replace cloud with local', 'Ganti cloud dengan lokal')}
          </button>
        </div>
      </div>
    </div>
  );
}
