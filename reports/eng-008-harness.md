# ENG-008 (slices 1–2) — H1 harness

**Date:** 2026-07-30 · **No model was called.** Every number here comes from the stub provider or
from deterministic retrieval, and describes the harness, not any model.

## The finding that matters

Before query formulation existed, **8 of 8 seed task requests retrieved zero records** from the
10,000-record corpus.

This is not a small bug. With no record, arms B, C, D and E assemble no context and become
byte-identical to arm A. The run would have completed cleanly, reported
`A ≈ B ≈ C ≈ D ≈ E`, and ENG-008 §7 reads that pattern as:

> **H1 falsified for this corpus/model. Stop before M4.**

The project's central question would have been answered "no" by a number that measured a missing
component. §Problem calls this exact class of outcome "worse than none".

**Cause.** `search.ts` requires ALL content terms to match. Correct for a search box, where users
type two or three words. A task request is a sentence — "Ich brauche eine Preisseite mit drei
Tarifen, monatlich und jährlich umschaltbar" carries ten content words, and no single record
contains all ten.

**Fix.** `engine/core/queryFormulation.ts`: a deterministic, non-model rule that drops function
words, discards terms absent from the corpus, ranks the rest by document frequency, and backs off
from k conjuncts to 1 until the conjunction can be satisfied. AND semantics stay strict; the number
of conjuncts shrinks. After it: **8 of 8 retrieve a record.**

## The second finding: rarest-first is wrong

The obvious ranking rule — rarest term first, on IDF intuition — was measurably wrong. IDF assumes
a rare term is *topical*; a term matching 1 or 2 records in 10,000 is usually just out of
vocabulary. In each failing case a rare **verb** displaced a common domain **noun**:

| request | term chosen | df | retrieved |
|---|---|---|---|
| "modal that closes with Escape" | `escape` | 1 | **Escape Room Display** |
| "user picks a delivery option" | `picks` | 2 | Shop with Curated **Picks** |
| "shows upload progress" | `shows` | 2 | Climate Change Visualizer |

A document-frequency floor fixes all three. Measured across floors on the 8 seed tasks:

| floor | outcome |
|---|---|
| 0 | 4 of 8 plausible — the three failures above, plus a weak T003 |
| **5** | **7 of 8 plausible** — `modal`, `address`, `file upload drop` |
| 10 | T008 degrades to `before` → "Best Before Display"; T002 to `email` |
| 25 | T004 degrades to "Certificate Template Designer" |

**Rejected on measurement:** preferring terms that occur in record titles or subcategories. It does
not separate the failing cases — `picks` and `escape` are both in titles ("Curated Picks", "Escape
Room") — and German requests have no terms in an English title set at all, so it would have broken
the German tasks outright.

**Honest limitation:** the floor of 5 is fitted to **eight tasks**. The shape of the curve is real
signal; the value is not validated. It must be revalidated when the task set reaches target size,
and it is recorded per run rather than left implicit.

## What the harness now guarantees

Structural, enforced by test, not by convention:

| Guarantee | ENG-008 | How |
|---|---|---|
| Layer 2 never reaches a prompt | §2 | separate file, separate module, stripped at load; assembly cannot import it |
| Evaluator is arm-blind | §2 | `evaluate()` takes exactly two arguments; imports no arm or retrieval state |
| B, C, D share one record | §3 | retrieval runs once per task, before the arm loop |
| B = C ∪ D | §3 | one field list, one renderer |
| §4 constants hold | §4 | `assertConstants()` checks the records the run produced |
| Unretrieved tasks excluded | new | reported in `unretrieved`, never scored |
| Core runs without a provider | ADR-0001 | stub provider in core; no `ollama` string anywhere in `engine/core` |
| One ranking, two consumers | ADR-0001 | engine imports `site/src/lib/ranking.ts` directly |

## Stub run, 8 tasks, 5 arms, n = 1

```
arm  structural  autoPass  autoFail  unresolved  ctxChars
  A          0        10         7          27         0
  B          0        10         7          27      1582
  C          0        10         7          27       899
  D          0        10         7          27       714
  E          0        10         7          27      1530
```

The identical scores across arms are the point: the stub ignores its context, so a context-blind
provider must score identically in every arm. It does. That is evidence the evaluator is arm-blind
in practice and not only by signature. The differing `ctxChars` confirms the arms are in fact
injecting different amounts.

`structural = 0` everywhere because the stub emits a fixed string. Nothing about model capability
can be read from this table.

## Mutation testing

A test that has never been red proves nothing. Nine deliberate defects were introduced and each had
to turn the suite red:

injecting the whole record into B · giving D a different record · perturbing one arm's system
wrapper by one space · removing arm E's deduplication · stringifying the task into the prompt ·
widening the injectable field set · scoring tasks that retrieved nothing · removing the frequency
floor · removing function-word filtering.

**Two tests failed to catch their mutation on the first attempt and were rewritten:**

1. The leakage sentinel test **could not fail**. It built prompts from an object that never carried
   the sentinel. Rewritten to poison the task and the record the way a real leak would.
2. The formulation tests ran against a 2,000-record corpus while the behaviour they check is a
   property of all 10,000. `escape` has df 0 in the smaller set, so it was excluded as *absent*
   rather than by the floor, and deleting the floor changed nothing. Both mutations passed green.

## What is deliberately not done

- **Task set is 8.** §1 targets 100 and permits 50 as under-powered. This is below both and is
  labelled in the file as a schema demonstration, not an H1 result.
- **Arm E is concatenation, not compilation.** No conflict resolution, no precedence, no context
  budget. `E ≈ D` would currently mean "concatenation adds nothing", a much weaker claim than
  "compilation adds nothing". Asserted by test so it cannot be reported as H1c.
- **Arm F** is M4.
- **No ollama adapter.** The CLI refuses any provider but the stub.
- **`quality.*` is injected nowhere,** including arm B. It is self-reported by the generating agent
  and not independently validated.
- **No relevance ground truth for task → record.** The formulation tests pin three known-bad cases;
  they are not a retrieval metric.

## Deviation from the ticket, recorded

§3 specifies both "arm B = the full record, verbatim" and the binding assertion `B = C ∪ D`. Both
cannot hold: a record also carries `id`, `slug`, `quality.*`, `batch`. Resolved by defining an
injectable set that C and D partition exactly; retrieval keys, provenance and quality scores enter
no arm. **This narrows arm B relative to a literal reading of the ticket.**
