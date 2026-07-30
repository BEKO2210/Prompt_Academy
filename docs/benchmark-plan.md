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

- **H1 — The right *executable* context helps.** See §1a for the refined form, which is the version
  actually tested.
- **H2 — Scaffolding substitutes for capability.** Small local model + full engine approaches a
  strong model on the same tasks.

Plus one prerequisite that is cheaper and independent:

- **H0 — Ranking helps.** Scored hybrid retrieval finds the right prompt more often than the current
  substring match. Testable **without any model at all**, purely as an information-retrieval
  measurement.

H0 is measured in M2. H1/H2 in M3.

---

## 1a. H1, refined: description vs. instruction vs. compiled instruction

### Prior evidence, and why it does not settle the question

Published work bears on this. **arXiv:2602.11988** — *"Evaluating AGENTS.md: Are Repository-Level
Context Files Helpful for Coding Agents?"* (Gloaguen, Mündler, Müller, Raychev, Vechev) reports,
verbatim:

> "Surprisingly, we find that providing context files does not generally improve task success rates,
> while increasing inference cost by over 20% on average."

> "repository overviews, although popular and recommended by model providers, are not helpful"
> — while "instructions in the context files are well followed by coding agents."

This is **relevant negative evidence and must shape our expectations and method. It is not a
refutation of H1**, because the experimental setup differs in the specific dimension this project
is about:

| | arXiv:2602.11988 | This project |
|---|---|---|
| Context selection | static, repository-wide | task-specific retrieval |
| Per-task variation | none — same file every task | reranked per task |
| Content treatment | whole file injected | instructions extracted from descriptive prose |
| Assembly | concatenation | compilation with dedup, conflict resolution, precedence |
| Budget | unbounded | explicit context budget |

The paper measures "more context, always the same". This project proposes "less context, selected
and compiled per task". Those are different interventions, and the difference **is** the product
thesis.

Crucially, the paper's own decomposition points toward this project's mechanism rather than away
from it: **descriptions did not help, instructions were followed.** If that split holds here, the
implication is not "retrieval is useless" but "retrieve and extract the instructions, discard the
prose".

### The refined hypothesis

> **H1 (refined):** Task-specific *actionable instructions* extracted and compiled from library
> records improve validated task success, whereas injecting whole retrieved records — which are
> mostly descriptive prose — does not.

This is decomposed into three testable sub-claims:

- **H1a — Instruction beats description.** Arm D (actionable only) > Arm C (descriptive only).
- **H1b — Extraction beats bulk injection.** Arm D > Arm B (whole record).
- **H1c — Compilation beats single-record extraction.** Arm E (compiled from several records) > Arm D.

### Why this is well-suited to *this* dataset

Measured: **all 10,000 records carry 3–6 `acceptance_criteria`, and all 10,000 carry a non-empty
`negative_prompt`.** So every record already contains a clean separation between:

- **descriptive content** — `prompt` prose ("cinematic depth", "biomorphic blobs", style narration)
- **actionable content** — `acceptance_criteria`, `negative_prompt`, explicit `tech_stack`
  constraints

The arms below exploit that separation directly. No new annotation is required to run this
experiment, which is why it is cheap and why it belongs in the first slice rather than later.

### What each outcome would mean architecturally

Stated in advance, because this determines what gets built:

| Outcome | Architectural implication |
|---|---|
| **D and/or E > B** | The product is **not** "load more context" but "extract and compile the right executable context". The Prompt Compiler becomes the core component, and the descriptive prose in 10,000 records is largely dead weight for generation (though still useful for human browsing). This would be a substantial change of emphasis. |
| **B ≈ D ≈ E > A** | Bulk injection is sufficient; the compiler's added complexity is not justified. Simplify: retrieve and inject, drop extraction. |
| **C > D** | Surprising, and would mean style/description carries the value. Re-examine the dataset's value proposition. |
| **A ≈ B ≈ C ≈ D ≈ E** | H1 falsified for this corpus and model. Stop before M4; keep the improved library as a browsing product (roadmap §Decision rules). |
| **E > D > B > A** | Strongest possible result: the full mechanism is justified end to end. |

Note that two of these five outcomes argue for *less* machinery than currently planned. That is the
point of running it first.

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

### 4.0 Evaluation leakage — the constraint that shapes everything else

**The problem.** Arms C/D/E deliberately inject a record's `acceptance_criteria` and
`negative_prompt` as instructions. If those same fields were also the success score, arm D would win
**by construction**: we would be showing the model its own test and then grading it on that test.
The result would be an artifact of the design, not evidence, and it would be invisible in the
headline number.

**The rule.** Every benchmark task carries two strictly separated layers:

| | Layer 1 — Skill-provided instructions | Layer 2 — Independent evaluation |
|---|---|---|
| Source | the retrieved record(s) | authored per task, **independent of any record** |
| Visible to model? | yes, depending on arm | **never** — not in any arm, not in any repair prompt |
| Varies by arm? | yes — that is the experiment | **no** — identical across A–F |
| Frozen? | no (retrieval selects it) | **yes, before the first run** |
| Determines success? | **no** | **yes** |

Layer 2 lives in the task-set files. It is authored while writing the task, from the task's own
requirements, **without looking at which record retrieval will select**. It is committed and hashed
before any arm executes.

**Enforcement, not convention.** The harness must make leakage structurally impossible:

- Layer 2 assertions are stored in a field the prompt-assembly code cannot read. Assembly receives a
  task object that does not contain them.
- A test asserts that no Layer 2 string appears in any assembled prompt for any arm.
- The evaluator receives the model output and Layer 2 only — never the arm identity, never the
  selected record. It cannot be arm-aware even accidentally.
- Repair prompts (arm F) may state *that* a check failed and which output location is implicated,
  but must not quote Layer 2 assertion text.

**What is still measured from Layer 1.** Skill instruction compliance remains interesting — it just
is not task success. It answers "did the model follow what we injected?", which is a different and
useful question, particularly for diagnosing *why* an arm underperformed. Reported separately and
never combined into the headline figure.

### 4.1 Arms

Refined per §1a to isolate **description vs. instruction vs. compiled instruction**. This replaces a
simpler A–E ladder that would have confounded "more context" with "better-selected context" — the
exact confound arXiv:2602.11988 shows matters.

**Same-record isolation (binding for B/C/D):** arms B, C and D must use **the identical retrieved
record** for a given task. Retrieval runs once per task; B/C/D differ only in which parts of that one
record are injected. If retrieval were re-run per arm, a B/D difference could come from a different
record rather than a different context type, and the comparison would be worthless.

| Arm | Configuration | Isolates |
|---|---|---|
| **A** | user request → model | the baseline that matters — no library at all |
| **B** | user request + **the full record**, verbatim | bulk injection — the paper's condition |
| **C** | user request + **descriptive part of the same record** (`prompt` prose, `style`) | does description help? |
| **D** | user request + **actionable part of the same record** (`acceptance_criteria`, `negative_prompt`, `tech_stack` constraints) | does instruction help? |
| **E** | user request + **compiled actionable instructions from several relevant records** (dedup, conflict resolution, precedence, budget) | does multi-record compilation beat single-record extraction? |
| **F** | E + full router/reranker + validation + targeted repair loop | the full mechanism (M4 only) |

Arms **A–E run in M3**. Arm **F is deferred to M4** and exists only if M3 justifies it.

By construction: `B = C ∪ D` over the same record, so B/C/D vary **only the context type** while
holding the retrieved record, the task, and every model parameter constant. E is the first arm
permitted to change *how many* records are involved — a deliberate, separate hypothesis.

Interpretation rules, fixed in advance (all against **independent** task success):

- **H1b** holds iff **D > B** beyond noise. This is the load-bearing comparison: it tests whether
  extraction beats the bulk injection the paper found unhelpful.
- **H1a** holds iff **D > C**. Together with H1b, this replicates or refutes the paper's
  description-vs-instruction split on our corpus.
- **H1c** holds iff **E > D**. This is the compiler's entire justification.
- **B vs. C** is diagnostic: if B ≈ C, the whole record is behaving like its prose, which would mean
  the acceptance criteria are being diluted by surrounding narration — itself an argument for D/E.
- If **A ≈ B** but **D > A**, the honest headline is *"bulk retrieval does not help; instruction
  extraction does"* — consistent with the paper rather than contradicting it, and a stronger
  positioning for the product than a naive "retrieval helps" claim.

Arms C and D must be constructed by a **deterministic, documented field split** — not by a model
deciding what counts as "actionable". Otherwise the split becomes an uncontrolled variable. The exact
field mapping is committed with the harness and frozen before the first run.

Token accounting matters especially here: D should be substantially *cheaper* than B (fewer tokens,
prose discarded). If D matches or beats B at lower cost, that is a compound win and the single most
commercially relevant result the benchmark can produce.

### 4.2 Constants across arms

Anything not listed as the manipulated variable is held **identical** across A–F. The manipulated
variable is the injected context only.

| Held constant | Note |
|---|---|
| Model | same model for all arms in a comparison |
| Model version | recorded; a mid-run version change invalidates the run |
| Temperature | fixed |
| Seed | fixed where the provider supports it |
| System wrapper / system prompt | byte-identical across arms |
| Output budget (max tokens) | identical — otherwise arms differ in room to answer |
| Tool availability | identical (none, in the first slice) |
| Evaluator | identical, arm-blind (§4.0) |
| Task dataset + version | identical |
| Retrieved record (B/C/D) | identical per task (§4.1) |

**Order effects.** Task order is randomized per run, with the shuffle seed recorded. Arm order within
a task is also randomized. This guards against provider-side drift (thermal throttling, cache warmth,
model reload) systematically favouring whichever arm happens to run first.

**Non-determinism.** Local models are not reliably deterministic even at temperature 0. The harness is
therefore designed for **n runs per (task, arm)** from the outset — `n = 1` is permitted for a first
pass but must be reported as `n = 1`, and the schema must not need changing to raise it. Results
report mean and spread; a single run is never presented as an arm's result (§7).

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

**Each task record has two separated layers (§4.0):**

```
{
  "task_id": "",
  "request": "",                  // the user request — goes to the model in every arm
  "domain": "",

  "evaluation": {                 // LAYER 2 — never enters any prompt, frozen before first run
    "assertions": [],             // deterministic, checkable, authored from the task itself
    "forbidden": [],              // packages/patterns that must be absent
    "required_artifacts": [],     // files/exports that must exist
    "notes": ""                   // for the human reviewing evaluator behaviour
  }
}
```

Authoring rules for `evaluation`:

- Written **while writing the task**, from the task's own requirements — **not** by copying a
  record's `acceptance_criteria`, and **without knowing** which record retrieval will select.
- Deterministically checkable wherever possible (§9 validation tiers). An assertion nobody can check
  mechanically is either dropped or explicitly flagged as human-only.
- Frozen and content-hashed before the first arm executes. A change to `evaluation` invalidates all
  prior results for that task and requires a task-set version bump.
- Stored in a field the prompt-assembly path structurally cannot read (§4.0).

**Overlap is expected and acceptable.** A task about a pricing page and a record about pricing pages
will naturally both mention responsive layout. That is convergent authoring, not leakage. Leakage is
the *mechanical reuse of the same text* as both instruction and grader. The rule is about provenance
and code paths, not about avoiding all semantic similarity — which would be impossible.

### Metrics (§45, §46)

Recorded **per arm** (A–F), for every run. Note the two-level split from §4.0 — these are different
questions and are never merged.

**Outcome — independent (Layer 2, the headline)**
- **Independent Task Success** — the primary metric. Frozen per-task assertions, never in context.
- **First-Pass Independent Success** — before any repair
- **Final Independent Success** — after repair (arm F only)
- validation failure counts by type (§28 taxonomy)

**Outcome — skill instruction compliance (Layer 1, diagnostic only)**
- **Skill Instruction Compliance** — did the model follow the injected `acceptance_criteria` /
  `negative_prompt`? Only meaningful for arms B–F, undefined for A.
- reported **separately**; never folded into Independent Task Success

The gap between the two is itself informative: high compliance with low independent success means the
injected instructions were followed but were the *wrong* instructions — a retrieval-quality problem,
not a model problem. Low compliance with high independent success means the model solved the task
while ignoring what we injected, which would argue the injection is not doing the work.

**Repair (arm F)**
- repair rate, average repairs per task

**Cost**
- input tokens
- output tokens
- total tokens
- total cost (0 for local models; recorded anyway for comparability — never reported as
  "infinite success per dollar")
- latency
- context size; compiled context size; **token reduction of D and E vs. B**

**Efficiency (§46)**
- success per 1k tokens
- success per dollar
- success per second
- router overhead, compiler savings

The cross-arm table that answers the central question:

| | A | B | C | D | E |
|---|---|---|---|---|---|
| **Independent Task Success** | | | | | |
| First-Pass Independent Success | | | | | |
| Skill Instruction Compliance | n/a | | | | |
| input tokens | | | | | |
| output tokens | | | | | |
| total cost | | | | | |
| latency | | | | | |
| success per 1k tokens | | | | | |
| n (runs per task) | | | | | |

Empty by design — filled only by a recorded run. **D beating B on Independent Task Success while
using fewer input tokens** is the outcome to watch for: it would mean the product's job is extraction
and compilation, not context loading.

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

- **Grading with what we injected.** Using a record's `acceptance_criteria` / `negative_prompt` as
  both Layer 1 instruction and Layer 2 success score. This is the leakage failure (§4.0) and would
  make arm D win by construction.
- **Authoring Layer 2 after seeing the retrieved record**, or by copying its fields. Same failure,
  arrived at by hand.
- **Letting the evaluator know the arm.** An arm-aware grader can differ across arms for reasons
  unrelated to output quality.
- **Re-running retrieval per arm for B/C/D.** Then a B/D difference may be a different record rather
  than a different context type (§4.1).
- **Varying any constant from §4.2** between arms — output budget and system wrapper are the easiest
  to get wrong and the most damaging.
- Reporting a lucky single run as evidence (§48), or presenting `n = 1` without saying so.
- Comparing against a strawman baseline. Arm A must be a *fair* attempt: the user's request as they
  would actually write it, to a capable model, with no deliberate handicap.
- Tuning weights on the same set used to report results. Hold out a test split, or report
  train/test separately.
- Changing the task set between arms, or editing `evaluation` mid-run without a version bump.
- Reporting token savings without the matching quality measurement (a compiler that saves tokens
  while degrading output is a regression).
- Merging Skill Instruction Compliance into Independent Task Success.
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
arm, task_id, run_index, n_runs
model, model_version (where available), provider
temperature, seed, output_budget, system_wrapper_hash, tools_available
engine_config_hash, ranking_weights, field_split_version
dataset_version, task_set_version, evaluation_hash
retrieved_record_ids[], skill_versions[]
task_order_seed, arm_order_seed
timestamp (real, not rounded), hardware
```

Three of these exist specifically to make the §4.0 and §4.2 guarantees auditable after the fact:

- `evaluation_hash` — proves Layer 2 was frozen and unchanged across the arms being compared.
- `retrieved_record_ids[]` — proves B/C/D used the same record for a given task.
- `system_wrapper_hash` + `output_budget` — proves the two easiest-to-break constants held.

Note on hardware: results are machine-dependent (RTX 3070 / 8 GB, one resident model). Latency
numbers do not transfer to other hardware and must be labelled as such.

---

## 9. Deliverables

| Artifact | Milestone |
|---|---|
| `benchmarks/queries/` labelled query set (versioned) | M2 |
| `benchmarks/tasks/` task set with frozen, hashed `evaluation` layer (versioned) | M3 |
| Retrieval ablation table R0–R7, incl. negative results | M2 |
| Documented, frozen deterministic field split for arms C and D | M3 |
| Leakage test: no Layer 2 string appears in any assembled prompt, any arm | M3 |
| End-to-end results **A–E** × model tiers (the §4 cross-arm table) | M3 |
| Failure taxonomy breakdown | M3 |
| Efficiency table | M3 |
| Written conclusion on H0 / H1a / H1b / H1c / H2, including any falsification | M3 |
| Arm F results (full router/reranker/repair) | M4 |

---

## 10. Decision rules

Stated in advance, so results cannot be reinterpreted after the fact.

**H0 (ranking):**

| Outcome | Action |
|---|---|
| H0 false | Do not ship the ranking. Investigate the query set and the signals first. |

**Hard stop conditions — abort the run, do not interpret results:**

| Condition | Action |
|---|---|
| Any Layer 2 string found in an assembled prompt | **Abort.** Results are invalid. Fix the harness, re-freeze, re-run. |
| B/C/D used different records for the same task | **Abort** that task's comparison. |
| A §4.2 constant differed across arms | **Abort** the affected comparison. |
| `evaluation` edited mid-run without a version bump | **Discard** all results for that task set version. |
| Model version changed mid-run | **Discard** and re-run. |

These are not warnings. A run that violates one of them produces numbers that look valid and are not,
which is worse than no numbers.

**H1 (the refined description/instruction/compilation question — see §1a).**
All comparisons below are on **Independent Task Success** (Layer 2), never on Skill Instruction
Compliance:

| Outcome | Action |
|---|---|
| **D > B** (H1b holds) | Product thesis confirmed as *extraction*, not context loading. The Prompt Compiler becomes the core component; prioritize it in M4. Reconsider how much of the descriptive prose in 10,000 records matters for generation at all. |
| **E > D** (H1c holds) | Multi-record compilation justified. Build the composer. |
| **E ≈ D** | Single-record extraction suffices. **Do not build the composer.** |
| **B ≈ D** | Extraction adds nothing over bulk injection. Drop extraction; simplify to retrieve-and-inject. |
| **C > D** | Description carries the value, contrary to prior evidence. Stop and re-examine the dataset's value proposition before building anything. |
| **A ≈ B ≈ C ≈ D ≈ E** | H1 falsified for this corpus and model. **Stop before M4.** Keep the improved library as a browsing product. Document the negative result. |
| High compliance, low independent success | The injected instructions were followed but were the **wrong** instructions. This is a retrieval-quality problem, not a compiler problem — go back to H0 and the ranking, do not build more pipeline. |
| Low compliance, high independent success | The model solved the task while largely ignoring the injection. The injection is not doing the work; question whether the mechanism is load-bearing at all. |

**H2 (capability substitution):**

| Outcome | Action |
|---|---|
| H1 true, H2 false | Engine helps but does not replace capability. Continue M4 with realistic framing; drop "small model matches strong model" as a project goal. |
| H1 true, H2 true | Proceed to M4 with the strongest possible justification. |

**Always:**

| Outcome | Action |
|---|---|
| Inconclusive | Report as inconclusive. Increase n or improve validators — do not proceed on a hunch. |

Note that four of the seven H1 outcomes above lead to building **less** than currently planned, and
one leads to stopping entirely. Committing to these rules before seeing data is the main defence
against motivated reasoning, and it is the reason this document exists now rather than at M16.
