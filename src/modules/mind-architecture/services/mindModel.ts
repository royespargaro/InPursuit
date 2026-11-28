import type {
  MindClaim,
  MindClaimKind,
  MindClaimStatus,
  MindEpistemicBasis,
  MindEvidenceLink,
  MindEvidencePolarity,
  MindModel,
  MindObservation,
  MindObservationMethod,
  MindRelationship,
  MindRelationshipStatus,
  MindReviewEvent,
  MindSourceAuthor,
  MindSourceKind,
  MindSourceRecord,
} from '../types/knowledge';

const LIMITS = {
  sources: 500,
  observations: 5000,
  claims: 2000,
  relationships: 4000,
  events: 8000,
  text: 4000,
  shortText: 500,
} as const;

const CLAIM_KINDS = new Set<MindClaimKind>([
  'fact', 'belief', 'value', 'preference', 'goal', 'skill', 'experience',
  'behavior_pattern', 'identity_model', 'interpretation', 'memory',
]);
const CLAIM_STATUSES = new Set<MindClaimStatus>([
  'candidate', 'active', 'challenged', 'rejected', 'superseded', 'expired',
]);
const BASES = new Set<MindEpistemicBasis>([
  'directly_observed', 'documented', 'self_reported', 'third_party_reported',
  'inferred', 'externally_sourced',
]);
const SOURCE_KINDS = new Set<MindSourceKind>([
  'conversation', 'document', 'assessment', 'behavior_log', 'reflection',
  'external_reference', 'user_entry',
]);
const SOURCE_AUTHORS = new Set<MindSourceAuthor>(['user', 'assistant', 'system', 'external']);
const OBSERVATION_METHODS = new Set<MindObservationMethod>([
  'direct_behavior', 'user_report', 'documented_record', 'assessment',
  'third_party_report', 'model_inference',
]);
const EVIDENCE_POLARITIES = new Set<MindEvidencePolarity>(['supports', 'refutes', 'qualifies']);
const RELATIONSHIP_STATUSES = new Set<MindRelationshipStatus>(['proposed', 'accepted', 'rejected']);

type Dict = Record<string, unknown>;
const isRecord = (value: unknown): value is Dict =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown, max = LIMITS.text): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const optionalStr = (value: unknown, max = LIMITS.text): string | undefined => {
  const result = str(value, max);
  return result || undefined;
};
const iso = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};
const boundedNumber = (value: unknown, fallback = 0.5): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
const enumValue = <T extends string>(value: unknown, values: Set<T>, fallback: T): T =>
  typeof value === 'string' && values.has(value as T) ? (value as T) : fallback;
const uniqueId = (value: unknown): string => str(value, 128);
const uniqueStrings = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim().slice(0, 128)).filter(Boolean))].slice(0, max)
    : [];

export function createEmptyMindModel(now = new Date().toISOString()): MindModel {
  return {
    schemaVersion: 2,
    sources: [],
    observations: [],
    claims: [],
    relationships: [],
    reviewEvents: [],
    updatedAt: now,
  };
}

export function sanitizeMindModel(raw: unknown): MindModel {
  if (!isRecord(raw)) return createEmptyMindModel();
  const now = new Date().toISOString();

  const sources: MindSourceRecord[] = [];
  const sourceIds = new Set<string>();
  if (Array.isArray(raw.sources)) {
    for (const item of raw.sources.slice(0, LIMITS.sources)) {
      if (!isRecord(item)) continue;
      const id = uniqueId(item.id);
      const title = str(item.title, 240);
      if (!id || !title || sourceIds.has(id)) continue;
      sourceIds.add(id);
      sources.push({
        id,
        kind: enumValue(item.kind, SOURCE_KINDS, 'user_entry'),
        author: enumValue(item.author, SOURCE_AUTHORS, 'user'),
        title,
        ...(optionalStr(item.locator, 500) ? { locator: optionalStr(item.locator, 500) } : {}),
        ...(optionalStr(item.occurredAt, 40) ? { occurredAt: iso(item.occurredAt, now) } : {}),
        capturedAt: iso(item.capturedAt, now),
        ...(optionalStr(item.contentHash, 128) ? { contentHash: optionalStr(item.contentHash, 128) } : {}),
        originalAvailable: Boolean(item.originalAvailable),
        sensitivity: item.sensitivity === 'highly_sensitive' || item.sensitivity === 'sensitive' ? item.sensitivity : 'normal',
      });
    }
  }

  const observations: MindObservation[] = [];
  const observationIds = new Set<string>();
  if (Array.isArray(raw.observations)) {
    for (const item of raw.observations.slice(0, LIMITS.observations)) {
      if (!isRecord(item)) continue;
      const id = uniqueId(item.id);
      const sourceId = uniqueId(item.sourceId);
      const content = str(item.content);
      if (!id || !sourceIds.has(sourceId) || !content || observationIds.has(id)) continue;
      observationIds.add(id);
      observations.push({
        id,
        sourceId,
        method: enumValue(item.method, OBSERVATION_METHODS, 'user_report'),
        content,
        ...(optionalStr(item.excerpt, 1200) ? { excerpt: optionalStr(item.excerpt, 1200) } : {}),
        ...(optionalStr(item.occurredAt, 40) ? { occurredAt: iso(item.occurredAt, now) } : {}),
        capturedAt: iso(item.capturedAt, now),
        ...(optionalStr(item.context, 1000) ? { context: optionalStr(item.context, 1000) } : {}),
        recordedBy: item.recordedBy === 'assistant' || item.recordedBy === 'system' ? item.recordedBy : 'user',
      });
    }
  }

  const claims: MindClaim[] = [];
  const claimIds = new Set<string>();
  if (Array.isArray(raw.claims)) {
    for (const item of raw.claims.slice(0, LIMITS.claims)) {
      if (!isRecord(item)) continue;
      const id = uniqueId(item.id);
      const statement = str(item.statement, 1000);
      if (!id || !statement || claimIds.has(id)) continue;
      claimIds.add(id);
      const evidence: MindEvidenceLink[] = [];
      const seenEvidence = new Set<string>();
      if (Array.isArray(item.evidence)) {
        for (const rawLink of item.evidence.slice(0, 100)) {
          if (!isRecord(rawLink)) continue;
          const linkId = uniqueId(rawLink.id);
          const observationId = uniqueId(rawLink.observationId);
          if (!linkId || !observationIds.has(observationId) || seenEvidence.has(linkId)) continue;
          seenEvidence.add(linkId);
          evidence.push({
            id: linkId,
            observationId,
            polarity: enumValue(rawLink.polarity, EVIDENCE_POLARITIES, 'supports'),
            ...(optionalStr(rawLink.rationale, 800) ? { rationale: optionalStr(rawLink.rationale, 800) } : {}),
            createdAt: iso(rawLink.createdAt, now),
          });
        }
      }
      const supersedesClaimId = uniqueId(item.supersedesClaimId);
      claims.push({
        id,
        statement,
        kind: enumValue(item.kind, CLAIM_KINDS, 'fact'),
        domain: str(item.domain, 100) || 'Unclassified',
        status: enumValue(item.status, CLAIM_STATUSES, 'candidate'),
        epistemicBasis: enumValue(item.epistemicBasis, BASES, 'self_reported'),
        confidence: boundedNumber(item.confidence),
        ...(optionalStr(item.context, 1000) ? { context: optionalStr(item.context, 1000) } : {}),
        ...(optionalStr(item.validFrom, 40) ? { validFrom: iso(item.validFrom, now) } : {}),
        ...(optionalStr(item.validUntil, 40) ? { validUntil: iso(item.validUntil, now) } : {}),
        evidence,
        ...(supersedesClaimId ? { supersedesClaimId } : {}),
        createdAt: iso(item.createdAt, now),
        updatedAt: iso(item.updatedAt, now),
        ...(optionalStr(item.lastReviewedAt, 40) ? { lastReviewedAt: iso(item.lastReviewedAt, now) } : {}),
      });
    }
  }

  const relationships: MindRelationship[] = [];
  const relationshipIds = new Set<string>();
  if (Array.isArray(raw.relationships)) {
    for (const item of raw.relationships.slice(0, LIMITS.relationships)) {
      if (!isRecord(item)) continue;
      const id = uniqueId(item.id);
      const fromClaimId = uniqueId(item.fromClaimId);
      const toClaimId = uniqueId(item.toClaimId);
      const predicate = str(item.predicate, 120);
      if (!id || !predicate || !claimIds.has(fromClaimId) || !claimIds.has(toClaimId) || fromClaimId === toClaimId || relationshipIds.has(id)) continue;
      relationshipIds.add(id);
      relationships.push({
        id,
        fromClaimId,
        toClaimId,
        predicate,
        status: enumValue(item.status, RELATIONSHIP_STATUSES, 'proposed'),
        basis: item.basis === 'explicit' ? 'explicit' : 'inferred',
        confidence: boundedNumber(item.confidence),
        observationIds: uniqueStrings(item.observationIds, 40).filter(obsId => observationIds.has(obsId)),
        createdAt: iso(item.createdAt, now),
        ...(optionalStr(item.reviewedAt, 40) ? { reviewedAt: iso(item.reviewedAt, now) } : {}),
      });
    }
  }

  const reviewEvents: MindReviewEvent[] = [];
  const eventIds = new Set<string>();
  if (Array.isArray(raw.reviewEvents)) {
    for (const item of raw.reviewEvents.slice(-LIMITS.events)) {
      if (!isRecord(item)) continue;
      const id = uniqueId(item.id);
      const targetType = item.targetType === 'relationship' ? 'relationship' : 'claim';
      const targetId = uniqueId(item.targetId);
      const exists = targetType === 'claim' ? claimIds.has(targetId) : relationshipIds.has(targetId);
      if (!id || !targetId || !exists || eventIds.has(id)) continue;
      eventIds.add(id);
      const actions = new Set(['confirm', 'challenge', 'reject', 'defer', 'correct', 'supersede', 'accept_link', 'reject_link']);
      const action = typeof item.action === 'string' && actions.has(item.action) ? item.action as MindReviewEvent['action'] : 'defer';
      reviewEvents.push({
        id,
        targetType,
        targetId,
        action,
        previousStatus: str(item.previousStatus, 40) || 'candidate',
        nextStatus: str(item.nextStatus, 40) || 'candidate',
        ...(optionalStr(item.note, 1000) ? { note: optionalStr(item.note, 1000) } : {}),
        actor: item.actor === 'assistant' || item.actor === 'system' ? item.actor : 'user',
        createdAt: iso(item.createdAt, now),
      });
    }
  }

  return {
    schemaVersion: 2,
    sources,
    observations,
    claims,
    relationships,
    reviewEvents,
    updatedAt: iso(raw.updatedAt, now),
  };
}

export function addMindSource(model: MindModel, source: MindSourceRecord): MindModel {
  if (model.sources.some(item => item.id === source.id)) return model;
  if (model.sources.length >= LIMITS.sources || !source.id.trim() || !source.title.trim()) return model;
  return { ...model, sources: [...model.sources, source], updatedAt: source.capturedAt };
}

export function addMindObservation(model: MindModel, observation: MindObservation): MindModel {
  if (!model.sources.some(item => item.id === observation.sourceId)) return model;
  if (model.observations.some(item => item.id === observation.id) || model.observations.length >= LIMITS.observations) return model;
  return { ...model, observations: [...model.observations, observation], updatedAt: observation.capturedAt };
}

export function createMindClaim(
  model: MindModel,
  input: Omit<MindClaim, 'status' | 'evidence' | 'createdAt' | 'updatedAt'>,
  now = new Date().toISOString()
): MindModel {
  if (!input.id.trim() || !input.statement.trim() || model.claims.some(item => item.id === input.id) || model.claims.length >= LIMITS.claims) return model;
  const claim: MindClaim = {
    ...input,
    status: 'candidate',
    evidence: [],
    createdAt: now,
    updatedAt: now,
  };
  return { ...model, claims: [...model.claims, claim], updatedAt: now };
}

export function attachMindEvidence(
  model: MindModel,
  claimId: string,
  link: MindEvidenceLink
): MindModel {
  if (!model.observations.some(item => item.id === link.observationId)) return model;
  const claim = model.claims.find(item => item.id === claimId);
  if (!claim || claim.evidence.some(item => item.id === link.id)) return model;
  return {
    ...model,
    claims: model.claims.map(item => item.id === claimId
      ? { ...item, evidence: [...item.evidence, link], updatedAt: link.createdAt }
      : item),
    updatedAt: link.createdAt,
  };
}

export function reviewMindClaim(
  model: MindModel,
  claimId: string,
  action: 'confirm' | 'challenge' | 'reject' | 'defer',
  eventId: string,
  actor: MindReviewEvent['actor'] = 'user',
  note?: string,
  now = new Date().toISOString()
): MindModel {
  const claim = model.claims.find(item => item.id === claimId);
  if (!claim || model.reviewEvents.some(item => item.id === eventId)) return model;
  if (action === 'confirm' && !claim.evidence.some(item => item.polarity === 'supports')) return model;
  const nextStatus: MindClaimStatus = action === 'confirm' ? 'active'
    : action === 'challenge' ? 'challenged'
      : action === 'reject' ? 'rejected' : 'candidate';
  const event: MindReviewEvent = {
    id: eventId,
    targetType: 'claim',
    targetId: claimId,
    action,
    previousStatus: claim.status,
    nextStatus,
    ...(note?.trim() ? { note: note.trim().slice(0, 1000) } : {}),
    actor,
    createdAt: now,
  };
  return {
    ...model,
    claims: model.claims.map(item => item.id === claimId
      ? { ...item, status: nextStatus, lastReviewedAt: now, updatedAt: now }
      : item),
    reviewEvents: [...model.reviewEvents, event].slice(-LIMITS.events),
    updatedAt: now,
  };
}

export function addMindRelationship(model: MindModel, relationship: MindRelationship): MindModel {
  const ids = new Set(model.claims.map(item => item.id));
  if (!ids.has(relationship.fromClaimId) || !ids.has(relationship.toClaimId) || relationship.fromClaimId === relationship.toClaimId) return model;
  if (model.relationships.some(item => item.id === relationship.id) || model.relationships.length >= LIMITS.relationships) return model;
  if (relationship.observationIds.some(id => !model.observations.some(obs => obs.id === id))) return model;
  return { ...model, relationships: [...model.relationships, relationship], updatedAt: relationship.createdAt };
}

export function reviewMindRelationship(
  model: MindModel,
  relationshipId: string,
  decision: 'accept_link' | 'reject_link',
  eventId: string,
  note?: string,
  now = new Date().toISOString()
): MindModel {
  const relationship = model.relationships.find(item => item.id === relationshipId);
  if (!relationship || model.reviewEvents.some(item => item.id === eventId)) return model;
  const nextStatus = decision === 'accept_link' ? 'accepted' : 'rejected';
  const event: MindReviewEvent = {
    id: eventId,
    targetType: 'relationship',
    targetId: relationshipId,
    action: decision,
    previousStatus: relationship.status,
    nextStatus,
    ...(note?.trim() ? { note: note.trim().slice(0, 1000) } : {}),
    actor: 'user',
    createdAt: now,
  };
  return {
    ...model,
    relationships: model.relationships.map(item => item.id === relationshipId
      ? { ...item, status: nextStatus, reviewedAt: now }
      : item),
    reviewEvents: [...model.reviewEvents, event].slice(-LIMITS.events),
    updatedAt: now,
  };
}
