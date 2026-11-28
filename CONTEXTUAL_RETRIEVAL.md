# Contextual Retrieval

## Purpose
Contextual retrieval creates a temporary working set around a selected Goal, Project or Problem. It does not create a second memory store or modify the knowledge archive.

## Current ranking (v1)
- Direct graph relationships rank highest.
- Two-edge paths are included with a decay factor.
- Explicit, established academic and co-discussed relationships carry more weight than user-suggested, inferred or structural links.
- Unconfirmed inferred edges are down-weighted and surfaced with a warning; rejected hypotheses are excluded.
- Shared domains are a low-priority fallback when no graph path exists.
- Sensitive nodes and paths are excluded when the existing hide-sensitive setting is enabled.
- Evidence grades are displayed as provenance context and are not used as relevance scores.

## Limitations
This is deterministic graph retrieval, not semantic embedding search or an AI-generated answer. It only surfaces information already represented in the graph. A disconnected but genuinely relevant node will not rank highly unless it shares a domain, and missing relationships reduce retrieval quality.

## Next iteration
- Add user feedback ("relevant" / "not relevant") to tune ranking without silently rewriting graph edges.
- Support a goal-specific active context from the main InPursuit planner.
- Add semantic similarity only with transparent source excerpts and reviewable provenance.
