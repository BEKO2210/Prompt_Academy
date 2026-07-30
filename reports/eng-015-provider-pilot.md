# ENG-015 — Provider pilot

**Date:** 2026-07-30 · **This is an infrastructure pilot. It is not an H1 result.**
No cross-arm inference may be drawn from anything below.

## PILOT STATUS

**Tasks:** 10, frozen before the first model call
(`T014 T018 T022 T025 T031 T033 T039 T040 T047 T049`), **DEV split only**.
10 distinct domains, both languages, 1–6 deterministic checks each, 8 carrying proxy checks. The
three language-gap diagnostics are excluded. **The holdout (20 tasks) was not touched.**

**Arms:** A, B, D, E. Arm C was omitted — it exercises the same assembly path as D with the other
half of the frozen split and adds no untested code. **Arm F was not built for this pilot**;
building it would have pulled M4 architecture forward for a pilot's sake.

**Model:** `qwen2.5-coder:7b-16k` via local Ollama.
Version recorded as the digest `3ebbcb3fc2d3…`, not the tag — a tag can be repointed at new weights,
which ENG-008 §7 calls a hard stop and a tag alone could not detect.
temperature 0 · seed 7 · num_predict 1536 · no tools · system wrapper byte-identical across arms.

**Calls:** 40 attempted / **40 successful**. 0 timeouts, 0 transport errors, 0 HTTP errors,
0 malformed responses, 0 empty outputs, 0 retries. All 40 outputs contained code. No output came
near the 1536-token budget (max 1101), so nothing was truncated.

**Deterministic Compliance per arm** — final run, after the instrument fixes below:

| arm | det pass | det fail | rate | proxy pass/fail | in tok | out tok | ctx chars |
|---|---|---|---|---|---|---|---|
| A | 24 | 7 | 0.774 | 8/4 | 668 | 4389 | 0 |
| B | 20 | 11 | 0.645 | 6/6 | 3408 | 2890 | 1440 |
| D | 24 | 7 | 0.774 | 8/4 | 1905 | 3889 | 601 |
| E | 22 | 9 | 0.710 | 7/5 | 3377 | 4340 | 1365 |

**Human:** pending. 118 human checks, none judged.
**Independent Task Success:** pending — 5 of 10 tasks per arm are `pending`, the rest `fail` on a
deterministic check. Zero `not_applicable`. **Pending is not zero and is not failure.**

**Latency:** p50 5.0 s, p95 10.7 s. **Wall clock:** 209 s for 40 calls.
**Cost:** `not_applicable` — local model, no monetary cost is invented.

## Provider problems

None at the transport layer. Two provider properties worth recording:

**1. The model is not deterministic at temperature 0 with a fixed seed.** Prompt hashes were
identical across runs (40/40), so the variation is entirely provider-side:

| comparison | identical outputs |
|---|---|
| run 1 vs run 2 | 27 / 40 |
| run 2 vs run 3 | 39 / 40 |

Between runs 2 and 3 — same instrument, same config — Deterministic Compliance moved by **0.000**
for every arm. That is one repeat, not a noise floor. What is established is that drift is real and
intermittent; what is **not** established is how large it can get. ENG-008 §4 anticipated this and
the harness already supports `n > 1`. **A cross-arm difference at n = 1 is uninterpretable until
the noise floor is measured with n ≥ 5.**

**2. Ollama applies the model's own chat template server-side.** The adapter sends an explicit
system message and user message via `/api/chat`; what the model finally sees is that array rendered
through its template, which is outside our reach. It is identical for every arm, since every arm
sends the same shape. Recorded as a known unmeasured layer rather than ignored.

## Harness bugs found — the point of the pilot

Four defects. Each was identified from a **criterion ↔ check mismatch**, not from which arm scored
what. None was found by looking at an arm's total.

**1. `artifact: component` rejected complete HTML documents.** It required
`export` / `<template>` / `@Component` / `function [A-Z]` — an unstated assumption that answers
would use a JavaScript framework. The tasks never said so. T014 and T018 returned working HTML
pages and were scored as having produced no artifact. *Instrument, not result:* the check failed
valid answers in **every** arm for a reason unrelated to the experimental variable.

**2. Two prohibitive criteria were automated as requirements.**
"Secrets are referenced, **never written** into the file" became a pattern that had to be PRESENT,
so an output containing no secret at all — committing no violation — was failed. Same shape for
"external links carry `rel`", which failed vacuously on an output that had no external links.
Fixed with a new `regex_absent` kind that tests the violation.

**3. The proxy/residual detector missed comma-coordinated compounds.** It looked for
`and` / `only` / `rather than` and so did not see
"Secrets are referenced, never written into the file" as compound. 9 checks were automating half a
criterion with no human residual. Residuals added; human checks 109 → 118.

**4. The contradiction detector fired on a correct evaluation.** Once `regex_absent` existed, T049's
secret-literal pattern legitimately named the same strings as its `forbidden` list, and the detector
read that as "a forbidden string is required". For an absence check that overlap is agreement.

### What was deliberately NOT fixed

**T022 arm A returned 84 characters: a JSON list of filenames, no artifact.** That is a genuine
model failure and the check caught it correctly. **T031** returned a Python/tkinter script with no
column-mapping step at all — also genuine. Neither was touched. Distinguishing these from the four
above is the whole discipline of §10: a check that contradicts its own criterion is a bug; a check
that catches a bad answer is a result.

## Experimental findings — descriptive only

Stated as observations of this run. **No inference is drawn and none is permitted from n = 1 on 10
DEV tasks with 5 of 10 tasks per arm still pending a human.**

- Arms A and D scored the same Deterministic Compliance (0.774) on this sample.
- Arm B scored lowest (0.645) and produced the fewest output tokens (2890 vs 4389 for A) despite the
  largest input context (3408 tokens). Whether a larger injected context shortened the answers, and
  whether shorter answers score worse on structural checks, is **not** established here.
- Context sizes behaved as designed: A 0, D 601, E 1365, B 1440 characters.

These numbers describe one run of one 7B model on ten tasks. They are not evidence about H1.

## Changes required before the full benchmark

1. **Measure the noise floor.** Run n ≥ 5 per (task, arm) on the DEV pilot subset and report the
   run-to-run spread of Deterministic Compliance. Until then no arm difference is interpretable.
2. **Run the human rubric pass.** 118 checks. Until then Independent Task Success is `pending` for
   every task that has any, which is most of them.
3. **Decide arm C and arm F.** C is cheap and completes the B = C ∪ D story. F needs the compiler
   that does not exist; arm E is still concatenation with duplicate removal, and `E ≈ D` currently
   means "concatenation adds nothing", not "compilation adds nothing".
4. **Seal the freeze manifest** with the post-pilot versions (`checks` and `evaluator` both changed
   today) and verify it immediately before the real run.
5. **Consider the output budget.** 1536 was never reached, so it did not bind; keep it, and record
   that it did not.

## Is the harness technically ready?

**YES**, for the pilot's stated purpose.

- real provider works: 40/40 calls, zero failures
- arm assembly works: pre-flight verified on the real corpus that arm A carries no context, arm D
  carries exactly the frozen actionable split with no descriptive leakage, arm B is a superset of D,
  no Layer 2 text appears anywhere, and the arm identity never reaches the model
- runs are reproducibly attributable: prompt hash, record content hashes, retrieval query, seeds,
  model digest and every §6 field are recorded per call
- token and latency measurement works, with the limit stated: token counts are Ollama's own, not
  re-derived
- outputs are stored raw and complete
- the evaluator processes real model answers, and four defects it had were exposed by them
- `pending` / `not_applicable` / `fail` stayed distinct throughout — no dimension collapsed to zero
- no leakage found
- no provider dependency in the core: `engine/core` contains no reference to ollama in code, and the
  core test suite passes with the stub while ollama is unreachable
- failures are visible: the adapter records every attempt, and none were silently swallowed

## Is H1 ready for final evaluation?

**NO.**

**Reason:** three things are missing, and none is a matter of running more tasks.

1. **118 human checks are unjudged**, so the primary metric is `pending` for most tasks. A cross-arm
   table on Deterministic Compliance alone measures structure, not task success.
2. **The noise floor is unmeasured.** One repeat showed 0.000 movement and another showed 13 of 40
   outputs differing. At n = 1 an arm difference of 0.13 — the A-to-B gap seen here — cannot be
   distinguished from provider drift.
3. **Arm E is not the compiler H1c is about**, and arm F does not exist. Two of the six arms the
   hypothesis is stated over are not yet the things they name.

Per §12, stopping here. No further tasks were run, the holdout was not touched, and no statistical
conclusion about H1 has been drawn.
