# Benchmark Plan

**Status:** Phase 0 Discovery — plan only. **No benchmark has been run. No results exist.**
**Date:** 2026-07-30

This document exists because every value claim in this project is currently unproven. Per master
prompt §42: no subjective assertion that "the skill router is better" — measure it.

**Explicit statement to prevent later confusion:** this file contains *no results*. Any number that
appears in a future results file must be traceable to a recorded run with the reproducibility
metadata in §8. Fabricated or illustrative numbers are forbidden (§ NICHT ERLAUBT).

---

## 1. What is being tested

Two hypotheses from `architecture/target-state.md` §1:

- **H1 — Retrieval helps.** Injecting a well-matched library prompt produces better output than the
  raw user request alone.
- **H2 — Scaffolding substitutes for capability.** Small local model + full engine approaches a
  strong model on the same tasks.

Plus one prerequisite that is cheaper and independent:

- **H0 — Ranking helps.** Scored hybrid retrieval finds the right prompt more often than the current
  substring match. Testable **without any model at all**, purely as an information-retrieval
  measurement.

H0 is measured in M2. H1/H2 in M3.

---

## 2. Two distinct benchmarks

These are frequently conflated and must not be:

| | **Retrieval benchmark (H0)** | **End-to-end benchmark (H1/H2)** |
|---|---|---|
| Measures | Did we find the right prompt? | Did the output get better? |
| Needs a model? | No | Yes |
| Cost | Near zero | Real (time, VRAM, tokens) |
| Milestone | M2 | M3 |
| Ground truth | Human-labelled query→prompt relevance | Deterministic validators + blind comparison |

Running only the second is a common mistake: if end-to-end results are poor, it is impossible to
tell whether retrieval picked the wrong prompt or the model failed to use a good one. The retrieval
benchmark isolates that.

---

## 3. Retrieval benchmark (H0) — M2

### Labelled query set

- 100–150 realistic queries, written **before** looking at ranking output (to avoid fitting the
  metric to the implementation).
- Mixed German and English, since the dataset is ~91% en / ~9% de (measured) and the operator writes
  both. Language mismatch between query and record is a real, testable failure mode.
- Mixed specificity: exact ("React pricing table"), vague ("something for a shop"), constrained
  ("accessible dashboard, no Tailwind"), and out-of-domain ("write me a poem") — the last to test
  that low-confidence returns *nothing* rather than a bad match (§29).
- For each query, a human marks which prompt IDs are relevant. Multiple relevant IDs allowed.
- Committed and versioned as a dataset in its own right.

**Honest limitation to record with the results:** a single labeller's relevance judgements are
subjective and will contain inconsistency. Where feasible, label a subset twice (separated in time)
and report self-agreement, so the metric's own noise floor is known. A precision improvement smaller
than the labelling noise is not a real improvement.

### Metrics

| Metric | Why |
|---|---|
| precision@1, @3, @5, @10 | Does the top of the list contain the right thing? |
| recall@10 | Are relevant items reachable at all? |
| MRR | Rank of the first relevant hit |
| nDCG@10 | Rank-weighted quality with graded relevance |
| Zero-result rate | How often nothing is returned |
| **False-confidence rate** | Returns a high-scoring result when nothing is relevant — the failure that actively harms H1 |
| Result-set diversity | Effect of MMR; near-duplicate density in top-10 |
| Query latency (p50/p95) | Must not regress (finding D1) |

### Arms (ablation, §47)

| Arm | Configuration |
|---|---|
| R0 | Current: facet filter + substring `includes()` — **the baseline** |
| R1 | + BM25 over title/prompt/summary |
| R2 | R1 + tag/keyword overlap |
| R3 | R2 + capability match |
| R4 | R3 + tech-stack + facet scoring |
| R5 | R4 + quality prior (low weight) |
| R6 | R5 + MMR diversity |
| R7 | R6 + embeddings (**only if** R1–R6 leave measurable headroom) |

Each arm is a real configuration of one codebase, toggled by config — not a separate
implementation. Any signal that does not improve the metric gets **weight 0 and its code removed**
(§47: remove non-functioning complexity). The ablation table must be published including the
negative results.

---

## 4. End-to-end benchmark (H1/H2) — M3

### Arms (master prompt §BENCHMARK BASELINES)

| Arm | Configuration |
|---|---|
| **A** | user request → model (no library at all) — **the baseline that matters** |
| **B** | user request + single best-matching prompt (raw) → model |
| **C** | user request + top-N raw prompts concatenated → model |
| **D** | user request + engine (retrieve → rank → compile) → model |
| **E** | D + validation + targeted repair → model |

H1 is supported only if **D > B and D > A** by a margin exceeding measurement noise.
Arm C is important: it tests whether the *compiler* adds anything over naive concatenation, which is
the compiler's entire justification.

### Model tiers (§43)

| Tier | Purpose |
|---|---|
| Small local (ollama, 8 GB-class) | The target of H2 |
| Strong model | Upper reference |

Cross-product of interest:

```
small alone | small + engine | strong alone | strong + engine
```

H2 is supported if `small + engine` approaches `strong alone`. If `small + engine` stays far below
`strong alone` while `strong + engine` improves over `strong alone`, the honest conclusion is that
the engine helps but does **not** substitute for capability — H1 true, H2 false. That is a useful
and publishable result, and the plan must be able to reach it.

**Confound to control:** if `small + engine` fails, distinguish "scaffolding does not help" from
"this model cannot follow the scaffolding". Running the strong model on the identical compiled
prompt separates these.

### Task set (§44)

- Target 100 tasks if cost and time permit; **50 is acceptable for a first run** and honest if
  reported as such. Under-powered results reported as under-powered are fine; under-powered results
  reported as conclusive are not.
- Drawn from the dataset's own domains: landing pages, UI components, dashboards, e-commerce,
  portfolio, AI tools, education, mobile, games, data-viz — plus auth, forms, payments, file upload,
  accessibility, testing, deployment.
- Tasks are written as *user requests*, not as prompts, and must not be copied from the dataset
  (that would test memorization, not generalization).
- Versioned dataset (§44). Task set version recorded with every result.

### Metrics (§45, §46)

**Outcome**
- task success rate (deterministic validators pass)
- acceptance-criteria pass rate
- first-pass success / final success
- repair rate, average repairs
- validation failure counts by type (§28 taxonomy)

**Cost**
- input / output / total tokens
- latency
- cost (0 for local; recorded anyway for comparability)
- context size, compiled context size, **token reduction vs. arm C**

**Efficiency (§46)**
- success per 1k tokens
- success per dollar
- success per second
- router overhead, compiler savings

### Scoring — deterministic first

Primary signal is deterministic and cheap (see `architecture/skill-engine.md` §9): parses,
typechecks, imports resolve, required exports present, forbidden packages absent,
acceptance-criteria keywords present.

Secondary, only where deterministic checks cannot decide: human blind comparison on a subsample.
Arms anonymized and shuffled.

**On LLM judges:** an LLM judge is permitted only as a last resort, and only after its agreement
with human judgement is measured on a labelled subsample and reported alongside every result it
produces. An unvalidated judge yields confident noise, which is worse than reporting "unknown".

---

## 5. Failure analysis

Every failed run is classified by the taxonomy (§28): `retrieval_failure`, `wrong_skill`,
`missing_skill`, `prompt_conflict`, `context_overflow`, `model_failure`, `implementation_error`,
`validation_error`, `tool_failure`, `dependency_failure`, `security_failure`, `license_failure`.

This is the most actionable output of the whole benchmark: it says *where* the pipeline breaks,
which is often not where one expects. Skill gaps feed the demand-driven authoring loop (§29).

---

## 6. Anti-patterns this plan forbids

- Reporting a lucky single run as evidence (§48).
- Comparing against a strawman baseline. Arm A must be a *fair* attempt: the user's request as they
  would actually write it, to a capable model, with no deliberate handicap.
- Tuning weights on the same set used to report results. Hold out a test split, or report
  train/test separately.
- Changing the task set between arms.
- Reporting token savings without the matching quality measurement (a compiler that saves tokens
  while degrading output is a regression).
- Publishing only the arms that worked.
- Any number not produced by a recorded run.

---

## 7. Statistical hygiene (§48)

- Fixed temperature; seed where the provider supports it.
- Multiple runs per task where variance matters; report mean and spread, not a single sample.
- State explicitly when n is too small to distinguish arms — an honest "inconclusive" is a valid
  result and far more useful than a manufactured one.
- Report the labelling noise floor (§3) alongside retrieval deltas.

---

## 8. Reproducibility metadata

Recorded with every result set, without exception:

```
model, model_version (where available), provider, temperature, seed,
engine_config_hash, ranking_weights, dataset_version, task_set_version,
skill_versions[], timestamp (real, not rounded), hardware, arm
```

Note on hardware: results are machine-dependent (RTX 3070 / 8 GB, one resident model). Latency
numbers do not transfer to other hardware and must be labelled as such.

---

## 9. Deliverables

| Artifact | Milestone |
|---|---|
| `benchmarks/queries/` labelled query set (versioned) | M2 |
| `benchmarks/tasks/` task set (versioned) | M3 |
| Retrieval ablation table R0–R7, incl. negative results | M2 |
| End-to-end results A–E × model tiers | M3 |
| Failure taxonomy breakdown | M3 |
| Efficiency table | M3 |
| Written conclusion on H0/H1/H2, including any falsification | M3 |

---

## 10. Decision rules

Stated in advance, so results cannot be reinterpreted after the fact:

| Outcome | Action |
|---|---|
| H0 false (ranking no better than substring) | Do not ship the ranking. Investigate the query set and the signals before proceeding. |
| H0 true, H1 false | **Stop before M4.** Keep the improved library (a good product). Document the negative result. Do not build the engine. |
| H1 true, H2 false | Engine helps, but does not replace capability. Continue M4 with realistic framing; drop "small model matches strong model" as a goal. |
| H1 true, H2 true | Proceed to M4 with the strongest possible justification. |
| Inconclusive | Report as inconclusive. Increase n or improve validators before deciding — do not proceed on a hunch. |

Committing to these rules before seeing data is the main defence against motivated reasoning, and
it is the reason this document is written now rather than at M16.
