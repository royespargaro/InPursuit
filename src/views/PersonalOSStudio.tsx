import { useMemo, useState } from 'react';
import { useHabits } from '../context/HabitContext';
import { useLanguage } from '../context/LanguageContext';
import { createId } from '../services/appStore';
import { localDateKey } from '../utils/habitUtils';
import type { DecisionEntry, GuidedReflection, KnowledgeClaim, PersonalPrinciple } from '../types';

type StudioTab = 'direction' | 'capacity' | 'decisions' | 'behavior' | 'evidence' | 'reflection';

const TABS: { id: StudioTab; en: string; idLabel: string }[] = [
  { id: 'direction', en: 'Direction', idLabel: 'Arah' },
  { id: 'capacity', en: 'Capacity', idLabel: 'Kapasitas' },
  { id: 'decisions', en: 'Decisions', idLabel: 'Keputusan' },
  { id: 'behavior', en: 'Behavior', idLabel: 'Perilaku' },
  { id: 'evidence', en: 'Evidence', idLabel: 'Bukti' },
  { id: 'reflection', en: 'Reflection', idLabel: 'Refleksi' },
];

const PROMPTS = [
  'What important work did I avoid, and what made it uncomfortable?',
  'Where did my actions contradict a principle I claim to hold?',
  'What did I assume would be easy that turned out to be difficult?',
  'Am I pursuing this because it matters, or because I want to prove something?',
  'What is one commitment I should renegotiate instead of silently carrying?',
  'What evidence changed my mind this week?',
];

const emptyOS = () => ({
  principles: [],
  decisions: [],
  claims: [],
  reflections: [],
  capacity: { dailyMinutes: 360, focusMinutes: 90, taskEstimates: {} as Record<string, number> },
});

export function PersonalOSStudio() {
  const { data, updateData } = useHabits();
  const { locale, l } = useLanguage();
  const isId = locale === 'id';
  const [tab, setTab] = useState<StudioTab>('direction');
  const [principleTitle, setPrincipleTitle] = useState('');
  const [principleStatement, setPrincipleStatement] = useState('');
  const [principleReason, setPrincipleReason] = useState('');
  const [principleBehaviors, setPrincipleBehaviors] = useState('');
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionContext, setDecisionContext] = useState('');
  const [decisionOptions, setDecisionOptions] = useState('');
  const [decisionChoice, setDecisionChoice] = useState('');
  const [decisionAssumptions, setDecisionAssumptions] = useState('');
  const [decisionPrediction, setDecisionPrediction] = useState('');
  const [decisionReviewAt, setDecisionReviewAt] = useState('');
  const [claimText, setClaimText] = useState('');
  const [claimDomain, setClaimDomain] = useState('Knowledge');
  const [claimSource, setClaimSource] = useState('Self-reported');
  const [claimEvidence, setClaimEvidence] = useState('');
  const [claimConfidence, setClaimConfidence] = useState(50);
  const [reflectionPrompt, setReflectionPrompt] = useState(PROMPTS[0]);
  const [reflectionAnswer, setReflectionAnswer] = useState('');
  const [reflectionInterpretation, setReflectionInterpretation] = useState('');
  const [capacityDraft, setCapacityDraft] = useState<number | null>(null);
  const [focusDraft, setFocusDraft] = useState<number | null>(null);

  const os = data.personalOS ?? emptyOS();
  const today = localDateKey();
  const openTasks = useMemo(
    () => data.tasks.filter(task => task.status === 'todo' && (!task.dueDate || task.dueDate <= today))
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 12),
    [data.tasks, today],
  );
  const plannedMinutes = openTasks.reduce((sum, task) => sum + (os.capacity.taskEstimates[task.id] ?? task.estimatedMinutes ?? 30), 0);
  const capacityMinutes = os.capacity.dailyMinutes || 360;
  const capacityPercent = Math.round((plannedMinutes / Math.max(1, capacityMinutes)) * 100);

  const patchOS = (patch: Partial<typeof os>) => updateData(current => ({
    ...current,
    personalOS: { ...emptyOS(), ...(current.personalOS ?? {}), ...patch,
      capacity: { ...emptyOS().capacity, ...(current.personalOS?.capacity ?? {}), ...(patch.capacity ?? {}) } },
  }));

  const addPrinciple = () => {
    if (!principleTitle.trim() || !principleStatement.trim()) return;
    const now = new Date().toISOString();
    const item: PersonalPrinciple = {
      id: createId(), title: principleTitle.trim(), statement: principleStatement.trim(),
      reason: principleReason.trim(), behaviors: principleBehaviors.trim(), contradictions: '',
      createdAt: now, updatedAt: now,
    };
    patchOS({ principles: [item, ...os.principles] });
    setPrincipleTitle(''); setPrincipleStatement(''); setPrincipleReason(''); setPrincipleBehaviors('');
  };

  const addDecision = () => {
    if (!decisionTitle.trim() || !decisionChoice.trim()) return;
    const item: DecisionEntry = {
      id: createId(), title: decisionTitle.trim(), context: decisionContext.trim(),
      options: decisionOptions.trim(), choice: decisionChoice.trim(), assumptions: decisionAssumptions.trim(),
      prediction: decisionPrediction.trim(), reviewAt: decisionReviewAt, outcome: '',
      createdAt: new Date().toISOString(),
    };
    patchOS({ decisions: [item, ...os.decisions] });
    setDecisionTitle(''); setDecisionContext(''); setDecisionOptions(''); setDecisionChoice('');
    setDecisionAssumptions(''); setDecisionPrediction(''); setDecisionReviewAt('');
  };

  const addClaim = () => {
    if (!claimText.trim()) return;
    const item: KnowledgeClaim = {
      id: createId(), claim: claimText.trim(), domain: claimDomain, source: claimSource,
      evidence: claimEvidence.trim(), confidence: claimConfidence, status: 'provisional',
      createdAt: new Date().toISOString(),
    };
    patchOS({ claims: [item, ...os.claims] });
    setClaimText(''); setClaimEvidence(''); setClaimConfidence(50);
  };

  const addReflection = () => {
    if (!reflectionAnswer.trim()) return;
    const item: GuidedReflection = {
      id: createId(), date: today, prompt: reflectionPrompt, answer: reflectionAnswer.trim(),
      interpretation: reflectionInterpretation.trim(), interpretationStatus: 'hypothesis',
      createdAt: new Date().toISOString(),
    };
    patchOS({ reflections: [item, ...os.reflections] });
    setReflectionAnswer(''); setReflectionInterpretation('');
  };

  const updateHabit = (habitId: string, patch: Record<string, unknown>) => updateData(current => ({
    ...current,
    habits: current.habits.map(habit => habit.id === habitId ? { ...habit, ...patch } : habit),
  }));

  const saveDecisionOutcome = (decision: DecisionEntry, outcome: string) => {
    patchOS({ decisions: os.decisions.map(item => item.id === decision.id
      ? { ...item, outcome, reviewedAt: outcome.trim() ? new Date().toISOString() : undefined } : item) });
  };

  const saveEstimate = (taskId: string, value: number) => {
    patchOS({ capacity: { ...os.capacity, taskEstimates: { ...os.capacity.taskEstimates, [taskId]: Math.max(5, Math.min(1440, value || 30)) } } });
  };

  const fieldClass = 'w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[#d4ff3a]/50 focus:outline-none';
  const labelClass = 'mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/55';
  const panelClass = 'rounded-xl border border-white/[0.09] bg-white/[0.025] p-4 sm:p-5';
  const buttonClass = 'inline-flex min-h-9 items-center justify-center rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white/80 transition hover:border-[#d4ff3a]/50 hover:text-[#d4ff3a] disabled:opacity-40';
  const primaryClass = 'inline-flex min-h-9 items-center justify-center rounded-lg bg-[#d4ff3a] px-4 py-2 text-xs font-semibold text-black transition hover:bg-[#e1ff70] disabled:opacity-40';

  return (
    <section className="personal-os-studio">
      <div className="personal-os-intro">
        <div>
          <div className="eyebrow">{l('personal operating system', 'sistem operasi personal')}</div>
          <h2>{l('Build a life you can actually execute.', 'Bangun hidup yang benar-benar bisa kamu jalankan.')}</h2>
          <p>{l('Connect what matters, what you decide, what you do, and what the evidence teaches you.', 'Hubungkan hal yang penting, keputusanmu, tindakanmu, dan pelajaran dari bukti nyata.')}</p>
        </div>
        <div className="personal-os-counts">
          <span><b>{os.principles.length}</b>{l('principles', 'prinsip')}</span>
          <span><b>{os.decisions.length}</b>{l('decisions', 'keputusan')}</span>
          <span><b>{os.claims.length}</b>{l('claims', 'klaim')}</span>
        </div>
      </div>

      <nav className="personal-os-tabs" aria-label={l('Personal OS sections', 'Bagian sistem personal')}>
        {TABS.map(item => <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{isId ? item.idLabel : item.en}</button>)}
      </nav>

      {tab === 'direction' && (
        <div className="personal-os-layout">
          <div className={panelClass}>
            <div className="eyebrow">{l('direction · character', 'arah · karakter')}</div>
            <h3>{l('Define your principles', 'Tentukan prinsipmu')}</h3>
            <p className="personal-os-muted">{l('A principle is only useful when it changes observable behavior.', 'Prinsip hanya berguna jika mengubah perilaku yang bisa diamati.')}</p>
            <div className="personal-os-form">
              <label><span className={labelClass}>{l('Principle name', 'Nama prinsip')}</span><input className={fieldClass} value={principleTitle} onChange={e => setPrincipleTitle(e.target.value)} placeholder={l('e.g. Keep promises', 'mis. Tepati janji')} /></label>
              <label><span className={labelClass}>{l('What it means', 'Maknanya')}</span><textarea className={fieldClass} rows={2} value={principleStatement} onChange={e => setPrincipleStatement(e.target.value)} placeholder={l('Write the rule in your own words', 'Tulis aturan dengan bahasamu sendiri')} /></label>
              <label><span className={labelClass}>{l('Why it matters', 'Mengapa penting')}</span><textarea className={fieldClass} rows={2} value={principleReason} onChange={e => setPrincipleReason(e.target.value)} /></label>
              <label><span className={labelClass}>{l('Observable behaviors', 'Perilaku yang terlihat')}</span><textarea className={fieldClass} rows={2} value={principleBehaviors} onChange={e => setPrincipleBehaviors(e.target.value)} placeholder={l('What would someone see you doing?', 'Apa yang orang lain bisa lihat kamu lakukan?')} /></label>
              <button type="button" className={primaryClass} disabled={!principleTitle.trim() || !principleStatement.trim()} onClick={addPrinciple}>{l('Add principle', 'Tambah prinsip')}</button>
            </div>
          </div>
          <div className="personal-os-list">
            {os.principles.length === 0 && <div className={panelClass}><h3>{l('No principles yet', 'Belum ada prinsip')}</h3><p className="personal-os-muted">{l('Start with three to five principles you are willing to be held accountable to.', 'Mulai dari tiga sampai lima prinsip yang siap kamu pertanggungjawabkan.')}</p></div>}
            {os.principles.map(item => <article className={panelClass} key={item.id}>
              <div className="personal-os-item-head"><h3>{item.title}</h3><button className="personal-os-remove" onClick={() => patchOS({ principles: os.principles.filter(p => p.id !== item.id) })}>{l('Remove', 'Hapus')}</button></div>
              <p>{item.statement}</p>
              {item.reason && <p className="personal-os-muted">{item.reason}</p>}
              {item.behaviors && <div className="personal-os-evidence"><b>{l('Behavioral test', 'Uji perilaku')}</b><span>{item.behaviors}</span></div>}
              <label className="personal-os-inline-field"><span>{l('Contradictory evidence / where I fall short', 'Bukti yang bertentangan / bagian yang belum konsisten')}</span><textarea className={fieldClass} rows={2} value={item.contradictions} onChange={e => patchOS({ principles: os.principles.map(p => p.id === item.id ? { ...p, contradictions: e.target.value, updatedAt: new Date().toISOString() } : p) })} placeholder={l('Record honestly, without self-judgment', 'Catat dengan jujur, tanpa menghakimi diri')} /></label>
            </article>)}
          </div>
        </div>
      )}

      {tab === 'capacity' && (
        <div className="personal-os-layout">
          <div className={panelClass}>
            <div className="eyebrow">{l('capacity · realism', 'kapasitas · realisme')}</div>
            <h3>{l('Plan against available time', 'Rencanakan berdasarkan waktu tersedia')}</h3>
            <p className="personal-os-muted">{l('Set realistic daily work capacity. The estimate is a planning aid, not a productivity score.', 'Atur kapasitas kerja harian yang realistis. Estimasi ini alat bantu, bukan nilai produktivitas.')}</p>
            <div className="personal-os-form personal-os-two">
              <label><span className={labelClass}>{l('Available work minutes / day', 'Menit kerja tersedia / hari')}</span><input type="number" min="30" max="1440" className={fieldClass} value={capacityDraft ?? capacityMinutes} onChange={e => setCapacityDraft(Number(e.target.value))} onBlur={() => { if (capacityDraft !== null) { patchOS({ capacity: { ...os.capacity, dailyMinutes: Math.max(30, Math.min(1440, capacityDraft || 360)) } }); setCapacityDraft(null); } }} /></label>
              <label><span className={labelClass}>{l('Preferred focus block (minutes)', 'Durasi fokus pilihan (menit)')}</span><input type="number" min="15" max="240" className={fieldClass} value={focusDraft ?? os.capacity.focusMinutes} onChange={e => setFocusDraft(Number(e.target.value))} onBlur={() => { if (focusDraft !== null) { patchOS({ capacity: { ...os.capacity, focusMinutes: Math.max(15, Math.min(240, focusDraft || 90)) } }); setFocusDraft(null); } }} /></label>
            </div>
            <div className="personal-os-capacity-meter">
              <div><b>{plannedMinutes} min</b><span>{l('estimated commitments', 'estimasi komitmen')}</span></div>
              <div><b>{capacityMinutes} min</b><span>{l('daily capacity', 'kapasitas harian')}</span></div>
              <div className={capacityPercent > 100 ? 'over' : ''}><b>{capacityPercent}%</b><span>{capacityPercent > 100 ? l('over capacity', 'melebihi kapasitas') : l('planned load', 'beban rencana')}</span></div>
              <div className="personal-os-meter"><span style={{ width: `${Math.min(100, capacityPercent)}%` }} /></div>
            </div>
            <p className="personal-os-muted">{capacityPercent > 100 ? l('Your current open commitments exceed the time you said you have. Reduce scope or move work; do not pretend the day has more hours.', 'Komitmen terbuka melebihi waktu yang tersedia. Kurangi cakupan atau jadwalkan ulang; jangan berpura-pura hari punya lebih banyak jam.') : l('Estimates start at 30 minutes until you set them. Update the tasks below as you learn your real pace.', 'Estimasi awal 30 menit sampai kamu mengaturnya. Perbarui tugas di bawah seiring kamu memahami ritme kerjamu.')}</p>
          </div>
          <div className={panelClass}>
            <div className="eyebrow">{l('workload calibration', 'kalibrasi beban')}</div><h3>{l('Estimate open commitments', 'Estimasi komitmen terbuka')}</h3>
            <div className="personal-os-task-estimates">
              {openTasks.length === 0 && <p className="personal-os-muted">{l('No open tasks due or overdue today.', 'Tidak ada tugas terbuka yang jatuh tempo atau terlambat hari ini.')}</p>}
              {openTasks.map(task => <label className="personal-os-estimate-row" key={task.id}><span><b>{task.title}</b><small>{task.dueDate || l('No due date', 'Tanpa tenggat')}</small></span><input aria-label={l(`Estimated minutes for ${task.title}`, `Estimasi menit untuk ${task.title}`)} type="number" min="5" max="1440" className={fieldClass} defaultValue={os.capacity.taskEstimates[task.id] ?? task.estimatedMinutes ?? 30} onBlur={e => saveEstimate(task.id, Number(e.target.value))} /></label>)}
            </div>
          </div>
        </div>
      )}

      {tab === 'decisions' && (
        <div className="personal-os-layout">
          <div className={panelClass}>
            <div className="eyebrow">{l('decision intelligence', 'intelijen keputusan')}</div><h3>{l('Record a consequential decision', 'Catat keputusan penting')}</h3>
            <div className="personal-os-form">
              <label><span className={labelClass}>{l('Decision', 'Keputusan')}</span><input className={fieldClass} value={decisionTitle} onChange={e => setDecisionTitle(e.target.value)} placeholder={l('What are you deciding?', 'Apa yang sedang kamu putuskan?')} /></label>
              <label><span className={labelClass}>{l('Context / objective', 'Konteks / tujuan')}</span><textarea className={fieldClass} rows={2} value={decisionContext} onChange={e => setDecisionContext(e.target.value)} /></label>
              <label><span className={labelClass}>{l('Alternatives considered', 'Alternatif yang dipertimbangkan')}</span><textarea className={fieldClass} rows={2} value={decisionOptions} onChange={e => setDecisionOptions(e.target.value)} /></label>
              <label><span className={labelClass}>{l('Choice and rationale', 'Pilihan dan alasannya')}</span><textarea className={fieldClass} rows={2} value={decisionChoice} onChange={e => setDecisionChoice(e.target.value)} /></label>
              <label><span className={labelClass}>{l('Assumptions / blind spots', 'Asumsi / titik buta')}</span><textarea className={fieldClass} rows={2} value={decisionAssumptions} onChange={e => setDecisionAssumptions(e.target.value)} /></label>
              <label><span className={labelClass}>{l('Expected outcome', 'Hasil yang diprediksi')}</span><textarea className={fieldClass} rows={2} value={decisionPrediction} onChange={e => setDecisionPrediction(e.target.value)} /></label>
              <label><span className={labelClass}>{l('Review this decision on', 'Evaluasi keputusan pada')}</span><input type="date" className={fieldClass} value={decisionReviewAt} onChange={e => setDecisionReviewAt(e.target.value)} /></label>
              <button className={primaryClass} type="button" disabled={!decisionTitle.trim() || !decisionChoice.trim()} onClick={addDecision}>{l('Save decision', 'Simpan keputusan')}</button>
            </div>
          </div>
          <div className="personal-os-list">
            {os.decisions.map(item => <article className={panelClass} key={item.id}>
              <div className="personal-os-item-head"><h3>{item.title}</h3><button className="personal-os-remove" onClick={() => patchOS({ decisions: os.decisions.filter(d => d.id !== item.id) })}>{l('Delete', 'Hapus')}</button></div>
              {item.context && <p>{item.context}</p>}<div className="personal-os-evidence"><b>{l('Chosen', 'Dipilih')}</b><span>{item.choice}</span></div>
              {item.assumptions && <p className="personal-os-muted">{l('Assumptions', 'Asumsi')}: {item.assumptions}</p>}
              {item.prediction && <p className="personal-os-muted">{l('Predicted', 'Prediksi')}: {item.prediction}</p>}
              <label className="personal-os-inline-field"><span>{l('Actual outcome / review', 'Hasil aktual / evaluasi')} {item.reviewAt && `· ${item.reviewAt}`}</span><textarea className={fieldClass} rows={2} value={item.outcome} onChange={e => saveDecisionOutcome(item, e.target.value)} placeholder={l('What actually happened?', 'Apa yang benar-benar terjadi?')} /></label>
            </article>)}
            {os.decisions.length === 0 && <div className={panelClass}><p className="personal-os-muted">{l('Your decision history starts with the next meaningful choice.', 'Riwayat keputusan dimulai dari pilihan penting berikutnya.')}</p></div>}
          </div>
        </div>
      )}

      {tab === 'behavior' && (
        <div className="personal-os-list">
          <div className={panelClass}><div className="eyebrow">{l('behavior engine', 'mesin perilaku')}</div><h3>{l('Design the behavior, not just the streak.', 'Rancang perilakunya, bukan hanya streak.')}</h3><p className="personal-os-muted">{l('For each habit, define its cue, friction, difficulty and recovery plan. Completion data is evidence; it is not a judgment.', 'Untuk setiap kebiasaan, tentukan pemicu, hambatan, kesulitan, dan rencana pemulihan. Data penyelesaian adalah bukti, bukan penghakiman.')}</p></div>
          {data.habits.filter(h => h.active).map(habit => {
            const logs = data.habitLogs.filter(log => log.habitId === habit.id && log.date >= new Date(Date.now() - 13 * 86400000).toISOString().slice(0,10) && log.status === 'done');
            const rate = Math.round((logs.length / 14) * 100);
            return <article className={panelClass} key={habit.id}>
              <div className="personal-os-item-head"><h3>{habit.name}</h3><span className="personal-os-muted">{rate}% · {l('14-day check-ins', 'check-in 14 hari')}</span></div>
              <div className="personal-os-form personal-os-two">
                <label><span className={labelClass}>{l('Cue / trigger', 'Pemicu')}</span><input className={fieldClass} value={habit.cue ?? ''} onChange={e => updateHabit(habit.id, { cue: e.target.value })} placeholder={l('After I...', 'Setelah saya...')} /></label>
                <label><span className={labelClass}>{l('Friction / obstacle', 'Hambatan')}</span><input className={fieldClass} value={habit.friction ?? ''} onChange={e => updateHabit(habit.id, { friction: e.target.value })} placeholder={l('What makes it harder?', 'Apa yang membuatnya sulit?')} /></label>
                <label><span className={labelClass}>{l('Difficulty (1–5)', 'Kesulitan (1–5)')}</span><select className={fieldClass} value={habit.difficulty ?? 3} onChange={e => updateHabit(habit.id, { difficulty: Number(e.target.value) })}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
                <label><span className={labelClass}>{l('Recovery plan', 'Rencana pemulihan')}</span><input className={fieldClass} value={habit.recoveryPlan ?? ''} onChange={e => updateHabit(habit.id, { recoveryPlan: e.target.value })} placeholder={l('If I miss, I will...', 'Jika terlewat, saya akan...')} /></label>
              </div>
            </article>;
          })}
        </div>
      )}

      {tab === 'evidence' && (
        <div className="personal-os-layout">
          <div className={panelClass}>
            <div className="eyebrow">{l('knowledge validation', 'validasi pengetahuan')}</div><h3>{l('Capture a claim, not a guess.', 'Catat klaim, bukan tebakan.')}</h3>
            <div className="personal-os-form">
              <label><span className={labelClass}>{l('Claim about what you know / believe / can do', 'Klaim tentang yang kamu tahu / yakini / bisa lakukan')}</span><textarea className={fieldClass} rows={3} value={claimText} onChange={e => setClaimText(e.target.value)} /></label>
              <div className="personal-os-two">
                <label><span className={labelClass}>{l('Domain', 'Domain')}</span><input className={fieldClass} value={claimDomain} onChange={e => setClaimDomain(e.target.value)} /></label>
                <label><span className={labelClass}>{l('Source type', 'Jenis sumber')}</span><select className={fieldClass} value={claimSource} onChange={e => setClaimSource(e.target.value)}>{['Self-reported','Demonstrated','Documented','Repeated observation','AI inference'].map(s => <option key={s}>{s}</option>)}</select></label>
              </div>
              <label><span className={labelClass}>{l('Supporting evidence / context', 'Bukti pendukung / konteks')}</span><textarea className={fieldClass} rows={2} value={claimEvidence} onChange={e => setClaimEvidence(e.target.value)} /></label>
              <label><span className={labelClass}>{l('Confidence', 'Keyakinan')} · {claimConfidence}%</span><input type="range" min="0" max="100" step="5" value={claimConfidence} onChange={e => setClaimConfidence(Number(e.target.value))} /></label>
              <button className={primaryClass} type="button" disabled={!claimText.trim()} onClick={addClaim}>{l('Add provisional claim', 'Tambah klaim sementara')}</button>
            </div>
          </div>
          <div className="personal-os-list">
            {os.claims.map(claim => <article className={panelClass} key={claim.id}>
              <div className="personal-os-item-head"><span className={`personal-os-status ${claim.status}`}>{claim.status}</span><button className="personal-os-remove" onClick={() => patchOS({ claims: os.claims.filter(c => c.id !== claim.id) })}>{l('Delete', 'Hapus')}</button></div>
              <h3>{claim.claim}</h3><p className="personal-os-muted">{claim.domain} · {claim.source} · {claim.confidence}%</p>
              {claim.evidence && <p>{claim.evidence}</p>}
              <div className="personal-os-actions">
                <button className={buttonClass} onClick={() => patchOS({ claims: os.claims.map(c => c.id === claim.id ? { ...c, status: 'confirmed', verifiedAt: new Date().toISOString() } : c) })}>{l('Confirm', 'Konfirmasi')}</button>
                <button className={buttonClass} onClick={() => patchOS({ claims: os.claims.map(c => c.id === claim.id ? { ...c, status: 'disputed', verifiedAt: new Date().toISOString() } : c) })}>{l('Dispute', 'Bantah')}</button>
                <button className={buttonClass} onClick={() => patchOS({ claims: os.claims.map(c => c.id === claim.id ? { ...c, status: 'outdated', verifiedAt: new Date().toISOString() } : c) })}>{l('Outdated', 'Kedaluwarsa')}</button>
              </div>
            </article>)}
            {os.claims.length === 0 && <div className={panelClass}><p className="personal-os-muted">{l('No claims awaiting validation. Add a claim and keep its source visible.', 'Belum ada klaim yang menunggu validasi. Tambahkan klaim dan pertahankan sumbernya.')}</p></div>}
          </div>
        </div>
      )}

      {tab === 'reflection' && (
        <div className="personal-os-layout">
          <div className={panelClass}>
            <div className="eyebrow">{l('guided reflection', 'refleksi terpandu')}</div><h3>{l('Look for patterns, not labels.', 'Cari pola, bukan label.')}</h3>
            <p className="personal-os-muted">{l('Psychological interpretations are hypotheses. You decide whether they fit; the app does not diagnose your unconscious.', 'Interpretasi psikologis adalah hipotesis. Kamu yang menilai kecocokannya; aplikasi tidak mendiagnosis alam bawah sadarmu.')}</p>
            <div className="personal-os-form">
              <label><span className={labelClass}>{l('Reflection prompt', 'Pertanyaan refleksi')}</span><select className={fieldClass} value={reflectionPrompt} onChange={e => setReflectionPrompt(e.target.value)}>{PROMPTS.map(prompt => <option key={prompt}>{prompt}</option>)}</select></label>
              <label><span className={labelClass}>{l('Your answer', 'Jawabanmu')}</span><textarea className={fieldClass} rows={5} value={reflectionAnswer} onChange={e => setReflectionAnswer(e.target.value)} /></label>
              <label><span className={labelClass}>{l('Possible interpretation (optional)', 'Kemungkinan interpretasi (opsional)')}</span><textarea className={fieldClass} rows={2} value={reflectionInterpretation} onChange={e => setReflectionInterpretation(e.target.value)} placeholder={l('Keep this tentative, not a fact.', 'Biarkan ini sebagai dugaan, bukan fakta.')} /></label>
              <button className={primaryClass} type="button" disabled={!reflectionAnswer.trim()} onClick={addReflection}>{l('Save reflection', 'Simpan refleksi')}</button>
            </div>
          </div>
          <div className="personal-os-list">
            {os.reflections.map(item => <article className={panelClass} key={item.id}>
              <div className="personal-os-item-head"><span className="personal-os-status provisional">{item.date} · {l('reflection', 'refleksi')}</span><button className="personal-os-remove" onClick={() => patchOS({ reflections: os.reflections.filter(r => r.id !== item.id) })}>{l('Delete', 'Hapus')}</button></div>
              <h3>{item.prompt}</h3><p>{item.answer}</p>
              {item.interpretation && <div className="personal-os-evidence"><b>{l('Hypothesis · not a diagnosis', 'Hipotesis · bukan diagnosis')}</b><span>{item.interpretation}</span><div className="personal-os-actions"><button className={buttonClass} onClick={() => patchOS({ reflections: os.reflections.map(r => r.id === item.id ? { ...r, interpretationStatus: 'user-confirmed' } : r) })}>{l('Fits me', 'Sesuai')}</button><button className={buttonClass} onClick={() => patchOS({ reflections: os.reflections.map(r => r.id === item.id ? { ...r, interpretationStatus: 'rejected' } : r) })}>{l('Does not fit', 'Tidak sesuai')}</button></div></div>}
            </article>)}
            {os.reflections.length === 0 && <div className={panelClass}><p className="personal-os-muted">{l('Your reflection history will help reveal repeated situations and responses over time.', 'Riwayat refleksi membantu melihat situasi dan respons berulang dari waktu ke waktu.')}</p></div>}
          </div>
        </div>
      )}
    </section>
  );
}
