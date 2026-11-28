import { describe, expect, it } from 'vitest';
import {
  addMindObservation, addMindSource, captureSelfReport,
  createEmptyMindModel, createMindClaim, reviewMindClaim, sanitizeMindModel, supersedeMindClaim,
} from '../modules/mind-architecture/services/mindModel';
import {
  createDefaultMindWorkspaceRecord, sanitizeMindWorkspaceRecord,
} from '../modules/mind-architecture/services/mindStore';
import type { MindClaim, MindObservation, MindSourceRecord } from '../modules/mind-architecture/types/knowledge';

const now='2026-11-28T04:00:00.000Z';
const source:MindSourceRecord={id:'s1',kind:'conversation',author:'user',title:'User statement',capturedAt:now,originalAvailable:true,sensitivity:'normal'};
const observation:MindObservation={id:'o1',sourceId:'s1',method:'user_report',content:'I plan backwards from long-term goals.',capturedAt:now,recordedBy:'user'};
const claim:Omit<MindClaim,'status'|'evidence'|'createdAt'|'updatedAt'>={id:'c1',statement:'The user prefers backward planning.',kind:'preference',domain:'Planning',epistemicBasis:'self_reported',confidence:.8,sensitivity:'normal'};

describe('Personal Mind Model v2',()=>{
  it('creates a clean personal model without importing sample archive data',()=>{
    const record=createDefaultMindWorkspaceRecord();
    expect(record.schemaVersion).toBe(2);
    expect(record.model.claims).toEqual([]);
  });
  it('migrates a v1 workspace without losing the old graph or review decisions',()=>{
    const result=sanitizeMindWorkspaceRecord({schemaVersion:1,profile:{title:'Archive',subtitle:'Old',mode:'custom',updatedAt:now},customDataset:{version:'legacy',nodes:[],edges:[]},hypothesisDecisions:{e1:'confirmed'},recentExplorations:[],updatedAt:now});
    expect(result.schemaVersion).toBe(2);
    expect(result.profile.title).toBe('Archive');
    expect(result.hypothesisDecisions.e1).toBe('confirmed');
    expect(result.customDataset).not.toBeNull();
    expect(result.model.claims).toHaveLength(0);
  });
  it('rejects observations without a registered source',()=>{
    const empty=createEmptyMindModel(now);
    expect(addMindObservation(empty,observation)).toBe(empty);
    expect(addMindObservation(addMindSource(empty,source),observation).observations).toHaveLength(1);
  });
  it('creates self-reported claims as candidates with explicit provenance',()=>{
    const model=captureSelfReport(createEmptyMindModel(now),{source,observation,claim,evidenceId:'ev1'});
    expect(model.claims[0]).toMatchObject({status:'candidate',epistemicBasis:'self_reported'});
    expect(model.claims[0].evidence[0]).toMatchObject({observationId:'o1',polarity:'supports'});
    expect(model.observations[0].sourceId).toBe('s1');
  });
  it('does not allow a claim to be confirmed without supporting evidence',()=>{
    const pending=createMindClaim(createEmptyMindModel(now),claim,now);
    const reviewed=reviewMindClaim(pending,'c1','confirm','r1','user',undefined,now);
    expect(reviewed.claims[0].status).toBe('candidate');
    expect(reviewed.reviewEvents).toHaveLength(0);
  });
  it('appends a review event rather than overwriting the review history',()=>{
    let model=captureSelfReport(createEmptyMindModel(now),{source,observation,claim,evidenceId:'ev1'});
    model=reviewMindClaim(model,'c1','confirm','r1','user','Reviewed against source.',now);
    model=reviewMindClaim(model,'c1','challenge','r2','user','New conflicting evidence.',now);
    expect(model.claims[0].status).toBe('challenged');
    expect(model.reviewEvents.map(e=>e.action)).toEqual(['confirm','challenge']);
    expect(model.reviewEvents[0].nextStatus).toBe('active');
  });
  it('drops orphaned observations, evidence and relationships during sanitization',()=>{
    const clean=sanitizeMindModel({
      sources:[source],
      observations:[{...observation,sourceId:'missing'}],
      claims:[{...claim,status:'active',createdAt:now,updatedAt:now,evidence:[{id:'bad',observationId:'missing',polarity:'supports',createdAt:now}]}],
      relationships:[{id:'bad-link',fromClaimId:'c1',toClaimId:'absent',predicate:'influences',status:'accepted',basis:'inferred',confidence:.9,observationIds:[],createdAt:now}],
    });
    expect(clean.observations).toHaveLength(0);
    expect(clean.claims[0].evidence).toHaveLength(0);
    expect(clean.claims[0].status).toBe('candidate');
    expect(clean.relationships).toHaveLength(0);
  });

  it('corrects a claim by creating a replacement and preserving supersede history',()=>{
    let model=captureSelfReport(createEmptyMindModel(now),{source,observation,claim,evidenceId:'ev1'});
    const correctionSource:MindSourceRecord={...source,id:'s2',title:'Correction',capturedAt:now};
    const correctionObservation:MindObservation={...observation,id:'o2',sourceId:'s2',content:'I plan backwards only for long-range projects.'};
    model=addMindSource(model,correctionSource);
    model=addMindObservation(model,correctionObservation);
    model=supersedeMindClaim(model,'c1',{
      id:'c2',statement:'The user uses backward planning for long-range projects.',kind:'preference',
      domain:'Planning',epistemicBasis:'self_reported',confidence:null,sensitivity:'normal',supersedesClaimId:'c1',
    },{id:'ev2',observationId:'o2',polarity:'supports',createdAt:now},'r2','User clarified the scope.',now);
    expect(model.claims.find(x=>x.id==='c1')?.status).toBe('superseded');
    expect(model.claims.find(x=>x.id==='c2')).toMatchObject({status:'candidate',supersedesClaimId:'c1'});
    expect(model.reviewEvents.at(-1)).toMatchObject({action:'supersede',targetId:'c1',nextStatus:'superseded'});
  });
  it('clamps confidence to a normalized 0..1 range',()=>{
    const clean=sanitizeMindModel({claims:[{...claim,confidence:5,createdAt:now,updatedAt:now}]});
    expect(clean.claims[0].confidence).toBe(1);
  });
});
