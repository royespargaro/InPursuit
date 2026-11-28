import { AlertTriangle, ArrowRight, BrainCircuit, CalendarClock, CheckCircle2, CircleHelp, Target, X } from 'lucide-react';
import type { GoalFeasibilityAssessment } from '../modules/mind-architecture/utils/goalFeasibility';
import { useLanguage } from '../context/LanguageContext';
import { Button, Modal } from './ui';

interface GoalFeasibilityModalProps {
  assessment: GoalFeasibilityAssessment;
  onClose: () => void;
  onCreatePlan: () => void;
}

const levelStyles: Record<GoalFeasibilityAssessment['level'], string> = {
  needs_definition: 'border-[#ffb36b]/25 bg-[#ffb36b]/[0.07] text-[#ffca91]',
  high_stretch: 'border-[#ff8b3d]/30 bg-[#ff8b3d]/[0.08] text-[#ffb36b]',
  plausible_with_constraints: 'border-[#72e3a8]/25 bg-[#72e3a8]/[0.07] text-[#72e3a8]',
  insufficient_evidence: 'border-[#89a8ff]/25 bg-[#89a8ff]/[0.07] text-[#b9c8ff]',
};

export function GoalFeasibilityModal({ assessment, onClose, onCreatePlan }: GoalFeasibilityModalProps) {
  const { l } = useLanguage();
  const daysLabel = assessment.daysRemaining === null
    ? l('No deadline', 'Tanpa tenggat')
    : assessment.daysRemaining < 0
      ? l(`${Math.abs(assessment.daysRemaining)} days overdue`, `${Math.abs(assessment.daysRemaining)} hari melewati tenggat`)
      : assessment.daysRemaining === 0
        ? l('Due today', 'Tenggat hari ini')
        : l(`${assessment.daysRemaining} days remaining`, `${assessment.daysRemaining} hari tersisa`);

  return (
    <Modal
      title={l('Goal reality check', 'Pemeriksaan realitas tujuan')}
      eyebrow={l('Mind Architecture · evidence-based assessment', 'Arsitektur Pikiran · penilaian berbasis bukti')}
      onClose={onClose}
      className="max-w-3xl"
    >
      <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
        <div className={`rounded-xl border p-4 ${levelStyles[assessment.level]}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">{assessment.label}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px]"><CalendarClock size={13} />{daysLabel}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-[#f5f5f3]">{assessment.goalTitle}</h3>
          <p className="mt-2 text-xs leading-relaxed text-[#c1c6ce]">{assessment.summary}</p>
        </div>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <BrainCircuit size={15} className="text-[#d4ff3a]" />
            <h4 className="text-xs font-semibold text-[#f5f5f3]">{l('What your existing knowledge tells us', 'Apa yang ditunjukkan pengetahuanmu')}</h4>
          </div>
          {assessment.evidence.length === 0 ? (
            <p className="rounded-lg border border-white/[0.08] p-3 text-xs text-[#9ba3b0]">{l('No relevant knowledge was found in the current Mind Architecture dataset. Add experience, skills or evidence before relying on a feasibility assessment.', 'Tidak ditemukan pengetahuan relevan dalam data Arsitektur Pikiran saat ini. Tambahkan pengalaman, keterampilan, atau bukti sebelum mengandalkan penilaian kelayakan.')}</p>
          ) : (
            <div className="space-y-2">
              {assessment.evidence.map((item) => (
                <div key={item.node.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#f5f5f3]">{item.node.title}</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#9ba3b0]">{item.node.description || item.reason}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/[0.12] px-2 py-0.5 font-mono text-[9px] text-[#aeb5c0]">{item.node.evidence_grade} · {item.category}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[#7f8794]">{item.reason}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-[#7f8794]">{l('Q3/Q4 evidence indicates recorded experience or stronger evidence; Q1/Q2 is contextual or proposal-level. Related knowledge is not proof of current availability or a guaranteed outcome.', 'Bukti Q3/Q4 menunjukkan pengalaman tercatat atau bukti lebih kuat; Q1/Q2 bersifat kontekstual atau berupa usulan. Pengetahuan terkait bukan bukti ketersediaan saat ini atau jaminan hasil.')}</p>
        </section>

        {assessment.missingInformation.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <CircleHelp size={15} className="text-[#ffb36b]" />
              <h4 className="text-xs font-semibold text-[#f5f5f3]">{l('What is still unknown', 'Informasi yang masih belum diketahui')}</h4>
            </div>
            <ul className="space-y-1.5">
              {assessment.missingInformation.map((item) => <li key={item} className="flex gap-2 text-xs leading-relaxed text-[#b4bac4]"><span className="text-[#ffb36b]">•</span>{item}</li>)}
            </ul>
          </section>
        )}

        {assessment.risks.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle size={15} className="text-[#ff8b3d]" />
              <h4 className="text-xs font-semibold text-[#f5f5f3]">{l('Risks to account for', 'Risiko yang perlu diperhitungkan')}</h4>
            </div>
            <ul className="space-y-1.5">
              {assessment.risks.map((item) => <li key={item} className="flex gap-2 text-xs leading-relaxed text-[#b4bac4]"><span className="text-[#ff8b3d]">•</span>{item}</li>)}
            </ul>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center gap-2">
            <Target size={15} className="text-[#d4ff3a]" />
            <h4 className="text-xs font-semibold text-[#f5f5f3]">{l('Suggested first execution path', 'Jalur eksekusi awal yang disarankan')}</h4>
          </div>
          <div className="space-y-2">
            {assessment.suggestedActions.map((action, index) => (
              <div key={action.title} className="flex gap-3 rounded-lg border border-white/[0.07] p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-mono text-[10px] text-[#d4ff3a]">{index + 1}</span>
                <div>
                  <p className="text-xs font-medium text-[#f5f5f3]">{action.title}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#9ba3b0]">{action.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-[10px] leading-relaxed text-[#7f8794]">
          {l('This is a deterministic first-pass assessment from your saved knowledge and goal details, not an AI prediction. It will improve as you add evidence, define success criteria and record execution outcomes.', 'Ini adalah penilaian awal deterministik dari pengetahuan tersimpan dan detail tujuanmu, bukan prediksi AI. Penilaian akan membaik ketika kamu menambahkan bukti, menentukan kriteria keberhasilan, dan mencatat hasil eksekusi.')}
        </div>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-white/[0.08] pt-4 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={onClose}><X size={14} />{l('Close', 'Tutup')}</Button>
        <Button variant="solid" onClick={onCreatePlan}><ArrowRight size={14} />{l('Create suggested project & tasks', 'Buat proyek dan tugas yang disarankan')}</Button>
      </div>
    </Modal>
  );
}
