# ENG-019 — Clean-DEV benchmark result

**Date:** 2026-07-31 · 18 H1-eligible DEV_CLEAN tasks × 5 arms × n=3 = **270 calls, all successful**.
Model `qwen2.5-coder:7b-16k`, digest `3ebbcb3fc2d3f311…`, temperature 0, seed 7.
Holdout untouched. DEV_PILOT not mixed in.

## Primary metric: still pending

Independent Task Success needs the human rubric pass, and ~300 propositions are unjudged. It is
`pending` for 24–42 tasks per arm, exactly as the frozen rule requires. **It is not reported as a
number here, and pending is not zero.**

What can be reported is the pre-registered secondary metric and the diagnostics.

## Secondary metric — Task-Normalized Independent Criterion Compliance

Definition frozen before this run: per task, `passed / RESOLVED` criteria; unresolved excluded from
both sides; repetitions collapsed per task first; equal weight per task.

| arm | value | Δ vs A | input tokens |
|---|---|---|---|
| **A — no context** | **0.918** | — | 3,525 (1.0×) |
| D — actionable only | 0.754 | −0.163 | 10,839 (3.1×) |
| B — full skill | 0.719 | −0.198 | 18,933 (5.4×) |
| E_concat — multi-skill | 0.649 | −0.268 | 19,287 (5.5×) |
| C — descriptive only | 0.645 | −0.272 | 11,997 (3.4×) |

Against the thresholds fixed in `docs/h1-decision-rules.md` (<0.10 not a difference, >0.20 act on):
**C and E_concat are past the act-on threshold, B is just under it, D is suggestive.**

Deterministic Compliance, the diagnostic, shows the same order: A 0.908 · B 0.774 · D 0.754 ·
C 0.708 · E_concat 0.692.

## Per task — because a mean must not hide one

**On no task did any context arm beat arm A.** On 1 task A was strictly better than every context
arm; on 17 the best context arm merely tied it.

The damage is concentrated, not spread:

| task | A | mean of context arms | retrieval was |
|---|---|---|---|
| T030 image upload with crop | 1.00 | 0.25 | IRRELEVANT |
| T015 responsive sidebar | 1.00 | 0.42 | IRRELEVANT |
| T036 course progress | 1.00 | 0.50 | IRRELEVANT |
| T035 compare prompt results | 1.00 | 0.50 | PARTIAL |
| T032 photographer portfolio | 1.00 | 0.50 | PARTIAL |

**5 of 18 tasks account for most of the gap. 8 show essentially no effect either way.**

## Damage tracks retrieval quality

Cross-referencing ENG-018's independent relevance judgement:

| retrieval verdict | n | mean A | mean context arms | drop |
|---|---|---|---|---|
| RELEVANT | 2 | 1.000 | 0.882 | −0.118 |
| PARTIAL | 7 | 0.883 | 0.647 | −0.237 |
| IRRELEVANT | 9 | 0.926 | 0.685 | −0.241 |

The worse the retrieval, the worse the injection. That is the expected shape if retrieval is the
cause — and retrieval was independently measured as wrong or empty for 55% of these tasks.

**But note the first row.** Even where retrieval was judged relevant, context cost 0.118. That is
two tasks and cannot carry weight, but it is the one result that does *not* fit a
"fix retrieval and injection will help" story, and it is recorded rather than smoothed over.

## Decision-rule verdict

The frozen tree, Case 1: *B ≈ A and D ≈ A → strong warning against a skill engine.*

**Observed is stronger than Case 1: B < A, C < A, D < A, E_concat < A.** Every form of injecting a
retrieved record scored below no injection at all, at 3–5× the input tokens.

Case 6 also applies: **E_concat ≈ D** (0.649 vs 0.754, E is *worse*) → **do not build the composer.**

## What this does and does not establish

**Does:** with this corpus, this retriever and this model, injecting a retrieved skill record makes
output worse, not better, and costs 3–5× the input tokens for the privilege. Consistently, on every
task, with no counterexample.

**Does not:** falsify the underlying idea. The experiment injects *what our retriever selected*, and
that is wrong or absent 55% of the time. It cannot separate "skills do not help" from "our retrieval
is broken", and ENG-018 established independently that retrieval is broken.

**Limits:** primary metric pending; one 7B local model with no stronger reference; 18 tasks at n=3;
deterministic checks verify structure, not behaviour; the relevance judgement behind the third table
is one reviewer's reading.

## Recommendation

1. **Do not build the prompt compiler.** Two independent frozen rules now say so — Case 1 and Case 6.
2. **Fix query formulation.** It is the one component with a measured, large, cheap-to-close gap, and
   ENG-018 showed hand-written queries reach the right record for 7 of 9 failures.
3. **Then re-run this exact benchmark.** Everything is frozen and reproducible; the rerun costs 33
   minutes of GPU. If injection still loses with good retrieval, the idea is genuinely dead — and
   that too would be an answer.
4. The human pass stays worth doing, but the direction it would confirm is already visible.
