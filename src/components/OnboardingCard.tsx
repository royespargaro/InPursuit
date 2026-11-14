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

interface OnboardingCardProps {
  onDismiss: () => void;
  onApplyTemplate: (template: StarterTemplateOption) => void;
  onCreateGoal: () => void;
}

export function OnboardingCard({ onDismiss, onApplyTemplate, onCreateGoal }: OnboardingCardProps) {
  return (
    <section className="panel onboarding-card" aria-label="Getting started with InPursuit">
      <div className="panel-head">
        <div>
          <div className="eyebrow">how inpursuit works</div>
          <h2>Turn ambition into daily execution</h2>
        </div>
        <button type="button" className="icon-btn" aria-label="Dismiss onboarding guide" onClick={onDismiss}>
          <X size={16} />
        </button>
      </div>

      <p className="onboarding-lede">
        Start with outcomes, break them into up to three active projects, then pick today&apos;s Top-3 tasks and review honestly.
      </p>

      <div className="onboarding-loop" aria-label="Core execution workflow">
        <span>Life Areas</span>
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>Goals</span>
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>Projects (max 3)</span>
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>Tasks</span>
        <ArrowUpRight size={12} aria-hidden="true" />
        <strong>Today Top-3</strong>
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>Habits &amp; Review</span>
      </div>

      <div className="onboarding-templates">
        {STARTER_TEMPLATES.map(template => (
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
          <Check size={14} /> Create my own goal
        </Button>
        <button type="button" className="text-action" onClick={onDismiss}>
          Skip guide
        </button>
      </div>
    </section>
  );
}
