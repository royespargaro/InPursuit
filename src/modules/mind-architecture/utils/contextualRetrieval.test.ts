import { describe, expect, it } from 'vitest';
import type { IndexedDataset, KnowledgeEdge, KnowledgeNode } from '../types/knowledge';
import { rankContextualNodes } from './contextualRetrieval';

function node(id: string, type = 'Concept', domains = ['Work']): KnowledgeNode {
  return {
    id, title: id, type, domains, level: 1, engagement: 'active', lifecycle: null,
    lifecycle_basis: 'test', description: id, source_ids: [], evidence_classes: [],
    confidence: 'medium', mentions: 1, aliases: [], evidence_grade: 'Q4',
    first_observed_at: null, last_observed_at: null, observation_ids: [], question_ids: [],
  };
}

function edge(id: string, source: string, target: string, basis: KnowledgeEdge['basis']): KnowledgeEdge {
  return {
    id, source, target, relationship: 'supports', basis, explanation: 'test relationship',
    confidence: 'medium', source_ids: [], evidence_classes: [], assertion_level: 'test',
    claim_scope: 'test', review_status: 'test', presentation_rule: 'test', external_citation: null,
  };
}

function dataset(nodes: KnowledgeNode[], edges: KnowledgeEdge[], sensitive: string[] = []): IndexedDataset {
  return {
    raw: { nodes, edges } as IndexedDataset['raw'],
    nodeById: new Map(nodes.map((item) => [item.id, item])),
    sourceById: new Map(),
    edgesByNodeId: new Map(),
    domainNodes: nodes,
    sensitiveNodeIds: new Set(sensitive),
  };
}

describe('rankContextualNodes', () => {
  it('ranks direct explicit links above shared-domain-only candidates', () => {
    const context = node('goal', 'Goal');
    const linked = node('linked');
    const shared = node('shared');
    const results = rankContextualNodes(
      dataset([context, linked, shared], [edge('e1', 'goal', 'linked', 'explicit')]),
      'goal',
      false
    );
    expect(results[0]?.node.id).toBe('linked');
    expect(results.find((item) => item.node.id === 'shared')?.reason).toContain('no graph path');
  });

  it('excludes rejected hypotheses and down-weights unconfirmed inferred links', () => {
    const context = node('goal', 'Goal');
    const inferred = node('inferred');
    const rejected = node('rejected');
    const results = rankContextualNodes(
      dataset([context, inferred, rejected], [
        edge('e1', 'goal', 'inferred', 'inferred'),
        edge('e2', 'goal', 'rejected', 'explicit'),
      ]),
      'goal',
      false,
      { e2: 'rejected' }
    );
    expect(results.map((item) => item.node.id)).toEqual(['inferred']);
    expect(results[0].reason).toContain('unconfirmed inferred');
  });

  it('does not surface sensitive nodes when sensitivity filtering is enabled', () => {
    const context = node('goal', 'Goal');
    const privateNode = node('private');
    const results = rankContextualNodes(
      dataset([context, privateNode], [edge('e1', 'goal', 'private', 'explicit')], ['private']),
      'goal',
      true
    );
    expect(results).toHaveLength(0);
  });
});
