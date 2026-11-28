export type ViewId =
  | 'overview'
  | 'graph'
  | 'atlas'
  | 'evolution'
  | 'patterns'
  | 'evidence';

export type ConnectionBasis =
  | 'explicit'
  | 'user_suggested'
  | 'co_discussed'
  | 'inferred'
  | 'structural'
  | 'established_academic';

export type EvidenceGrade = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export type HypothesisDecision = 'unreviewed' | 'confirmed' | 'rejected';

export type MindWorkspaceMode = 'sample' | 'custom';

export interface MindWorkspaceProfile {
  title: string;
  subtitle: string;
  mode: MindWorkspaceMode;
  ownerName?: string;
  updatedAt: string;
}

export interface RecentExplorationEntry {
  nodeId: string;
  title: string;
  domain?: string;
  visitedAt: string;
}

export interface MindWorkspaceRecord {
  schemaVersion: 2;
  model: MindModel;
  profile: MindWorkspaceProfile;
  customDataset: KnowledgeDataset | null;
  hypothesisDecisions: Record<string, HypothesisDecision>;
  recentExplorations: RecentExplorationEntry[];
  updatedAt: string;
}

export interface KnowledgeSource {
  id: string;
  evidence_class: string;
  source_type: string;
  path?: string;
  file?: string;
  description?: string;
  excerpt?: string;
  date: string | null;
  date_meaning?: string;
  conversation_id: string | null;
  original_available: boolean;
  reliability: string;
}

export interface KnowledgeNode {
  id: string;
  title: string;
  type: string;
  domains: string[];
  level: number;
  engagement: string;
  lifecycle: string | null;
  lifecycle_basis: string;
  description: string;
  source_ids: string[];
  evidence_classes: string[];
  confidence: string;
  mentions: number;
  aliases: string[];
  evidence_grade: EvidenceGrade;
  first_observed_at: string | null;
  last_observed_at: string | null;
  observation_ids: string[];
  question_ids: string[];
  lifecycle_events?: unknown[];
  conversation_id?: string | null;
  original_available?: boolean;
  date?: string | null;
}

export interface KnowledgeEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  basis: ConnectionBasis;
  explanation: string;
  confidence: string;
  source_ids: string[];
  evidence_classes: string[];
  assertion_level: string;
  claim_scope: string;
  review_status: string;
  presentation_rule: string;
  external_citation: string | null;
  also_classified_as?: string[];
}

export interface ConflictRecord {
  topic: string;
  this_export: string;
  other_source: string;
  resolution: string;
  resolution_event_ids?: string[];
  resolution_status?: string;
}

export interface CoverageRow {
  domain: string;
  nodes: number;
  subdomains: number;
  concepts: number;
  questions: number;
  projects_experiences: number;
  goals: number;
  grade_Q1: number;
  grade_Q2: number;
  grade_Q3: number;
  grade_Q4: number;
  source_records: number;
  source_classes: string[];
  edges_touching: number;
  explicit_edges: number;
  inferred_edges: number;
  missing: string[];
}

export interface ResolutionQueueItem {
  id: string;
  node_a: string;
  node_b: string;
  reason: string;
  status: string;
  proposed_action: string;
}

export interface ChangeLogEntry {
  id: string;
  type: string;
  edge_id?: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  detail?: string;
  event_id?: string;
}

export interface KnowledgeDataset {
  version: string;
  evidence_classes: Record<string, string>;
  connection_bases: Record<string, string>;
  sources: KnowledgeSource[];
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  conflicts: ConflictRecord[];
  rules: string[];
  evidence_grades: Record<string, string>;
  entity_tables: {
    conversations: unknown[];
    messages: unknown[];
    questions: unknown[];
    question_threads: unknown[];
    observations: Record<string, unknown>[];
    positions: Record<string, unknown>[];
    position_changes: Record<string, unknown>[];
    resolution_queue: ResolutionQueueItem[];
    ingest_ledger: unknown[];
    resolution_events: unknown[];
  };
  entity_schemas: {
    conversation: string[];
    message: string[];
    question: string[];
    question_thread: string[];
    observation: string[];
    position: string[];
    position_change: string[];
    resolution_event: string[];
  };
  change_log: ChangeLogEntry[];
  coverage_matrix: CoverageRow[];
  data_quality: {
    duplicate_node_ids: number;
    dangling_edges: number;
    edges_missing_sources: number;
    nodes_missing_sources: number;
    evidence_class_mismatch: number;
    conversation_nodes_without_id_or_date: number;
    sources_without_conversation_id: number;
    lifecycle_missing: number;
    lifecycle_unknown_or_unverified: number;
    evidence_grades: Record<string, number>;
    edge_bases: Record<string, number>;
    inferred_unreviewed: number;
    structural_share: number;
    structural_from_assistant_groupings: number;
    nodes_with_only_structural_edges: number;
    nodes_without_edges: number;
    multi_domain_nodes: number;
    nodes_without_domain: number;
    assistant_proposed_nodes: number;
    brief_only_nodes: number;
    possible_duplicates: number;
    sensitive_review: string[];
  };
}

export interface IndexedDataset {
  raw: KnowledgeDataset;
  nodeById: Map<string, KnowledgeNode>;
  sourceById: Map<string, KnowledgeSource>;
  edgesByNodeId: Map<string, KnowledgeEdge[]>;
  domainNodes: KnowledgeNode[];
  sensitiveNodeIds: Set<string>;
}


/**
 * Personal Mind Model v2.
 *
 * The legacy KnowledgeDataset is a navigable intellectual archive. This model is
 * the canonical, user-owned record of what may be true about a person and why.
 * Source and observation records are immutable; corrections are represented by
 * appended review events and superseding claims.
 */
export type MindSourceKind =
  | 'conversation'
  | 'document'
  | 'assessment'
  | 'behavior_log'
  | 'reflection'
  | 'external_reference'
  | 'user_entry';

export type MindSourceAuthor = 'user' | 'assistant' | 'system' | 'external';

export type MindObservationMethod =
  | 'direct_behavior'
  | 'user_report'
  | 'documented_record'
  | 'assessment'
  | 'third_party_report'
  | 'model_inference';

export type MindClaimKind =
  | 'fact'
  | 'belief'
  | 'value'
  | 'preference'
  | 'goal'
  | 'skill'
  | 'experience'
  | 'behavior_pattern'
  | 'identity_model'
  | 'interpretation'
  | 'memory';

export type MindClaimStatus =
  | 'candidate'
  | 'active'
  | 'challenged'
  | 'rejected'
  | 'superseded'
  | 'expired';

export type MindEpistemicBasis =
  | 'directly_observed'
  | 'documented'
  | 'self_reported'
  | 'third_party_reported'
  | 'inferred'
  | 'externally_sourced';

export type MindEvidencePolarity = 'supports' | 'refutes' | 'qualifies';

export type MindRelationshipStatus = 'proposed' | 'accepted' | 'rejected';

export interface MindSourceRecord {
  id: string;
  kind: MindSourceKind;
  author: MindSourceAuthor;
  title: string;
  locator?: string;
  occurredAt?: string;
  capturedAt: string;
  contentHash?: string;
  originalAvailable: boolean;
  sensitivity: 'normal' | 'sensitive' | 'highly_sensitive';
}

export interface MindObservation {
  id: string;
  sourceId: string;
  method: MindObservationMethod;
  content: string;
  excerpt?: string;
  occurredAt?: string;
  capturedAt: string;
  context?: string;
  recordedBy: 'user' | 'assistant' | 'system';
}

export interface MindEvidenceLink {
  id: string;
  observationId: string;
  polarity: MindEvidencePolarity;
  rationale?: string;
  createdAt: string;
}

export interface MindClaim {
  id: string;
  statement: string;
  kind: MindClaimKind;
  domain: string;
  status: MindClaimStatus;
  epistemicBasis: MindEpistemicBasis;
  confidence: number | null;
  sensitivity: 'normal' | 'sensitive' | 'highly_sensitive';
  context?: string;
  validFrom?: string;
  validUntil?: string;
  evidence: MindEvidenceLink[];
  supersedesClaimId?: string;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt?: string;
}

export interface MindRelationship {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  predicate: string;
  status: MindRelationshipStatus;
  basis: 'explicit' | 'inferred';
  confidence: number;
  observationIds: string[];
  createdAt: string;
  reviewedAt?: string;
}

export interface MindReviewEvent {
  id: string;
  targetType: 'claim' | 'relationship';
  targetId: string;
  action: 'confirm' | 'challenge' | 'reject' | 'defer' | 'correct' | 'supersede' | 'accept_link' | 'reject_link';
  previousStatus: string;
  nextStatus: string;
  note?: string;
  actor: 'user' | 'assistant' | 'system';
  createdAt: string;
}

export interface MindModel {
  schemaVersion: 2;
  sources: MindSourceRecord[];
  observations: MindObservation[];
  claims: MindClaim[];
  relationships: MindRelationship[];
  reviewEvents: MindReviewEvent[];
  updatedAt: string;
}
