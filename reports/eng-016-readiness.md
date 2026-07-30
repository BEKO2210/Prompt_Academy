# ENG-016 — Benchmark readiness

**Date:** 2026-07-30 · Holdout untouched. No DEV A–E benchmark was run.

## HUMAN PASS

104 propositions across 40 blinded packets from the pilot run.

| | |
|---|---|
| judged | **104** |
| PASS | 37 |
| FAIL | 61 |
| UNCERTAIN | **6** |

`UNCERTAIN` is withheld, not folded into either bucket. Those six keep their task `pending` rather
than being scored — five are the same criterion ("Secrets are referenced, never written into the
file") on outputs that write no secret and reference none, which cannot be settled from the file;
one is a gallery delegated to a component that was not shown.

**Reviewer provenance**, recorded per §5: single reviewer (`reviewer-01`, the assistant),
rubric `task-set-v1-eval4`, protocol 1.0.0, 2026-07-30, with a short reason on every FAIL and every
UNCERTAIN.

**Two limitations that must travel with these numbers:**

1. **One reviewer. No inter-rater reliability.** None is invented.
2. **Blinding is partial.** While hunting harness bugs in ENG-015 the reviewer had already seen
   T014/A, T018/A, T022/A, T031/A, T040/A and every arm of T033 and T049 — roughly a quarter of the
   packets — with the arm visible at the time. Packets were shuffled and carry no arm, model, record
   or score, but prior exposure cannot be undone by shuffling. Recorded rather than claimed away.

### Independent Task Success — computable for the first time

The combination rule was **not** touched after the pilot. It is the rule frozen before it.

| arm | det pass/total | det rate | human pass/total | human rate | ITS pass/fail/pending/na |
|---|---|---|---|---|---|
| A | 24/31 | 0.774 | 14/25 | 0.560 | 1/8/1/0 |
| B | 20/31 | 0.645 | 7/25 | 0.280 | 0/9/1/0 |
| D | 24/31 | 0.774 | 9/25 | 0.360 | 0/9/1/0 |
| E_concat | 22/31 | 0.710 | 7/23 | 0.304 | 0/9/1/0 |

Per task, because a mean must not hide one:

```
task    A        B        D        E_concat
T014    fail     fail     fail     fail
T018    fail     fail     fail     fail
T022    fail     fail     fail     fail
T025    fail     fail     fail     fail
T031    fail     fail     fail     fail
T033    fail     fail     fail     fail
T039    fail     fail     fail     fail
T040    fail     fail     fail     fail
T047    pass     fail     fail     fail
T049    pending  pending  pending  pending
```

**One task passes, in one arm.** Still descriptive only: 10 tasks, n=1, one partially-blinded
reviewer, arm C not run.

**A finding that is about the mechanism, not the model:** four outputs across B and E_concat were
**refusals** citing the injected context — *"the requested artifact does not match the reference
context"*, *"the reference context specifies a matching pairs quiz, while the request asks for a
memory card game"*. Injected context caused the model to decline the task. That is a real property
of context injection, not a harness bug, and it is the most concrete thing this pass produced.

## NOISE FLOOR

Fixed subset rule, set before running: the first 4 pilot (DEV) tasks by task_id with ≥3
deterministic checks. Arms A, B, D — the extremes of injected context plus the pilot's lowest
scorer, so noise is not measured only where it is smallest.

**2 sessions × 4 tasks × 3 arms × n=8 = 192 calls.** Identical prompt hash, model digest,
temperature, seed, max tokens, provider and evaluator throughout; verified, not assumed — the runner
aborts if a prompt hash varies across repetitions.

| | result |
|---|---|
| Deterministic Compliance range per cell | mean 0.000, **max 0.000** |
| Deterministic Compliance sd per cell | mean 0.000, max 0.000 |
| across-session shift, all 12 cells | **0.000** |
| exact-output match rate | 83% / 85% within session |
| session-2 outputs also seen in session 1 | **96/96** |
| output chars | mean 1441, min 112, max 2349, sd 718 |
| output tokens | mean 399, min 25, max 669, sd 199 |
| latency ms | mean 5334, min 488, max 8889, sd 2584 |

Output text drifts in roughly 15% of repetitions. **In no measurement did that drift move
Deterministic Compliance.** The pilot's larger drift (13/40 outputs between its first two runs) also
left compliance unchanged where it was compared.

Length, token and latency spread are large — but they are spread *across tasks*, not across
repetitions of one prompt. Per-cell they are near zero.

**What this does not establish:** a zero observed spread over 12 cells is not a zero true spread.
Human outcome variance was not measured at all — each output was judged once.

## ARMS

| arm | what it actually is |
|---|---|
| A | user request only, no injected context |
| B | the full injectable record, verbatim |
| **C** | the descriptive portion (prompt prose, style) — **implemented and verified, not yet run** |
| D | the actionable portion (acceptance_criteria, negative_prompt, tech_stack) |
| **E_concat** | multi-skill actionable **concatenation** with duplicate removal. **Not a compiler.** |
| ~~F_compiled~~ | declared `NOT_IMPLEMENTED`. Must earn its existence from evidence. |

`compileActionable()` was renamed `concatenateActionable()`. A test fails if the old name or the
bare `E` label returns.

**B = C ∪ D now verified on the assembled prompts**, not only on the field list: every non-heading
line of C and of D appears in B, and B carries nothing outside the two. Measured context sizes:
A 0 · D 601 · C 869 · E_concat 1365 · B 1440 chars.

## FREEZE

`benchmarks/tasks/v1/freeze-manifest.json`, `manifestHash=bae523778b13…`, verified against the
repository.

18 files hashed (task set, ground truth, splits, pilot subset, check audit, and every module that
decides a verdict — checks, evaluator, eligibility, review protocol, field split, arms, formulation,
retrieval, runner, the ollama adapter, and the three shared site modules).

| | |
|---|---|
| task_set_version | `task-set-v1` |
| ground truth | `task-set-v1-eval4` |
| dataset hash | `7442fd2f93bda28e…` |
| split algorithm | `task-split-v1`, seed 20260730 · 30 DEV / **20 HOLDOUT** |
| model digest | `3ebbcb3fc2d3f311…` |
| checks / evaluator / eligibility / review | 1.0.0 / 2.0.0 / 1.0.0 / 1.0.0 |
| field split / matching / ranking / formulation | 1.0.0 / 1.1.0 / 1.0.0 / 1.1.0 |
| seed policy | seed=7 on every call; determinism measured, not assumed |

The seal was itself caught being wrong: the first version hashed the base and then appended fields,
leaving them uncovered, and `verifyFreeze` reported the file as edited. Tamper-tested afterwards —
a modified evaluator is named correctly.

Decision rules for the DEV benchmark are frozen in `docs/h1-decision-rules.md`, including the six
cases and the effect thresholds, written before any comparison.

## READY FOR DEV H1 BENCHMARK: **YES**

**Recommended repetitions: n = 3.**

**Reasoning, from the measurement and not from a round number.** Deterministic Compliance moved
0.000 across 192 calls spanning 12 cells and two sessions, so repetition buys nothing *for that
metric* — n = 1 would be defensible on the evidence. Three is chosen anyway for two reasons that the
evidence does support:

1. Output text drifts in ~15% of repetitions. Compliance happened not to move, but 12 cells cannot
   rule out a task where it does. n = 3 detects such a cell; n = 1 cannot see it at all.
2. Human judgement variance is **entirely unmeasured** — every output was judged once. Three
   repetitions give three artifacts per cell, which is the cheapest way to notice that a human
   verdict was borderline.

n ≥ 5 is not justified: it would triple the cost of the human pass, which is the binding constraint,
against a measured per-cell spread of zero. If a cell does show movement at n = 3, raise n for that
cell rather than for the whole matrix.

**Scale that implies:** 30 DEV tasks × 5 arms × 3 = 450 calls ≈ 40 minutes of inference, and
roughly 350 human propositions — about three times the pass just completed. **The human pass, not
the inference, is what makes this expensive.**

### Blockers that are not blockers, and one that is

Not blocking, but must travel with every result:

- one reviewer, no inter-rater reliability
- partial blinding on ~25% of the packets already judged
- deterministic checks verify structure, never behaviour
- arm C has never produced an output

**The one real risk:** with 8 of 10 pilot tasks failing in every arm, the DEV benchmark may
distinguish nothing because almost everything fails. If that happens the answer is *not* to loosen
the checks — it is that a 7B local model does not clear this bar, and the honest next step would be
a stronger model as a reference arm, exactly as ENG-008 §Risks anticipated. That decision belongs to
the results, not to this document.

Per §21, stopping here. No DEV A–E benchmark was started.
