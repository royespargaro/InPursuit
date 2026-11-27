# InPursuit Cognitive Architecture

## Product principle
InPursuit models a person's evolving relationship between experience, knowledge, capability, active goals and reflective beliefs. It uses one interconnected graph with multiple cognitive lenses rather than separate, disconnected memory databases.

The neuroscience is an inspiration for software design, not a literal map of brain anatomy. Memory is distributed across interacting systems; a software node is not stored in a single brain region.

## Cognitive lenses
| Lens | Current node types | Product responsibility |
|---|---|---|
| Episodic memory | Experience, Conversation | Preserve events, context, dates and source provenance |
| Semantic knowledge | Concept, Framework, Discipline, Subdiscipline, Tool, Person, Organization | Organize reusable knowledge and conceptual understanding |
| Procedural capability | Skill | Represent abilities that develop through practice and feedback |
| Active context | Goal, Project, Problem | Bring current priorities and unresolved work into focus |
| Reflective models | Belief, Hypothesis | Track interpretations, uncertainty, supporting evidence and revision |
| Emotional significance | Not yet modeled | Future user-authored salience/affect metadata; never infer emotion from tone alone |

These are pragmatic classifications of the existing node taxonomy. They should remain revisable as the schema evolves.

## Shared graph, orthogonal dimensions
Do not create six separate stores. Keep one node/edge graph and represent these concerns independently:
- Node type: what kind of entity this is (existing KnowledgeNode.type).
- Cognitive lens: which functional view helps interpret it (derived by cognitiveModel.ts).
- Evidence/provenance: where the information came from and how well supported it is (existing sources, evidence classes, grades and edge basis).
- Temporal context: when it was observed, practiced, changed or revisited (existing observation and lifecycle fields).
- Salience: optional, explicit user-authored emotional or personal importance metadata in a future schema version.

A classification is not evidence. A Q4 evidence grade does not mean a memory is emotionally strong; repeated mentions do not prove a belief is true; a skill node does not prove current proficiency.

## Cognitive lifecycle
1. Capture an experience, observation, question, decision or source.
2. Encode its type, date, context and provenance.
3. Associate it with relevant existing nodes through typed relationships.
4. Consolidate by proposing reusable knowledge and patterns, with AI suggestions kept reviewable.
5. Retrieve relevant nodes into a temporary active context based on the user's current goal or project.
6. Apply knowledge through decisions, practice and execution.
7. Reflect on outcomes and update the graph with evidence and timestamps.

## Module responsibilities
- Overview: cognitive distribution, active context, graph health, pending synthesis review and next exploration.
- Graph: the shared topology; future cognitive lens filters should change visibility, not duplicate data.
- Atlas: semantic organization and conceptual navigation.
- Evolution: temporal development of experiences, understanding and capabilities.
- Patterns: recurring behavior, practice and relationships across time.
- Evidence: provenance, source quality, uncertainty, conflicts and review decisions.

## Guardrails
- Never claim that the app reproduces the brain or diagnoses cognition.
- Never infer emotional state, trauma, fear or motivation from text as fact.
- Keep inferred edges distinct from explicit/user-authored relationships and require review where appropriate.
- Preserve source provenance and confidence independently of cognitive classification.
- Distinguish knowing a concept from demonstrating a skill or executing a behavior.
- Treat working memory as a temporary, goal-dependent active context, not a permanent memory category.
- Keep the existing dataset schema backward-compatible; introduce persisted fields only through an explicit schema migration.

## Implementation status
The first integration adds a derived cognitive classification utility and an Overview panel. It does not rewrite the underlying archive or alter existing Firestore records. Subsequent work can add user-controlled salience, goal-conditioned retrieval, temporal skill evidence and optional cognitive-lens filters in the graph.
