# ENG-017 — Pre-DEV H1 readiness gate

**Date:** 2026-07-30 · No capacity call and no clean-DEV run were started. Holdout untouched.

## DEV subdivision

| split | n | status |
|---|---|---|
| **DEV_PILOT** | **10** | already spent. `T014 T018 T022 T025 T031 T033 T039 T040 T047 T049` |
| **DEV_CLEAN** | **20** | never used in an H1 comparison |
| **HOLDOUT** | **20** | untouched |

Membership follows only from what was already exposed. No task id was exchanged and no "better"
task substituted — a test asserts `dev_pilot` equals the recorded pilot subset exactly, and that the
three splits are disjoint and together account for every task.

DEV_PILOT remains usable for harness debugging, provider calibration, noise measurement and capacity
calibration. It may not enter the clean DEV H1 result: roughly a quarter of its human packets were
reviewed with the arm visible during ENG-015, and later blinding cannot undo that.

**Of the 20 DEV_CLEAN tasks, 18 are H1-eligible.** T017 and T027 are two of the three language-gap
diagnostics — German compounds absent from a ~91% English corpus — so arms B–E would be
byte-identical to A for them. They stay in the set, labelled, and are excluded from the comparison.

That makes the planned run **18 × 5 × 3 = 270 calls**, not 300.

## Primary metric — unchanged

**Independent Task Success**, exactly as frozen before the pilot. No check loosened, no pass rule
altered, no threshold moved.

## Secondary metric — newly defined and frozen

**Task-Normalized Independent Criterion Compliance.** Per task: `passed / RESOLVED` independent
criteria. Unresolved and uncertain leave **both** numerator and denominator, per the
missing-measurement rule already frozen. Repetitions are collapsed into one row per task **before**
the task-level mean, then tasks are averaged with equal weight.

Two pooling errors are specifically prevented, each pinned by a test:

- pooling every criterion would let a 14-criterion task outweigh a 4-criterion one by more than
  three to one, so the metric would partly measure how verbosely a task was specified
- averaging repetitions afterwards would let a task with more repetitions gain weight — the same
  error one level down

A task that resolves nothing is reported separately and never enters the mean as a zero.

Reporting order is itself frozen in code: primary, then secondary, then diagnostics
(deterministic compliance, human compliance, proxy compliance, input/output tokens, output length,
latency). A test fails if a diagnostic is promoted to primary.

## Human deduplication

A judgement is reused only across units identical in **all five** of `task_id`, `output_hash`,
`criterion_id`, `criterion_version`, `rubric_version`. Tested that a difference in *any one* of them
blocks reuse — two outputs differing by a line can differ by exactly the line a criterion is about.
Judgements expand back onto every identical unit, so the reduction is in reviewer effort only and
changes no result.

## Intra-rater protocol

~10% of the sample is duplicated covertly: same output, same criteria, a different packet id, and a
position set by the shuffle rather than adjacent to its twin. The reviewer is not told which. Tested
that no packet advertises its status and that the duplicate's content matches its twin exactly.

Results are reported as **intra-rater consistency** — one reviewer against themselves. Raw agreement
always; **Cohen's kappa is withheld** when fewer than 10 paired propositions exist or when every
judgement fell in one class, because a kappa from a degenerate table is a number without a meaning.
Both withholding paths are tested. **Inter-rater reliability is not claimed and cannot be, with one
reviewer.**

`UNCERTAIN` is now withheld in code (`withheldUncertain`) rather than by discipline, so it cannot be
coerced into pass or fail at the last step, where it would be least visible.

## Capacity reference model: **NO**

**No meaningfully stronger model is available locally, and none may be obtained without approval.**

| candidate | why it is not a capacity reference |
|---|---|
| `qwen2.5-coder:7b-16k` | the incumbent — and the only **code-specialised** model present |
| `gemma2:9b`, `qwen3:8b`, `llama3.1:8b`, `deepseek-r1:8b`, `mistral:7b` | general-purpose at 7–9B. A general 8B model is not reliably stronger at code generation than a 7B code specialist, so a null result would be uninterpretable |
| `gemma4:e4b` (9.6 GB) | 8.0B parameters — a larger footprint, not a capability tier. Spills to CPU on the 8 GB card |
| a hosted API | monetary cost. Excluded by the brief |

The honest option is `qwen2.5-coder:14b` or `:32b`, which would be a real tier jump in the same
family. That is a **~9–20 GB download** onto the operator's machine and would run partly on CPU at
8 GB VRAM. **Not pulled** — it is an unrequested resource commitment, and the brief says to report
rather than improvise.

**This is the decision needed from you.** Options, in the order I would rank them:

1. **Approve pulling `qwen2.5-coder:14b`** (~9 GB). Same family, one clear tier up, so a difference
   is attributable to capability rather than to model family. Slow on 8 GB but the capacity check is
   10 calls, arm A only.
2. **Run the gate with `qwen3:8b`** as a *different-family* reference. Cheap and immediate, but it
   tests generality, not headroom — a null result would not distinguish (A) from (B), which is the
   entire point of the gate.
3. **Skip the capacity gate** and start clean-DEV H1 accepting the floor risk. Cheapest now, but if
   almost everything fails the run answers nothing and the 270 calls plus ~350 human propositions
   are spent for nothing.

I recommend (1).

## Capacity gate rule — fixed before any capacity call

DEV_PILOT only, **arm A only**, not an H1 arm, never mixed into the model comparison. Judged on the
**secondary** metric, because the primary is the one suspected of flooring:

| reference vs 7B | verdict |
|---|---|
| **+0.20 or more** | **PASS** — measurable headroom; clean-DEV H1 may proceed with the 7B model |
| +0.10 to +0.20 | **INCONCLUSIVE** — report and decide explicitly; not a pass |
| **under +0.10**, or Independent Task Success still ≤ 1/10 | **FAIL** — do not start clean-DEV H1; investigate task difficulty, output contract, output budget and evaluation design |

The capacity result may **not** be used to relax a check because the strong model missed it. The only
admissible reason to change a check remains the one used for the four ENG-015 fixes: the check and
its criterion objectively contradict each other.

## Freeze

`benchmarks/tasks/v1/freeze-manifest.json`

**`manifestHash = 82329c78ec33260847c5bb56ae9a50f048476612eb6aa2b1d664a916d4332917`**

Now additionally seals: DEV_PILOT ids, DEV_CLEAN ids, holdout ids and policy, the secondary metric
definition and version, the deduplication rule and version, the intra-rater protocol and duplicate
share, the capacity gate rule, and the model reference policy.

Versions: checks 1.0.0 · evaluator 2.0.0 · eligibility 1.0.0 · reviewProtocol **2.0.0** ·
fieldSplit 1.0.0 · matching 1.1.0 · ranking 1.0.0 · formulation 1.1.0 · **metrics 1.0.0** ·
**dedup 1.0.0** · **intraRaterProtocol 1.0.0**

Verified against the repository, and tamper-tested three ways:

- a changed ground-truth file → *"benchmarks/tasks/v1/evaluation.json: changed since the freeze"*
- a bumped metric version → *"metrics version changed since the freeze: 1.0.0 → 1.1.0"*
- a hand-edited manifest field → *"manifest hash does not match its own contents"*

212 tests pass.

## READY FOR CAPACITY CHECK: **NO**

**Blocker:** no capacity reference model is available. Everything else is done — the subdivision is
frozen, the secondary metric is defined and tested, deduplication and the intra-rater protocol are
implemented and tested, the gate rule is fixed in advance, and the manifest is sealed and verified.

The gate cannot run without a model that is *actually stronger*. Running it against a same-tier
general model would produce a number that cannot distinguish "the 7B model is too weak" from "the
tasks are unpassable", which is the only question the gate exists to answer.

Stopping here for that decision. No capacity call and no clean-DEV H1 run were started.
