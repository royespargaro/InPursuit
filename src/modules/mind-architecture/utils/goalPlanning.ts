import type { Goal, Habit, Project, Task } from '../../../types';
import type { GoalFeasibilityAssessment } from './goalFeasibility';

export interface CapabilityRequirement {
  name: string;
  rationale: string;
  evidence: string[];
  status: 'evidenced' | 'partial' | 'gap';
}

export interface PlanMilestone {
  title: string;
  outcome: string;
  tasks: string[];
  dayOffset: number;
}

export interface HabitRecommendation {
  name: string;
  rationale: string;
  frequency: Habit['frequency'];
  minimumVersion: string;
  goalLinked: true;
}

export interface GoalPlanBlueprint {
  strategy: string;
  requirements: CapabilityRequirement[];
  milestones: PlanMilestone[];
  habits: HabitRecommendation[];
  planningNotes: string[];
}

const REQUIREMENTS: Record<string, Array<{ name: string; terms: string[]; rationale: string }>> = {
  job: [
    { name: 'Role positioning', terms: ['sales', 'customer success', 'customer support', 'account management', 'business development', 'consultant', 'manager'], rationale: 'Translate previous work into a clear match for a specific role family.' },
    { name: 'Application assets', terms: ['cv', 'resume', 'linkedin', 'portfolio', 'writing'], rationale: 'Present evidence and measurable outcomes in a recruiter-friendly format.' },
    { name: 'Hiring communication', terms: ['communication', 'english', 'interview', 'negotiation', 'language'], rationale: 'Explain achievements clearly and handle screening or interviews.' },
    { name: 'Targeted opportunity sourcing', terms: ['research', 'recruitment', 'lead generation', 'networking'], rationale: 'Find legitimate vacancies where location, compensation and experience fit.' },
  ],
  business: [
    { name: 'Customer discovery', terms: ['research', 'customer', 'market', 'interview'], rationale: 'Validate a real customer problem and willingness to pay.' },
    { name: 'Offer and positioning', terms: ['marketing', 'product', 'strategy', 'communication'], rationale: 'Explain who the offer serves and why it is valuable.' },
    { name: 'Sales and delivery', terms: ['sales', 'client', 'project management', 'operations'], rationale: 'Acquire customers and deliver what was promised.' },
    { name: 'Financial control', terms: ['finance', 'accounting', 'budget', 'pricing'], rationale: 'Understand costs, pricing, cash flow and margin.' },
  ],
  study: [
    { name: 'Academic readiness', terms: ['research', 'academic', 'writing', 'language'], rationale: 'Demonstrate the academic preparation required by the programme.' },
    { name: 'Application package', terms: ['application', 'cv', 'resume', 'motivation', 'writing'], rationale: 'Prepare a coherent and complete application.' },
    { name: 'Funding and eligibility research', terms: ['scholarship', 'funding', 'research', 'university'], rationale: 'Verify eligibility, deadlines, funding and documentation.' },
  ],
  general: [
    { name: 'Domain knowledge', terms: ['knowledge', 'research', 'concept', 'framework'], rationale: 'Understand the subject and the conditions for success.' },
    { name: 'Practical execution', terms: ['experience', 'skill', 'project', 'practice'], rationale: 'Turn understanding into observable work and results.' },
    { name: 'Feedback and measurement', terms: ['analysis', 'communication', 'review', 'measurement'], rationale: 'Measure outcomes and adjust the approach.' },
  ],
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ' ');
}

function inferFamily(goal: Goal): keyof typeof REQUIREMENTS {
  const text = normalize(`${goal.title} ${goal.outcome}`);
  if (/remote|job|employment|career|interview|hiring|recruit|vacancy/.test(text)) return 'job';
  if (/business|entrepreneur|export|agency|revenue|client|startup/.test(text)) return 'business';
  if (/study|scholarship|university|master|degree|ielts|toefl|academic/.test(text)) return 'study';
  return 'general';
}

export function buildGoalPlanBlueprint(
  goal: Goal,
  assessment: GoalFeasibilityAssessment,
): GoalPlanBlueprint {
  const family = inferFamily(goal);
  const requirements = REQUIREMENTS[family].map((requirement) => {
    const evidence = assessment.evidence
      .filter((item) => {
        const haystack = normalize(`${item.node.title} ${item.node.description} ${item.node.aliases.join(' ')}`);
        return requirement.terms.some((term) => haystack.includes(term));
      })
      .map((item) => item.node.title);
    const hasStrong = assessment.evidence.some((item) =>
      evidence.includes(item.node.title) && item.strength === 'strong' && item.category !== 'context',
    );
    return {
      name: requirement.name,
      rationale: requirement.rationale,
      evidence,
      status: hasStrong ? 'evidenced' as const : evidence.length ? 'partial' as const : 'gap' as const,
    };
  });

  const milestones = assessment.suggestedActions.map((action, index) => ({
    title: action.title,
    outcome: action.description,
    tasks: [action.title],
    dayOffset: action.daysFromStart,
  }));

  const habits: HabitRecommendation[] = family === 'job'
    ? [{
        name: 'Focused job-search block',
        rationale: 'Maintain consistent, high-fit applications and direct outreach without mistaking volume for progress.',
        frequency: 'weekdays',
        minimumVersion: 'Complete one high-quality application or one relevant recruiter conversation.',
        goalLinked: true,
      }]
    : family === 'study'
      ? [{
          name: 'Focused study/application block',
          rationale: 'Protect recurring time for preparation and application work.',
          frequency: 'weekdays',
          minimumVersion: 'Complete 20 minutes of focused preparation.',
          goalLinked: true,
        }]
      : [];

  const gaps = requirements.filter((item) => item.status === 'gap').map((item) => item.name);
  const planningNotes = [
    'Requirements are inferred from the goal category and available evidence; review them before treating them as facts.',
    ...(gaps.length ? [`Capability gaps needing validation: ${gaps.join(', ')}.`] : []),
    ...(assessment.daysRemaining !== null && assessment.daysRemaining <= 7
      ? ['Short deadline: prioritize actions under your control; employer, institution or customer decisions remain external dependencies.']
      : []),
    ...(habits.length ? ['The habit is optional support for recurring behavior; the project and its tasks remain the main outcome-producing work.'] : ['No recurring habit is recommended by default; add one only if repetition is genuinely required.']),
  ];

  const strategy = family === 'job'
    ? 'Position existing experience against a narrow set of suitable roles, build a qualified pipeline, then convert recruiter responses into interviews.'
    : family === 'business'
      ? 'Validate the customer and offer first, then build a small acquisition and delivery loop with measurable commercial evidence.'
      : family === 'study'
        ? 'Verify eligibility and deadlines first, strengthen the application evidence, then submit a complete and tailored package.'
        : 'Identify the critical requirements, execute the smallest meaningful milestone, and use feedback to refine the route.';

  return { strategy, requirements, milestones, habits, planningNotes };
}

export function createGoalPlanRecords(
  goal: Goal,
  blueprint: GoalPlanBlueprint,
  options: { now: Date; today: string; projectStatus: Project['status']; id: () => string },
): { project: Project; tasks: Task[]; habits: Habit[] } {
  const { now, today, projectStatus, id } = options;
  const createdAt = now.toISOString();
  const projectId = id();
  const project: Project = {
    id: projectId,
    goalId: goal.id,
    title: `Execution plan · ${goal.title}`,
    description: `${blueprint.strategy}\n\nReview the inferred requirements and milestones as new evidence arrives.`,
    dueDate: goal.targetDate || '',
    status: projectStatus,
    createdAt,
    startDate: today,
    exitCondition: goal.successCriteria?.map((criterion) => criterion.text).filter(Boolean).join('; ') || goal.outcome || goal.title,
  };
  const tasks = blueprint.milestones.map((milestone, index) => {
    const due = new Date(`${today}T12:00:00`);
    const target = goal.targetDate ? new Date(`${goal.targetDate}T12:00:00`) : null;
    const offset = target && !Number.isNaN(target.getTime())
      ? Math.min(milestone.dayOffset, Math.max(0, Math.round((target.getTime() - due.getTime()) / 86_400_000)))
      : milestone.dayOffset;
    due.setDate(due.getDate() + offset);
    const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    return {
      id: id(),
      projectId,
      title: milestone.title,
      dueDate,
      priority: index < 2 ? 'high' as const : 'medium' as const,
      status: 'todo' as const,
      createdAt,
      completedAt: null,
    };
  });
  const habits: Habit[] = blueprint.habits.map((recommendation) => ({
    id: id(),
    name: recommendation.name,
    frequency: recommendation.frequency,
    active: true,
    createdAt,
    minimumVersion: recommendation.minimumVersion,
    goalId: goal.id,
  }));
  return { project, tasks, habits };
}
