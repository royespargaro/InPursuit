import type {
  ConnectionBasis,
  EvidenceGrade,
  HypothesisDecision,
  KnowledgeDataset,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeSource,
  MindWorkspaceMode,
  MindWorkspaceProfile,
  MindWorkspaceRecord,
  RecentExplorationEntry,
} from '../types/knowledge';
import { createEmptyMindDataset, recomputeDerivedDatasetStats } from './mindBuilder';

export const MIND_STORAGE_KEY_PREFIX = 'inpursuit:mind:';
export const MIND_STORAGE_KEY_SUFFIX = ':v1';
const LEGACY_HYPOTHESES_KEY = 'architecture_of_my_mind_v3_hypotheses';

export const MAX_MIND_NODES = 600;
export const MAX_MIND_EDGES = 1200;
export const MAX_MIND_SOURCES = 200;
export const MAX_RECENT_EXPLORATIONS = 12;
export const MAX_FIRESTORE_MIND_BYTES = 750 * 1024;

const VALID_GRADES = new Set<EvidenceGrade>(['Q1', 'Q2', 'Q3', 'Q4']);
const VALID_BASES = new Set<ConnectionBasis>([
  'explicit',
  'user_suggested',
  'co_discussed',
  'inferred',
  'structural',
  'established_academic',
]);

export function mindStorageKeyForScope(scope: string): string {
  const safeScope = scope.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
  return `${MIND_STORAGE_KEY_PREFIX}${safeScope}${MIND_STORAGE_KEY_SUFFIX}`;
}

export function createDefaultMindProfile(
  mode: MindWorkspaceMode = 'sample',
  ownerName?: string
): MindWorkspaceProfile {
  const now = new Date().toISOString();
  if (mode === 'custom') {
    return {
      title: ownerName ? `${ownerName.split(' ')[0]}'s Mind Architecture` : 'My Mind Architecture',
      subtitle: 'Personal intellectual graph linking domains, core questions, goals, and practiced evidence.',
      mode: 'custom',
      ...(ownerName ? { ownerName: ownerName.slice(0, 80) } : {}),
      updatedAt: now,
    };
  }
  return {
    title: 'The Architecture of My Mind',
    subtitle:
      'Epistemic archive of disciplines, active inquiries, practiced concepts, and provenance across conversations.',
    mode: 'sample',
    ...(ownerName ? { ownerName: ownerName.slice(0, 80) } : {}),
    updatedAt: now,
  };
}

function loadLegacyHypotheses(): Record<string, HypothesisDecision> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LEGACY_HYPOTHESES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeHypothesisDecisions(parsed);
  } catch {
    return {};
  }
}

export function createDefaultMindWorkspaceRecord(
  ownerName?: string,
  withLegacyDecisions = false
): MindWorkspaceRecord {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    profile: createDefaultMindProfile('sample', ownerName),
    customDataset: null,
    hypothesisDecisions: withLegacyDecisions ? loadLegacyHypotheses() : {},
    recentExplorations: [],
    updatedAt: now,
  };
}

export function sanitizeHypothesisDecisions(raw: unknown): Record<string, HypothesisDecision> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, HypothesisDecision> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= 400) break;
    if (typeof k !== 'string' || !k || k.length > 128) continue;
    if (v === 'confirmed' || v === 'rejected' || v === 'unreviewed') {
      out[k] = v;
      count += 1;
    }
  }
  return out;
}

export function sanitizeRecentExplorations(raw: unknown): RecentExplorationEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentExplorationEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const nodeId = typeof rec.nodeId === 'string' ? rec.nodeId.trim().slice(0, 128) : '';
    const title = typeof rec.title === 'string' ? rec.title.trim().slice(0, 160) : '';
    if (!nodeId || !title || seen.has(nodeId)) continue;
    seen.add(nodeId);
    out.push({
      nodeId,
      title,
      ...(typeof rec.domain === 'string' && rec.domain.trim()
        ? { domain: rec.domain.trim().slice(0, 100) }
        : {}),
      visitedAt:
        typeof rec.visitedAt === 'string' && rec.visitedAt.trim()
          ? rec.visitedAt.trim().slice(0, 40)
          : new Date().toISOString(),
    });
    if (out.length >= MAX_RECENT_EXPLORATIONS) break;
  }
  return out;
}

function sanitizeStringList(raw: unknown, maxLen: number, maxStr = 120): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const s = item.trim().slice(0, maxStr);
    if (s) out.push(s);
    if (out.length >= maxLen) break;
  }
  return out;
}

export function sanitizeKnowledgeDataset(raw: unknown): KnowledgeDataset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) return null;

  const base = createEmptyMindDataset(
    typeof obj.version === 'string' && obj.version.trim() ? obj.version.trim().slice(0, 40) : 'custom-1.0'
  );

  const sources: KnowledgeSource[] = [];
  if (Array.isArray(obj.sources)) {
    for (const s of obj.sources) {
      if (!s || typeof s !== 'object') continue;
      const src = s as Record<string, unknown>;
      const id = typeof src.id === 'string' ? src.id.trim().slice(0, 128) : '';
      if (!id) continue;
      sources.push({
        id,
        evidence_class:
          typeof src.evidence_class === 'string' ? src.evidence_class.slice(0, 60) : 'E2_user_summary',
        source_type: typeof src.source_type === 'string' ? src.source_type.slice(0, 60) : 'user_entry',
        ...(typeof src.path === 'string' ? { path: src.path.slice(0, 240) } : {}),
        ...(typeof src.file === 'string' ? { file: src.file.slice(0, 240) } : {}),
        ...(typeof src.description === 'string' ? { description: src.description.slice(0, 500) } : {}),
        ...(typeof src.excerpt === 'string' ? { excerpt: src.excerpt.slice(0, 800) } : {}),
        date: typeof src.date === 'string' ? src.date.slice(0, 32) : null,
        ...(typeof src.date_meaning === 'string' ? { date_meaning: src.date_meaning.slice(0, 80) } : {}),
        conversation_id: typeof src.conversation_id === 'string' ? src.conversation_id.slice(0, 128) : null,
        original_available: Boolean(src.original_available),
        reliability: typeof src.reliability === 'string' ? src.reliability.slice(0, 80) : 'user_authored',
      });
      if (sources.length >= MAX_MIND_SOURCES) break;
    }
  }

  const nodes: KnowledgeNode[] = [];
  const seenNodeIds = new Set<string>();
  for (const n of obj.nodes) {
    if (!n || typeof n !== 'object') continue;
    const node = n as Record<string, unknown>;
    const id = typeof node.id === 'string' ? node.id.trim().slice(0, 128) : '';
    const title = typeof node.title === 'string' ? node.title.trim().slice(0, 160) : '';
    if (!id || !title || seenNodeIds.has(id)) continue;
    seenNodeIds.add(id);

    const rawGrade = typeof node.evidence_grade === 'string' ? (node.evidence_grade as EvidenceGrade) : 'Q2';
    const evidence_grade: EvidenceGrade = VALID_GRADES.has(rawGrade) ? rawGrade : 'Q2';

    nodes.push({
      id,
      title,
      type: typeof node.type === 'string' && node.type.trim() ? node.type.trim().slice(0, 60) : 'Concept',
      domains: sanitizeStringList(node.domains, 6, 100),
      level: typeof node.level === 'number' && Number.isFinite(node.level) ? Math.max(1, Math.min(5, Math.round(node.level))) : 3,
      engagement: typeof node.engagement === 'string' ? node.engagement.slice(0, 40) : 'explored',
      lifecycle: typeof node.lifecycle === 'string' ? node.lifecycle.slice(0, 40) : null,
      lifecycle_basis: typeof node.lifecycle_basis === 'string' ? node.lifecycle_basis.slice(0, 80) : 'user_authored',
      description: typeof node.description === 'string' ? node.description.slice(0, 1400) : '',
      source_ids: sanitizeStringList(node.source_ids, 20, 128),
      evidence_classes: sanitizeStringList(node.evidence_classes, 8, 60),
      confidence: typeof node.confidence === 'string' ? node.confidence.slice(0, 40) : 'high',
      mentions: typeof node.mentions === 'number' && Number.isFinite(node.mentions) ? Math.max(0, Math.min(10000, Math.round(node.mentions))) : 1,
      aliases: sanitizeStringList(node.aliases, 12, 100),
      evidence_grade,
      first_observed_at: typeof node.first_observed_at === 'string' ? node.first_observed_at.slice(0, 32) : null,
      last_observed_at: typeof node.last_observed_at === 'string' ? node.last_observed_at.slice(0, 32) : null,
      observation_ids: sanitizeStringList(node.observation_ids, 20, 128),
      question_ids: sanitizeStringList(node.question_ids, 20, 128),
    });
    if (nodes.length >= MAX_MIND_NODES) break;
  }

  const edges: KnowledgeEdge[] = [];
  const seenEdgeIds = new Set<string>();
  for (const e of obj.edges) {
    if (!e || typeof e !== 'object') continue;
    const edge = e as Record<string, unknown>;
    const id = typeof edge.id === 'string' ? edge.id.trim().slice(0, 128) : '';
    const source = typeof edge.source === 'string' ? edge.source.trim().slice(0, 128) : '';
    const target = typeof edge.target === 'string' ? edge.target.trim().slice(0, 128) : '';
    if (!id || !source || !target || seenEdgeIds.has(id)) continue;
    if (!seenNodeIds.has(source) || !seenNodeIds.has(target)) continue;
    seenEdgeIds.add(id);

    const rawBasis = typeof edge.basis === 'string' ? (edge.basis as ConnectionBasis) : 'explicit';
    const basis: ConnectionBasis = VALID_BASES.has(rawBasis) ? rawBasis : 'explicit';

    edges.push({
      id,
      source,
      target,
      relationship: typeof edge.relationship === 'string' && edge.relationship.trim() ? edge.relationship.trim().slice(0, 80) : 'relates_to',
      basis,
      explanation: typeof edge.explanation === 'string' ? edge.explanation.slice(0, 600) : '',
      confidence: typeof edge.confidence === 'string' ? edge.confidence.slice(0, 40) : 'medium',
      source_ids: sanitizeStringList(edge.source_ids, 20, 128),
      evidence_classes: sanitizeStringList(edge.evidence_classes, 8, 60),
      assertion_level: typeof edge.assertion_level === 'string' ? edge.assertion_level.slice(0, 60) : 'asserted',
      claim_scope: typeof edge.claim_scope === 'string' ? edge.claim_scope.slice(0, 60) : 'personal',
      review_status: typeof edge.review_status === 'string' ? edge.review_status.slice(0, 40) : 'verified',
      presentation_rule: typeof edge.presentation_rule === 'string' ? edge.presentation_rule.slice(0, 120) : 'User workspace',
      external_citation: typeof edge.external_citation === 'string' ? edge.external_citation.slice(0, 240) : null,
    });
    if (edges.length >= MAX_MIND_EDGES) break;
  }

  return recomputeDerivedDatasetStats({
    ...base,
    sources,
    nodes,
    edges,
    conflicts: Array.isArray(obj.conflicts) ? obj.conflicts.slice(0, 40) : [],
    rules: Array.isArray(obj.rules) ? sanitizeStringList(obj.rules, 20, 240) : base.rules,
  });
}

export function sanitizeMindWorkspaceRecord(
  raw: unknown,
  fallbackOwnerName?: string
): MindWorkspaceRecord {
  const defaults = createDefaultMindWorkspaceRecord(fallbackOwnerName, false);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const obj = raw as Record<string, unknown>;

  const rawProfile =
    obj.profile && typeof obj.profile === 'object' && !Array.isArray(obj.profile)
      ? (obj.profile as Record<string, unknown>)
      : {};
  const mode: MindWorkspaceMode = rawProfile.mode === 'custom' ? 'custom' : 'sample';
  const fallbackProfile = createDefaultMindProfile(mode, fallbackOwnerName);

  const profile: MindWorkspaceProfile = {
    title:
      typeof rawProfile.title === 'string' && rawProfile.title.trim()
        ? rawProfile.title.trim().slice(0, 120)
        : fallbackProfile.title,
    subtitle:
      typeof rawProfile.subtitle === 'string' && rawProfile.subtitle.trim()
        ? rawProfile.subtitle.trim().slice(0, 320)
        : fallbackProfile.subtitle,
    mode,
    ...(typeof rawProfile.ownerName === 'string' && rawProfile.ownerName.trim()
      ? { ownerName: rawProfile.ownerName.trim().slice(0, 80) }
      : fallbackOwnerName
        ? { ownerName: fallbackOwnerName.slice(0, 80) }
        : {}),
    updatedAt:
      typeof rawProfile.updatedAt === 'string' && rawProfile.updatedAt.trim()
        ? rawProfile.updatedAt.trim().slice(0, 40)
        : defaults.updatedAt,
  };

  const customDataset =
    mode === 'custom'
      ? sanitizeKnowledgeDataset(obj.customDataset) ?? createEmptyMindDataset()
      : null;

  return {
    schemaVersion: 1,
    profile,
    customDataset,
    hypothesisDecisions: sanitizeHypothesisDecisions(obj.hypothesisDecisions),
    recentExplorations: sanitizeRecentExplorations(obj.recentExplorations),
    updatedAt:
      typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
        ? obj.updatedAt.trim().slice(0, 40)
        : profile.updatedAt,
  };
}

export function loadLocalMindWorkspace(
  scope: string,
  ownerName?: string
): MindWorkspaceRecord {
  if (typeof window === 'undefined') {
    return createDefaultMindWorkspaceRecord(ownerName, false);
  }
  try {
    const raw = window.localStorage.getItem(mindStorageKeyForScope(scope));
    if (!raw) {
      return createDefaultMindWorkspaceRecord(ownerName, scope === 'guest');
    }
    return sanitizeMindWorkspaceRecord(JSON.parse(raw), ownerName);
  } catch {
    return createDefaultMindWorkspaceRecord(ownerName, false);
  }
}

export function saveLocalMindWorkspace(
  scope: string,
  record: MindWorkspaceRecord
): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = sanitizeMindWorkspaceRecord(record, record.profile.ownerName);
    window.localStorage.setItem(
      mindStorageKeyForScope(scope),
      JSON.stringify(sanitized)
    );
    window.localStorage.setItem(
      LEGACY_HYPOTHESES_KEY,
      JSON.stringify(sanitized.hypothesisDecisions)
    );
  } catch {
    // Ignore storage quota restrictions gracefully
  }
}

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function prepareFirestoreMindPayload(
  record: MindWorkspaceRecord
): MindWorkspaceRecord {
  const sanitized = sanitizeMindWorkspaceRecord(record, record.profile.ownerName);
  const payload = stripUndefinedDeep({
    ...sanitized,
    updatedAt: (sanitized.updatedAt || new Date().toISOString()).slice(0, 40),
  });
  const encoded = JSON.stringify(payload);
  if (encoded.length > MAX_FIRESTORE_MIND_BYTES) {
    throw new Error(
      `Mind Architecture workspace exceeds ${Math.round(MAX_FIRESTORE_MIND_BYTES / 1024)}KB cloud sync limit. Export a JSON backup or trim older entries.`
    );
  }
  return payload;
}
