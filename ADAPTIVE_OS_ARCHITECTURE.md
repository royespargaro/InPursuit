# InPursuit Adaptive Operating System

## Product thesis

InPursuit connects a person's direction, knowledge, capabilities, plans, behavior and feedback into one explainable system. It should help the user make better decisions and execute them; it must not silently choose the user's life goals.

## Core loop

Understand → Decide → Plan → Execute → Observe → Learn → Adapt.

## Engine boundaries

1. **Direction** — user-authored values, principles, life areas, goals, constraints and success criteria.
2. **Mind Architecture** — knowledge, experiences, beliefs, hypotheses, skills, sources and typed relationships.
3. **Capability** — required capabilities, demonstrated evidence, proficiency uncertainty and gaps between current and target capability.
4. **Planning** — projects, milestones, dependencies and tasks.
5. **Behavior** — habits, triggers, schedules, minimum viable behaviors and completion logs.
6. **Learning** — daily/weekly reviews, outcome measures, blockers and recommendations.

These are logical responsibilities, not a requirement to create six separate databases.

## Authority and autonomy

- User-authored principles, goals and constraints are authoritative.
- Deterministic calculations may update derived statistics automatically.
- AI may interpret context and propose changes, but must expose evidence and uncertainty.
- Creating or materially changing a goal, project, task or habit requires user approval by default.
- Rejected hypotheses must not be reused as facts.
- Inferred relationships remain distinct from explicit relationships and user-confirmed relationships.

## Shared relationship vocabulary

| Relationship | From → To | Meaning |
|---|---|---|
| supports | Habit → Goal | Habit is intended to support the goal |
| requires_capability | Goal → Skill | Capability is required for the goal |
| develops_capability | Habit/Project → Skill | Practice is intended to develop a capability |
| advances | Task → Project | Task advances a project |
| delivers | Project → Goal | Project contributes to a goal |
| informs | Knowledge → Goal | Knowledge is relevant to a goal |
| evidences | Experience/HabitLog → Skill | Evidence informs capability assessment |
| challenges | Experience → Belief | Experience challenges a belief |
| blocks | Problem → Goal/Project | Problem is a recorded blocker |

Every relationship should retain provenance: explicit, user-suggested, inferred, or confirmed. Confidence and evidence quality remain separate from relevance.

## Automation tiers

### Deterministic
- Recalculate task, project and habit statistics.
- Detect overdue work and missing goal-to-project/habit links.
- Prepare daily and weekly review summaries.
- Generate recurring habit occurrences from existing schedules.
- Preserve event history and idempotency.

### Intelligence-assisted
- Decompose approved goals into proposed milestones.
- Identify capability requirements from user-approved mappings and evidence.
- Retrieve relevant knowledge for a goal/project/task.
- Detect repeated blockers, stagnation and competing priorities.
- Recommend habits only when a capability or behavioral gap is supported by evidence.

### External integrations
Calendar, email, documents, health/activity and financial sources are optional, permissioned integrations. Do not make them prerequisites for the core product.

## Event model (planned)

Use append-only, user-scoped events such as GoalCreated, GoalUpdated, ProjectCreated, TaskCompleted, HabitCompleted, ReviewSubmitted, KnowledgeCaptured, RelationshipConfirmed, RecommendationAccepted, and RecommendationRejected.

Events should include an ID, user scope, timestamp, source, entity reference and schema version. Consumers must be idempotent. Derived state can be rebuilt from canonical records and events.

## Current implementation tranche

- Connect Mind Architecture Overview to the live InPursuit execution workspace.
- Show active goals, projects, open/overdue tasks and habit alignment.
- Recognize only explicit/user-suggested or user-confirmed Goal ↔ Skill relationships.
- Surface explainable structural recommendations without creating or mutating user data.
- Keep the existing constellation, dark theme and lime accent.

## Next implementation stages

1. Shared typed relationship editor and stable entity IDs across the execution and knowledge graph.
2. Persisted capability assessments with evidence, target level, current estimate and confidence.
3. Event log and deterministic automation scheduler.
4. Daily Intelligence Briefing and weekly adaptive review.
5. AI-assisted planning and natural-language capture with approval queue.
6. Optional external integrations and user-controlled data permissions.

## Non-goals and safety

- Do not infer mental-health conditions, emotional states or personality diagnoses.
- Do not treat reading a concept as proof of skill.
- Do not treat habit completion as proof of goal progress.
- Do not treat task completion ratios as outcome achievement.
- Do not silently reprioritize goals or rewrite plans.
- Do not duplicate the existing goals/projects/tasks/habits stores inside Mind Architecture.
