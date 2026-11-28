# Mind Architecture v2

## Purpose

Mind Architecture maintains an evolving, evidence-linked model of a person. It is not a personality verdict, a static profile, or a graph of AI-generated guesses.

The legacy `KnowledgeDataset` remains a navigable intellectual archive. `MindModel` is the canonical user-owned record of personal claims and the evidence behind them. They are deliberately separate: archive material must not silently become personal truth.

## Data flow

```text
Source → Observation → Claim ← Evidence link
                         ↕
                   Relationship
                         ↕
                  Review events
                         ↓
               Derived views / graph
```

### 1. Sources

A source records where material came from: conversation, document, assessment, behavior log, reflection, external reference, or direct user entry. It records author, locator, capture time, original availability, and sensitivity.

Source records are append-only. A corrected document or new conversation is a new source, not an overwrite.

### 2. Observations

An observation is a specific piece of information extracted from a source. Its method is explicit:

- Directly observed behavior
- User report
- Documented record
- Assessment
- Third-party report
- Model inference

The source reference and capture time are required. An observation without a valid source is rejected by the domain service.

### 3. Claims

A claim is a statement that may be true about the person. Claim kinds include facts, beliefs, values, preferences, goals, skills, experiences, behavior patterns, identity models, interpretations, and memories.

Every claim has:
- A statement, domain, kind, and sensitivity
- An epistemic basis (observed, documented, self-reported, third-party, inferred, or externally sourced)
- Optional context and temporal validity
- Evidence links with support / refute / qualify polarity
- A nullable confidence estimate. Null means not assessed; the system must not invent a score.
- A lifecycle status

New claims begin as `candidate`. A user can confirm the claim as a current self-model, challenge it, reject it, or replace it with a superseding claim. Confirmation means the user accepts the claim as their current understanding; it is not scientific proof.

### 4. Evidence links

Evidence links connect a claim to an observation and state whether the observation supports, refutes, or qualifies the claim. The same observation may support one claim and contradict another.

A direct self-report is evidence that the user expressed a statement. It is not independent evidence that the statement is objectively true.

### 5. Relationships

Relationships connect two claims with a named predicate (for example, `contributes_to`, `conflicts_with`, `depends_on`, `changed_after`). They are either explicit or inferred. New relationships are always proposed; acceptance or rejection is recorded as a review event.

### 6. Review events

Review events are append-only. They preserve the prior and next status, action, actor, timestamp, and optional note. The current reviewed status is derived from the latest valid review event, not trusted from an arbitrary imported status field.

Corrections create a new claim linked through `supersedesClaimId`; the old claim and its evidence remain available for audit.

## Invariants

1. No observation without a registered source.
2. No evidence link without an existing observation.
3. No relationship without two existing claims.
4. No new claim starts as active.
5. No claim is considered reviewed without a corresponding review event.
6. No inferred relationship is silently treated as explicit.
7. No source, observation, evidence, or review history is silently overwritten.
8. Missing confidence remains unassessed.
9. Sensitive claims are hidden when the user's sensitivity filter is active.
10. Sample archive content is never automatically promoted into the personal model.

## Evidence interpretation

Evidence strength is not a single universal score. The system should show the actual evidence types and context rather than collapse them into a misleading percentage. Repeated self-report, a dated document, a measured assessment, and observed behavior answer different questions.

The confidence field is therefore optional in meaning (represented by `null` when unassessed). A future calibration layer may calculate confidence only when it can explain the method, sample size, time window, and uncertainty.

## Planned ingestion adapters

The domain model is ready to receive evidence from:
- Conversation exports, preserving conversation/message locators and verbatim excerpts
- User-provided files and documents
- InPursuit execution records, habit logs, and outcomes
- Structured assessments, including instrument/version/date and raw result provenance
- Guided reflections and direct user corrections

Extraction produces candidate observations and claims. It does not automatically confirm them.

## Current implementation boundary

v2 establishes the persisted domain model, validation/sanitization, local and Firestore persistence, a self-report capture workflow, claim review/correction, and a first claims ledger. The existing knowledge graph and archive views remain in place while future work incrementally connects their nodes and edges to this canonical claim layer.
