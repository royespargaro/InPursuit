import type { User } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Extraction, HabitCadence, PlanImportRecord, Priority, WeekdayKey } from '../types';
import { MAX_PLAN_TEXT_CHARS } from '../utils/planImportSchema';
import { Check, LoaderCircle, MessageSquare, RotateCcw, Sparkles, Trash2, X } from './Icon';
import { Button, cx } from './ui';

const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MAX_RECOMMENDED_DAILY_HABITS = 6;

const EXTRACT_PROGRESS_STAGES = [
  'Reading plan text & date anchors…',
  'Extracting goals, phases, habits & tasks…',
  'Grounding quotes & resolving dates…',
] as const;

const DEEP_CHECK_PROGRESS_STAGES = [
  'Auditing extracted items against your plan…',
  'Merging fixes & verifying quotes…',
] as const;

interface PlanImportModalProps {
  today: string;
  user?: Pick<User, 'uid' | 'email' | 'getIdToken'> | null;
  lastImportRecord: PlanImportRecord | null;
  onClose: () => void;
  onOpenSettings?: () => void;
  onApproveImport: (draft: Extraction) => void;
  onUndoLastImport: () => void;
}

interface ExtractApiResponse {
  extraction: Extraction;
  anchorDate: string;
  timezone: string;
  verified: boolean;
  droppedCount?: number;
  dailyHabitCount?: number;
}

interface ErrorBannerState {
  message: string;
  retryable: boolean;
  action: 'extract' | 'deep-check' | 'refine';
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === 'AbortError'
    : err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'));
}

export function PlanImportModal({
  today,
  user = null,
  lastImportRecord,
  onClose,
  onOpenSettings,
  onApproveImport,
  onUndoLastImport,
}: PlanImportModalProps) {
  const [planText, setPlanText] = useState('');
  const [draft, setDraft] = useState<Extraction | null>(null);
  const [meta, setMeta] = useState<{
    anchorDate: string;
    timezone: string;
    verified: boolean;
    droppedCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [deepChecking, setDeepChecking] = useState(false);
  const [refining, setRefining] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [cancelNotice, setCancelNotice] = useState('');
  const [errorState, setErrorState] = useState<ErrorBannerState | null>(null);
  const [refineInput, setRefineInput] = useState('');
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<number, string>>({});

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!loading && !deepChecking) {
      setProgressStage(0);
      return;
    }
    setProgressStage(0);
    if (loading) {
      const t1 = window.setTimeout(() => setProgressStage(1), 1200);
      const t2 = window.setTimeout(() => setProgressStage(2), 7000);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
    const tDeep = window.setTimeout(() => setProgressStage(1), 2000);
    return () => window.clearTimeout(tDeep);
  }, [loading, deepChecking]);

  const totalDraftItems = useMemo(() => {
    if (!draft) return 0;
    return (
      draft.goals.length +
      draft.phases.length +
      draft.habits.length +
      draft.tasks.length +
      draft.success_criteria.length +
      draft.principles.length
    );
  }, [draft]);

  const dailyHabitCount = useMemo(
    () => (draft ? draft.habits.filter(h => h.cadence === 'daily').length : 0),
    [draft],
  );

  const unscheduledTasksCount = useMemo(
    () => (draft ? draft.tasks.filter(t => !t.phase_ref?.trim() && !t.due?.trim()).length : 0),
    [draft],
  );

  const availablePhaseTitles = useMemo(() => {
    if (!draft) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const phase of draft.phases) {
      const title = phase.title.trim();
      if (title && !seen.has(title)) {
        seen.add(title);
        out.push(title);
      }
    }
    return out;
  }, [draft]);

  const getAuthHeader = async (): Promise<string> => {
    if (!user) {
      throw new Error('Sign in via Settings to extract a plan with AI.');
    }
    const token = await user.getIdToken();
    if (!token) {
      throw new Error('Could not obtain a valid authentication token. Please sign in again.');
    }
    return `Bearer ${token}`;
  };

  const handleCancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setDeepChecking(false);
    setErrorState(null);
    setCancelNotice('Cancelled. Your pasted text is preserved.');
  };

  const runExtract = async () => {
    const trimmed = planText.trim();
    if (!trimmed) {
      setErrorState({
        message: 'Paste a plan first so items can be extracted.',
        retryable: false,
        action: 'extract',
      });
      return;
    }
    if (trimmed.length > MAX_PLAN_TEXT_CHARS) {
      setErrorState({
        message: `Plan text exceeds the ${MAX_PLAN_TEXT_CHARS.toLocaleString()}-character limit.`,
        retryable: false,
        action: 'extract',
      });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setErrorState(null);
    setCancelNotice('');
    try {
      const authorization = await getAuthHeader();
      const response = await fetch('/api/import-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
        },
        body: JSON.stringify({ mode: 'extract', planText: trimmed }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as Partial<ExtractApiResponse> & {
        error?: string;
        code?: string;
        retryable?: boolean;
      };
      if (!response.ok || !payload.extraction) {
        const retryable = payload.retryable ?? (response.status >= 500 || response.status === 429);
        setErrorState({
          message: payload.error || 'Could not extract plan items. Please try again.',
          retryable,
          action: 'extract',
        });
        return;
      }
      setDraft(payload.extraction);
      setMeta({
        anchorDate: payload.anchorDate ?? today,
        timezone: payload.timezone ?? 'Asia/Makassar',
        verified: Boolean(payload.verified),
        droppedCount: typeof payload.droppedCount === 'number' ? payload.droppedCount : 0,
      });
      setClarificationAnswers({});
    } catch (err) {
      if (isAbortError(err)) return;
      setErrorState({
        message: err instanceof Error ? err.message : 'Network issue while extracting plan. Please retry.',
        retryable: true,
        action: 'extract',
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    await runExtract();
  };

  const handleDeepCheck = async () => {
    if (!draft) return;
    const trimmed = planText.trim();
    if (!trimmed) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setDeepChecking(true);
    setErrorState(null);
    setCancelNotice('');
    try {
      const authorization = await getAuthHeader();
      const response = await fetch('/api/import-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
        },
        body: JSON.stringify({
          mode: 'extract',
          planText: trimmed,
          currentDraft: draft,
          deepCheck: true,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as Partial<ExtractApiResponse> & {
        error?: string;
        code?: string;
        retryable?: boolean;
      };
      if (!response.ok || !payload.extraction) {
        const retryable = payload.retryable ?? (response.status >= 500 || response.status === 429);
        setErrorState({
          message: payload.error || 'Deep check could not finish. Your draft is safe — please retry.',
          retryable,
          action: 'deep-check',
        });
        return;
      }
      setDraft(payload.extraction);
      setMeta({
        anchorDate: payload.anchorDate ?? today,
        timezone: payload.timezone ?? 'Asia/Makassar',
        verified: Boolean(payload.verified),
        droppedCount: typeof payload.droppedCount === 'number' ? payload.droppedCount : 0,
      });
    } catch (err) {
      if (isAbortError(err)) return;
      setErrorState({
        message: err instanceof Error ? err.message : 'Deep check timed out or lost connection. Please retry.',
        retryable: true,
        action: 'deep-check',
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setDeepChecking(false);
    }
  };

  const handleRefine = async (customInstruction?: string) => {
    if (!draft) return;
    const instruction = (customInstruction ?? refineInput).trim();
    const answers = draft.clarifications
      .map((item, idx) => ({
        question: item.question,
        related_quote: item.related_quote,
        answer: (clarificationAnswers[idx] ?? '').trim(),
      }))
      .filter(a => a.answer.length > 0);

    if (!instruction && answers.length === 0) {
      setErrorState({
        message: 'Enter a refinement instruction or answer a clarification first.',
        retryable: false,
        action: 'refine',
      });
      return;
    }

    setRefining(true);
    setErrorState(null);
    setCancelNotice('');
    try {
      const authorization = await getAuthHeader();
      const response = await fetch('/api/import-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
        },
        body: JSON.stringify({
          mode: 'refine',
          planText: planText.trim(),
          currentDraft: draft,
          instruction,
          answers,
        }),
      });
      const payload = (await response.json()) as Partial<ExtractApiResponse> & {
        error?: string;
        retryable?: boolean;
      };
      if (!response.ok || !payload.extraction) {
        setErrorState({
          message: payload.error || 'Refinement failed. Your draft is preserved — please retry.',
          retryable: payload.retryable ?? (response.status >= 500 || response.status === 429),
          action: 'refine',
        });
        return;
      }
      setDraft(payload.extraction);
      setMeta(prev => ({
        anchorDate: payload.anchorDate ?? today,
        timezone: payload.timezone ?? 'Asia/Makassar',
        verified: Boolean(payload.verified),
        droppedCount: (prev?.droppedCount ?? 0) + (typeof payload.droppedCount === 'number' ? payload.droppedCount : 0),
      }));
      setRefineInput('');
      setClarificationAnswers({});
    } catch (err) {
      setErrorState({
        message: err instanceof Error ? err.message : 'Refinement failed. Please retry.',
        retryable: true,
        action: 'refine',
      });
    } finally {
      setRefining(false);
    }
  };

  const toggleHabitDay = (habitIdx: number, day: WeekdayKey) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        habits: prev.habits.map((h, idx) => {
          if (idx !== habitIdx) return h;
          const current = h.days ?? [];
          const nextDays = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
          return { ...h, days: nextDays };
        }),
      };
    });
  };

  const activeProgressStages = loading ? EXTRACT_PROGRESS_STAGES : DEEP_CHECK_PROGRESS_STAGES;
  const activeStageText = activeProgressStages[Math.min(progressStage, activeProgressStages.length - 1)];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-import-title"
      onMouseDown={e => e.target === e.currentTarget && !loading && !deepChecking && onClose()}
    >
      <div className="modal plan-import-modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow">import plan · grounded extraction</div>
            <h2 id="plan-import-title">{draft ? 'Review extracted plan' : 'Paste your plan'}</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close import modal"
            onClick={() => {
              abortControllerRef.current?.abort();
              onClose();
            }}
          >
            <X size={18} />
          </button>
        </div>

        {errorState && (
          <div className="form-error import-error-banner" role="alert">
            <div>
              <span>{errorState.message}</span>
              {errorState.retryable && (
                <span className="import-error-sub">
                  {draft ? ' Your draft and pasted text are safe — please retry.' : ' Your pasted text is preserved — please retry.'}
                </span>
              )}
            </div>
            {errorState.retryable && errorState.action !== 'refine' && (
              <Button
                type="button"
                variant="outline"
                disabled={loading || deepChecking || refining}
                onClick={() => {
                  if (errorState.action === 'deep-check') {
                    void handleDeepCheck();
                  } else {
                    void runExtract();
                  }
                }}
              >
                Retry
              </Button>
            )}
          </div>
        )}

        {cancelNotice && !errorState && !loading && !deepChecking && (
          <div className="import-dropped-note" role="status">
            {cancelNotice}
          </div>
        )}

        {(loading || deepChecking) && (
          <div className="import-progress-banner" role="status" aria-live="polite">
            <div className="import-progress-top">
              <LoaderCircle size={14} className="spin" />
              <span>
                Step {Math.min(progressStage + 1, activeProgressStages.length)}/{activeProgressStages.length} · {activeStageText}
              </span>
            </div>
            <div className="import-progress-track" aria-hidden="true">
              <div
                className="import-progress-fill"
                style={{
                  width: `${Math.round(((Math.min(progressStage + 1, activeProgressStages.length)) / activeProgressStages.length) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {!draft ? (
          <form onSubmit={e => void handleExtract(e)} className="modal-form">
            {!user && (
              <div className="import-warning-banner" role="status">
                <span>Sign in via Settings to run AI plan extraction. Your workspace syncs automatically once signed in.</span>
                {onOpenSettings && (
                  <Button type="button" variant="outline" onClick={onOpenSettings}>
                    Open Settings
                  </Button>
                )}
              </div>
            )}
            <label className="field">
              <span>Free-text plan</span>
              <textarea
                rows={10}
                maxLength={MAX_PLAN_TEXT_CHARS}
                value={planText}
                onChange={e => setPlanText(e.target.value)}
                placeholder="Paste a 90-day roadmap, training block, quarterly sprint, or coaching plan. Only items explicitly in your text are extracted with source quotes."
                disabled={loading}
              />
            </label>
            <div className="import-stage-note">
              <span>
                {planText.length.toLocaleString()}/{MAX_PLAN_TEXT_CHARS.toLocaleString()} chars · Relative phrases resolve against Asia/Makassar ({today}).
              </span>
              {lastImportRecord && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    onUndoLastImport();
                    onClose();
                  }}
                >
                  <RotateCcw size={13} /> Undo last import ({lastImportRecord.counts.goals}g · {lastImportRecord.counts.tasks}t)
                </button>
              )}
            </div>
            <div className="modal-foot">
              {loading ? (
                <Button type="button" variant="outline" onClick={handleCancelRequest}>
                  Cancel
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
              )}
              <Button type="submit" variant="solid" disabled={loading || !user}>
                {loading ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}
                {loading ? 'Extracting…' : 'Extract plan'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="import-review-stack">
            <div className="import-review-toolbar">
              <div className="import-review-meta">
                <span>
                  {totalDraftItems} items ready · {meta?.timezone ?? 'Asia/Makassar'} ({meta?.anchorDate ?? today})
                  {meta?.verified ? ' · deep check verified' : ''}
                  {meta && meta.droppedCount > 0 ? ` · ${meta.droppedCount} unverified dropped` : ''}
                </span>
              </div>
              <div className="import-toolbar-actions">
                <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={refining || deepChecking}>
                  Back to text
                </Button>
                {deepChecking ? (
                  <Button type="button" variant="outline" onClick={handleCancelRequest}>
                    Cancel
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={refining || deepChecking}
                    onClick={() => void handleDeepCheck()}
                  >
                    <Sparkles size={14} /> Deep check
                  </Button>
                )}
                <Button
                  type="button"
                  variant="solid"
                  disabled={refining || deepChecking || totalDraftItems === 0}
                  onClick={() => onApproveImport(draft)}
                >
                  <Check size={15} /> Approve all
                </Button>
              </div>
            </div>

            {meta && meta.droppedCount > 0 && (
              <div className="import-dropped-note" role="status">
                {meta.droppedCount} unverified {meta.droppedCount === 1 ? 'item was' : 'items were'} dropped because no matching verbatim quote was found in your plan text.
              </div>
            )}

            {dailyHabitCount > MAX_RECOMMENDED_DAILY_HABITS && (
              <div className="import-warning-banner" role="alert">
                <span>
                  High daily habit load ({dailyHabitCount} daily habits). More than {MAX_RECOMMENDED_DAILY_HABITS} daily habits increases burnout risk — consider switching lower-priority habits to weekly_count or specific_days before approving.
                </span>
              </div>
            )}

            {draft.clarifications.length > 0 && (
              <section className="import-group import-clarifications" aria-label="Clarifications">
                <div className="import-group-head">
                  <h3>Clarifications</h3>
                  <span>{draft.clarifications.length} open</span>
                </div>
                <div className="import-card-list">
                  {draft.clarifications.map((item, idx) => (
                    <div className="import-item-card" key={`${item.question}-${idx}`}>
                      <div className="import-item-top">
                        <strong>{item.question}</strong>
                        <button
                          type="button"
                          className="icon-btn subtle"
                          aria-label={`Dismiss clarification ${idx + 1}`}
                          onClick={() =>
                            setDraft(prev =>
                              prev
                                ? { ...prev, clarifications: prev.clarifications.filter((_, i) => i !== idx) }
                                : prev,
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <blockquote className="import-quote">&ldquo;{item.related_quote}&rdquo;</blockquote>
                      <input
                        className="import-inline-input"
                        placeholder="Answer to clarify (optional)..."
                        value={clarificationAnswers[idx] ?? ''}
                        onChange={e =>
                          setClarificationAnswers(prev => ({ ...prev, [idx]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
                {Object.values(clarificationAnswers).some(v => v.trim().length > 0) && (
                  <div className="import-clarify-actions">
                    <Button type="button" variant="outline" disabled={refining} onClick={() => void handleRefine()}>
                      {refining ? 'Applying…' : 'Apply clarification answers'}
                    </Button>
                  </div>
                )}
              </section>
            )}

            <section className="import-refine-box" aria-label="Refine by chat">
              <label htmlFor="refine-chat-input" className="eyebrow">
                refine by chat
              </label>
              <div className="import-refine-row">
                <MessageSquare size={15} />
                <input
                  id="refine-chat-input"
                  value={refineInput}
                  onChange={e => setRefineInput(e.target.value)}
                  placeholder='Refine by chat (e.g. "move workouts to evenings")'
                  disabled={refining}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleRefine();
                    }
                  }}
                />
                <Button type="button" variant="outline" disabled={refining} onClick={() => void handleRefine()}>
                  {refining ? 'Refining…' : 'Refine'}
                </Button>
              </div>
            </section>

            <section className="import-group" aria-label="Extracted goals">
              <div className="import-group-head">
                <h3>Goals</h3>
                <span>{draft.goals.length}</span>
              </div>
              {draft.goals.length === 0 ? (
                <p className="import-group-empty">No goals in draft.</p>
              ) : (
                <div className="import-card-list">
                  {draft.goals.map((goal, idx) => (
                    <div className="import-item-card" key={`goal-${idx}`}>
                      <div className="import-item-top">
                        <input
                          aria-label={`Goal title ${idx + 1}`}
                          className="import-title-input"
                          value={goal.title}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    goals: prev.goals.map((g, i) => (i === idx ? { ...g, title: e.target.value } : g)),
                                  }
                                : prev,
                            )
                          }
                        />
                        <input
                          aria-label={`Goal weight ${idx + 1}`}
                          className="import-small-input"
                          type="number"
                          min={0}
                          max={100}
                          placeholder="% wt"
                          value={goal.pillar_weight_pct ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? undefined : Number(e.target.value);
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    goals: prev.goals.map((g, i) =>
                                      i === idx ? { ...g, pillar_weight_pct: val } : g,
                                    ),
                                  }
                                : prev,
                            );
                          }}
                        />
                        <button
                          type="button"
                          className="icon-btn subtle"
                          aria-label={`Delete goal ${goal.title}`}
                          onClick={() =>
                            setDraft(prev =>
                              prev ? { ...prev, goals: prev.goals.filter((_, i) => i !== idx) } : prev,
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="import-field-grid">
                        <input
                          aria-label={`Goal life area ${idx + 1}`}
                          placeholder="Life area (e.g. Health, Career)"
                          value={goal.life_area ?? ''}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    goals: prev.goals.map((g, i) =>
                                      i === idx ? { ...g, life_area: e.target.value || undefined } : g,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                        <input
                          aria-label={`Goal description ${idx + 1}`}
                          placeholder="Description / outcome"
                          value={goal.description ?? ''}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    goals: prev.goals.map((g, i) =>
                                      i === idx ? { ...g, description: e.target.value } : g,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                      </div>
                      <blockquote className="import-quote">&ldquo;{goal.source_quote}&rdquo;</blockquote>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="import-group" aria-label="Extracted phases">
              <div className="import-group-head">
                <h3>Phases</h3>
                <span>{draft.phases.length} · saved as Projects (max 3 active, extra saved as planned)</span>
              </div>
              {draft.phases.length === 0 ? (
                <p className="import-group-empty">No phases in draft.</p>
              ) : (
                <div className="import-card-list">
                  {draft.phases.map((phase, idx) => (
                    <div className="import-item-card" key={`phase-${idx}`}>
                      <div className="import-item-top">
                        <input
                          aria-label={`Phase title ${idx + 1}`}
                          className="import-title-input"
                          value={phase.title}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    phases: prev.phases.map((p, i) =>
                                      i === idx ? { ...p, title: e.target.value } : p,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                        <button
                          type="button"
                          className="icon-btn subtle"
                          aria-label={`Delete phase ${phase.title}`}
                          onClick={() =>
                            setDraft(prev =>
                              prev ? { ...prev, phases: prev.phases.filter((_, i) => i !== idx) } : prev,
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="import-field-grid">
                        <input
                          aria-label={`Phase start ${idx + 1}`}
                          type="date"
                          value={phase.start}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    phases: prev.phases.map((p, i) =>
                                      i === idx ? { ...p, start: e.target.value } : p,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                        <input
                          aria-label={`Phase end ${idx + 1}`}
                          type="date"
                          value={phase.end}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    phases: prev.phases.map((p, i) =>
                                      i === idx ? { ...p, end: e.target.value } : p,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                        <input
                          aria-label={`Phase theme ${idx + 1}`}
                          placeholder="Theme"
                          value={phase.theme ?? ''}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    phases: prev.phases.map((p, i) =>
                                      i === idx ? { ...p, theme: e.target.value } : p,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                        <input
                          aria-label={`Phase exit condition ${idx + 1}`}
                          placeholder="Exit condition"
                          value={phase.exit_condition ?? ''}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    phases: prev.phases.map((p, i) =>
                                      i === idx ? { ...p, exit_condition: e.target.value } : p,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                      </div>
                      <blockquote className="import-quote">&ldquo;{phase.source_quote}&rdquo;</blockquote>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="import-group" aria-label="Extracted habits">
              <div className="import-group-head">
                <h3>Habits</h3>
                <span>{draft.habits.length} ({dailyHabitCount} daily)</span>
              </div>
              {draft.habits.length === 0 ? (
                <p className="import-group-empty">No habits in draft.</p>
              ) : (
                <div className="import-card-list">
                  {draft.habits.map((habit, idx) => (
                    <div className="import-item-card" key={`habit-${idx}`}>
                      <div className="import-item-top">
                        <input
                          aria-label={`Habit title ${idx + 1}`}
                          className="import-title-input"
                          value={habit.title}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    habits: prev.habits.map((h, i) =>
                                      i === idx ? { ...h, title: e.target.value } : h,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                        <select
                          aria-label={`Habit cadence ${idx + 1}`}
                          value={habit.cadence}
                          onChange={e => {
                            const nextCadence = e.target.value as HabitCadence;
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    habits: prev.habits.map((h, i) =>
                                      i === idx
                                        ? {
                                            ...h,
                                            cadence: nextCadence,
                                            target_count:
                                              nextCadence === 'weekly_count' ? h.target_count ?? 3 : undefined,
                                          }
                                        : h,
                                    ),
                                  }
                                : prev,
                            );
                          }}
                        >
                          <option value="daily">daily</option>
                          <option value="weekly_count">weekly_count</option>
                          <option value="specific_days">specific_days</option>
                        </select>
                        {habit.cadence === 'weekly_count' && (
                          <input
                            aria-label={`Habit weekly count ${idx + 1}`}
                            className="import-small-input"
                            type="number"
                            min={1}
                            max={14}
                            value={habit.target_count ?? 1}
                            onChange={e =>
                              setDraft(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      habits: prev.habits.map((h, i) =>
                                        i === idx ? { ...h, target_count: Number(e.target.value) || 1 } : h,
                                      ),
                                    }
                                  : prev,
                              )
                            }
                          />
                        )}
                        <button
                          type="button"
                          className="icon-btn subtle"
                          aria-label={`Delete habit ${habit.title}`}
                          onClick={() =>
                            setDraft(prev =>
                              prev ? { ...prev, habits: prev.habits.filter((_, i) => i !== idx) } : prev,
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {habit.cadence === 'specific_days' && (
                        <div className="import-days-row" role="group" aria-label={`Days for ${habit.title}`}>
                          {WEEKDAYS.map(day => (
                            <button
                              key={day}
                              type="button"
                              className={cx('day-toggle-btn', habit.days?.includes(day) && 'active')}
                              onClick={() => toggleHabitDay(idx, day)}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="import-field-grid">
                        <input
                          aria-label={`Habit time start ${idx + 1}`}
                          placeholder="Start (e.g. 07:00)"
                          value={habit.time_block?.start ?? ''}
                          onChange={e => {
                            const start = e.target.value;
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    habits: prev.habits.map((h, i) =>
                                      i === idx
                                        ? {
                                            ...h,
                                            time_block:
                                              start || h.time_block?.end
                                                ? { start, end: h.time_block?.end ?? '' }
                                                : undefined,
                                          }
                                        : h,
                                    ),
                                  }
                                : prev,
                            );
                          }}
                        />
                        <input
                          aria-label={`Habit time end ${idx + 1}`}
                          placeholder="End (e.g. 08:00)"
                          value={habit.time_block?.end ?? ''}
                          onChange={e => {
                            const end = e.target.value;
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    habits: prev.habits.map((h, i) =>
                                      i === idx
                                        ? {
                                            ...h,
                                            time_block:
                                              h.time_block?.start || end
                                                ? { start: h.time_block?.start ?? '', end }
                                                : undefined,
                                          }
                                        : h,
                                    ),
                                  }
                                : prev,
                            );
                          }}
                        />
                        <input
                          aria-label={`Habit minimum version ${idx + 1}`}
                          placeholder="Minimum version"
                          value={habit.minimum_version ?? ''}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    habits: prev.habits.map((h, i) =>
                                      i === idx ? { ...h, minimum_version: e.target.value } : h,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                      </div>
                      <blockquote className="import-quote">&ldquo;{habit.source_quote}&rdquo;</blockquote>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="import-group" aria-label="Extracted tasks">
              <div className="import-group-head">
                <h3>Tasks</h3>
                <span>{draft.tasks.length}</span>
              </div>
              {unscheduledTasksCount > 0 && (
                <div className="import-warning-banner" role="status" aria-label="Unassigned tasks warning">
                  <span>
                    <strong>{unscheduledTasksCount}</strong>{' '}
                    {unscheduledTasksCount === 1 ? 'task has' : 'tasks have'} no phase and no due date — assign a phase or set a due date so{' '}
                    {unscheduledTasksCount === 1 ? 'it appears' : 'they appear'} in Today&apos;s focus queue.
                  </span>
                </div>
              )}
              {draft.tasks.length === 0 ? (
                <p className="import-group-empty">No tasks in draft.</p>
              ) : (
                <div className="import-card-list">
                  {draft.tasks.map((task, idx) => {
                    const needsPhaseOrDue = !task.phase_ref?.trim() && !task.due?.trim();
                    const phaseOptions =
                      task.phase_ref?.trim() && !availablePhaseTitles.includes(task.phase_ref.trim())
                        ? [task.phase_ref.trim(), ...availablePhaseTitles]
                        : availablePhaseTitles;
                    return (
                      <div className="import-item-card" key={`task-${idx}`}>
                        <div className="import-item-top">
                          <input
                            aria-label={`Task title ${idx + 1}`}
                            className="import-title-input"
                            value={task.title}
                            onChange={e =>
                              setDraft(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      tasks: prev.tasks.map((t, i) =>
                                        i === idx ? { ...t, title: e.target.value } : t,
                                      ),
                                    }
                                  : prev,
                              )
                            }
                          />
                          <select
                            aria-label={`Task phase ${idx + 1}`}
                            value={task.phase_ref ?? ''}
                            onChange={e =>
                              setDraft(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      tasks: prev.tasks.map((t, i) =>
                                        i === idx ? { ...t, phase_ref: e.target.value || undefined } : t,
                                      ),
                                    }
                                  : prev,
                              )
                            }
                          >
                            <option value="">No phase</option>
                            {phaseOptions.map(phaseTitle => (
                              <option key={phaseTitle} value={phaseTitle}>
                                {phaseTitle}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label={`Task priority ${idx + 1}`}
                            value={task.priority ?? 'medium'}
                            onChange={e =>
                              setDraft(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      tasks: prev.tasks.map((t, i) =>
                                        i === idx ? { ...t, priority: e.target.value as Priority } : t,
                                      ),
                                    }
                                  : prev,
                              )
                            }
                          >
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                          </select>
                          <input
                            aria-label={`Task due ${idx + 1}`}
                            type="date"
                            value={task.due ?? ''}
                            onChange={e =>
                              setDraft(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      tasks: prev.tasks.map((t, i) =>
                                        i === idx ? { ...t, due: e.target.value || undefined } : t,
                                      ),
                                    }
                                  : prev,
                              )
                            }
                          />
                          <input
                            aria-label={`Task quantity ${idx + 1}`}
                            className="import-small-input"
                            type="number"
                            min={1}
                            placeholder="Qty"
                            value={task.target_quantity ?? ''}
                            onChange={e =>
                              setDraft(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      tasks: prev.tasks.map((t, i) =>
                                        i === idx
                                          ? {
                                              ...t,
                                              target_quantity: e.target.value ? Number(e.target.value) : undefined,
                                            }
                                          : t,
                                      ),
                                    }
                                  : prev,
                              )
                            }
                          />
                          <button
                            type="button"
                            className="icon-btn subtle"
                            aria-label={`Delete task ${task.title}`}
                            onClick={() =>
                              setDraft(prev =>
                                prev ? { ...prev, tasks: prev.tasks.filter((_, i) => i !== idx) } : prev,
                              )
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {needsPhaseOrDue && (
                          <span className="import-task-flag">No phase or due date assigned</span>
                        )}
                        <blockquote className="import-quote">&ldquo;{task.source_quote}&rdquo;</blockquote>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="import-group" aria-label="Extracted success criteria">
              <div className="import-group-head">
                <h3>Success criteria</h3>
                <span>{draft.success_criteria.length}</span>
              </div>
              {draft.success_criteria.length === 0 ? (
                <p className="import-group-empty">No success criteria in draft.</p>
              ) : (
                <div className="import-card-list">
                  {draft.success_criteria.map((criterion, idx) => (
                    <div className="import-item-card" key={`crit-${idx}`}>
                      <div className="import-item-top">
                        <input
                          aria-label={`Success criterion ${idx + 1}`}
                          className="import-title-input"
                          value={criterion.text}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    success_criteria: prev.success_criteria.map((c, i) =>
                                      i === idx ? { ...c, text: e.target.value } : c,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                        <button
                          type="button"
                          className="icon-btn subtle"
                          aria-label={`Delete criterion ${criterion.text}`}
                          onClick={() =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    success_criteria: prev.success_criteria.filter((_, i) => i !== idx),
                                  }
                                : prev,
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <blockquote className="import-quote">&ldquo;{criterion.source_quote}&rdquo;</blockquote>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="import-group" aria-label="Extracted principles">
              <div className="import-group-head">
                <h3>Principles</h3>
                <span>{draft.principles.length}</span>
              </div>
              {draft.principles.length === 0 ? (
                <p className="import-group-empty">No principles in draft.</p>
              ) : (
                <div className="import-card-list">
                  {draft.principles.map((principle, idx) => (
                    <div className="import-item-card" key={`prin-${idx}`}>
                      <div className="import-item-top">
                        <input
                          aria-label={`Principle ${idx + 1}`}
                          className="import-title-input"
                          value={principle.text}
                          onChange={e =>
                            setDraft(prev =>
                              prev
                                ? {
                                    ...prev,
                                    principles: prev.principles.map((p, i) =>
                                      i === idx ? { ...p, text: e.target.value } : p,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                        <button
                          type="button"
                          className="icon-btn subtle"
                          aria-label={`Delete principle ${principle.text}`}
                          onClick={() =>
                            setDraft(prev =>
                              prev ? { ...prev, principles: prev.principles.filter((_, i) => i !== idx) } : prev,
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <blockquote className="import-quote">&ldquo;{principle.source_quote}&rdquo;</blockquote>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
