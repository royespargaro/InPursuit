import type { KnowledgeNode } from '../types/knowledge';

/** Product-level cognitive lenses inspired by memory science, not brain-region mappings. */
export type CognitiveLayerId = 'episodic' | 'semantic' | 'procedural' | 'executive' | 'reflective' | 'salience';

export interface CognitiveLayer {
  id: CognitiveLayerId;
  label: string;
  subtitle: string;
  description: string;
  count: number | null;
  status: 'modeled' | 'not_modeled';
}

const NODE_LAYER: Record<string, Exclude<CognitiveLayerId, 'salience'>> = {
  Experience: 'episodic', Conversation: 'episodic',
  Concept: 'semantic', Framework: 'semantic', Discipline: 'semantic',
  Subdiscipline: 'semantic', Tool: 'semantic', Person: 'semantic', Organization: 'semantic',
  Skill: 'procedural',
  Goal: 'executive', Project: 'executive', Problem: 'executive',
  Belief: 'reflective', Hypothesis: 'reflective',
};

export const COGNITIVE_LAYER_META: Record<Exclude<CognitiveLayerId, 'salience'>, Pick<CognitiveLayer, 'label' | 'subtitle' | 'description'>> = {
  episodic: { label: 'Episodic memory', subtitle: 'Experiences & conversations', description: 'Specific events, interactions and their context.' },
  semantic: { label: 'Semantic knowledge', subtitle: 'Concepts & understanding', description: 'Reusable knowledge, facts, frameworks and mental models.' },
  procedural: { label: 'Procedural capability', subtitle: 'Skills & practiced ability', description: 'Capabilities developed through practice and feedback.' },
  executive: { label: 'Active context', subtitle: 'Goals, projects & problems', description: 'Information currently organizing attention, planning and action.' },
  reflective: { label: 'Reflective models', subtitle: 'Beliefs & hypotheses', description: 'Personal interpretations that should remain open to evidence and revision.' },
};

export function classifyCognitiveLayer(node: KnowledgeNode): Exclude<CognitiveLayerId, 'salience'> | null {
  return NODE_LAYER[node.type] ?? null;
}

export function summarizeCognitiveLayers(nodes: KnowledgeNode[]): CognitiveLayer[] {
  const counts: Record<Exclude<CognitiveLayerId, 'salience'>, number> = {
    episodic: 0, semantic: 0, procedural: 0, executive: 0, reflective: 0,
  };
  for (const node of nodes) {
    const layer = classifyCognitiveLayer(node);
    if (layer) counts[layer] += 1;
  }
  const modeled = (Object.keys(COGNITIVE_LAYER_META) as Array<keyof typeof COGNITIVE_LAYER_META>).map((id) => ({
    id, ...COGNITIVE_LAYER_META[id], count: counts[id], status: 'modeled' as const,
  }));
  return [...modeled, {
    id: 'salience',
    label: 'Emotional significance',
    subtitle: 'Importance & affect',
    description: 'Not yet represented as explicit user-authored data. The system must not infer emotion from writing style or treat intensity as truth.',
    count: null,
    status: 'not_modeled' as const,
  }];
}
