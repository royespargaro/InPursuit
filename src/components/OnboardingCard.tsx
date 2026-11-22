import { useLanguage, type AppLanguage } from '../context/LanguageContext';
import { ArrowUpRight, Check, Sparkles, X } from './Icon';
import { Button } from './ui';

export interface StarterTemplateOption {
  id: 'focus' | 'study' | 'builder';
  label: string;
  summary: string;
  areaName: string;
  goalTitle: string;
  goalOutcome: string;
  projectTitle: string;
  projectDescription: string;
  tasks: string[];
}

export const STARTER_TEMPLATES: readonly StarterTemplateOption[] = [
  {
    id: 'focus',
    label: 'Personal Focus',
    summary: 'Health routine + one concrete 2-week sprint.',
    areaName: 'Health',
    goalTitle: 'Build steady daily energy',
    goalOutcome: 'Sleep 7+ hours and finish key work before noon.',
    projectTitle: 'Two-week energy reset',
    projectDescription: 'Establish repeatable morning and evening anchors.',
    tasks: ['Set fixed sleep & wake window', 'Plan tomorrow Top-3 before bed', '30-minute brisk walk'],
  },
  {
    id: 'study',
    label: 'Study & Skill Growth',
    summary: 'Structured learning milestone with daily practice.',
    areaName: 'Education',
    goalTitle: 'Master a core practical skill',
    goalOutcome: 'Complete a capstone piece and document what you learned.',
    projectTitle: '4-week study sprint',
    projectDescription: 'Work through core lessons and build one tangible artifact.',
    tasks: ['Define curriculum & finish line', 'Schedule 45-min focused study block', 'Publish summary notes'],
  },
  {
    id: 'builder',
    label: 'Independent Builder',
    summary: 'Ship a clear milestone without over-planning.',
    areaName: 'Business',
    goalTitle: 'Launch a focused deliverable',
    goalOutcome: 'Reach real users and gather honest feedback.',
    projectTitle: 'Release milestone v1',
    projectDescription: 'Scope tightly, execute daily Top-3, and review weekly.',
    tasks: ['Write 3-sentence release scope', 'Complete top blocker task today', 'Share progress with 3 peers'],
  },
] as const;

const INDONESIAN_STARTER_TEMPLATES: readonly StarterTemplateOption[] = [
  {
    id: 'focus',
    label: 'Fokus Pribadi',
    summary: 'Rutinitas kesehatan + satu sprint konkret 2 minggu.',
    areaName: 'Kesehatan',
    goalTitle: 'Bangun energi harian yang stabil',
    goalOutcome: 'Tidur 7+ jam dan selesaikan pekerjaan utama sebelum siang.',
    projectTitle: 'Reset energi dua minggu',
    projectDescription: 'Membangun jangkar rutinitas pagi dan malam yang konsisten.',
    tasks: ['Tetapkan jam tidur & bangun tetap', 'Susun 3 prioritas besok sebelum tidur', 'Jalan cepat 30 menit'],
  },
  {
    id: 'study',
    label: 'Belajar & Keahlian',
    summary: 'Target belajar terstruktur dengan latihan harian.',
    areaName: 'Pendidikan',
    goalTitle: 'Kuasai satu keahlian praktis inti',
    goalOutcome: 'Selesaikan proyek akhir dan dokumentasikan hasil belajar.',
    projectTitle: 'Sprint belajar 4 minggu',
    projectDescription: 'Pelajari materi inti dan hasilkan satu karya nyata.',
    tasks: ['Tentukan kurikulum & garis akhir', 'Jadwalkan blok belajar fokus 45 menit', 'Tulis ringkasan catatan belajar'],
  },
  {
    id: 'builder',
    label: 'Pembangun Mandiri',
    summary: 'Rilis target nyata tanpa perencanaan berlebihan.',
    areaName: 'Bisnis',
    goalTitle: 'Luncurkan rilisan yang terfokus',
    goalOutcome: 'Jangkau pengguna nyata dan kumpulkan masukan jujur.',
    projectTitle: 'Target rilis v1',
    projectDescription: 'Batasi cakupan dengan ketat, jalankan Top-3 harian, dan evaluasi mingguan.',
    tasks: ['Tulis ruang lingkup rilis dalam 3 kalimat', 'Selesaikan tugas penghambat utama hari ini', 'Bagikan progres ke 3 rekan'],
  },
] as const;

export function getStarterTemplates(language: AppLanguage): readonly StarterTemplateOption[] {
  return language === 'id' ? INDONESIAN_STARTER_TEMPLATES : STARTER_TEMPLATES;
}

interface OnboardingCardProps {
  onDismiss: () => void;
  onApplyTemplate: (template: StarterTemplateOption) => void;
  onCreateGoal: () => void;
}

export function OnboardingCard({ onDismiss, onApplyTemplate, onCreateGoal }: OnboardingCardProps) {
  const { language, l } = useLanguage();
  const templates = getStarterTemplates(language);

  return (
    <section className="panel onboarding-card" aria-label={l('Getting started with InPursuit', 'Memulai dengan InPursuit')}>
      <div className="panel-head">
        <div>
          <div className="eyebrow">{l('how inpursuit works', 'cara kerja inpursuit')}</div>
          <h2>{l('Turn ambition into daily execution', 'Ubah ambisi menjadi eksekusi harian')}</h2>
        </div>
        <button type="button" className="icon-btn" aria-label={l('Dismiss onboarding guide', 'Tutup panduan awal')} onClick={onDismiss}>
          <X size={16} />
        </button>
      </div>

      <p className="onboarding-lede">
        {l(
          "Start with outcomes, break them into up to three active projects, then pick today's Top-3 tasks and review honestly.",
          'Mulai dari hasil yang ingin dicapai, pecah menjadi maksimal tiga proyek aktif, lalu pilih 3 prioritas hari ini dan evaluasi dengan jujur.',
        )}
      </p>

      <div className="onboarding-loop" aria-label={l('Core execution workflow', 'Alur eksekusi inti')}>
        <span>{l('Life Areas', 'Area Hidup')}</span>
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>{l('Goals', 'Tujuan')}</span>
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>{l('Projects (max 3)', 'Proyek (maks 3)')}</span>
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>{l('Tasks', 'Tugas')}</span>
        <ArrowUpRight size={12} aria-hidden="true" />
        <strong>{l('Today Top-3', '3 Prioritas Hari Ini')}</strong>
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>{l('Habits & Review', 'Kebiasaan & Evaluasi')}</span>
      </div>

      <div className="onboarding-templates">
        {templates.map(template => (
          <button
            key={template.id}
            type="button"
            className="onboarding-template-btn"
            onClick={() => onApplyTemplate(template)}
          >
            <div className="onboarding-template-head">
              <Sparkles size={13} aria-hidden="true" />
              <b>{template.label}</b>
            </div>
            <span>{template.summary}</span>
          </button>
        ))}
      </div>

      <div className="panel-foot onboarding-foot">
        <Button variant="outline" onClick={onCreateGoal}>
          <Check size={14} /> {l('Create my own goal', 'Buat tujuan sendiri')}
        </Button>
        <button type="button" className="text-action" onClick={onDismiss}>
          {l('Skip guide', 'Lewati panduan')}
        </button>
      </div>
    </section>
  );
}
