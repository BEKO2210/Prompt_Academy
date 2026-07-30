# ENG-008 — End-to-end benchmark harness (arms A–E)

**Type:** Measurement / Architecture
**Milestone:** M3
**Status:** BLOCKED — spec approved, implementation gated on M1+M2 completing
**Complexity:** XL

Specification of record for the H1 experiment. Everything here is frozen **before** implementation
begins, because the design decisions are what make the results interpretable. Companion to
`../benchmark-plan.md`, which holds the reasoning; this ticket holds the executable contract.

## Problem

H1 — whether task-specific *executable* context improves output — is the project's central premise
and has no supporting evidence. Two failure modes would make a benchmark worse than none:

1. **Evaluation leakage.** Arms C/D/E inject a record's `acceptance_criteria` and `negative_prompt`.
   If those same fields also score success, arm D wins by construction. The numbers would look valid.
2. **Uncontrolled variables.** If arms differ in the retrieved record, output budget, or system
   wrapper, a measured difference cannot be attributed to context type.

## Goal

A harness that can produce a **falsifiable** answer to H1a/H1b/H1c, and that structurally cannot
produce a leaked or confounded one.

---

## 1. Benchmark dataset (task set)

Location: `benchmarks/tasks/<version>/`. Versioned; version recorded with every result.

- **Size:** target 100 tasks; **50 acceptable for a first pass** and must then be reported as
  under-powered, not as conclusive.
- **Coverage:** the dataset's own domains (landing pages, UI components, dashboards, e-commerce,
  portfolio, AI tools, education, mobile, games, data-viz) plus auth, forms, payments, file upload,
  accessibility, testing, deployment.
- **Form:** each task is a **user request** as a user would actually write it — not a prompt, and
  **not copied from the dataset** (that would test memorization).
- **Language mix:** German and English, matching the operator's real usage.

Task record:

```json
{
  "task_id": "",
  "request": "",                    // goes to the model in EVERY arm
  "domain": "",
  "evaluation": {                   // LAYER 2 — see §2. Never enters a prompt.
    "assertions": [],
    "forbidden": [],
    "required_artifacts": [],
    "notes": ""
  }
}
```

## 2. Hidden evaluation ground truth (Layer 2)

**The load-bearing design decision.**

| | Layer 1 — skill instructions | Layer 2 — independent evaluation |
|---|---|---|
| Source | the retrieved record(s) | authored per task, independent of any record |
| In model context? | yes, per arm | **never**, in any arm, including repair prompts |
| Varies by arm? | yes — the experiment | **no** — identical across A–F |
| Frozen? | no | **yes, hashed before the first run** |
| Determines success? | no | **yes** |

**Authoring rules:**

- Written while writing the task, from the task's own requirements.
- **Without knowing** which record retrieval will select. Not by copying any record's fields.
- Deterministically checkable wherever possible; anything human-only is flagged as such.
- Frozen and content-hashed (`evaluation_hash`) before any arm executes.

**Structural enforcement — not convention:**

- `evaluation` is stored where the prompt-assembly path **cannot read it**. Assembly receives a task
  object without it.
- A test asserts **no Layer 2 string appears in any assembled prompt, for any arm**.
- The evaluator receives model output + Layer 2 **only**. Never the arm identity, never the selected
  record — so it cannot become arm-aware even by accident.
- Repair prompts may state *that* a check failed and where, but must never quote Layer 2 text.

**Expected overlap is fine.** A pricing-page task and a pricing-page record will both mention
responsive layout. That is convergent authoring. Leakage is *mechanical reuse of the same text* as
both instruction and grader — a provenance and code-path property, not a semantic-similarity one.

## 3. Arms

**Same-record isolation (binding):** retrieval runs **once per task**. Arms B, C and D use the
**identical** retrieved record; only the injected portion differs. `B = C ∪ D`.

| Arm | Injected context | Isolates | Milestone |
|---|---|---|---|
| **A** | nothing | fair baseline | M3 |
| **B** | the full record, verbatim | bulk injection | M3 |
| **C** | descriptive part of that record (`prompt` prose, `style`) | does description help? | M3 |
| **D** | actionable part of that record (`acceptance_criteria`, `negative_prompt`, `tech_stack` constraints) | does instruction help? | M3 |
| **E** | compiled actionable instructions from several relevant records (dedup, conflict resolution, precedence, budget) | does multi-record compilation help? | M3 |
| **F** | E + full router/reranker + validation + targeted repair | the full mechanism | **M4** |

The C/D split is a **deterministic, documented field mapping**, versioned as `field_split_version`
and frozen before the run. Never model-decided — it is the independent variable.

## 4. Constants

Held **identical** across arms. The injected context is the only manipulated variable.

| Constant | Failure if violated |
|---|---|
| Model | incomparable arms |
| Model version | mid-run change invalidates the run |
| Temperature | variance differs by arm |
| Seed (where supported) | — |
| System wrapper / system prompt | byte-identical; easiest to break, most damaging |
| Output budget (max tokens) | arms differ in room to answer |
| Tool availability | none in the first slice |
| Evaluator | must be arm-blind |
| Task dataset + version | — |
| Retrieved record (B/C/D) | a B/D difference becomes a different record, not a different context type |

**Order effects:** task order and per-task arm order randomized; both seeds recorded
(`task_order_seed`, `arm_order_seed`). Guards against provider drift (thermal throttling, cache
warmth, model reload) favouring whichever arm runs first.

**Non-determinism:** local models are not reliably deterministic at temperature 0. The harness
supports **n runs per (task, arm)** from the outset. `n = 1` is permitted for a first pass but must
be reported as `n = 1`; raising n must not require a schema change.

## 5. Metrics

Two levels, **never merged**.

**Headline — independent (Layer 2):**
- **Independent Task Success** ← the primary metric
- First-Pass Independent Success (before repair)
- Final Independent Success (after repair; arm F only)
- validation failure counts by taxonomy type

**Diagnostic — Layer 1:**
- **Skill Instruction Compliance** — did the model follow what was injected? Undefined for arm A.

The *gap* between them is the diagnostic payload:

| Pattern | Reading |
|---|---|
| high compliance, low independent success | followed the wrong instructions → **retrieval** problem |
| low compliance, high independent success | solved it while ignoring the injection → mechanism not load-bearing |

**Cost:** input tokens, output tokens, total tokens, cost (0 for local, recorded, never reported as
"infinite success per dollar"), latency, context size, compiled context size, token reduction of
D and E vs. B.

**Efficiency:** success per 1k tokens, success per dollar, success per second.

## 6. Reproducibility

Recorded per run, without exception:

```
arm, task_id, run_index, n_runs
model, model_version, provider
temperature, seed, output_budget, system_wrapper_hash, tools_available
engine_config_hash, ranking_weights, field_split_version
dataset_version, task_set_version, evaluation_hash
retrieved_record_ids[], skill_versions[]
task_order_seed, arm_order_seed
timestamp (real, not rounded), hardware
```

Three fields exist to make the §2/§4 guarantees auditable afterwards:

- `evaluation_hash` — proves Layer 2 was frozen and unchanged across compared arms
- `retrieved_record_ids[]` — proves B/C/D shared one record per task
- `system_wrapper_hash` + `output_budget` — proves the two most fragile constants held

Latency is machine-dependent (RTX 3070 / 8 GB, one resident model) and must be labelled as such.

## 7. Pass / fail / stop rules

**Hard stops — abort, do not interpret:**

| Condition | Action |
|---|---|
| Layer 2 string found in an assembled prompt | **Abort.** Fix harness, re-freeze, re-run. |
| B/C/D used different records for one task | **Abort** that comparison. |
| A §4 constant differed across arms | **Abort** the affected comparison. |
| `evaluation` edited mid-run without version bump | **Discard** that task-set version's results. |
| Model version changed mid-run | **Discard**, re-run. |

Not warnings. A violating run yields numbers that look valid and are not — worse than none.

**Hypothesis outcomes** (all on Independent Task Success):

| Outcome | Action |
|---|---|
| **D > B** (H1b) | Thesis is *extraction*, not context loading. Compiler becomes the core; prioritize it in M4. |
| **E > D** (H1c) | Multi-record compilation justified → build the composer. |
| **E ≈ D** | **Do not build the composer.** |
| **B ≈ D** | Extraction adds nothing → simplify to retrieve-and-inject. |
| **C > D** | Description carries the value. Stop; re-examine the dataset's value proposition. |
| **A ≈ B ≈ C ≈ D ≈ E** | H1 falsified for this corpus/model. **Stop before M4.** Keep the library. |
| Inconclusive | Report as inconclusive. Raise n or improve validators. Do not proceed on a hunch. |

Four of these lead to building **less** than planned; one to stopping. Intended.

## Non-goals

Arm F (M4). Model routing, decomposer, DAG, UI. LLM-judge scoring (deterministic validators only in
the first pass; a judge requires its own measured agreement rate before its verdicts count).

## Dependencies

ENG-006 (ranking module — supplies retrieval), ENG-001 (capabilities), ADR-0001 (accepted).
Core logic lives in the **provider-neutral core library** per ADR-0001 — not in the Ollama adapter
and not in the CLI.

## Acceptance criteria

- [ ] Leakage test passes: no Layer 2 string in any assembled prompt, any arm.
- [ ] Evaluator is provably arm-blind (receives no arm identity or record).
- [ ] B/C/D verifiably share one retrieved record per task (asserted from `retrieved_record_ids[]`).
- [ ] All §4 constants asserted equal across arms by the harness itself, not by discipline.
- [ ] Task set ≥50 tasks with frozen, hashed `evaluation` layer.
- [ ] `field_split_version` frozen and documented before the first run.
- [ ] Harness runs with `n > 1` without schema change.
- [ ] Cross-arm table produced from real runs, with full §6 metadata.
- [ ] Independent Task Success and Skill Instruction Compliance reported separately.
- [ ] Core logic runs against a **stub provider** with no ollama installed (ADR-0001 compliance).

## Tests

- Leakage: fixture task whose Layer 2 contains a unique sentinel string; assert the sentinel appears
  in **no** assembled prompt for any arm.
- Same-record: assert B/C/D record ids are identical per task.
- Constants: assert equality of every §4 constant across a multi-arm run.
- Field split: fixture record → expected C and D content, byte-exact.
- `B = C ∪ D`: assert no content is lost or duplicated by the split.
- Evaluator determinism: same output + same Layer 2 → same verdict.
- Provider neutrality: full harness run against a stub provider.

## Security

Threat T8 (model-output-driven harm): generated code is written only to an explicit output directory
and is **never executed** to validate it. Validation is read-only static analysis. A strong-model
reference arm needs a credential — scope it to the harness, never the engine (threat T5).

## Risks

- Local 8 GB model quality may bound results, confounding H1. Mitigate by running one arm's
  identical compiled prompt through a stronger model to separate "scaffolding ineffective" from
  "this model can't use it".
- Layer 2 authoring is subjective and effortful; it is also the entire validity of the experiment.
  Under-invest here and the whole benchmark is decoration.
- Deterministic assertions verify **structure**, not quality. "Task success" means "passed the
  structural checks" and must be stated that way whenever results are reported.
