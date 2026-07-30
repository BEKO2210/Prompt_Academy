# Target State — Prompt Academy → Skill Engine

**Status:** Phase 0 Discovery — proposed, not approved
**Date:** 2026-07-30

Read `current-state.md` first. This document describes where the project could go and, more
importantly, **which parts should not be built yet and why**.

---

## 1. The core hypothesis — and why it must be tested first

The master prompt's central goal:

> Möglichst viel Intelligenz soll in der Architektur liegen und möglichst wenig vom verwendeten
> LLM abhängen. Ein kleines LLM soll durch Routing, Skills, deterministische Logik, Retrieval,
> Validation und gutes Scaffolding Leistungen erreichen können, für die sonst deutlich stärkere
> Modelle nötig wären.

This is a **falsifiable technical claim**, not a design goal. It decomposes into two independent
sub-claims:

- **H1 — The right *executable* context helps.** Task-specific actionable instructions, extracted and
  compiled from library records, improve validated task success — whereas injecting whole retrieved
  records (mostly descriptive prose) does not. Decomposed into H1a (instruction > description),
  H1b (extraction > bulk injection), H1c (compilation > single-record extraction).
  **See `benchmark-plan.md` §1a for the tested form and the prior evidence bearing on it.**
- **H2 — Scaffolding substitutes for model capability.** A small local model plus the full engine
  approaches a strong model's quality on the same task.

Neither is supported by any evidence in this repository. Both are plausible. Both are also plausibly
false in specific ways worth naming:

- H1 fails if a capable model, given a bare request, already produces output as good as one guided
  by a library record. For well-trodden tasks ("build a pricing page"), this is a real possibility —
  the record may add words without adding information the model lacked.
- H1 also fails if retrieval precision is low: injecting a *mismatched* record is worse than
  injecting nothing, because it actively misdirects.
- H2 fails if the binding constraint on small-model output is capability (reasoning depth, instruction
  adherence, long-range coherence) rather than specification quality. Scaffolding can supply
  specification; it cannot supply reasoning the model cannot perform.

**External evidence exists and is unfavourable to the naive version of H1.** arXiv:2602.11988 found
that repository-level context files do not generally improve task success and cost >20% more, and
specifically that *repository overviews did not help while instructions were well followed*. That
setup differs from this project's in exactly the dimension under test — static repo-wide context vs.
task-specific retrieval, extraction and compilation — so it does not refute H1. It does two useful
things: it lowers the prior on "just inject the retrieved record", and its description/instruction
split suggests where the value would actually be. That is why H1 is tested in the decomposed form
above rather than as a single yes/no. Full treatment in `benchmark-plan.md` §1a.

**Architectural consequence:** the roadmap is ordered to test H1 as early and as cheaply as
possible, before building anything that presupposes it. A benchmark is not milestone 16 of 22 —
it is a precondition for milestones that cost real effort. This inverts the master prompt's
suggested ordering, deliberately, and in the spirit of its own §47 (ablation studies) and §90
(North Star = validated task success relative to cost and complexity).

---

## 2. Design principles (adopted)

Taken from the master prompt's engineering philosophy, which is sound:

| Principle | Applied here |
|---|---|
| Determinism first | Code > heuristic > small model > large model. Facet filtering and scoring are code, not model calls. |
| Measured > assumed | No component ships without a measurement showing it helps. |
| Extension over replacement | The existing site keeps working. New capability arrives behind flags. |
| Simple > clever | No vector DB, no queue, no cluster, no microservices for 10,000 records. |
| Secure by default | External content is untrusted. Current attack surface is near zero; keep it that way as long as possible. |
| Incremental delivery | Vertical slice before breadth. |
| Cheapest capable model | Strong models are an escalation path, not a default. |

And one added principle, from the measured findings:

| Principle | Rationale |
|---|---|
| **Token/byte budget is a first-class constraint** | `index.json` is already 6.9 MB. Every enrichment must justify its bytes. Retrieval metadata that helps ranking must not be shipped to the browser wholesale. |

---

## 3. Target architecture — layered, with honest boundaries

The key structural insight: **the existing product and the proposed engine have different runtime
requirements and should not be forced into one deployment.**

```
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 0 — DATASET (exists, stays source of truth)                │
│   data/*.jsonl  +  schema/  +  scripts/ (validation, dedupe)      │
│   Extended additively: capabilities[], retrieval fields           │
│   Backward compatible. No field removals. No silent rewrites.     │
└──────────────────────────────────────────────────────────────────┘
                              │ build step (exists: build_site_data.mjs)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 1 — STATIC ARTIFACTS (exists, gets a ranked index)          │
│   index.json (slim), category/*.json, stats.json, meta.json       │
│   NEW: search index (inverted/BM25-style, built offline)           │
│   Still 100% static. Still GitHub Pages. No backend needed.        │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 2 — BROWSER APP (exists, gains real ranking)                │
│   Faceted filter (exists) + scored ranking (new) + diversity       │
│   Explainability: why this result ranked here                      │
│   NO model calls. NO execution. Pure retrieval UX.                 │
└──────────────────────────────────────────────────────────────────┘
                     ╌╌╌╌╌╌╌ trust / runtime boundary ╌╌╌╌╌╌╌
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 3 — ENGINE RUNTIME (does not exist; requires a decision)     │
│   normalizer → intent → decompose → resolve capabilities →         │
│   retrieve → rerank → compose → compile → model route →            │
│   execute → validate → repair                                      │
│   Requires: a real runtime + model access. See ADR-0001.           │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 4 — EXTERNAL SKILL SUPPLY CHAIN (does not exist; last)       │
│   importer → quarantine → static analysis → license → risk →       │
│   human approval → registry                                        │
│   Adds the largest attack surface. Deliberately sequenced last.    │
└──────────────────────────────────────────────────────────────────┘
```

Layers 0–2 are **evolution of what exists** and need no new infrastructure. Layers 3–4 are **new
categories of system**. The boundary between 2 and 3 is where the project stops being a static
site, and it should be crossed deliberately and once.

---

## 4. Layer 0 — Schema evolution (additive only)

The existing 21-field schema stays. Additions are optional fields with defaults, so every existing
record remains valid and the site keeps building.

### Addition A1 — `capabilities[]` (the critical one)

A controlled vocabulary. Without this there is no capability-based routing (see current-state D2).

```json
"capabilities": ["auth.email_password", "ui.responsive", "a11y.keyboard_nav"]
```

Design constraints:
- Closed vocabulary, versioned, defined in `schema/capabilities.vocabulary.json`.
- Hierarchical dotted namespaces so a task can match at any depth.
- Derived **deterministically where possible** from existing fields (`subcategory`, `use_case`,
  `tags`, `tech_stack`, acceptance-criteria text) before reaching for a model. Per the determinism
  principle, a mapping table for 200 subcategories is preferable to 10,000 model calls.
- Model-assisted labelling is acceptable for the residual, but must be spot-checked against a
  human-labelled sample and the sample's agreement rate recorded. Unverified labels are worse than
  no labels, because they silently corrupt ranking.

### Addition A2 — retrieval support fields

Computed at build time, not authored: normalized term vectors / document lengths for BM25,
duplicate-cluster ids, near-duplicate neighbours. These live in build artifacts, **not** in
`data/*.jsonl`, to keep the source dataset human-authored and diffable.

### Addition A3 — provenance & license (only when external import becomes real)

`source{}`, `license{}` per master prompt §5/§6. Not needed while the dataset is 100%
self-generated — adding it now would be empty ceremony on 10,000 records. Introduce it in the same
milestone as the importer, so the fields arrive with data to put in them.

### Addition A4 — versioning

Current `version` is a static `"1.0.0"` string with no history. Real versioning (`parent_version`,
`content_hash`, `change_reason`, `status`) matters once records start changing — i.e. when import
or automated improvement exists. Defer to that point; introduce `content_hash` early since it is
cheap and enables idempotency later.

**Not adopted now:** `type` discriminator, `dependencies`, `incompatible_with`,
`required_permissions`, `required_tools`, `required_secrets`, `security{}`. These describe
executable skills with side effects. The current dataset is text prompts with no side effects.
Adding the fields before the concept exists produces schema bloat that every consumer must handle
and no producer populates.

---

## 5. Layers 1–2 — Retrieval that can ship without a backend

This is the highest-value, lowest-risk work, and it is achievable entirely within the existing
static architecture.

### Hybrid retrieval, honestly scoped

Master prompt §14 lists 17 signals. Most are unavailable today (no historical performance, no
model-specific performance, no security status, no license status, no dependencies). The signals
that **actually exist right now**:

| Signal | Source | Available? |
|---|---|---|
| Exact facet match | category, difficulty, framework, language, audience | yes (already used) |
| Subcategory / use_case / industry match | dataset | yes |
| Tag overlap | `tags[]` | yes |
| Keyword match | `website_card.search_keywords[]` | yes |
| Full-text relevance (BM25) | `title`, `prompt`, `summary` | buildable offline |
| Tech-stack match | `tech_stack{}` | yes |
| Quality prior | `quality{}` | yes, but self-reported — weak, low weight (see D6) |
| Capability match | `capabilities[]` | after A1 |
| Semantic similarity | embeddings | possible, but see below |
| Historical success | telemetry | no — requires Layer 3 |

Ranking = weighted combination of available signals, weights in **one central config**
(master prompt §16, §73, §74 — no scattered magic numbers). Every weight must be justifiable by a
measurement, and unjustified weights start at zero.

### On embeddings — deliberately deferred

10,000 records is small. A brute-force cosine scan over 10,000 × 384-dim float32 vectors is
~15 MB and milliseconds of compute — **no vector database is warranted**, exactly as master prompt
§15 states. But:

- Shipping 15 MB of vectors to a browser that already struggles with a 6.9 MB index is a
  regression, not an improvement (finding D1).
- Quantization (int8) and dimensionality reduction change that calculus. `UNMEASURED`.
- BM25 over this corpus may already capture most of the achievable gain, since queries and
  documents share vocabulary (UI/framework terms).

**Sequence:** implement BM25 + facet + tag scoring first, measure it, and only add embeddings if
an ablation shows BM25 leaves real gain on the table. This is master prompt §47 applied honestly:
build the cheap thing, measure, then decide — rather than assuming the sophisticated thing wins.

### Diversity / MMR

Worth doing (§17), cheap, and there is a measured reason: 26 duplicate first-sentences and
near-duplicate clusters exist. MMR-style selection prevents five near-identical results filling
the top of the list. Implement after base ranking, measure the effect on result-set variety.

### The byte-budget problem

Real ranking needs more per-record signal than the current index carries, but the index is already
6.9 MB (D1). Resolution options, all `UNMEASURED`:

1. Split: a slim card index for display + a separate compact scoring index loaded on first search.
2. Shard the index by category and load lazily (the app already lazy-loads per-category full data —
   the pattern exists in `data.ts`).
3. Move the inverted index to a compact binary/typed-array format rather than JSON.

This must be resolved *as part of* the retrieval work, not after, or retrieval will make the
existing performance problem worse. Measuring the current baseline (see current-state §11) comes
first.

---

## 6. Layer 3 — Engine runtime (blocked on a decision)

Everything from normalizer to repair engine needs a runtime that can call a model. The static site
cannot. Options, with honest trade-offs:

| Option | Pros | Cons |
|---|---|---|
| **A. Local-only CLI / Node tool** | No hosting, no cost, no public attack surface. Uses the existing isolated ollama at `~/open-webui`. Matches the operator's clean-system preference. Fastest path to testing H1/H2. | Not a public product feature. Single-user. |
| **B. Self-hosted service on the existing home server** | Real API, reuses known infrastructure. | Ongoing maintenance; exposes a new surface; VRAM contention with ComfyUI on the 8 GB card is a known, already-experienced problem. |
| **C. Managed cloud backend** | Scales; public feature. | Recurring cost; vendor dependency; contradicts local-first preference; largest security surface. |
| **D. Bring-your-own-key in the browser** | No backend at all. | Key handling in a browser is a genuine security problem; no server-side validation or sandboxing possible; cannot run code to validate output. |

**Recommendation: A, first and possibly only.** It tests both hypotheses at near-zero cost and
risk, produces the benchmark data that every later decision depends on, and commits the project to
nothing. If H1 and H2 hold, promoting the same engine core to option B is a deployment change, not
a rewrite — provided the engine is written as a library with a thin entry point rather than as a
web service from the start.

This is ADR-0001 and is the gating decision for the entire upper half of the master prompt.

### Validation before repair

Master prompt §25 is right that validation must be deterministic first. Note what is cheaply
checkable for this domain's outputs: valid TypeScript/JSX parse, imports resolve, `tsc` succeeds,
required elements present, forbidden packages absent, acceptance-criteria keywords present.
An LLM judge is the last resort, not the first (§25), and is itself unvalidated machinery —
if used, its agreement with human judgement must be measured before its verdicts are trusted.

The repair engine (§27) is only meaningful once validation produces reliable signal. Sequence
accordingly; cap attempts (§27) to prevent loops.

---

## 7. Layer 4 — External skill supply chain (last, on purpose)

Master prompt §3, §4, §35 are correct and well-specified: external skills are untrusted, need
quarantine, static analysis, injection detection, license detection, risk scoring, and human
approval before activation.

The reason to sequence this **last** is not that it is unimportant — it is that it is the single
largest increase in attack surface in the entire plan, and the current surface is close to zero
(current-state §8). Building an importer before the engine that consumes skills exists means
carrying that risk with no offsetting benefit.

Additional honest points:

- Prompt-injection detection by pattern matching ("ignore previous instructions") catches naive
  cases and is worth having as defence in depth. It should not be presented as a solved problem —
  it is not, and a determined adversary bypasses keyword lists. The stronger control is the trust
  hierarchy (§4) plus never granting untrusted content the ability to execute.
- Never executing third-party scripts is a far stronger guarantee than sandboxing them.
  Prefer "import instructions, never run scripts" as the default posture; treat script execution
  as a separate, explicitly-approved capability with real isolation (§38) if ever needed.
- License detection is genuinely important and genuinely hard. `license_unknown` must block
  redistribution (§5), and the aggregator repo's licence is not the licence of its contents.
  This has legal consequences and is one of the few places where asking rather than deciding
  autonomously is correct.

---

## 8. What is explicitly out of scope

Not because these are bad ideas, but because building them before the core is proven violates the
master prompt's own constraints (§65, §88, "NICHT ERLAUBT"):

- Marketplace
- Automatic skill evolution / self-improving prompts (§96 — explicitly deferred by the spec itself)
- Multi-agent orchestration (§88 — only with benchmark-proven advantage)
- Kubernetes, Kafka, Pinecone, Qdrant cluster, Elastic cluster, microservices (§15)
- Large analytics platform
- Admin UI (§52 — explicitly "not before core function")
- Model-specific performance learning (§33) — requires telemetry that requires Layer 3

---

## 9. Success criteria for the target state

Aligned to master prompt §90 (North Star = validated task success relative to cost, tokens,
latency, complexity), stated as falsifiable conditions:

| # | Criterion | How it would be proven |
|---|---|---|
| S1 | Retrieval finds the right prompt more often than substring search | Labelled query set; precision@k vs. current baseline |
| S2 | Library page is not slower than today | Measured TTI + parse time, before/after |
| S3 | H1 holds: retrieved context improves output | A/B on a task set, deterministic validators + blind comparison |
| S4 | H2 holds: small model + engine ≈ strong model | Same task set across model tiers |
| S5 | Every shipped component has a measurement justifying it | Ablation table with components that were *removed* for failing to help |
| S6 | Existing site never regressed | Tests + CI gates that do not exist today |

S5 deserves emphasis: the plan is only credible if it can also produce **negative** results and
delete the corresponding complexity (§47: "Nicht funktionierende Komplexität entfernen"). A
roadmap that only ever adds is not being measured honestly.

---

## 10. Summary of the honest position

- The dataset is a real asset and better than most starting points.
- The retrieval improvement (Layers 0–2) is worth doing, is well-scoped, needs no new
  infrastructure, and has a clear measurable baseline. **This is the recommended first real work.**
- The engine (Layer 3) is a genuine and interesting idea whose central premise is **untested**.
  It should be prototyped in the cheapest possible form — a local CLI against the existing ollama —
  specifically to test that premise, before any infrastructure is committed.
- The external supply chain (Layer 4) is correctly specified in the master prompt and should be
  built last, because it is where the risk is.
- The full 22-milestone specification, taken literally and in order, would build substantial
  machinery on top of an unverified assumption. The spec's own principles argue against that.
  This plan therefore reorders rather than reduces ambition: prove the premise, then scale.
