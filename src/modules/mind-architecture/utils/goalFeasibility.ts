import type { Goal } from '../../../types';
import type { EvidenceGrade, KnowledgeDataset, KnowledgeNode } from '../types/knowledge';

export type GoalFeasibilityLevel = 'needs_definition' | 'high_stretch' | 'plausible_with_constraints' | 'insufficient_evidence';

export interface GoalEvidenceMatch {
  node: KnowledgeNode;
  category: 'experience' | 'skill' | 'context';
  strength: 'strong' | 'supporting' | 'contextual';
  reason: string;
}

export interface SuggestedGoalAction {
  title: string;
  description: string;
  daysFromStart: number;
}

export interface GoalFeasibilityAssessment {
  goalId: string;
  goalTitle: string;
  deadline: string | null;
  daysRemaining: number | null;
  level: GoalFeasibilityLevel;
  label: string;
  summary: string;
  evidence: GoalEvidenceMatch[];
  strongEvidenceCount: number;
  supportingEvidenceCount: number;
  missingInformation: string[];
  risks: string[];
  suggestedActions: SuggestedGoalAction[];
  evidenceCoverage: 'strong' | 'partial' | 'thin' | 'none';
}

const JOB_TERMS = [
  'remote', 'job', 'career', 'employment', 'work', 'role', 'sales',
  'customer success', 'customer support', 'business development',
  'application', 'recruit', 'hiring', 'cv', 'resume', 'interview',
  'consultant', 'account executive', 'lead generation', 'english',
  'bahasa indonesia', 'communication',
];

const BUSINESS_TERMS = [
  'business', 'entrepreneur', 'revenue', 'customer', 'sales', 'marketing',
  'export', 'agency', 'client', 'acquisition', 'supplier', 'product',
];

const STUDY_TERMS = [
  'study', 'scholarship', 'university', 'master', 'degree', 'ielts',
  'toefl', 'language', 'research', 'academic', 'application',
];

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(start: string, end: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ' ');
}

function inferGoalFamily(goal: Goal): 'job' | 'business' | 'study' | 'general' {
  const text = normalize(`${goal.title} ${goal.outcome}`);
  if (JOB_TERMS.some((term) => text.includes(term))) return 'job';
  if (BUSINESS_TERMS.some((term) => text.includes(term))) return 'business';
  if (STUDY_TERMS.some((term) => text.includes(term))) return 'study';
  return 'general';
}

function gradeStrength(grade: EvidenceGrade): GoalEvidenceMatch['strength'] {
  if (grade === 'Q3' || grade === 'Q4') return 'strong';
  if (grade === 'Q2') return 'supporting';
  return 'contextual';
}

function evidenceReason(node: KnowledgeNode, family: ReturnType<typeof inferGoalFamily>): string {
  if (family === 'job' && node.type === 'Experience') return 'Relevant professional experience recorded in your knowledge archive.';
  if (family === 'job' && node.type === 'Skill') return 'A recorded skill that may support remote-role applications.';
  if (family === 'job' && (node.type === 'Goal' || node.type === 'Project')) return 'Related career or job-search context; this is not proof of an achieved outcome.';
  if (node.type === 'Experience') return 'Relevant experience recorded in your knowledge archive.';
  if (node.type === 'Skill') return 'A recorded skill that may support this goal.';
  return 'Related knowledge or prior context; validate its practical relevance.';
}

function familyTerms(family: ReturnType<typeof inferGoalFamily>): string[] {
  if (family === 'job') return JOB_TERMS;
  if (family === 'business') return BUSINESS_TERMS;
  if (family === 'study') return STUDY_TERMS;
  return [];
}

function relevanceScore(node: KnowledgeNode, goalText: string, terms: string[]): number {
  const title = normalize(node.title);
  const description = normalize(node.description);
  const aliases = node.aliases.map(normalize);
  const domains = node.domains.map(normalize);
  let score = 0;
  for (const token of goalText.split(/[^a-z0-9]+/).filter((part) => part.length > 2)) {
    if (title.includes(token)) score += 3;
    else if (aliases.some((alias) => alias.includes(token))) score += 2;
    else if (description.includes(token)) score += 1;
  }
  for (const term of terms) {
    if (title.includes(term)) score += 2.5;
    else if (aliases.some((alias) => alias.includes(term))) score += 2;
    else if (description.includes(term)) score += 1.25;
  }
  if (familyTermsForDomain(terms, domains)) score += 0.75;
  return score;
}

function familyTermsForDomain(terms: string[], domains: string[]): boolean {
  if (terms === JOB_TERMS) return domains.some((domain) => domain.includes('business') || domain.includes('education'));
  if (terms === BUSINESS_TERMS) return domains.some((domain) => domain.includes('business') || domain.includes('economics'));
  if (terms === STUDY_TERMS) return domains.some((domain) => domain.includes('education'));
  return false;
}

function buildJobActions(): SuggestedGoalAction[] {
  return [
    { title: 'Define the target role and success condition', description: 'Choose 1–2 role families, minimum acceptable pay, work arrangement, time zone and whether success means an offer or an interview pipeline.', daysFromStart: 0 },
    { title: 'Prepare one strong application package', description: 'Update the CV and LinkedIn around measurable sales, customer-success and management outcomes. Prepare a short remote-work introduction.', daysFromStart: 1 },
    { title: 'Build a qualified target list', description: 'Collect 20 relevant remote vacancies. Check location eligibility, compensation, contract type, English requirements and closing dates.', daysFromStart: 2 },
    { title: 'Submit focused applications', description: 'Tailor and submit applications to the strongest matches. Track role, company, fit, contact, date and follow-up.', daysFromStart: 3 },
    { title: 'Start direct outreach and interview preparation', description: 'Contact recruiters or hiring managers where appropriate; prepare concise examples of sales results, customer handling and remote collaboration.', daysFromStart: 5 },
  ];
}

function buildGeneralActions(goal: Goal): SuggestedGoalAction[] {
  return [
    { title: 'Define the finish line', description: 'Turn the goal into one observable outcome and write down exactly what counts as done.', daysFromStart: 0 },
    { title: 'Map requirements against existing evidence', description: 'Separate capabilities you already have evidence for from capabilities, resources or approvals still missing.', daysFromStart: 1 },
    { title: 'Choose the critical path', description: 'Identify the 2–3 milestones that most directly determine whether the outcome can happen by the deadline.', daysFromStart: 2 },
    { title: 'Execute the first measurable step', description: `Choose one action that creates external evidence of progress toward “${goal.title}”.`, daysFromStart: 3 },
  ];
}

/**
 * A deterministic, evidence-aware first-pass assessment. It is intentionally
 * transparent: this is not an AI prediction and it never guarantees an outcome.
 */
export function assessGoalFeasibility(
  goal: Goal,
  dataset: KnowledgeDataset | null,
  now = new Date(),
): GoalFeasibilityAssessment {
  const today = dateKey(now);
  const daysRemaining = goal.targetDate ? daysBetween(today, goal.targetDate) : null;
  const family = inferGoalFamily(goal);
  const goalText = normalize(`${goal.title} ${goal.outcome}`);
  const terms = familyTerms(family);
  const evidence = (dataset?.nodes ?? [])
    .filter((node) => !['Goal'].includes(node.type))
    .map((node) => ({ node, score: relevanceScore(node, goalText, terms) }))
    .filter((item) => item.score >= (family === 'general' ? 3 : 2.5))
    .sort((a, b) => {
      const gradeWeight = (grade: EvidenceGrade) => grade === 'Q4' ? 4 : grade === 'Q3' ? 3 : grade === 'Q2' ? 2 : 1;
      return b.score * gradeWeight(b.node.evidence_grade) - a.score * gradeWeight(a.node.evidence_grade);
    })
    .slice(0, 8)
    .map(({ node }) => ({
      node,
      category: node.type === 'Experience' ? 'experience' as const : node.type === 'Skill' ? 'skill' as const : 'context' as const,
      strength: gradeStrength(node.evidence_grade),
      reason: evidenceReason(node, family),
    }));

  const strongEvidenceCount = evidence.filter((item) => item.strength === 'strong' && item.category !== 'context').length;
  const supportingEvidenceCount = evidence.filter((item) => item.strength === 'supporting' && item.category !== 'context').length;
  const evidenceCoverage: GoalFeasibilityAssessment['evidenceCoverage'] =
    strongEvidenceCount >= 2 ? 'strong' : strongEvidenceCount + supportingEvidenceCount > 0 ? 'partial' : evidence.length > 0 ? 'thin' : 'none';

  const missingInformation: string[] = [];
  const risks: string[] = [];
  const hasOutcome = goal.outcome.trim().length >= 12;
  const hasSuccessCriteria = Boolean(goal.successCriteria?.some((item) => item.text.trim()));
  if (!hasOutcome) missingInformation.push('Define the observable result, not just the activity or aspiration.');
  if (!hasSuccessCriteria) missingInformation.push('Add a measurable success condition so the system knows what counts as achieved.');
  if (family === 'job') {
    missingInformation.push('Specify target role(s), minimum compensation, eligible locations/time zones and whether success means a signed offer or reaching interview stage.');
    if (!evidence.some((item) => item.node.type === 'Experience')) missingInformation.push('Add or verify relevant work experience in your knowledge archive.');
    if (daysRemaining !== null && daysRemaining <= 7) risks.push('A signed job offer within a week depends on employer response times and interview stages outside your control.');
    if (evidence.some((item) => /remote.*role|remote.*sales/i.test(item.node.title + ' ' + item.node.description))) {
      risks.push('Prior remote-role activity is recorded, but the archive does not establish that it resulted in an offer.');
    }
  }
  if (daysRemaining !== null && daysRemaining < 0) risks.push('The target date is already in the past. Reassess the deadline before planning.');
  else if (daysRemaining !== null && daysRemaining <= 7) risks.push('The deadline is very close; the plan needs a narrow scope and daily execution.');
  else if (daysRemaining !== null && daysRemaining <= 14) risks.push('The timeline leaves little room for delays or rework.');

  const needsDefinition = !hasOutcome || !hasSuccessCriteria;
  let level: GoalFeasibilityLevel;
  let label: string;
  let summary: string;
  if (evidenceCoverage === 'none') {
    level = 'insufficient_evidence';
    label = 'Insufficient evidence';
    summary = 'The knowledge archive does not yet contain enough relevant, verified evidence to assess this goal confidently.';
  } else if (needsDefinition) {
    level = 'needs_definition';
    label = 'Needs definition';
    summary = 'There is relevant prior knowledge, but the finish line is not specific enough to judge feasibility or build a reliable plan.';
  } else if (daysRemaining !== null && daysRemaining <= 7) {
    level = 'high_stretch';
    label = 'High-stretch deadline';
    summary = 'Relevant experience exists, but this deadline is aggressive. Treat the outcome as uncertain and focus on the parts you can control.';
  } else {
    level = 'plausible_with_constraints';
    label = 'Plausible with constraints';
    summary = 'The archive contains relevant evidence. Feasibility still depends on the missing requirements, available time and execution quality.';
  }

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    deadline: goal.targetDate || null,
    daysRemaining,
    level,
    label,
    summary,
    evidence,
    strongEvidenceCount,
    supportingEvidenceCount,
    missingInformation,
    risks: [...new Set(risks)],
    suggestedActions: family === 'job' ? buildJobActions() : buildGeneralActions(goal),
    evidenceCoverage,
  };
}
