# H1 decision rules — written before the DEV benchmark

Frozen alongside `benchmarks/tasks/v1/freeze-manifest.json`. Recorded here so no threshold can be
invented after seeing a result.

## Hypotheses under test

| | question | comparison |
|---|---|---|
| **H1a** | does a full skill help at all? | B vs A |
| **H1b** | does description help? | C vs A |
| **H1c** | do actionable instructions help? | D vs A, and **D vs B** |
| **H1d** | does simply combining several actionable skills help? | E_concat vs D |

**Not yet under test:** "does an intelligent prompt compiler help?" No compiler exists. It may only
be tested after one is justified by evidence, and it must have its own arm — `F_compiled`, listed
as unimplemented in `ARM_SEMANTICS`.

## Metrics, in this order

1. **Deterministic Compliance** — passed / total over machine-settleable checks. Structure only.
2. **Human Compliance** — passed / total over judged human propositions.
3. **Independent Task Success** — the frozen combination rule in `evaluator.ts`, unchanged since
   before the pilot.
4. Proxy-dependent checks reported separately; `unresolved` and `pending` never folded into either.

Only after all four are reported separately may a combined statement be made.

## Effect thresholds

Set from the measured noise floor (`reports/noise-floor.json`, 2 sessions × 96 calls, 12 cells):
Deterministic Compliance moved **0.000** across every repetition and across sessions, while output
text drifted in ~15% of repetitions.

Because a zero observed spread cannot be taken as a zero true spread from 12 cells, the threshold is
set conservatively rather than at zero:

| difference in Independent Task Success | reading |
|---|---|
| < 0.10 | **not a difference.** Inside what 10 tasks and an unmeasured tail can produce. |
| 0.10 – 0.20 | suggestive; requires the direction to hold per task, not only in the mean |
| > 0.20 | a difference worth acting on |

Per-task results must be shown in every case. A single easy task must not carry a mean.

## Decision tree

| case | condition | action |
|---|---|---|
| **1** | B ≈ A and D ≈ A | **Strong warning against a skill engine.** Do not build one. Analyse why retrieval-injected context adds nothing, or stop. |
| **2** | B < A but D > A | Full injection *harms*, actionable instructions help. **Focus everything on instruction extraction.** |
| **3** | B > A and D ≈ B | Full skill works and extraction adds nothing. **A compiler is probably unnecessary.** |
| **4** | D > B | Extraction is valuable. Prioritise the field split and its quality. |
| **5** | E_concat > D | Multi-skill context has potential. **This is the first thing that would justify a real compiler.** |
| **6** | E_concat ≈ D | **Do not build the composer.** Concatenation adds nothing; a compiler would have to earn its case some other way. |

Four of these six lead to building **less** than planned, and one to stopping. That is intended.

## Standing constraints

- The **holdout (20 tasks) stays untouched** until every architecture and parameter decision is
  frozen. No retrieval measurement, no model call, no human evaluation, no prompt inspection for
  tuning.
- No arm may be redefined, and no check changed, because of a result. A change after the fact must
  be shown to be an instrument defect — a check contradicting its own criterion — and recorded as
  such, as the four ENG-015 fixes were.
- `E_concat` is concatenation. If it wins, that justifies investigating composition; it does not
  validate a compiler that has not been built.

---

# Capacity gate — written before any capacity call (ENG-017 §6)

## What it is for

The pilot produced 1 passing task out of 40 cells. Two very different worlds explain that:

- **(A)** a 7B local model does not clear the bar these tasks set
- **(B)** *nothing* clears it, because the tasks, the output contract, the output budget or the
  evaluation design cap what any model can score

Only (B) is a reason to change the instrument. Telling them apart requires a stronger model, run on
the already-spent `DEV_PILOT` tasks, arm A only. It is **not an H1 arm** and never enters the model
comparison.

## The threshold, fixed in advance

"Significantly better" uses the same effect scale as the decision tree above, on the **secondary**
metric because the primary is the one suspected of flooring:

| reference model vs qwen2.5-coder:7b-16k | reading |
|---|---|
| Task-Normalized Compliance **+0.20 or more** | **PASS.** The instrument has measurable headroom; clean-DEV H1 may proceed with the 7B model. |
| between +0.10 and +0.20 | **INCONCLUSIVE.** Report and decide explicitly; do not treat as a pass. |
| **less than +0.10**, or Independent Task Success still ≤ 1/10 | **FAIL.** Do not start clean-DEV H1. Investigate task difficulty, output contract, output budget and evaluation design first. |

Independent Task Success is reported alongside but does not decide the gate on its own: at 1/10 it
has too little resolution to move meaningfully.

## What the capacity result may NOT be used for

- **Not** to relax a check because the strong model missed it. The only admissible reason to change
  a check remains the one used for the four ENG-015 fixes: the check and its criterion objectively
  contradict each other.
- **Not** as evidence about any H1 hypothesis. Arm A only, on tasks already spent.
- **Not** to reselect tasks.
