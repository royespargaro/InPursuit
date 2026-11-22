import { useState, type FormEvent } from 'react';
import { useLanguage } from '../context/LanguageContext';
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
  const { l } = useLanguage();
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
  const [targetQuantity, setTargetQuantity] = useState<string>(
    typeof existingTask?.targetQuantity === 'number' && existingTask.targetQuantity > 0
      ? String(existingTask.targetQuantity)
      : '',
  );
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
  const [minimumVersion, setMinimumVersion] = useState(existingHabit?.minimumVersion ?? '');
  const [active, setActive] = useState(existingHabit?.active ?? true);
  const [wins, setWins] = useState(existingReview?.wins ?? '');
  const [blockers, setBlockers] = useState(existingReview?.blockers ?? '');
  const [notes, setNotes] = useState(existingReview?.notes ?? '');
  const [energy, setEnergy] = useState(existingReview?.energy ?? 3);

  const kindLabel =
    kind === 'task'
      ? l('task', 'tugas')
      : kind === 'goal'
        ? l('goal', 'tujuan')
        : kind === 'project'
          ? l('project', 'proyek')
          : kind === 'habit'
            ? l('habit', 'kebiasaan')
            : l('review', 'evaluasi');

  const statusText = (value: string) =>
    value === 'active'
      ? l('active', 'aktif')
      : value === 'planned'
        ? l('planned', 'direncanakan')
        : value === 'completed'
          ? l('completed', 'selesai')
          : value === 'archived'
            ? l('archived', 'diarsipkan')
            : value;

  const handleReviewDateChange = (nextDate: string) => {
    setSelectedReviewDate(nextDate);
    const match = data.dailyReviews.find(r => r.date === nextDate);
    setWins(match?.wins ?? '');
    setBlockers(match?.blockers ?? '');
    setNotes(match?.notes ?? '');
    setEnergy(match?.energy ?? 3);
    setFormError(
      nextDate > today
        ? l('Future-dated reviews are not allowed. Choose today or an earlier date.', 'Evaluasi bertanggal masa depan tidak diperbolehkan. Pilih hari ini atau tanggal sebelumnya.')
        : '',
    );
  };

  // Preserve non-active currently assigned parents in dropdowns so editing doesn't erase relationships
  const selectableProjects = data.projects.filter(p => p.status === 'active' || p.id === projectId);
  const selectableGoals = data.goals.filter(g => g.status === 'active' || g.id === goalId);

  const isReview = kind === 'review';
  const heading = isReview ? l('Daily review', 'Evaluasi harian') : `${id ? l('Edit', 'Ubah') : l('Create', 'Buat')} ${kindLabel}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const now = new Date().toISOString();

    if (kind === 'review') {
      if (!DATE_RE.test(selectedReviewDate)) {
        setFormError(l('Please select a valid review date.', 'Pilih tanggal evaluasi yang valid.'));
        return;
      }
      if (selectedReviewDate > today) {
        setFormError(l('Future-dated reviews cannot be saved. Select today or an earlier date.', 'Evaluasi bertanggal masa depan tidak dapat disimpan. Pilih hari ini atau tanggal sebelumnya.'));
        return;
      }
      if (!wins.trim() && !blockers.trim() && !notes.trim()) {
        setFormError(l('Write at least one win, blocker, or adjustment before saving your review.', 'Tulis minimal satu capaian, hambatan, atau penyesuaian sebelum menyimpan evaluasi.'));
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
      setFormError(l('Title cannot be empty.', 'Judul tidak boleh kosong.'));
      return;
    }

    if (kind === 'project' && projectStatus === 'active' && !canActivateProject(data.projects, existingProject?.id)) {
      setFormError(
        l(
          `The ${MAX_ACTIVE_PROJECTS}-project focus limit is reached. Complete or archive a project first.`,
          `Batas fokus ${MAX_ACTIVE_PROJECTS} proyek aktif telah tercapai. Selesaikan atau arsipkan satu proyek terlebih dahulu.`,
        ),
      );
      return;
    }

    if (kind === 'task') {
      const parsedQty = Number(targetQuantity);
      const nextTargetQty =
        targetQuantity.trim() !== '' && Number.isFinite(parsedQty) && parsedQty > 0
          ? Math.max(1, Math.round(parsedQty))
          : undefined;
      const nextTask: Task = {
        ...existingTask,
        id: existingTask?.id ?? createId(),
        title: title.trim(),
        projectId: projectId || null,
        dueDate,
        priority,
        status,
        createdAt: existingTask?.createdAt ?? now,
        completedAt: status === 'done' ? existingTask?.completedAt ?? now : null,
      };
      if (nextTargetQty !== undefined) {
        nextTask.targetQuantity = nextTargetQty;
      } else {
        delete nextTask.targetQuantity;
        delete nextTask.completedQuantity;
      }
      onSave(kind, nextTask);
    }
    if (kind === 'goal') {
      onSave(kind, {
        ...existingGoal,
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
        ...existingProject,
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
      const nextMinimum = minimumVersion.trim();
      const nextHabit = {
        ...existingHabit,
        id: existingHabit?.id ?? createId(),
        name: title.trim(),
        frequency,
        active,
        createdAt: existingHabit?.createdAt ?? now,
      };
      if (nextMinimum) {
        nextHabit.minimumVersion = nextMinimum;
      } else {
        delete nextHabit.minimumVersion;
      }
      onSave(kind, nextHabit);
    }
  };

  return (
    <Modal title={heading} onClose={onClose}>
      <form className="editor-form" onSubmit={submit}>
        {kind !== 'review' && (
          <Field label={kind === 'habit' ? l('Habit name', 'Nama kebiasaan') : l('Title', 'Judul')}>
            <input
              autoFocus
              required
              maxLength={100}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={
                kind === 'task'
                  ? l('What needs to get done?', 'Apa yang perlu diselesaikan?')
                  : kind === 'goal'
                    ? l('What outcome are you aiming for?', 'Hasil apa yang ingin Anda capai?')
                    : kind === 'project'
                      ? l('Name this project', 'Beri nama proyek ini')
                      : l('e.g. Read for 20 minutes', 'mis. Membaca selama 20 menit')
              }
            />
          </Field>
        )}

        {(kind === 'goal' || kind === 'project') && (
          <Field label={kind === 'goal' ? l('What does success look like?', 'Seperti apa bentuk keberhasilannya?') : l('Description', 'Deskripsi')}>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={l('Make the outcome concrete...', 'Jadikan hasilnya konkret...')}
            />
          </Field>
        )}

        {kind === 'goal' && (
          <>
            <Field label={l('Life area', 'Area hidup')}>
              <div className="inline-select-row">
                <select value={lifeAreaId} onChange={e => setLifeAreaId(e.target.value)}>
                  <option value="">{l('Unassigned', 'Belum ditetapkan')}</option>
                  {data.lifeAreas.map(area => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
                <button type="button" className="text-action" onClick={() => setAddingArea(v => !v)}>
                  {addingArea ? l('Cancel', 'Batal') : l('+ Area', '+ Area')}
                </button>
              </div>
            </Field>
            {addingArea && (
              <div className="inline-create-area">
                <input
                  type="text"
                  maxLength={60}
                  value={newAreaName}
                  placeholder={l('New life area name', 'Nama area hidup baru')}
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
                  {l('Add', 'Tambah')}
                </Button>
              </div>
            )}
            <Field label={l('Status', 'Status')}>
              <select value={goalStatus} onChange={e => setGoalStatus(e.target.value as Status)}>
                <option value="active">{l('Active', 'Aktif')}</option>
                <option value="completed">{l('Completed', 'Selesai')}</option>
                <option value="archived">{l('Archived', 'Diarsipkan')}</option>
              </select>
            </Field>
          </>
        )}

        {(kind === 'task' || kind === 'goal' || kind === 'project') && (
          <Field label={kind === 'goal' ? l('Target date (optional)', 'Tanggal target (opsional)') : l('Due date (optional)', 'Tenggat waktu (opsional)')}>
            <div className="inline-select-row">
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              {dueDate && (
                <button type="button" className="text-action" onClick={() => setDueDate('')}>
                  {l('Clear', 'Hapus')}
                </button>
              )}
            </div>
          </Field>
        )}

        {kind === 'task' && (
          <>
            <Field label={l('Project', 'Proyek')}>
              <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">{l('Personal / unassigned', 'Pribadi / tanpa proyek')}</option>
                {selectableProjects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.status === 'active' ? p.title : `${p.title} (${statusText(p.status)})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={l('Priority', 'Prioritas')}>
              <select value={priority} onChange={e => setPriority(e.target.value as Priority)}>
                <option value="high">{l('High', 'Tinggi')}</option>
                <option value="medium">{l('Medium', 'Sedang')}</option>
                <option value="low">{l('Low', 'Rendah')}</option>
              </select>
            </Field>
            <Field label={l('Target quantity (optional)', 'Target kuantitas (opsional)')}>
              <input
                type="number"
                min={1}
                placeholder={l('e.g. 30 (leave blank for single checkoff)', 'mis. 30 (kosongkan untuk centang tunggal)')}
                value={targetQuantity}
                onChange={e => setTargetQuantity(e.target.value)}
              />
            </Field>
            <Field label={l('Status', 'Status')}>
              <select value={status} onChange={e => setStatus(e.target.value as typeof status)}>
                <option value="todo">{l('To do', 'Belum selesai')}</option>
                <option value="done">{l('Completed', 'Selesai')}</option>
                <option value="skipped">{l('Skipped', 'Dilewati')}</option>
              </select>
            </Field>
          </>
        )}

        {kind === 'project' && (
          <>
            <Field label={l('Connect to a goal', 'Hubungkan ke tujuan')}>
              <select value={goalId} onChange={e => setGoalId(e.target.value)}>
                <option value="">{l('No linked goal', 'Tidak terhubung ke tujuan')}</option>
                {selectableGoals.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.status === 'active' ? g.title : `${g.title} (${statusText(g.status)})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={l('Status', 'Status')}>
              <select
                value={projectStatus}
                onChange={e => {
                  setProjectStatus(e.target.value as Project['status']);
                  setFormError('');
                }}
              >
                <option value="active">{l('Active', 'Aktif')}</option>
                <option value="planned">{l('Planned', 'Direncanakan')}</option>
                <option value="completed">{l('Completed', 'Selesai')}</option>
                <option value="archived">{l('Archived', 'Diarsipkan')}</option>
              </select>
            </Field>
            {activeProjectCount >= MAX_ACTIVE_PROJECTS && projectStatus === 'active' && existingProject?.status !== 'active' && (
              <p className="form-error" role="status">
                {l(
                  `${MAX_ACTIVE_PROJECTS} active projects max. Complete or archive one to activate this project.`,
                  `Maksimal ${MAX_ACTIVE_PROJECTS} proyek aktif. Selesaikan atau arsipkan salah satu untuk mengaktifkan proyek ini.`,
                )}
              </p>
            )}
          </>
        )}

        {kind === 'habit' && (
          <>
            <Field label={l('Frequency', 'Frekuensi')}>
              <select value={frequency} onChange={e => setFrequency(e.target.value as Habit['frequency'])}>
                <option value="daily">{l('Every day', 'Setiap hari')}</option>
                <option value="weekdays">{l('Weekdays', 'Hari kerja')}</option>
                <option value="weekends">{l('Weekends', 'Akhir pekan')}</option>
              </select>
            </Field>
            <Field label={l('Minimum version (for rough days, optional)', 'Versi minimum (untuk hari berat, opsional)')}>
              <input
                type="text"
                maxLength={100}
                value={minimumVersion}
                onChange={e => setMinimumVersion(e.target.value)}
                placeholder={l('e.g. 5 minutes stretching', 'mis. Peregangan 5 menit')}
              />
            </Field>
            <label className="toggle-field">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> {l('Active habit', 'Kebiasaan aktif')}
            </label>
          </>
        )}

        {kind === 'review' && (
          <>
            <div className="review-form-intro">
              <Field label={l('Review date', 'Tanggal evaluasi')}>
                <input
                  type="date"
                  max={today}
                  value={selectedReviewDate}
                  onChange={e => handleReviewDateChange(e.target.value)}
                />
              </Field>
              <p>{l('Be honest, not impressive. This is information, not a performance review.', 'Jujurlah, bukan mengesankan. Ini catatan informasi, bukan penilaian kinerja.')}</p>
            </div>
            <Field label={l('What went well?', 'Apa yang berjalan baik?')}>
              <textarea
                rows={3}
                value={wins}
                onChange={e => setWins(e.target.value)}
                placeholder={l('What did you actually move forward?', 'Apa yang benar-benar berhasil Anda majukan?')}
              />
            </Field>
            <Field label={l('What got in the way?', 'Apa yang menjadi hambatan?')}>
              <textarea
                rows={3}
                value={blockers}
                onChange={e => setBlockers(e.target.value)}
                placeholder={l('Where did reality differ from the plan?', 'Di mana kenyataan berbeda dari rencana?')}
              />
            </Field>
            <Field label={l('What will you adjust tomorrow?', 'Apa yang akan Anda sesuaikan besok?')}>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={l('One concrete adjustment...', 'Satu penyesuaian konkret...')}
              />
            </Field>
            <Field label={`${l('Energy level', 'Tingkat energi')} · ${energy}/5`}>
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
              onClick={() => onDeleteItem(kind, id, title || l('this item', 'item ini'))}
            >
              {l('Delete', 'Hapus')}
            </Button>
          )}
          {kind === 'review' && existingReview && onDeleteReview && (
            <Button
              variant="danger"
              className="modal-delete-left"
              onClick={() => onDeleteReview(selectedReviewDate)}
            >
              {l('Delete', 'Hapus')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>{l('Cancel', 'Batal')}</Button>
          <Button variant="solid" type="submit">
            <Check size={15} /> {l(`Save ${kindLabel}`, `Simpan ${kindLabel}`)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
