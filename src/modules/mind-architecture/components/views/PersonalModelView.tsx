import { useMemo, useState, type FormEvent } from 'react';
import { Check, CircleHelp, Plus, ShieldAlert, X } from 'lucide-react';
import { useMindWorkspaceOptional } from '../../context/MindWorkspaceContext';
import { createMindId } from '../../services/mindBuilder';
import type { MindClaim, MindClaimKind } from '../../types/knowledge';

const KINDS: { value: MindClaimKind; label: string }[] = [
  {value:'fact',label:'Fact / personal record'},{value:'belief',label:'Belief'},{value:'value',label:'Value'},
  {value:'preference',label:'Preference'},{value:'goal',label:'Goal / intention'},{value:'skill',label:'Skill / capability'},
  {value:'experience',label:'Experience'},{value:'behavior_pattern',label:'Behavior pattern'},
  {value:'identity_model',label:'Identity / self-model'},{value:'interpretation',label:'Interpretation'},{value:'memory',label:'Memory'},
];
const STATUS: Record<string,string>={candidate:'Needs review',active:'Current self-model',challenged:'Conflicting evidence',rejected:'Rejected',superseded:'Superseded',expired:'Expired'};

export function PersonalModelView({ hideSensitive }: { hideSensitive: boolean }) {
  const workspace=useMindWorkspaceOptional();
  const [statement,setStatement]=useState('');
  const [domain,setDomain]=useState('Personal');
  const [kind,setKind]=useState<MindClaimKind>('preference');
  const [correctionFor,setCorrectionFor]=useState<string|null>(null);
  const [correctionText,setCorrectionText]=useState('');
  const model=workspace?.record.model;
  const visibleClaims = useMemo(() => (model?.claims ?? []).filter(claim => !hideSensitive || claim.sensitivity === 'normal'), [model, hideSensitive]);
  const counts=useMemo(()=>{
    const claims=visibleClaims;
    return [claims.length,claims.filter(x=>x.status==='candidate').length,claims.filter(x=>x.status==='active').length,claims.filter(x=>x.status==='challenged').length];
  },[visibleClaims]);
  const saveCorrection=(event:FormEvent<HTMLFormElement>, claim: MindClaim)=>{
    event.preventDefault();
    if(!workspace||!correctionText.trim())return;
    const now=new Date().toISOString(), sourceId=createMindId('src'), observationId=createMindId('obs'), claimId=createMindId('clm');
    workspace.addModelSource({id:sourceId,kind:'user_entry',author:'user',title:'User correction',capturedAt:now,originalAvailable:true,sensitivity:claim.sensitivity});
    workspace.addModelObservation({id:observationId,sourceId,method:'user_report',content:correctionText.trim(),capturedAt:now,recordedBy:'user'});
    workspace.supersedeModelClaim(claim.id,{
      id:claimId,statement:correctionText.trim(),kind:claim.kind,domain:claim.domain,
      epistemicBasis:'self_reported',confidence:null,sensitivity:claim.sensitivity,validFrom:now,supersedesClaimId:claim.id,
    },{id:createMindId('evd'),observationId,polarity:'supports',rationale:'User-provided correction; evidence of the updated self-report, not independent proof.',createdAt:now},
    createMindId('rev'),'User supplied a replacement claim.');
    setCorrectionFor(null);
    setCorrectionText('');
  };
  const capture=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!workspace||!statement.trim())return;
    const now=new Date().toISOString(), sourceId=createMindId('src'), observationId=createMindId('obs'), claimId=createMindId('clm');
    workspace.captureSelfReport({
      source:{id:sourceId,kind:'user_entry',author:'user',title:'Direct self-report',capturedAt:now,originalAvailable:true,sensitivity:'normal'},
      observation:{id:observationId,sourceId,method:'user_report',content:statement.trim(),capturedAt:now,recordedBy:'user'},
      claim:{id:claimId,statement:statement.trim(),kind,domain:domain.trim()||'Unclassified',epistemicBasis:'self_reported',confidence:null,sensitivity:'normal',validFrom:now},
      evidenceId:createMindId('evd'),
    });
    setStatement('');
  };
  if(!workspace||!model)return <div className="p-6 text-sm text-[#9ba3b0]">Personal model storage is unavailable.</div>;
  return <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
    <header className="border-b border-white/[0.08] pb-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#d4ff3a]">Canonical personal knowledge base · v2</p>
      <h1 className="mt-1.5 font-display text-2xl font-bold text-[#f5f5f3]">Personal Model</h1>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#9ba3b0]">A claim is not a fact just because it appears here. Every claim carries its source, observation method, evidence, review history and time context.</p>
    </header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {['Claims','Needs review','Current','Challenged'].map((label,i)=><div key={label} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-[11px] text-[#9ba3b0]">{label}</p><p className="mt-1 font-mono text-2xl text-[#f5f5f3]">{counts[i]}</p></div>)}
    </div>
    <section className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-5 sm:p-6">
      <div className="flex items-center gap-2 text-[#d4ff3a]"><Plus size={15}/><h2 className="font-display text-base font-semibold text-[#f5f5f3]">Capture a self-report</h2></div>
      <p className="mt-2 text-xs leading-relaxed text-[#9ba3b0]">This records evidence that you made the statement—not independent proof that it is objectively true.</p>
      <form onSubmit={capture} className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-xs text-[#9ba3b0]">Statement<textarea value={statement} onChange={e=>setStatement(e.target.value)} required rows={3} maxLength={1000} placeholder="Example: I work best when I define the outcome first and plan backwards." className="w-full rounded-xl border border-white/[0.12] bg-black/20 px-3 py-3 text-sm text-[#f5f5f3] outline-none focus:border-[#d4ff3a]/50"/></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs text-[#9ba3b0]">Claim type<select value={kind} onChange={e=>setKind(e.target.value as MindClaimKind)} className="min-h-10 rounded-lg border border-white/[0.12] bg-[#15171b] px-3 text-sm text-[#f5f5f3]">{KINDS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs text-[#9ba3b0]">Domain<input value={domain} onChange={e=>setDomain(e.target.value)} maxLength={100} className="min-h-10 rounded-lg border border-white/[0.12] bg-black/20 px-3 text-sm text-[#f5f5f3]"/></label>
        </div>
        <div className="flex justify-end"><button disabled={!statement.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#d4ff3a] px-4 text-xs font-semibold text-[#10120b] disabled:opacity-40"><Plus size={14}/> Add provisional claim</button></div>
      </form>
    </section>
    <section className="space-y-3">
      <div><h2 className="font-display text-lg font-semibold text-[#f5f5f3]">Claims ledger</h2><p className="text-xs text-[#9ba3b0]">Newest first · {model.reviewEvents.length} append-only review events</p></div>
      {visibleClaims.length===0?<div className="rounded-2xl border border-dashed border-white/[0.14] p-8 text-center"><CircleHelp className="mx-auto mb-3 text-[#9ba3b0]" size={22}/><p className="text-sm font-medium text-[#f5f5f3]">No personal claims captured yet</p><p className="mt-1 text-xs text-[#9ba3b0]">The model starts empty. It will not silently import personality scores or assumptions from the sample archive.</p></div>:
      [...visibleClaims].reverse().map(claim=><article key={claim.id} className="rounded-2xl border border-white/[0.08] bg-[rgba(12,13,16,0.85)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full border border-white/[0.12] px-2.5 py-1 font-mono text-[10px] uppercase text-[#aeb5c2]">{STATUS[claim.status]}</span><span className="font-mono text-[10px] text-[#7c8494]">{claim.kind.replaceAll('_',' ')} · {claim.domain}</span></div>
        <p className="mt-3 text-sm leading-relaxed text-[#f5f5f3]">{claim.statement}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#9ba3b0]"><span>Basis: {claim.epistemicBasis.replaceAll('_',' ')}</span><span>Evidence: {claim.evidence.length}</span><span>Confidence: {claim.confidence === null ? 'not assessed' : `${Math.round(claim.confidence*100)}% · provisional estimate`} · {claim.sensitivity}</span><span>{new Date(claim.createdAt).toLocaleDateString()}</span></div>
        {claim.evidence.map(link=>{const obs=model.observations.find(x=>x.id===link.observationId);const src=obs&&model.sources.find(x=>x.id===obs.sourceId);return <div key={link.id} className="mt-3 border-l-2 border-[#d4ff3a]/50 bg-white/[0.025] px-3 py-2"><p className="text-xs leading-relaxed text-[#c8ced8]">{obs?.content??'Observation unavailable'}</p><p className="mt-1 font-mono text-[9px] text-[#7c8494]">{src?.title??'Unknown source'} · {obs?.method.replaceAll('_',' ')}</p></div>;})}
        {!['rejected','superseded','expired'].includes(claim.status)&&<div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-3">
          <button onClick={()=>workspace.reviewModelClaim(claim.id,'confirm',createMindId('rev'),'I confirm this reflects my current self-understanding.')} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 text-[11px] text-emerald-300"><Check size={13}/> Confirm current</button>
          <button onClick={()=>workspace.reviewModelClaim(claim.id,'challenge',createMindId('rev'),'This claim needs further evidence or qualification.')} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 text-[11px] text-amber-300"><ShieldAlert size={13}/> Challenge</button>
          <button onClick={()=>workspace.reviewModelClaim(claim.id,'reject',createMindId('rev'),'I reject this claim.')} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 text-[11px] text-rose-300"><X size={13}/> Reject</button>
          <button onClick={()=>{setCorrectionFor(claim.id);setCorrectionText(claim.statement);}} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/[0.15] px-3 text-[11px] text-[#d6d9e0]">Correct / replace</button>
        </div>}
        {correctionFor===claim.id && <form onSubmit={event=>saveCorrection(event,claim)} className="mt-3 grid gap-2 border-t border-white/[0.07] pt-3">
          <label className="grid gap-1 text-xs text-[#9ba3b0]">Replacement statement<textarea required rows={3} value={correctionText} onChange={event=>setCorrectionText(event.target.value)} className="w-full rounded-lg border border-white/[0.12] bg-black/20 p-3 text-sm text-[#f5f5f3]"/></label>
          <div className="flex gap-2"><button className="min-h-8 rounded-lg bg-[#d4ff3a] px-3 text-[11px] font-semibold text-[#10120b]">Save correction</button><button type="button" onClick={()=>setCorrectionFor(null)} className="min-h-8 rounded-lg border border-white/[0.12] px-3 text-[11px] text-[#9ba3b0]">Cancel</button></div>
        </form>}
      </article>)}
    </section>
  </div>;
}
