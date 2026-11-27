import type {
  HypothesisDecision,
  IndexedDataset,
  KnowledgeEdge,
  KnowledgeNode,
} from '../types/knowledge';

export interface ContextualRetrievalResult {
  node: KnowledgeNode;
  score: number;
  reason: string;
  pathIds: string[];
  relationship: string;
}

const BASIS_WEIGHT: Record<KnowledgeEdge['basis'], number> = {
  explicit: 1,
  established_academic: 0.9,
  co_discussed: 0.82,
  user_suggested: 0.68,
  inferred: 0.42,
  structural: 0.24,
};

function visible(nodeId: string, dataset: IndexedDataset, hideSensitive: boolean): boolean {
  return !hideSensitive || !dataset.sensitiveNodeIds.has(nodeId);
}

/**
 * Explainable graph retrieval. Relevance comes from recorded graph paths and
 * shared domains; evidence grade is displayed separately and never treated as truth.
 */
export function rankContextualNodes(
  dataset: IndexedDataset,
  contextNodeId: string,
  hideSensitive: boolean,
  decisions: Record<string, HypothesisDecision> = {},
  limit = 6
): ContextualRetrievalResult[] {
  const context = dataset.nodeById.get(contextNodeId);
  if (!context || !visible(contextNodeId, dataset, hideSensitive)) return [];

  const domains = new Set(context.domains);
  const adjacency = new Map<string, Array<{ edge: KnowledgeEdge; nextId: string }>>();

  for (const edge of dataset.raw.edges) {
    if (decisions[edge.id] === 'rejected') continue;
    if (!visible(edge.source, dataset, hideSensitive) || !visible(edge.target, dataset, hideSensitive)) continue;
    if (!dataset.nodeById.has(edge.source) || !dataset.nodeById.has(edge.target)) continue;
    const add = (from: string, nextId: string) => {
      const list = adjacency.get(from) ?? [];
      list.push({ edge, nextId });
      adjacency.set(from, list);
    };
    add(edge.source, edge.target);
    add(edge.target, edge.source);
  }

  const best = new Map<string, ContextualRetrievalResult>();
  const consider = (
    node: KnowledgeNode,
    pathIds: string[],
    edges: KnowledgeEdge[],
    pathWeight: number
  ) => {
    if (node.id === contextNodeId || !visible(node.id, dataset, hideSensitive)) return;
    const overlap = node.domains.filter((domain) => domains.has(domain)).length;
    const domainBoost = Math.min(0.18, overlap * 0.09);
    const score = pathWeight + domainBoost;
    const inferred = edges.some((edge) => edge.basis === 'inferred' && decisions[edge.id] !== 'confirmed');
    const relationship = edges.map((edge) => edge.relationship.replace(/_/g, ' ')).join(' → ');
    const reason = inferred
      ? 'Includes an unconfirmed inferred connection; treat as a suggestion.'
      : edges.length === 1
        ? `Directly connected via ${relationship || 'a recorded relationship'}.`
        : `Connected through ${dataset.nodeById.get(pathIds[1])?.title ?? 'an intermediate node'}.`;
    const result = { node, score, reason, pathIds, relationship };
    const previous = best.get(node.id);
    if (!previous || result.score > previous.score) best.set(node.id, result);
  };

  for (const first of adjacency.get(contextNodeId) ?? []) {
    const firstWeight = BASIS_WEIGHT[first.edge.basis] * (
      first.edge.basis === 'inferred' && decisions[first.edge.id] !== 'confirmed' ? 0.65 : 1
    );
    const firstNode = dataset.nodeById.get(first.nextId);
    if (!firstNode) continue;
    consider(firstNode, [contextNodeId, first.nextId], [first.edge], firstWeight);

    for (const second of adjacency.get(first.nextId) ?? []) {
      if (second.nextId === contextNodeId || second.nextId === first.nextId) continue;
      const secondWeight = BASIS_WEIGHT[second.edge.basis] * (
        second.edge.basis === 'inferred' && decisions[second.edge.id] !== 'confirmed' ? 0.65 : 1
      );
      const secondNode = dataset.nodeById.get(second.nextId);
      if (!secondNode) continue;
      consider(
        secondNode,
        [contextNodeId, first.nextId, second.nextId],
        [first.edge, second.edge],
        firstWeight * secondWeight * 0.62
      );
    }
  }

  // Shared-domain candidates are a low-priority fallback, clearly labelled as such.
  for (const node of dataset.raw.nodes) {
    if (node.id === contextNodeId || best.has(node.id) || !visible(node.id, dataset, hideSensitive)) continue;
    const overlap = node.domains.filter((domain) => domains.has(domain));
    if (overlap.length === 0) continue;
    best.set(node.id, {
      node,
      score: Math.min(0.16, overlap.length * 0.08),
      reason: `Shares the ${overlap.join(', ')} domain; no graph path is recorded.`,
      pathIds: [contextNodeId, node.id],
      relationship: 'shared domain only',
    });
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || b.node.mentions - a.node.mentions)
    .slice(0, limit);
}
