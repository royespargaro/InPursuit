import type {
  MindClaim, MindClaimKind, MindClaimStatus, MindEpistemicBasis, MindEvidenceLink,
  MindEvidencePolarity, MindModel, MindObservation, MindObservationMethod,
  MindRelationship, MindRelationshipStatus, MindReviewEvent, MindSourceAuthor,
  MindSourceKind, MindSourceRecord,
} from '../types/knowledge';

const LIMITS = { sources: 500, observations: 5000, claims: 2000, relationships: 4000, events: 8000 } as const;
const CLAIM_KINDS = new Set<MindClaimKind>(['fact','belief','value','preference','goal','skill','experience','behavior_pattern','identity_model','interpretation','memory']);
const CLAIM_STATUSES = new Set<MindClaimStatus>(['candidate','active','challenged','rejected','superseded','expired']);
const BASES = new Set<MindEpistemicBasis>(['directly_observed','documented','self_reported','third_party_reported','inferred','externally_sourced']);
const SOURCE_KINDS = new Set<MindSourceKind>(['conversation','document','assessment','behavior_log','reflection','external_reference','user_entry']);
const SOURCE_AUTHORS = new Set<MindSourceAuthor>(['user','assistant','system','external']);
const METHODS = new Set<MindObservationMethod>(['direct_behavior','user_report','documented_record','assessment','third_party_report','model_inference']);
const POLARITIES = new Set<MindEvidencePolarity>(['supports','refutes','qualifies']);
const REL_STATUSES = new Set<MindRelationshipStatus>(['proposed','accepted','rejected']);
type Dict = Record<string, unknown>;
const isRecord = (v: unknown): v is Dict => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 4000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const optional = (v: unknown, max = 4000) => str(v, max) || undefined;
const iso = (v: unknown, fallback: string) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : fallback;
const num = (v: unknown, fallback = .5) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
const en = <T extends string>(v: unknown, values: Set<T>, fallback: T): T => typeof v === 'string' && values.has(v as T) ? v as T : fallback;
const id = (v: unknown) => str(v, 128);
const strings = (v: unknown, max: number) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map(x => x.trim().slice(0,128)).filter(Boolean))].slice(0,max) : [];

export function createEmptyMindModel(now = new Date().toISOString()): MindModel {
  return { schemaVersion: 2, sources: [], observations: [], claims: [], relationships: [], reviewEvents: [], updatedAt: now };
}

export function sanitizeMindModel(raw: unknown): MindModel {
  if (!isRecord(raw)) return createEmptyMindModel();
  const now = new Date().toISOString();
  const sources: MindSourceRecord[] = [];
  const sourceIds = new Set<string>();
  for (const x of (Array.isArray(raw.sources) ? raw.sources : []).slice(0,LIMITS.sources)) {
    if (!isRecord(x)) continue;
    const sid=id(x.id), title=str(x.title,240);
    if (!sid || !title || sourceIds.has(sid)) continue;
    sourceIds.add(sid);
    sources.push({ id:sid, kind:en(x.kind,SOURCE_KINDS,'user_entry'), author:en(x.author,SOURCE_AUTHORS,'user'), title,
      ...(optional(x.locator,500)?{locator:optional(x.locator,500)}:{}),
      ...(optional(x.occurredAt,40)?{occurredAt:iso(x.occurredAt,now)}:{}),
      capturedAt:iso(x.capturedAt,now), ...(optional(x.contentHash,128)?{contentHash:optional(x.contentHash,128)}:{}),
      originalAvailable:Boolean(x.originalAvailable),
      sensitivity:x.sensitivity==='highly_sensitive'||x.sensitivity==='sensitive'?x.sensitivity:'normal' });
  }
  const observations: MindObservation[]=[];
  const observationIds=new Set<string>();
  for (const x of (Array.isArray(raw.observations)?raw.observations:[]).slice(0,LIMITS.observations)) {
    if (!isRecord(x)) continue;
    const oid=id(x.id), sourceId=id(x.sourceId), content=str(x.content);
    if (!oid || !sourceIds.has(sourceId) || !content || observationIds.has(oid)) continue;
    observationIds.add(oid);
    observations.push({id:oid,sourceId,method:en(x.method,METHODS,'user_report'),content,
      ...(optional(x.excerpt,1200)?{excerpt:optional(x.excerpt,1200)}:{}),
      ...(optional(x.occurredAt,40)?{occurredAt:iso(x.occurredAt,now)}:{}),
      capturedAt:iso(x.capturedAt,now),...(optional(x.context,1000)?{context:optional(x.context,1000)}:{}),
      recordedBy:x.recordedBy==='assistant'||x.recordedBy==='system'?x.recordedBy:'user'});
  }
  const claims: MindClaim[]=[];
  const claimIds=new Set<string>();
  for (const x of (Array.isArray(raw.claims)?raw.claims:[]).slice(0,LIMITS.claims)) {
    if (!isRecord(x)) continue;
    const cid=id(x.id), statement=str(x.statement,1000);
    if (!cid || !statement || claimIds.has(cid)) continue;
    claimIds.add(cid);
    const evidence: MindEvidenceLink[]=[];
    const evidenceIds=new Set<string>();
    for (const e of (Array.isArray(x.evidence)?x.evidence:[]).slice(0,100)) {
      if (!isRecord(e)) continue;
      const eid=id(e.id), observationId=id(e.observationId);
      if (!eid || !observationIds.has(observationId) || evidenceIds.has(eid)) continue;
      evidenceIds.add(eid);
      evidence.push({id:eid,observationId,polarity:en(e.polarity,POLARITIES,'supports'),
        ...(optional(e.rationale,800)?{rationale:optional(e.rationale,800)}:{}),createdAt:iso(e.createdAt,now)});
    }
    const supersedesClaimId=id(x.supersedesClaimId);
    claims.push({id:cid,statement,kind:en(x.kind,CLAIM_KINDS,'fact'),domain:str(x.domain,100)||'Unclassified',
      status:en(x.status,CLAIM_STATUSES,'candidate'),epistemicBasis:en(x.epistemicBasis,BASES,'self_reported'),
      confidence:typeof x.confidence==='number'?num(x.confidence):null,sensitivity:x.sensitivity==='highly_sensitive'||x.sensitivity==='sensitive'?x.sensitivity:'normal',...(optional(x.context,1000)?{context:optional(x.context,1000)}:{}),
      ...(optional(x.validFrom,40)?{validFrom:iso(x.validFrom,now)}:{}),
      ...(optional(x.validUntil,40)?{validUntil:iso(x.validUntil,now)}:{}),evidence,
      ...(supersedesClaimId?{supersedesClaimId}:{}),createdAt:iso(x.createdAt,now),updatedAt:iso(x.updatedAt,now),
      ...(optional(x.lastReviewedAt,40)?{lastReviewedAt:iso(x.lastReviewedAt,now)}:{})});
  }
  const relationships: MindRelationship[]=[];
  const relIds=new Set<string>();
  for (const x of (Array.isArray(raw.relationships)?raw.relationships:[]).slice(0,LIMITS.relationships)) {
    if (!isRecord(x)) continue;
    const rid=id(x.id), from=id(x.fromClaimId), to=id(x.toClaimId), predicate=str(x.predicate,120);
    if (!rid || !predicate || !claimIds.has(from) || !claimIds.has(to) || from===to || relIds.has(rid)) continue;
    relIds.add(rid);
    relationships.push({id:rid,fromClaimId:from,toClaimId:to,predicate,status:en(x.status,REL_STATUSES,'proposed'),
      basis:x.basis==='explicit'?'explicit':'inferred',confidence:num(x.confidence),
      observationIds:strings(x.observationIds,40).filter(v=>observationIds.has(v)),createdAt:iso(x.createdAt,now),
      ...(optional(x.reviewedAt,40)?{reviewedAt:iso(x.reviewedAt,now)}:{})});
  }
  const reviewEvents: MindReviewEvent[]=[];
  const eventIds=new Set<string>();
  const actions=new Set(['confirm','challenge','reject','defer','correct','supersede','accept_link','reject_link']);
  for (const x of (Array.isArray(raw.reviewEvents)?raw.reviewEvents:[]).slice(-LIMITS.events)) {
    if (!isRecord(x)) continue;
    const eid=id(x.id), targetType=x.targetType==='relationship'?'relationship':'claim', targetId=id(x.targetId);
    const exists=targetType==='claim'?claimIds.has(targetId):relIds.has(targetId);
    if (!eid || !exists || eventIds.has(eid)) continue;
    eventIds.add(eid);
    reviewEvents.push({id:eid,targetType,targetId,action:typeof x.action==='string'&&actions.has(x.action)?x.action as MindReviewEvent['action']:'defer',
      previousStatus:str(x.previousStatus,40)||'candidate',nextStatus:str(x.nextStatus,40)||'candidate',
      ...(optional(x.note,1000)?{note:optional(x.note,1000)}:{}),
      actor:x.actor==='assistant'||x.actor==='system'?x.actor:'user',createdAt:iso(x.createdAt,now)});
  }
  // Review events are the authority for reviewed status. Imported status labels
  // without a corresponding event are downgraded instead of trusted.
  const reviewedClaims = claims.map(claim => {
    const latest = [...reviewEvents].reverse().find(event => event.targetType === 'claim' && event.targetId === claim.id);
    const status = latest ? en(latest.nextStatus, CLAIM_STATUSES, 'candidate') : 'candidate';
    return { ...claim, status };
  });
  const reviewedRelationships = relationships.map(relationship => {
    const latest = [...reviewEvents].reverse().find(event => event.targetType === 'relationship' && event.targetId === relationship.id);
    const status = latest ? en(latest.nextStatus, REL_STATUSES, 'proposed') : 'proposed';
    return { ...relationship, status };
  });
  return {schemaVersion:2,sources,observations,claims:reviewedClaims,relationships:reviewedRelationships,reviewEvents,updatedAt:iso(raw.updatedAt,now)};
}

export function addMindSource(model: MindModel, source: MindSourceRecord): MindModel {
  if (!source.id.trim() || !source.title.trim() || model.sources.some(x=>x.id===source.id) || model.sources.length>=LIMITS.sources) return model;
  return {...model,sources:[...model.sources,source],updatedAt:source.capturedAt};
}
export function addMindObservation(model: MindModel, observation: MindObservation): MindModel {
  if (!model.sources.some(x=>x.id===observation.sourceId) || model.observations.some(x=>x.id===observation.id) || model.observations.length>=LIMITS.observations) return model;
  return {...model,observations:[...model.observations,observation],updatedAt:observation.capturedAt};
}
export function createMindClaim(model: MindModel, input: Omit<MindClaim,'status'|'evidence'|'createdAt'|'updatedAt'>, now=new Date().toISOString()): MindModel {
  if (!input.id.trim() || !input.statement.trim() || model.claims.some(x=>x.id===input.id) || model.claims.length>=LIMITS.claims) return model;
  return {...model,claims:[...model.claims,{...input,status:'candidate',evidence:[],createdAt:now,updatedAt:now}],updatedAt:now};
}
export function attachMindEvidence(model: MindModel, claimId: string, link: MindEvidenceLink): MindModel {
  if (!model.observations.some(x=>x.id===link.observationId)) return model;
  const claim=model.claims.find(x=>x.id===claimId);
  if (!claim || claim.evidence.some(x=>x.id===link.id)) return model;
  return {...model,claims:model.claims.map(x=>x.id===claimId?{...x,evidence:[...x.evidence,link],updatedAt:link.createdAt}:x),updatedAt:link.createdAt};
}
export function reviewMindClaim(model: MindModel, claimId: string, action: 'confirm'|'challenge'|'reject'|'defer'|'supersede', eventId: string, actor: MindReviewEvent['actor']='user', note?: string, now=new Date().toISOString()): MindModel {
  const claim=model.claims.find(x=>x.id===claimId);
  if (!claim || model.reviewEvents.some(x=>x.id===eventId)) return model;
  if (action==='confirm' && !claim.evidence.some(x=>x.polarity==='supports')) return model;
  const nextStatus: MindClaimStatus=action==='confirm'?'active':action==='challenge'?'challenged':action==='reject'?'rejected':action==='supersede'?'superseded':'candidate';
  const event: MindReviewEvent={id:eventId,targetType:'claim',targetId:claimId,action,previousStatus:claim.status,nextStatus,
    ...(note?.trim()?{note:note.trim().slice(0,1000)}:{}),actor,createdAt:now};
  return {...model,claims:model.claims.map(x=>x.id===claimId?{...x,status:nextStatus,lastReviewedAt:now,updatedAt:now}:x),
    reviewEvents:[...model.reviewEvents,event].slice(-LIMITS.events),updatedAt:now};
}
export function addMindRelationship(model: MindModel, relationship: MindRelationship): MindModel {
  const ids=new Set(model.claims.map(x=>x.id));
  if (!ids.has(relationship.fromClaimId)||!ids.has(relationship.toClaimId)||relationship.fromClaimId===relationship.toClaimId||
      model.relationships.some(x=>x.id===relationship.id)||model.relationships.length>=LIMITS.relationships||
      relationship.observationIds.some(id=>!model.observations.some(x=>x.id===id))) return model;
  return {...model,relationships:[...model.relationships,{...relationship,status:'proposed',reviewedAt:undefined}],updatedAt:relationship.createdAt};
}
export function reviewMindRelationship(model: MindModel, relationshipId: string, decision: 'accept_link'|'reject_link', eventId: string, note?: string, now=new Date().toISOString()): MindModel {
  const rel=model.relationships.find(x=>x.id===relationshipId);
  if (!rel || model.reviewEvents.some(x=>x.id===eventId)) return model;
  const nextStatus=decision==='accept_link'?'accepted':'rejected';
  const event: MindReviewEvent={id:eventId,targetType:'relationship',targetId:relationshipId,action:decision,
    previousStatus:rel.status,nextStatus,...(note?.trim()?{note:note.trim().slice(0,1000)}:{}),actor:'user',createdAt:now};
  return {...model,relationships:model.relationships.map(x=>x.id===relationshipId?{...x,status:nextStatus,reviewedAt:now}:x),
    reviewEvents:[...model.reviewEvents,event].slice(-LIMITS.events),updatedAt:now};
}
export function captureSelfReport(model: MindModel, input: {
  source: MindSourceRecord; observation: MindObservation;
  claim: Omit<MindClaim,'status'|'evidence'|'createdAt'|'updatedAt'>; evidenceId: string;
}): MindModel {
  if (input.source.author!=='user'||input.observation.recordedBy!=='user'||input.observation.method!=='user_report') return model;
  let next=addMindSource(model,input.source);
  next=addMindObservation(next,input.observation);
  next=createMindClaim(next,input.claim,input.source.capturedAt);
  next=attachMindEvidence(next,input.claim.id,{id:input.evidenceId,observationId:input.observation.id,polarity:'supports',
    rationale:'Direct self-report: evidence that the user expressed this claim, not independent proof that it is objectively true.',
    createdAt:input.source.capturedAt});
  return next;
}

export function supersedeMindClaim(
  model: MindModel,
  claimId: string,
  replacement: Omit<MindClaim,'status'|'evidence'|'createdAt'|'updatedAt'>,
  evidenceLink: MindEvidenceLink,
  eventId: string,
  note?: string,
  now = new Date().toISOString()
): MindModel {
  const original = model.claims.find(item => item.id === claimId);
  if (!original || model.reviewEvents.some(item => item.id === eventId) ||
      replacement.id === claimId || replacement.supersedesClaimId !== claimId ||
      !model.observations.some(item => item.id === evidenceLink.observationId)) return model;
  let next = createMindClaim(model, replacement, now);
  next = attachMindEvidence(next, replacement.id, evidenceLink);
  const revised = next.claims.find(item => item.id === replacement.id);
  if (!revised || revised.evidence.length === 0) return model;
  const event: MindReviewEvent = {
    id: eventId, targetType: 'claim', targetId: claimId, action: 'supersede',
    previousStatus: original.status, nextStatus: 'superseded',
    ...(note?.trim() ? { note: note.trim().slice(0,1000) } : {}),
    actor: 'user', createdAt: now,
  };
  return {
    ...next,
    claims: next.claims.map(item => item.id === claimId
      ? { ...item, status: 'superseded', lastReviewedAt: now, updatedAt: now }
      : item),
    reviewEvents: [...next.reviewEvents, event].slice(-LIMITS.events),
    updatedAt: now,
  };
}
