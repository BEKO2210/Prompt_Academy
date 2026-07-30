# ENG-014 — Evaluation hardening

**Date:** 2026-07-30 · **No model was run.** This ticket exists because the instrument was not
strong enough to run one against.

## The blocker

| before | |
|---|---|
| deterministic checks | 44 |
| checks needing a human | 193 (**81%**) |
| tasks with ≥1 deterministic check | 26 of 50 |
| tasks with none at all | **24 of 50** |
| `structuralSuccess` | 0 for every arm, on every task |

A metric that is constantly zero cannot distinguish arm A from arm F. Reporting it as
"no difference between arms" would have been the same class of error as the 8-of-8 retrieval
failure: a number describing the instrument, presented as a finding about the hypothesis.

## Audit of all 193 manual checks

| class | | count |
|---|---|---|
| **A** | already deterministic as written | 21 |
| **B** | faithfully automatable | 125 |
| **C** | genuinely needs human judgement | 63 |
| **D** | defective as written — reworked, not deleted | 5 |

The single largest win was structural, not clever: **50 `required_artifacts` entries** were prose
("a component file", "a test file") that no evaluator could settle. They became one generic
`artifact` check parameterised by kind. Every task has one; an answer returning prose instead of
code now fails it identically in every arm.

Most frequent automatable types, in order of coverage gained:

| type | count | what it settles |
|---|---|---|
| `artifact` | 50 | the output contains code of the requested sort |
| `regex` | 48 | a named construct appears |
| `count_min` / `any_of` | 13 | N of something, or a loop that produces N |
| `attribute` | 4 | `aria-describedby`, `rel`, … |
| `handler` | 3 | an event handler is bound |
| `breakpoint` | 2 | a responsive breakpoint is declared |
| `element` | 1 | a tag is present |

### The 5 class-D checks

Kept as criteria, restated so they can be judged at all.

| check | defect | resolution |
|---|---|---|
| T003.a3 | "…or the tradeoff is stated" — an either-or that nothing can fail | restated: silence is a fail |
| T024.a3 | "no fake data shown *as if it were real*" — ambiguous | restated as a labelling rule |
| T033.a3 | "external links open without breaking the page" — vague | → `attribute: rel` |
| T038.a4 | "labels remain legible at small sizes" — **not judgeable from code at all** | → label length ≤ 12 chars, the code-visible part |
| T042.a3 | "rescales or clearly does not" — unfalsifiable | restated: clipping is the fail |

## The rule that shaped everything: no Scheinautomatisierung

**A human criterion is never rewritten into a weaker pattern and then called automated.**

Applying that honestly cost coverage back. 77 automated checks record the criterion they were
derived from, and **43 of them turned out to be strictly narrower than it** — compound criteria
asserting a relation, an ordering or a negation that a pattern cannot see:

> "Focus is moved into the modal on open **and restored to the trigger on close**"
> → automated as a pattern for a focus call, which cannot observe the restore.

Those 43 are flagged `proxy: true` and each carries a **human residual** holding the full original
criterion. The deterministic check supplements the judgement; it never replaces it. A test enforces
that every proxy has its residual and that the residual text still matches the original.

This was caught while debugging a failing test, not by design. The first pass had quietly deleted
T007's human checks entirely.

## After

| | before | after |
|---|---|---|
| deterministic checks | 44 | **171** |
| human checks | 193 | **109** |
| share needing a human | 81% | **39%** |
| tasks with ≥1 deterministic check | 26/50 | **50/50** |
| human-only tasks | 24/50 | **0/50** |
| reworked (class D) | — | 5 |
| H1-eligible tasks | undefined | **47/50** |
| diagnostic-only tasks | — | 3 (German language gap) |

Automation coverage is not the success metric. 39% still needs a human, and that is the correct
answer, not a shortfall.

## Sensitivity — the measurement that mattered most

A check that never passes is as useless as one that always does. Five hand-written plausibly-correct
answers were run against the check set. **The first pass had a 9% false-negative rate**, and both
failures were instrument defects:

- the `artifact` check rejected a valid YAML workflow, because its "does this look like code"
  precondition was JS-shaped (`function` / `const` / `export` / `<tag>`)
- `count_min 6::<input` rejected six inputs rendered by `[0,1,2,3,4,5].map(...)` — they occur **once**
  in the source

Both fixed; the `any_of` kind exists because of the second. False-negative rate is now 0% on that
set, and a test pins it at ≤5%. The opposite direction is pinned too: prose ("I would build this
using modern best practices") must fail the deterministic checks of every one of those tasks.

Five outputs is a small sensitivity set. It is not a validation of the check suite; it is a floor
that stops the two known defect shapes from returning.

## New metrics

Three dimensions, never merged by accident:

| metric | definition | when absent |
|---|---|---|
| **Deterministic Compliance** | passed / total over machine-settleable checks | `null`, never 0 |
| **Human Rubric Score** | passed / total over checks needing a human | `null` until judged |
| **Independent Task Success** | one frozen rule over both | `not_applicable` |

The frozen rule, written before any arm has run and identical for every arm:

```
fail            any measured dimension contains a failure
pass            every measured dimension passed, and at least one was measured
pending         nothing failed, but human checks exist and are unjudged
not_applicable  neither dimension had anything to measure
```

A failure anywhere outranks a pending elsewhere, so a broken output is not parked awaiting a human.
**Missing measurement is never failure** — a test asserts a task with no deterministic check yields
`not_applicable` and that its rate is `null` rather than 0.

## Human evaluation protocol

`engine/core/humanReview.ts`. Blinding is structural, not procedural: the packet type has no field
for the arm, the model, the record or the retrieval score, so a reviewer file cannot leak them by
accident — it would take a deliberate change to the type. Tested against an explicit forbidden-field
list, and the packet is serialised and re-checked so a nested leak is caught too.

- packet order randomised from a recorded seed; the id→arm mapping is asserted **unstable** across
  seeds, so a rater seeing two bundles cannot correlate them
- every arm judged against byte-identical criteria (asserted)
- **PASS / FAIL** per written proposition. No 1–10 scale without anchors: the criteria are already
  propositions, and a proposition is true or false
- the retrieved record is never shown, so injected skill instructions cannot become a hidden
  grading key
- verdicts reattach to (task, arm) through a key the rater never sees

**Not done, and blocking:** no human has judged anything yet. Independent Task Success is therefore
`pending` for every eligible task, which is the honest state and not a failure.

## H1 eligibility

A task enters the A–F comparison only when ground truth is valid, no criterion contradicts another
or the request, at least one check is evaluable, and retrieval produced a record.

**47 of 50 eligible.** The 3 exclusions are `no_retrieval` **and** `language_gap_diagnostic` —
German compounds (`Bestellbestätigungsseite`, `Adresszusatz`, `Ziffernfelder`) absent from a ~91%
English corpus. They are **not deleted**. The retrieval report keeps reporting 47/50 with the 3
named, so the product problem is not absorbed into a benchmark decision. Later work should test
lexical vs. translation/expansion vs. embeddings against exactly these.

## Freeze gate

`engine/core/freeze.ts` seals a manifest over: task set version, ground truth version, dataset hash,
content hashes of the ground-truth files, the versions of every module that decides a verdict
(checks, evaluator, eligibility, review protocol, field split, matching, ranking, formulation),
model configuration, arm definitions and the system wrapper hash.

`verifyFreeze()` recomputes it. Tested to detect: a changed ground-truth file, a bumped evaluator
version, a hand-edited manifest, and a new file the freeze does not cover. The rule it exists to
enforce — no change because of what an arm did — is easy to keep right up to the moment a result
disappoints.

## Umlaut regression (§11)

Against the real product module; the mirror is gone and a test asserts it stays gone. Covers
`Übersicht`, `Uebersicht`, `größe`, `schaltfläche`, `oberfläche`, German word boundaries, and the
English queries that must not move (`dashboard` 3,391 · `pricing page` 162 ·
`accessible dashboard` 100 · `zzzznomatch` 0). `schaltfläche` and `oberfläche` were vocabulary keys
that tokenisation could never produce — dead code until the fix.

## Known limitations

1. **Deterministic checks verify structure, never behaviour.** A bound handler is not a working
   interaction. "Task success" means "passed the structural checks", and every report must say so.
2. **Known false-positive sources**, stated rather than discovered later: a pattern inside a comment
   or string literal counts as present; a handler bound but unused counts as bound; a check tuned to
   React idioms can miss a valid Svelte answer, which is why each kind accepts several dialects.
3. **No human pass has happened.** 109 human checks are unjudged. Until then the primary metric is
   `pending`, and the only usable dimension is Deterministic Compliance.
4. **Sensitivity set is 5 hand-written answers**, by me, which is not independent.
5. **50 tasks is the under-powered first pass** ENG-008 §1 permits, not the 100 it targets.
6. **No LLM judge.** If one is tried later, human labels stay the reference and it must be measured
   for agreement, false-positive rate, false-negative rate, per-arm bias and cost before replacing
   any human work. Not before.

## Is the instrument strong enough for a first A–F pilot?

**For Deterministic Compliance: yes, with stated limits.** It covers all 50 tasks, discriminates
(prose fails, plausible code passes), is arm-blind by construction, and refuses to score what it
cannot measure.

**For Independent Task Success: not yet.** It requires the human rubric pass, and 109 checks are
waiting. Running A–F now would yield `pending` for every eligible task on the primary metric.

**Recommended next step, if a pilot is wanted before the full human pass:** run a small pilot on
Deterministic Compliance alone, reported as such, on a subset — enough to exercise the runner
against a real provider and expose the failures a stub cannot. Then decide whether the human pass
is worth its cost given what that pilot shows.

Per §15, stopping here. No model benchmark has been run.
