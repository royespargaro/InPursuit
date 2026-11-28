import type { AppData, Goal, Habit, Project } from '../../../types';
import type { HypothesisDecision, KnowledgeDataset, KnowledgeNode } from '../types/knowledge';

export interface GoalExecutionSnapshot {
  goal: Goal;
  projects: Project[];
  tasks: AppData['tasks'];
  activeHabits: Habit[];
  requiredSkills: KnowledgeNode[];
  completedTasks: number;
  openTasks: number;
  overdueTasks: number;
}

export interface ExecutionRecommendation {
  id: string;
  kind: 'planning' | 'behavior' | 'capability' | 'attention';
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ExecutionIntelligence {
  activeGoals: GoalExecutionSnapshot[];
  activeProjects: number;
  openTasks: number;
  overdueTasks: number;
  activeHabits: number;
  linkedHabits: number;
  unlinkedHabits: number;
  mappedCapabilities: number;
  unmappedGoals: number;
  recommendations: ExecutionRecommendation[];
}

export function getGoalKnowledgeNodeId(goalId: string): string {
  return `goal_${goalId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isAcceptedRelationship(
  basis: string,
  edgeId: string,
  decisions: Record<string, HypothesisDecision>,
): boolean {
  if (basis === 'explicit' || basis === 'user_suggested') return true;
  return basis === 'inferred' && decisions[edgeId] === 'confirmed';
}

/**
 * Builds an explainable, read-only view across the existing execution workspace
 * and Mind Architecture graph. It deliberately does not invent skill requirements:
 * only explicit/user-suggested or user-confirmed graph links count as mappings.
 */
export function computeExecutionIntelligence(
  appData: AppData | null,
  dataset: KnowledgeDataset,
  decisions: Record<string, HypothesisDecision>,
  hideSensitive = true,
  sensitiveNodeIds: ReadonlySet<string> = new Set(),
  now = new Date(),
): ExecutionIntelligence | null {
  if (!appData) return null;

  const today = localDateKey(now);
  const skillNodes = dataset.nodes.filter((node) => node.type.toLowerCase() === 'skill' && (!hideSensitive || !sensitiveNodeIds.has(node.id)));
  const skillById = new Map(skillNodes.map((node) => [node.id, node]));
  const skillsByGoal = new Map<string, KnowledgeNode[]>();

  for (const edge of dataset.edges) {
    if (!isAcceptedRelationship(edge.basis, edge.id, decisions)) continue;
    const relationship = edge.relationship.toLowerCase().replace(/[\s-]+/g, '_');
    if (!/(requires|capability|skill|develops)/.test(relationship)) continue;

    const sourceSkill = skillById.get(edge.source);
    const targetSkill = skillById.get(edge.target);
    const sourceGoal = edge.source.startsWith('goal_') ? edge.source : null;
    const targetGoal = edge.target.startsWith('goal_') ? edge.target : null;
    const goalNodeId = sourceGoal && targetSkill ? sourceGoal : targetGoal && sourceSkill ? targetGoal : null;
    const skill = sourceGoal ? targetSkill : targetGoal ? sourceSkill : null;
    if (!goalNodeId || !skill) continue;
    const current = skillsByGoal.get(goalNodeId) ?? [];
    if (!current.some((item) => item.id === skill.id)) current.push(skill);
    skillsByGoal.set(goalNodeId, current);
  }

  const activeGoals = appData.goals
    .filter((goal) => goal.status === 'active')
    .map((goal): GoalExecutionSnapshot => {
      const projects = appData.projects.filter(
        (project) => project.goalId === goal.id && project.status !== 'archived' && project.status !== 'completed',
      );
      const projectIds = new Set(projects.map((project) => project.id));
      const tasks = appData.tasks.filter((task) => task.projectId && projectIds.has(task.projectId));
      const activeHabits = appData.habits.filter((habit) => habit.active && habit.goalId === goal.id);
      return {
        goal,
        projects,
        tasks,
        activeHabits,
        requiredSkills: skillsByGoal.get(getGoalKnowledgeNodeId(goal.id)) ?? [],
        completedTasks: tasks.filter((task) => task.status === 'done').length,
        openTasks: tasks.filter((task) => task.status === 'todo').length,
        overdueTasks: tasks.filter((task) => task.status === 'todo' && task.dueDate && task.dueDate < today).length,
      };
    });

  const activeProjects = appData.projects.filter(
    (project) => project.status === 'active' || project.status === 'planned',
  ).length;
  const openTasks = appData.tasks.filter((task) => task.status === 'todo').length;
  const overdueTasks = appData.tasks.filter(
    (task) => task.status === 'todo' && task.dueDate && task.dueDate < today,
  ).length;
  const activeHabits = appData.habits.filter((habit) => habit.active);
  const linkedHabits = activeHabits.filter((habit) =>
    Boolean(habit.goalId && appData.goals.some((goal) => goal.id === habit.goalId && goal.status === 'active')),
  ).length;
  const mappedCapabilities = activeGoals.reduce((total, item) => total + item.requiredSkills.length, 0);
  const unmappedGoals = activeGoals.filter((item) => item.requiredSkills.length === 0).length;

  const recommendations: ExecutionRecommendation[] = [];
  if (activeGoals.length === 0) {
    recommendations.push({
      id: 'no-active-goals',
      kind: 'planning',
      title: 'Establish an active direction',
      detail: 'There are no active goals in the execution workspace. Add a goal before asking the system to optimize your habits or projects.',
      priority: 'medium',
    });
  }

  for (const item of activeGoals) {
    if (item.projects.length === 0) {
      recommendations.push({
        id: `project-gap-${item.goal.id}`,
        kind: 'planning',
        title: `Give “${item.goal.title}” an execution path`,
        detail: 'This active goal has no linked active or planned project yet. Consider creating a project or milestone.',
        priority: 'high',
      });
    }
    if (item.activeHabits.length === 0) {
      recommendations.push({
        id: `habit-gap-${item.goal.id}`,
        kind: 'behavior',
        title: `Connect a repeatable behavior to “${item.goal.title}”`,
        detail: 'No active habit is explicitly linked to this goal. This is a missing relationship, not proof that you lack discipline.',
        priority: 'medium',
      });
    }
    if (item.requiredSkills.length === 0) {
      recommendations.push({
        id: `capability-gap-${item.goal.id}`,
        kind: 'capability',
        title: `Map the capabilities behind “${item.goal.title}”`,
        detail: 'No Skill node is explicitly connected to this goal with a capability relationship. Add or confirm the required skills before generating capability-based habits.',
        priority: 'medium',
      });
    }
  }

  if (overdueTasks > 0) {
    recommendations.push({
      id: 'overdue-tasks',
      kind: 'attention',
      title: `${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'} need attention`,
      detail: 'Review whether each item should be completed, rescheduled, delegated or removed. Do not let overdue work silently accumulate.',
      priority: 'high',
    });
  }

  return {
    activeGoals,
    activeProjects,
    openTasks,
    overdueTasks,
    activeHabits: activeHabits.length,
    linkedHabits,
    unlinkedHabits: activeHabits.length - linkedHabits,
    mappedCapabilities,
    unmappedGoals,
    recommendations: recommendations.slice(0, 6),
  };
}
