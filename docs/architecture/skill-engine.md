# Skill Engine — Component Design

**Status:** Phase 0 Discovery — design sketch, nothing implemented
**Date:** 2026-07-30

Companion to `target-state.md`. This document specifies the Layer 3 engine components in enough
detail to write tickets against, while marking clearly which are **speculative until H1/H2 are
tested** (see `target-state.md` §1).

Nothing here is built. Layer 3 is gated on ADR-0001 (runtime decision).

---

## 1. Pipeline overview

The master prompt's pipeline (§ Grundpipeline), annotated with honest necessity assessment:

| Stage | Necessity | Notes |
|---|---|---|
| Request Normalizer | **Core** | Cheap, deterministic, always useful. |
| Intent Router | **Core** | Small: classify into a handful of intents. |
| Task Decomposer | **Core for multi-task** | Skip entirely for single-task requests — most requests are single-task. |
| Task Dependency Graph | **Deferred** | Only meaningful for genuinely multi-task builds. Premature for a slice. |
| Capability Resolver | **Core** | Depends on `capabilities[]` vocabulary (schema A1). |
| Skill Registry | **Exists as dataset** | The dataset *is* the registry for internal prompts. No new store needed initially. |
| Hybrid Retrieval | **Core** | Shared with Layers 1–2. Same code path. |
| Reranker | **Core** | Cheap: reorder top-N by weighted signals. |
| Compatibility Check | **Deferred** | No dependency/incompatibility data exists (schema not adopted). No-op today. |
| Skill Composer | **Core for multi-skill** | Only if >1 skill selected. |
| Context Budget Manager | **Core** | Real constraint on 8 GB-class local models. |
| Prompt Compiler | **Core** | The most interesting component; see §6. |
| Model Router | **Thin initially** | With one local provider, this is a config lookup, not a router. Grows later. |
| Execution | **Core** | Provider adapter call. |
| Validation | **Core** | Deterministic first. The main source of trustworthy signal. |
| Repair Loop | **After validation works** | Meaningless without reliable validation signal. |
| Telemetry | **Core** | Without it, nothing can be measured, and measurement is the whole point. |

**Minimum viable pipeline for the vertical slice** (master prompt §66):

```
request → normalize → capabilities → retrieve+rank → compile → local model → validate → result
                                                                                  ↓
                                                                             telemetry
```

Decomposition, composition, reranking, repair, and routing are all **excluded from the first
slice** and added only where measurement shows a gap. This is the single most important scoping
decision in this document.

---

## 2. Request Normalizer

Input: raw user text. Output: structured record. Deterministic; **no model call**.

```
{
  raw: string,                    // preserved verbatim, never mutated
  language: "de" | "en",          // detectable by stopword/character heuristic
  facets: {                       // extracted by pattern match against known vocabularies
    framework?: string,           // 18 known values — exact/alias match
    difficulty?: string,
    audience?: string,
    industry?: string             // 65 known values
  },
  explicit_constraints: string[],  // "no Tailwind", "must be accessible", "ohne ..."
  explicit_prohibitions: string[]
}
```

The dataset supplies closed vocabularies for framework (18), industry (65), subcategory (200),
audience, difficulty, use_case — so facet extraction is a lookup, not inference. Determinism first
(§87).

**Rule:** the raw request is preserved and always wins over inferred structure. Extraction is
additive hinting, never replacement (§20, §9).

---

## 3. Intent Router

Master prompt §10 example implies a rich intent object. Honest scoping: with a UI-prompt dataset,
the realistic intent set is small.

```
find_prompt | build_single_component | build_page | build_multi_feature_app | unclear
```

Implementation order per §10 and §87: deterministic rules → heuristics → small model. Start with
rules over normalized facets and verb patterns; escalate only where rules demonstrably misclassify
on a labelled sample.

`unclear` is a real and important output: it should ask the user rather than guess. Guessing an
intent silently is worse than one clarifying question.

---

## 4. Capability Resolver

Maps a task to required capabilities from the controlled vocabulary (schema A1).

Approach, cheapest first:
1. **Static mapping table**: subcategory (200 values) → capability set. Authored once, reviewed,
   versioned. Covers the large majority deterministically.
2. **Tag/keyword rules** for capabilities not implied by subcategory (a11y, i18n, responsive).
3. **Small model** only for residual free-text requests that match no known subcategory.

The mapping table is the high-leverage artifact here: 200 hand-reviewed rows replace 10,000
inference calls and are auditable and diffable. This is the determinism principle paying off
concretely.

---

## 5. Retrieval & Ranking

**Shared with Layers 1–2 — one implementation, two consumers.** The browser and the engine must
use the same ranking code, or the engine's behaviour will diverge from what users see in the
Library. This is a hard design constraint, and it argues for the ranking core being a small,
dependency-free, isomorphic module.

Score composition, all weights in one config file:

```
score = w_capability  * capability_overlap
      + w_facet       * exact_facet_match
      + w_bm25        * bm25(query, title+prompt+summary)
      + w_tag         * tag_overlap
      + w_keyword     * search_keyword_hit
      + w_stack       * tech_stack_match
      + w_quality     * quality_prior          // low weight: self-reported (finding D6)
      + w_history     * historical_success     // 0 until telemetry exists
```

Rules:
- Every weight defaults to **0** and is raised only with a measurement justifying it (§16, §74).
- `w_history` is structurally present but zero — it cannot be non-zero before telemetry exists.
  Naming it now prevents a later retrofit.
- Thresholds (`MIN_RETRIEVAL_SCORE`, `MAX_SELECTED_SKILLS`, `REDUNDANCY_THRESHOLD`,
  `MAX_REPAIR_ATTEMPTS`) live in the same central config (§73, §74).

### Diversity (MMR)

After scoring, select iteratively penalizing similarity to already-selected items. Justified by
measured near-duplicate clusters. Target: maximum relevant information per token (§17).

### Skill gaps

If the top score is below `MIN_RETRIEVAL_SCORE`, do **not** inject a poor match — a mismatched
prompt actively misdirects the model and is worse than nothing (§29). Emit `skill_gap`, record
`{capability, task_type, frequency, avg_score}`, and fall back to a generic instruction. The gap
statistics then tell us which prompts are actually worth authoring — demand-driven rather than
speculative (§29).

---

## 6. Prompt Compiler

The most interesting component and the one where the "intelligence in the architecture" claim
actually lives or dies.

Input: normalized request, task, selected prompts, constraints, system policy, model capability,
context budget.
Output: one coherent instruction, plus an internal trace of provenance.

Required behaviours (§19):

| Behaviour | Notes |
|---|---|
| Deduplicate overlapping instructions | Library prompts share boilerplate ("no undocumented imports"). Measured in the sibling dataset: trigrams like `react typescript tailwind` recur in hundreds of records. Deduplication is a real, measurable token win. |
| Detect and resolve conflicts | Two prompts may demand different frameworks. Must resolve by precedence, not concatenate. |
| Preserve user constraints | Non-negotiable (§20). |
| Protect system policy | Library content must never override system rules (§4). |
| Drop irrelevant sections | A prompt matched for its auth guidance should not drag in its unrelated animation prose. |
| Preserve acceptance criteria | Never dropped by budget trimming (§21, §26). The dataset has 3–6 per record — this is exactly the validator's input. |
| Integrate negative instructions | All 10,000 records have a non-empty `negative_prompt`. |
| Reduce tokens | Measured against the naive concatenation baseline. |
| Trace provenance | Which instruction came from which record (§86). Internal only. |

### Instruction precedence (§20, §4)

```
System safety
  > Application policy
    > User explicit constraints
      > Task requirements
        > Approved skill instructions
          > Skill defaults
            > Untrusted external content   (never above anything)
```

A library prompt overriding an explicit user constraint is a defect, not a feature.

**Honest note:** the compiler is where token savings and coherence gains are claimed, and it is
also the easiest place to fool oneself. Its output must be evaluated against the naive baseline
(concatenate everything) on both token count *and* output quality — a compiler that saves tokens
while degrading output is a regression that a token-only metric would report as success.

---

## 7. Context Budget Manager

Per-model config (§21):

```
context_window, reserved_output, system_budget, task_budget, skill_budget, history_budget
```

Trim order when over budget: irrelevant skills → redundant sections → skill segment selection →
summarize → reduce history.

**Hard invariant:** acceptance criteria and safety rules are never trimmed (§21). This should be
enforced by construction (separate non-trimmable region) rather than by convention, because a
convention will eventually be violated by a future edit.

Relevance: on an 8 GB card, context windows are the binding constraint. This component is not
theoretical here.

---

## 8. Model Provider Abstraction & Router

```
{ provider, model, context_window, input_cost, output_cost, capabilities[], local: bool }
```

Adapter interface over OpenAI-compatible APIs / ollama / OpenRouter (§22). No vendor lock-in.

**Honest scoping:** with one local provider, the "router" is a config lookup. It should be written
as a seam, not as a system. It becomes a genuine router only when there are multiple tiers with
measured per-model skill performance (§33) — which requires telemetry that requires this to ship
first. Do not build routing sophistication before there is data to route on.

Execution modes (§24): `economy | balanced | quality | local-only`. With only ollama configured,
three of the four collapse to the same behaviour. Model the modes in config, implement the
distinction when a second provider exists.

**Hardware reality:** RTX 3070, 8 GB VRAM. One model resident at a time. Parallel multi-model
execution is not available locally; ComfyUI contention is a known, previously-experienced problem.
Any design assuming concurrent local models is wrong on this machine.

---

## 9. Validation Engine

Deterministic first (§25). For this domain the cheap, high-signal checks are:

| Check | Cost |
|---|---|
| Output non-empty, expected format | trivial |
| Valid JSON where JSON expected | trivial |
| TypeScript/JSX parses | cheap (parser only) |
| `tsc` typechecks | moderate |
| Imports resolve | cheap |
| Forbidden package absent (`negative_prompt` derived) | cheap |
| Required elements/exports present | cheap |
| Acceptance-criteria keyword presence | cheap, weak signal |
| Build succeeds | expensive |
| Tests pass | expensive, needs generated tests |

An LLM judge (§25) is a last resort. If used, its agreement with human judgement must itself be
measured before its verdicts are trusted — an unvalidated judge produces confident noise, which is
worse than an honest "unknown".

Acceptance criteria from the dataset (3–6 per record, always present) are the natural bridge
between retrieval and validation: the same record that guided generation supplies the checks.
This is the strongest structural argument in favour of the whole approach and should be tested
early.

---

## 10. Repair Engine

Only after validation is reliable. Targeted, not regenerate-everything (§27):

```
failure → classify → locate affected output → retrieve repair-relevant context
        → targeted patch prompt → apply → re-validate (targeted, then full)
```

`MAX_REPAIR_ATTEMPTS` capped; infinite loops prevented (§27).

Failure taxonomy (§28) is recorded from day one even before repair exists, because the taxonomy is
what tells us *where* the pipeline actually fails — which may well be somewhere other than where
we expect.

---

## 11. Telemetry

Required for every measurement claim (§32, §39, §89). Per run:

```
request_id, task_id, skill_ids[], skill_versions[], model, mode,
retrieval_time, compile_time, execution_time, validation_time, repair_time, total_time,
input_tokens, output_tokens, cost, context_size, compiled_context_size, token_reduction,
success, first_pass_success, repair_count, failure_type, validator_results[]
```

Privacy (§37, §40): local-first, no secrets logged, prompts not retained beyond need, redaction by
default. On a local CLI this is a local JSONL file — no infrastructure required.

**Without telemetry there is no benchmark, and without a benchmark every claim in this plan is
marketing.** It is therefore part of the first slice, not a later milestone.

---

## 12. Explainability

Debug output (§34) showing the full chain, and per-selection reasoning:

```
Selected: PRM-001234  score 0.87
  + capability match: auth.email_password, ui.responsive
  + framework match: React
  + bm25: 0.41
  − quality prior: 8.2 (self-reported, weight 0.05)
Rejected: PRM-004567  score 0.71
  reason: 0.83 tag overlap with selected (MMR penalty)
```

This is genuinely valuable for debugging retrieval — arguably more valuable than any user-facing
feature during development, because it is how ranking bugs become visible.

---

## 13. What is deliberately NOT in this design

| Omitted | Reason |
|---|---|
| Task dependency DAG | No multi-task slice yet; premature. |
| Skill compatibility check | No dependency data in schema; would be a no-op. |
| Multi-agent orchestration | §88 — requires proven benefit. |
| Generated skills | §30 — after core works. |
| Skill evolution loop | §96 — spec itself defers it. |
| Sandboxing | Needed only if third-party scripts execute. Preferred posture: never execute them. |
| Admin UI | §52 — not before core function. |
| Vector database | §15 — 10k records; brute force suffices if embeddings are used at all. |

Each omission is reversible. Each is omitted because building it now would mean building on an
untested premise.
