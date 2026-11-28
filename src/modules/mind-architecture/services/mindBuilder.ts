import type { AppData } from '../../../types';
import type {
  ConnectionBasis,
  CoverageRow,
  EvidenceGrade,
  HypothesisDecision,
  IndexedDataset,
  KnowledgeDataset,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeSource,
} from '../types/knowledge';
import { getDomainTheme } from '../utils/dataset';

const DEFAULT_EVIDENCE_CLASSES: Record<string, string> = {
  E1_user_conversation: 'Direct user conversation or journal transcript',
  E2_user_summary: 'Curated user summary or self-authored reflection',
  E3_workspace_goal: 'Active InPursuit goal, phase, or life area commitment',
  E4_assistant_proposal: 'Structured proposal or inferred synthesis',
};

const DEFAULT_CONNECTION_BASES: Record<string, string> = {
  explicit: 'Directly stated relationship in user note or source',
  user_suggested: 'User-defined conceptual chain or personal bridge',
  co_discussed: 'Items explored together within a single entry',
  inferred: 'Suggested synthesis awaiting user review',
  structural: 'Domain/taxonomy membership grouping',
  established_academic: 'External academic citation',
};

const DEFAULT_EVIDENCE_GRADES: Record<string, string> = {
  Q4: 'Direct original transcript or verified multi-source anchor',
  Q3: 'Practiced commitment, recurring reflection, or multi-summary anchor',
  Q2: 'Single summary entry or articulated note',
  Q1: 'Initial hypothesis or tentative brief entry',
};

export function createMindId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20) || 'item';
  return `${safePrefix}_${random}`;
}

export function createEmptyMindDataset(version = 'custom-1.0'): KnowledgeDataset {
  return recomputeDerivedDatasetStats({
    version,
    evidence_classes: { ...DEFAULT_EVIDENCE_CLASSES },
    connection_bases: { ...DEFAULT_CONNECTION_BASES },
    sources: [],
    nodes: [],
    edges: [],
    conflicts: [],
    rules: [
      'User-authored nodes and relationships are preserved verbatim.',
      'Inferred links remain tentative until explicitly confirmed or dismissed.',
    ],
    evidence_grades: { ...DEFAULT_EVIDENCE_GRADES },
    entity_tables: {
      conversations: [],
      messages: [],
      questions: [],
      question_threads: [],
      observations: [],
      positions: [],
      position_changes: [],
      resolution_queue: [],
      ingest_ledger: [],
      resolution_events: [],
    },
    entity_schemas: {
      conversation: [],
      message: [],
      question: [],
      question_thread: [],
      observation: [],
      position: [],
      position_change: [],
      resolution_event: [],
    },
    change_log: [],
    coverage_matrix: [],
    data_quality: {
      duplicate_node_ids: 0,
      dangling_edges: 0,
      edges_missing_sources: 0,
      nodes_missing_sources: 0,
      evidence_class_mismatch: 0,
      conversation_nodes_without_id_or_date: 0,
      sources_without_conversation_id: 0,
      lifecycle_missing: 0,
      lifecycle_unknown_or_unverified: 0,
      evidence_grades: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
      edge_bases: {
        explicit: 0,
        user_suggested: 0,
        co_discussed: 0,
        inferred: 0,
        structural: 0,
        established_academic: 0,
      },
      inferred_unreviewed: 0,
      structural_share: 0,
      structural_from_assistant_groupings: 0,
      nodes_with_only_structural_edges: 0,
      nodes_without_edges: 0,
      multi_domain_nodes: 0,
      nodes_without_domain: 0,
      assistant_proposed_nodes: 0,
      brief_only_nodes: 0,
      possible_duplicates: 0,
      sensitive_review: [],
    },
  });
}

export function cloneDatasetForCustomization(source: KnowledgeDataset): KnowledgeDataset {
  const cloned = JSON.parse(JSON.stringify(source)) as KnowledgeDataset;
  return recomputeDerivedDatasetStats(cloned);
}

export function recomputeDerivedDatasetStats(raw: KnowledgeDataset): KnowledgeDataset {
  const nodeIds = new Set(raw.nodes.map((n) => n.id));
  const validEdges = raw.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Build domain buckets preserving Discipline order first
  const domainNames: string[] = [];
  const seenDomains = new Set<string>();
  for (const node of raw.nodes) {
    if (node.type === 'Discipline' && node.title && !seenDomains.has(node.title)) {
      seenDomains.add(node.title);
      domainNames.push(node.title);
    }
  }
  for (const node of raw.nodes) {
    for (const d of node.domains) {
      if (d && !seenDomains.has(d)) {
        seenDomains.add(d);
        domainNames.push(d);
      }
    }
  }

  const hasUnmapped = raw.nodes.some((n) => n.domains.length === 0);
  const matrixDomains = hasUnmapped ? [...domainNames, '(no domain)'] : domainNames;

  const edgesByNode = new Map<string, KnowledgeEdge[]>();
  for (const n of raw.nodes) edgesByNode.set(n.id, []);
  for (const e of validEdges) {
    edgesByNode.get(e.source)?.push(e);
    if (e.target !== e.source) edgesByNode.get(e.target)?.push(e);
  }

  const coverage_matrix: CoverageRow[] = matrixDomains.map((domain) => {
    const members = raw.nodes.filter((n) =>
      domain === '(no domain)' ? n.domains.length === 0 : n.domains.includes(domain)
    );
    const memberIds = new Set(members.map((m) => m.id));
    const touchingEdges = validEdges.filter(
      (e) => memberIds.has(e.source) || memberIds.has(e.target)
    );
    const srcIds = new Set<string>();
    const srcClasses = new Set<string>();
    for (const m of members) {
      for (const sid of m.source_ids) srcIds.add(sid);
      for (const ec of m.evidence_classes) srcClasses.add(ec);
    }

    const q1 = members.filter((m) => m.evidence_grade === 'Q1').length;
    const q2 = members.filter((m) => m.evidence_grade === 'Q2').length;
    const q3 = members.filter((m) => m.evidence_grade === 'Q3').length;
    const q4 = members.filter((m) => m.evidence_grade === 'Q4').length;
    const explicitEdges = touchingEdges.filter((e) => e.basis === 'explicit').length;
    const inferredEdges = touchingEdges.filter((e) => e.basis === 'inferred').length;
    const missing: string[] = [];
    if (q3 === 0 && q4 === 0 && members.length > 0) missing.push('No Q3/Q4 practiced evidence yet');
    if (explicitEdges === 0 && members.length > 1) missing.push('No explicit cross-node links');

    return {
      domain,
      nodes: members.length,
      subdomains: members.filter((m) => m.type === 'Subdiscipline').length,
      concepts: members.filter((m) => m.type === 'Concept').length,
      questions: members.filter((m) => m.type === 'Question').length,
      projects_experiences: members.filter(
        (m) => m.type === 'Project' || m.type === 'Experience'
      ).length,
      goals: members.filter((m) => m.type === 'Goal').length,
      grade_Q1: q1,
      grade_Q2: q2,
      grade_Q3: q3,
      grade_Q4: q4,
      source_records: srcIds.size,
      source_classes: Array.from(srcClasses),
      edges_touching: touchingEdges.length,
      explicit_edges: explicitEdges,
      inferred_edges: inferredEdges,
      missing,
    };
  });

  const evidence_grades: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  for (const n of raw.nodes) {
    evidence_grades[n.evidence_grade] = (evidence_grades[n.evidence_grade] ?? 0) + 1;
  }

  const edge_bases: Record<string, number> = {
    explicit: 0,
    user_suggested: 0,
    co_discussed: 0,
    inferred: 0,
    structural: 0,
    established_academic: 0,
  };
  for (const e of validEdges) {
    edge_bases[e.basis] = (edge_bases[e.basis] ?? 0) + 1;
  }

  let nodesWithoutEdges = 0;
  let nodesOnlyStructural = 0;
  for (const n of raw.nodes) {
    const list = edgesByNode.get(n.id) ?? [];
    if (list.length === 0) nodesWithoutEdges += 1;
    else if (list.every((e) => e.basis === 'structural')) nodesOnlyStructural += 1;
  }

  const structuralCount = edge_bases.structural ?? 0;
  const structuralShare =
    validEdges.length > 0 ? Number((structuralCount / validEdges.length).toFixed(3)) : 0;

  return {
    ...raw,
    edges: validEdges,
    coverage_matrix,
    data_quality: {
      ...(raw.data_quality ?? {}),
      duplicate_node_ids: 0,
      dangling_edges: raw.edges.length - validEdges.length,
      edges_missing_sources: validEdges.filter((e) => e.source_ids.length === 0).length,
      nodes_missing_sources: raw.nodes.filter((n) => n.source_ids.length === 0).length,
      evidence_class_mismatch: 0,
      conversation_nodes_without_id_or_date: 0,
      sources_without_conversation_id: raw.sources.filter((s) => !s.conversation_id).length,
      lifecycle_missing: raw.nodes.filter((n) => !n.lifecycle).length,
      lifecycle_unknown_or_unverified: 0,
      evidence_grades,
      edge_bases,
      inferred_unreviewed: edge_bases.inferred ?? 0,
      structural_share: structuralShare,
      structural_from_assistant_groupings: structuralCount,
      nodes_with_only_structural_edges: nodesOnlyStructural,
      nodes_without_edges: nodesWithoutEdges,
      multi_domain_nodes: raw.nodes.filter((n) => n.domains.length > 1).length,
      nodes_without_domain: raw.nodes.filter((n) => n.domains.length === 0).length,
      assistant_proposed_nodes: raw.nodes.filter((n) => n.evidence_grade === 'Q1').length,
      brief_only_nodes: raw.nodes.filter((n) => n.evidence_grade === 'Q1').length,
      possible_duplicates: 0,
      sensitive_review: raw.data_quality?.sensitive_review ?? [],
    },
  };
}

export interface UpsertMindNodeInput {
  id?: string;
  title: string;
  type: string;
  domains: string[];
  description: string;
  evidence_grade: EvidenceGrade;
  lifecycle?: string | null;
  confidence?: string;
  sourceTitle?: string;
}

export function upsertMindNode(
  dataset: KnowledgeDataset,
  input: UpsertMindNodeInput
): { dataset: KnowledgeDataset; nodeId: string } {
  const title = input.title.trim().slice(0, 140);
  if (!title) return { dataset, nodeId: '' };

  const todayStr = new Date().toISOString().slice(0, 10);
  const existingIdx = input.id ? dataset.nodes.findIndex((n) => n.id === input.id) : -1;
  const nodeId = existingIdx >= 0 ? dataset.nodes[existingIdx].id : createMindId('node');

  const cleanDomains = Array.from(
    new Set(input.domains.map((d) => d.trim()).filter(Boolean))
  ).slice(0, 4);

  let nextSources = [...dataset.sources];
  let sourceIds = existingIdx >= 0 ? [...dataset.nodes[existingIdx].source_ids] : [];
  let evidenceClasses = existingIdx >= 0 ? [...dataset.nodes[existingIdx].evidence_classes] : ['E2_user_summary'];

  if (input.sourceTitle?.trim()) {
    const srcId = createMindId('src');
    nextSources.push({
      id: srcId,
      evidence_class: 'E2_user_summary',
      source_type: 'user_entry',
      description: input.sourceTitle.trim().slice(0, 280),
      date: todayStr,
      date_meaning: 'user_authored',
      conversation_id: null,
      original_available: true,
      reliability: 'user_authored',
    });
    sourceIds = Array.from(new Set([...sourceIds, srcId]));
  } else if (sourceIds.length === 0) {
    let defaultSrc = nextSources.find((s) => s.id === 'src_user_manual');
    if (!defaultSrc) {
      defaultSrc = {
        id: 'src_user_manual',
        evidence_class: 'E2_user_summary',
        source_type: 'manual_workspace',
        description: 'Direct user entries in InPursuit Mind Architecture',
        date: todayStr,
        date_meaning: 'workspace_created',
        conversation_id: null,
        original_available: true,
        reliability: 'user_authored',
      };
      nextSources.push(defaultSrc);
    }
    sourceIds = [defaultSrc.id];
  }

  let nextNodes = [...dataset.nodes];
  let nextEdges = [...dataset.edges];

  // Ensure Discipline anchor exists for non-Discipline domains when added
  if (input.type !== 'Discipline') {
    for (const domName of cleanDomains) {
      let disciplineNode = nextNodes.find(
        (n) => n.type === 'Discipline' && n.title.toLowerCase() === domName.toLowerCase()
      );
      if (!disciplineNode) {
        disciplineNode = {
          id: createMindId('disc'),
          title: domName,
          type: 'Discipline',
          domains: [domName],
          level: 1,
          engagement: 'active',
          lifecycle: 'active',
          lifecycle_basis: 'user_authored',
          description: `Personal intellectual domain: ${domName}`,
          source_ids: [sourceIds[0]],
          evidence_classes: ['E2_user_summary'],
          confidence: 'high',
          mentions: 1,
          aliases: [],
          evidence_grade: 'Q3',
          first_observed_at: todayStr,
          last_observed_at: todayStr,
          observation_ids: [],
          question_ids: [],
        };
        nextNodes.push(disciplineNode);
      }
      // Link new node structurally to its primary discipline if no link exists yet
      if (domName === cleanDomains[0] && existingIdx === -1) {
        nextEdges.push({
          id: createMindId('edge'),
          source: disciplineNode.id,
          target: nodeId,
          relationship: 'contains',
          basis: 'structural',
          explanation: `${title} belongs to ${disciplineNode.title}.`,
          confidence: 'high',
          source_ids: [sourceIds[0]],
          evidence_classes: ['E2_user_summary'],
          assertion_level: 'structural_grouping',
          claim_scope: 'personal',
          review_status: 'verified',
          presentation_rule: 'Always visible in structural layer',
          external_citation: null,
        });
      }
    }
  }

  const nextNode: KnowledgeNode =
    existingIdx >= 0
      ? {
          ...nextNodes[existingIdx],
          title,
          type: input.type || nextNodes[existingIdx].type,
          domains: input.type === 'Discipline' ? [title] : cleanDomains,
          description: input.description.trim().slice(0, 1200),
          evidence_grade: input.evidence_grade,
          lifecycle: input.lifecycle ?? nextNodes[existingIdx].lifecycle,
          confidence: input.confidence ?? nextNodes[existingIdx].confidence,
          source_ids: sourceIds,
          evidence_classes: evidenceClasses,
          last_observed_at: todayStr,
        }
      : {
          id: nodeId,
          title,
          type: input.type || 'Concept',
          domains: input.type === 'Discipline' ? [title] : cleanDomains,
          level: input.type === 'Discipline' ? 1 : input.type === 'Subdiscipline' ? 2 : 3,
          engagement: input.evidence_grade === 'Q3' || input.evidence_grade === 'Q4' ? 'practiced' : 'explored',
          lifecycle: input.lifecycle ?? 'active',
          lifecycle_basis: 'user_authored',
          description: input.description.trim().slice(0, 1200),
          source_ids: sourceIds,
          evidence_classes: evidenceClasses,
          confidence: input.confidence ?? 'high',
          mentions: 1,
          aliases: [],
          evidence_grade: input.evidence_grade,
          first_observed_at: todayStr,
          last_observed_at: todayStr,
          observation_ids: [],
          question_ids: [],
        };

  if (existingIdx >= 0) {
    const oldTitle = nextNodes[existingIdx].title;
    nextNodes[existingIdx] = nextNode;
    if (nextNode.type === 'Discipline' && oldTitle !== nextNode.title) {
      nextNodes = nextNodes.map((n) =>
        n.id === nextNode.id
          ? n
          : { ...n, domains: n.domains.map((d) => (d === oldTitle ? nextNode.title : d)) }
      );
    }
  } else {
    nextNodes.push(nextNode);
  }

  return {
    dataset: recomputeDerivedDatasetStats({
      ...dataset,
      sources: nextSources,
      nodes: nextNodes,
      edges: nextEdges,
    }),
    nodeId,
  };
}

export function deleteMindNode(dataset: KnowledgeDataset, nodeId: string): KnowledgeDataset {
  const target = dataset.nodes.find((n) => n.id === nodeId);
  if (!target) return dataset;

  let nextNodes = dataset.nodes.filter((n) => n.id !== nodeId);
  if (target.type === 'Discipline') {
    nextNodes = nextNodes.map((n) => ({
      ...n,
      domains: n.domains.filter((d) => d !== target.title),
    }));
  }
  const nextEdges = dataset.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);

  return recomputeDerivedDatasetStats({
    ...dataset,
    nodes: nextNodes,
    edges: nextEdges,
  });
}

export interface AddMindEdgeInput {
  source: string;
  target: string;
  relationship: string;
  basis: ConnectionBasis;
  explanation: string;
}

export function addMindEdge(dataset: KnowledgeDataset, input: AddMindEdgeInput): KnowledgeDataset {
  if (!input.source || !input.target || input.source === input.target) return dataset;
  const hasSource = dataset.nodes.some((n) => n.id === input.source);
  const hasTarget = dataset.nodes.some((n) => n.id === input.target);
  if (!hasSource || !hasTarget) return dataset;

  const fallbackSourceId = dataset.sources[0]?.id ?? 'src_user_manual';
  const nextSources =
    dataset.sources.length > 0
      ? dataset.sources
      : [
          {
            id: fallbackSourceId,
            evidence_class: 'E2_user_summary',
            source_type: 'manual_workspace',
            description: 'Direct user connection entry',
            date: new Date().toISOString().slice(0, 10),
            date_meaning: 'workspace_created',
            conversation_id: null,
            original_available: true,
            reliability: 'user_authored',
          },
        ];

  const edge: KnowledgeEdge = {
    id: createMindId('edge'),
    source: input.source,
    target: input.target,
    relationship: input.relationship.trim().slice(0, 60) || 'relates_to',
    basis: input.basis,
    explanation: input.explanation.trim().slice(0, 500) || 'User-defined connection.',
    confidence: input.basis === 'inferred' ? 'medium' : 'high',
    source_ids: [fallbackSourceId],
    evidence_classes: ['E2_user_summary'],
    assertion_level: input.basis === 'inferred' ? 'hypothesis' : 'asserted',
    claim_scope: 'personal',
    review_status: input.basis === 'inferred' ? 'unreviewed' : 'verified',
    presentation_rule:
      input.basis === 'inferred' ? 'Requires user confirmation' : 'Directly authored',
    external_citation: null,
  };

  return recomputeDerivedDatasetStats({
    ...dataset,
    sources: nextSources,
    edges: [...dataset.edges, edge],
  });
}

export function deleteMindEdge(dataset: KnowledgeDataset, edgeId: string): KnowledgeDataset {
  return recomputeDerivedDatasetStats({
    ...dataset,
    edges: dataset.edges.filter((e) => e.id !== edgeId),
  });
}

export function addMindSource(
  dataset: KnowledgeDataset,
  input: { title: string; sourceType: string; excerpt?: string; date?: string }
): KnowledgeDataset {
  const title = input.title.trim().slice(0, 240);
  if (!title) return dataset;
  const source: KnowledgeSource = {
    id: createMindId('src'),
    evidence_class: 'E2_user_summary',
    source_type: input.sourceType || 'journal_note',
    description: title,
    excerpt: input.excerpt?.trim().slice(0, 600),
    date: input.date?.trim() || new Date().toISOString().slice(0, 10),
    date_meaning: 'user_recorded',
    conversation_id: null,
    original_available: true,
    reliability: 'user_authored',
  };
  return recomputeDerivedDatasetStats({
    ...dataset,
    sources: [source, ...dataset.sources],
  });
}

function createExecutionEdgeId(relationship: string, source: string, target: string): string {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 72);
  return `edge_ip_${safe(relationship)}_${safe(source)}_${safe(target)}`;
}

export function buildDatasetFromInPursuitGoals(appData: AppData): KnowledgeDataset {
  const todayStr = new Date().toISOString().slice(0, 10);
  const srcId = createMindId('src_ip');
  const sources: KnowledgeSource[] = [
    {
      id: srcId,
      evidence_class: 'E3_workspace_goal',
      source_type: 'inpursuit_workspace',
      description: 'Synced from InPursuit Life Areas, Goals, Phases, and Active Habits',
      date: todayStr,
      date_meaning: 'synced_snapshot',
      conversation_id: null,
      original_available: true,
      reliability: 'verified_action_plan',
    },
  ];

  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  const areaById = new Map<string, { title: string; nodeId: string }>();

  for (const area of appData.lifeAreas) {
    const discId = `disc_${area.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
    areaById.set(area.id, { title: area.name, nodeId: discId });
    nodes.push({
      id: discId,
      title: area.name,
      type: 'Discipline',
      domains: [area.name],
      level: 1,
      engagement: 'active',
      lifecycle: 'active',
      lifecycle_basis: 'inpursuit_life_area',
      description: area.description || `InPursuit life area: ${area.name}`,
      source_ids: [srcId],
      evidence_classes: ['E3_workspace_goal'],
      confidence: 'high',
      mentions: 1,
      aliases: [],
      evidence_grade: 'Q3',
      first_observed_at: area.createdAt.slice(0, 10),
      last_observed_at: todayStr,
      observation_ids: [],
      question_ids: [],
    });
  }

  const goalNodeIdByGoalId = new Map<string, { nodeId: string; domain?: string }>();

  for (const goal of appData.goals) {
    const areaMeta = goal.lifeAreaId ? areaById.get(goal.lifeAreaId) : undefined;
    const gNodeId = `goal_${goal.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
    const domains = areaMeta ? [areaMeta.title] : [];
    goalNodeIdByGoalId.set(goal.id, { nodeId: gNodeId, domain: areaMeta?.title });

    nodes.push({
      id: gNodeId,
      title: goal.title,
      type: 'Goal',
      domains,
      level: 2,
      engagement: goal.status === 'active' ? 'practiced' : 'archived',
      lifecycle: goal.status,
      lifecycle_basis: 'inpursuit_goal',
      description: goal.outcome || `Target commitment (${goal.status})`,
      source_ids: [srcId],
      evidence_classes: ['E3_workspace_goal'],
      confidence: 'high',
      mentions: 1,
      aliases: [],
      evidence_grade: goal.status === 'active' ? 'Q3' : 'Q2',
      first_observed_at: goal.createdAt.slice(0, 10),
      last_observed_at: todayStr,
      observation_ids: [],
      question_ids: [],
    });

    if (areaMeta) {
      edges.push({
        id: createExecutionEdgeId('anchors_goal', areaMeta.nodeId, gNodeId),
        source: areaMeta.nodeId,
        target: gNodeId,
        relationship: 'anchors_goal',
        basis: 'explicit',
        explanation: `${goal.title} advances ${areaMeta.title}.`,
        confidence: 'high',
        source_ids: [srcId],
        evidence_classes: ['E3_workspace_goal'],
        assertion_level: 'asserted',
        claim_scope: 'personal',
        review_status: 'verified',
        presentation_rule: 'Directly linked from InPursuit',
        external_citation: null,
      });
    }
  }

  for (const proj of appData.projects.slice(0, 40)) {
    const gMeta = proj.goalId ? goalNodeIdByGoalId.get(proj.goalId) : undefined;
    const pNodeId = `proj_${proj.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
    nodes.push({
      id: pNodeId,
      title: proj.title,
      type: 'Project',
      domains: gMeta?.domain ? [gMeta.domain] : [],
      level: 3,
      engagement: proj.status === 'active' ? 'practiced' : 'planned',
      lifecycle: proj.status,
      lifecycle_basis: 'inpursuit_project',
      description: proj.description || `Phase status: ${proj.status}`,
      source_ids: [srcId],
      evidence_classes: ['E3_workspace_goal'],
      confidence: 'high',
      mentions: 1,
      aliases: [],
      evidence_grade: proj.status === 'active' ? 'Q3' : 'Q2',
      first_observed_at: proj.createdAt.slice(0, 10),
      last_observed_at: todayStr,
      observation_ids: [],
      question_ids: [],
    });

    if (gMeta) {
      edges.push({
        id: createExecutionEdgeId('delivers', pNodeId, gMeta.nodeId),
        source: pNodeId,
        target: gMeta.nodeId,
        relationship: 'delivers',
        basis: 'explicit',
        explanation: `${proj.title} is an execution phase for this goal.`,
        confidence: 'high',
        source_ids: [srcId],
        evidence_classes: ['E3_workspace_goal'],
        assertion_level: 'asserted',
        claim_scope: 'personal',
        review_status: 'verified',
        presentation_rule: 'Directly linked from InPursuit',
        external_citation: null,
      });
    }
  }

  const projectNodeIdByProjectId = new Map<string, string>();
  for (const project of appData.projects.slice(0, 40)) {
    projectNodeIdByProjectId.set(project.id, `proj_${project.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`);
  }

  // Tasks become first-class execution nodes and retain their project provenance.
  for (const task of appData.tasks.slice(0, 100)) {
    const taskNodeId = `task_${task.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
    const projectNodeId = task.projectId ? projectNodeIdByProjectId.get(task.projectId) : undefined;
    const parentProject = task.projectId ? appData.projects.find((project) => project.id === task.projectId) : undefined;
    const parentGoal = parentProject?.goalId ? appData.goals.find((goal) => goal.id === parentProject.goalId) : undefined;
    const parentArea = parentGoal?.lifeAreaId ? appData.lifeAreas.find((area) => area.id === parentGoal.lifeAreaId) : undefined;
    nodes.push({
      id: taskNodeId,
      title: task.title,
      type: 'Task',
      domains: parentArea ? [parentArea.name] : [],
      level: 4,
      engagement: task.status === 'done' ? 'practiced' : 'active',
      lifecycle: task.status,
      lifecycle_basis: 'inpursuit_task',
      description: `Task status: ${task.status}`,
      source_ids: [srcId],
      evidence_classes: ['E3_workspace_goal'],
      confidence: 'high',
      mentions: 1,
      aliases: [],
      evidence_grade: task.status === 'done' ? 'Q3' : 'Q2',
      first_observed_at: task.createdAt.slice(0, 10),
      last_observed_at: task.completedAt?.slice(0, 10) ?? todayStr,
      observation_ids: [],
      question_ids: [],
    });
    if (projectNodeId) {
      edges.push({
        id: createExecutionEdgeId('advances', taskNodeId, projectNodeId),
        source: taskNodeId,
        target: projectNodeId,
        relationship: 'advances',
        basis: 'explicit',
        explanation: `${task.title} advances its linked project.`,
        confidence: 'high',
        source_ids: [srcId],
        evidence_classes: ['E3_workspace_goal'],
        assertion_level: 'asserted',
        claim_scope: 'personal',
        review_status: 'verified',
        presentation_rule: 'Directly linked from InPursuit',
        external_citation: null,
      });
    }
  }

  for (const habit of appData.habits.filter((h) => h.active).slice(0, 20)) {
    const hNodeId = `hab_${habit.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
    const linkedGoal = habit.goalId ? goalNodeIdByGoalId.get(habit.goalId) : undefined;
    const firstArea = linkedGoal?.domain ?? appData.lifeAreas[0]?.name;
    nodes.push({
      id: hNodeId,
      title: habit.name,
      type: 'Habit',
      domains: firstArea ? [firstArea] : [],
      level: 3,
      engagement: 'practiced',
      lifecycle: 'active',
      lifecycle_basis: 'inpursuit_habit',
      description: `Active routine (${habit.cadence ?? habit.frequency})`,
      source_ids: [srcId],
      evidence_classes: ['E3_workspace_goal'],
      confidence: 'high',
      mentions: 1,
      aliases: [],
      evidence_grade: 'Q3',
      first_observed_at: habit.createdAt.slice(0, 10),
      last_observed_at: todayStr,
      observation_ids: [],
      question_ids: [],
    });

    if (linkedGoal) {
      edges.push({
        id: createExecutionEdgeId('supports', hNodeId, linkedGoal.nodeId),
        source: hNodeId,
        target: linkedGoal.nodeId,
        relationship: 'supports',
        basis: 'explicit',
        explanation: `${habit.name} is explicitly linked to this goal in InPursuit.`,
        confidence: 'high',
        source_ids: [srcId],
        evidence_classes: ['E3_workspace_goal'],
        assertion_level: 'asserted',
        claim_scope: 'personal',
        review_status: 'verified',
        presentation_rule: 'Directly linked from InPursuit',
        external_citation: null,
      });
    }
  }

  return recomputeDerivedDatasetStats({
    ...createEmptyMindDataset('inpursuit-synced-1.0'),
    sources,
    nodes,
    edges,
  });
}

/**
 * Refreshes the generated InPursuit execution layer while preserving the user's
 * independently authored knowledge nodes, edges and sources.
 */
export function mergeExecutionSnapshotIntoDataset(baseDataset: KnowledgeDataset, appData: AppData): KnowledgeDataset {
  const snapshot = buildDatasetFromInPursuitGoals(appData);
  const generatedNodeIds = new Set(snapshot.nodes.map((node) => node.id));
  const retainedNodes = baseDataset.nodes.filter(
    (node) => !node.lifecycle_basis.startsWith('inpursuit_') && !generatedNodeIds.has(node.id),
  );
  const retainedSources = baseDataset.sources.filter((source) => source.source_type !== 'inpursuit_workspace');
  const retainedEdges = baseDataset.edges.filter((edge) =>
    !edge.id.startsWith('edge_ip_') && !edge.source_ids.some((id) => id.startsWith('src_ip_')),
  );
  return recomputeDerivedDatasetStats({
    ...baseDataset,
    sources: [...snapshot.sources, ...retainedSources],
    nodes: [...retainedNodes, ...snapshot.nodes],
    edges: [...retainedEdges, ...snapshot.edges],
  });
}


export interface ExtractedMindBatch {
  domains: string[];
  nodes: Array<{
    title: string;
    type: string;
    domain: string;
    description: string;
    evidence_grade: EvidenceGrade;
  }>;
  edges: Array<{
    sourceTitle: string;
    targetTitle: string;
    relationship: string;
    basis: ConnectionBasis;
    explanation: string;
  }>;
  sourceLabel: string;
}

export function extractMindFromNotesOffline(rawText: string, sourceLabel = 'Pasted Personal Notes'): ExtractedMindBatch {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 60);

  let currentDomain = 'Personal Synthesis';
  const domainsSet = new Set<string>();
  const nodes: ExtractedMindBatch['nodes'] = [];
  const edges: ExtractedMindBatch['edges'] = [];
  const seenTitles = new Set<string>();

  for (const rawLine of lines) {
    // Headings become domains
    const headingMatch = rawLine.match(/^#{1,3}\s+(.+)$/) || rawLine.match(/^([A-Za-z0-9 &/,_-]{3,42}):$/);
    if (headingMatch) {
      currentDomain = headingMatch[1].trim().slice(0, 64);
      domainsSet.add(currentDomain);
      continue;
    }

    const cleaned = rawLine.replace(/^[-*•\d.)]+\s*/, '').trim();
    if (!cleaned || cleaned.length < 3) continue;

    // Arrow connections e.g. "A -> B: why"
    const arrowMatch = cleaned.match(/^(.+?)\s*(?:->|→)\s*(.+?)(?::\s*(.+))?$/);
    if (arrowMatch) {
      const src = arrowMatch[1].trim().slice(0, 100);
      const tgt = arrowMatch[2].trim().slice(0, 100);
      const expl = (arrowMatch[3] ?? 'Linked inside personal notes.').trim().slice(0, 300);
      domainsSet.add(currentDomain);
      for (const title of [src, tgt]) {
        if (!seenTitles.has(title.toLowerCase())) {
          seenTitles.add(title.toLowerCase());
          nodes.push({
            title,
            type: 'Concept',
            domain: currentDomain,
            description: expl,
            evidence_grade: 'Q2',
          });
        }
      }
      edges.push({
        sourceTitle: src,
        targetTitle: tgt,
        relationship: 'connects_to',
        basis: 'explicit',
        explanation: expl,
      });
      continue;
    }

    const colonSplit = cleaned.match(/^([^:]{3,80}):\s+(.+)$/);
    const title = (colonSplit ? colonSplit[1] : cleaned.slice(0, 72)).trim();
    const description = (colonSplit ? colonSplit[2] : cleaned).trim();
    const isQuestion = title.endsWith('?') || cleaned.endsWith('?');
    const type = isQuestion ? 'Question' : 'Concept';

    domainsSet.add(currentDomain);
    if (!seenTitles.has(title.toLowerCase())) {
      seenTitles.add(title.toLowerCase());
      nodes.push({
        title,
        type,
        domain: currentDomain,
        description: description.slice(0, 400),
        evidence_grade: 'Q2',
      });
    }
  }

  return {
    domains: Array.from(domainsSet),
    nodes: nodes.slice(0, 35),
    edges: edges.slice(0, 40),
    sourceLabel,
  };
}

export function mergeExtractedBatchIntoDataset(
  dataset: KnowledgeDataset,
  batch: ExtractedMindBatch
): KnowledgeDataset {
  const todayStr = new Date().toISOString().slice(0, 10);
  const srcId = createMindId('src_note');
  const nextSources: KnowledgeSource[] = [
    {
      id: srcId,
      evidence_class: 'E2_user_summary',
      source_type: 'extracted_notes',
      description: batch.sourceLabel || 'Extracted personal notes',
      date: todayStr,
      date_meaning: 'imported_notes',
      conversation_id: null,
      original_available: true,
      reliability: 'user_authored',
    },
    ...dataset.sources,
  ];

  let nextNodes = [...dataset.nodes];
  let nextEdges = [...dataset.edges];

  const findNodeByTitle = (title: string) =>
    nextNodes.find((n) => n.title.toLowerCase() === title.trim().toLowerCase());

  const ensureDomainNode = (domainName: string): KnowledgeNode => {
    const existing = nextNodes.find(
      (n) => n.type === 'Discipline' && n.title.toLowerCase() === domainName.trim().toLowerCase()
    );
    if (existing) return existing;
    const created: KnowledgeNode = {
      id: createMindId('disc'),
      title: domainName.trim().slice(0, 90),
      type: 'Discipline',
      domains: [domainName.trim().slice(0, 90)],
      level: 1,
      engagement: 'active',
      lifecycle: 'active',
      lifecycle_basis: 'extracted_notes',
      description: `Intellectual domain: ${domainName.trim()}`,
      source_ids: [srcId],
      evidence_classes: ['E2_user_summary'],
      confidence: 'high',
      mentions: 1,
      aliases: [],
      evidence_grade: 'Q3',
      first_observed_at: todayStr,
      last_observed_at: todayStr,
      observation_ids: [],
      question_ids: [],
    };
    nextNodes.push(created);
    return created;
  };

  for (const dom of batch.domains) {
    if (dom.trim()) ensureDomainNode(dom.trim());
  }

  for (const item of batch.nodes) {
    const title = item.title.trim();
    if (!title) continue;
    const domName = item.domain.trim() || 'Personal Synthesis';
    const disc = ensureDomainNode(domName);
    const existing = findNodeByTitle(title);
    if (existing) {
      if (!existing.domains.includes(disc.title)) {
        existing.domains = [...existing.domains, disc.title];
      }
      if (!existing.source_ids.includes(srcId)) {
        existing.source_ids = [...existing.source_ids, srcId];
      }
      continue;
    }

    const createdId = createMindId('node');
    nextNodes.push({
      id: createdId,
      title: title.slice(0, 140),
      type: item.type || 'Concept',
      domains: [disc.title],
      level: 3,
      engagement: item.evidence_grade === 'Q3' || item.evidence_grade === 'Q4' ? 'practiced' : 'explored',
      lifecycle: 'active',
      lifecycle_basis: 'extracted_notes',
      description: item.description.trim().slice(0, 1200),
      source_ids: [srcId],
      evidence_classes: ['E2_user_summary'],
      confidence: 'high',
      mentions: 1,
      aliases: [],
      evidence_grade: item.evidence_grade ?? 'Q2',
      first_observed_at: todayStr,
      last_observed_at: todayStr,
      observation_ids: [],
      question_ids: [],
    });

    nextEdges.push({
      id: createMindId('edge'),
      source: disc.id,
      target: createdId,
      relationship: 'contains',
      basis: 'structural',
      explanation: `${title} grouped under ${disc.title}.`,
      confidence: 'high',
      source_ids: [srcId],
      evidence_classes: ['E2_user_summary'],
      assertion_level: 'structural_grouping',
      claim_scope: 'personal',
      review_status: 'verified',
      presentation_rule: 'Extracted domain link',
      external_citation: null,
    });
  }

  for (const edgeItem of batch.edges) {
    const srcNode = findNodeByTitle(edgeItem.sourceTitle);
    const tgtNode = findNodeByTitle(edgeItem.targetTitle);
    if (!srcNode || !tgtNode || srcNode.id === tgtNode.id) continue;
    nextEdges.push({
      id: createMindId('edge'),
      source: srcNode.id,
      target: tgtNode.id,
      relationship: edgeItem.relationship || 'connects_to',
      basis: edgeItem.basis || 'inferred',
      explanation: edgeItem.explanation || 'Extracted connection.',
      confidence: edgeItem.basis === 'inferred' ? 'medium' : 'high',
      source_ids: [srcId],
      evidence_classes: ['E2_user_summary'],
      assertion_level: edgeItem.basis === 'inferred' ? 'hypothesis' : 'asserted',
      claim_scope: 'personal',
      review_status: edgeItem.basis === 'inferred' ? 'unreviewed' : 'verified',
      presentation_rule:
        edgeItem.basis === 'inferred' ? 'Requires user confirmation' : 'Extracted from notes',
      external_citation: null,
    });
  }

  return recomputeDerivedDatasetStats({
    ...dataset,
    sources: nextSources,
    nodes: nextNodes,
    edges: nextEdges,
  });
}

export interface MindDashboardInsights {
  nodeCount: number;
  connectionCount: number;
  sourceCount: number;
  domainCount: number;
  practicedCount: number;
  practicedPct: number;
  bridgeCount: number;
  inferredTotal: number;
  inferredPendingCount: number;
  confirmedInferredCount: number;
  semanticCount: number;
  structuralCount: number;
  topDomainName: string | null;
  topDomainCount: number;
  headlineInsight: string;
  detailInsight: string;
}

export function computeMindInsights(
  dataset: IndexedDataset,
  hypothesisDecisions: Record<string, HypothesisDecision>,
  hideSensitive = true
): MindDashboardInsights {
  const allNodes = dataset.raw.nodes;
  const allEdges = dataset.raw.edges;

  const nodeCount = allNodes.length;
  const connectionCount = allEdges.length;
  const sourceCount = dataset.raw.sources.length;
  const domainCount = dataset.domainNodes.length;

  const practicedCount = allNodes.filter(
    (n) => n.evidence_grade === 'Q3' || n.evidence_grade === 'Q4'
  ).length;
  const practicedPct = nodeCount > 0 ? Math.round((practicedCount / nodeCount) * 100) : 0;
  const bridgeCount = allNodes.filter((n) => n.domains.length > 1).length;

  const inferredEdges = allEdges.filter((e) => e.basis === 'inferred');
  const inferredTotal = inferredEdges.length;
  let confirmedInferredCount = 0;
  let inferredPendingCount = 0;
  for (const edge of inferredEdges) {
    const decision = hypothesisDecisions[edge.id];
    if (decision === 'confirmed') confirmedInferredCount += 1;
    else if (decision !== 'rejected') inferredPendingCount += 1;
  }

  const structuralCount = allEdges.filter((e) => e.basis === 'structural').length;
  const semanticCount = connectionCount - structuralCount;

  const domainCounts = new Map<string, number>();
  for (const node of allNodes) {
    if (hideSensitive && dataset.sensitiveNodeIds.has(node.id)) continue;
    const dom = node.domains[0];
    if (!dom) continue;
    domainCounts.set(dom, (domainCounts.get(dom) ?? 0) + 1);
  }
  let topDomainName: string | null = null;
  let topDomainCount = 0;
  for (const [dom, count] of domainCounts.entries()) {
    if (count > topDomainCount) {
      topDomainCount = count;
      topDomainName = dom;
    }
  }

  let headlineInsight: string;
  let detailInsight: string;

  if (nodeCount === 0) {
    headlineInsight = 'Your personal mind map is ready for its first intellectual anchor.';
    detailInsight =
      'Add a domain, concept, or seed directly from your active InPursuit goals and life areas to begin growing your constellation.';
  } else if (inferredPendingCount > 0 && topDomainName) {
    const shortDom = getDomainTheme(topDomainName).shortName;
    headlineInsight = `${shortDom} anchors your densest cluster (${topDomainCount} nodes), while ${inferredPendingCount} inferred links await synthesis review.`;
    detailInsight = `${semanticCount} semantic relationships connect across ${bridgeCount} cross-domain bridges (${practicedPct}% backed by Q3/Q4 practice or primary transcripts).`;
  } else if (topDomainName) {
    const shortDom = getDomainTheme(topDomainName).shortName;
    headlineInsight = `${shortDom} leads your active architecture with ${practicedCount} practiced or primary-grade nodes (${practicedPct}%).`;
    detailInsight = `${semanticCount} explicit and semantic connections weave across ${domainCount} domains and ${sourceCount} provenance sources.`;
  } else {
    headlineInsight = `${nodeCount} mapped concepts connected across ${connectionCount} relationships.`;
    detailInsight = `${practicedCount} nodes carry Q3/Q4 practice evidence across ${sourceCount} documented sources.`;
  }

  return {
    nodeCount,
    connectionCount,
    sourceCount,
    domainCount,
    practicedCount,
    practicedPct,
    bridgeCount,
    inferredTotal,
    inferredPendingCount,
    confirmedInferredCount,
    semanticCount,
    structuralCount,
    topDomainName,
    topDomainCount,
    headlineInsight,
    detailInsight,
  };
}
