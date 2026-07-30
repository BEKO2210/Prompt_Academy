# ENG-011 — Precompute the search haystack (D3b)

**Type:** Performance
**Milestone:** M1 (out of band)
**Status:** **REJECTED** (2026-07-30) — implemented, measured, reverted
**Complexity:** S

## Result: no code ships

Full measurement in `reports/eng-011-haystack-precompute-rejected.md`.

| | Baseline | With precomputation | |
|---|---|---|---|
| Filter-only p50 | 7.73 ms | **1.21 ms** | 6.4× faster |
| **keystroke → paint p50** | 49.9 ms | **49.7 ms** | **no change** |
| **JS heap after load** | 24.4 MB (budget **≤ 24.5**) | **34.3 MB** | **budget FAILED** |

The filter got 6.4× faster and **the user experiences nothing**. Removing ~6.5 ms from
a ~50 ms interaction is invisible, because React's commit and paint of the 48 visible
cards account for ~42 ms of it. The ticket predicted a ceiling of ~12%; the measurement
came in at 0%.

One hard acceptance criterion (heap ≤ 24.5 MB) fails by 10 MB. Per the release gates and
master prompt §47, a component that does not measurably help is removed rather than kept.
**Reverted.**

The change was verified behaviour-neutral before rejection — precomputed haystacks were
byte-identical for all 10,000 records, and 9 representative queries selected the same
record ids in the same order. This was not a broken implementation; the payoff simply was
not there.

## What this redirects

- **The bottleneck is React re-render, not retrieval.** Any filter or scoring
  optimisation is dominated by rendered work.
- **A debounce on the search input is likely the highest-value next change** and costs no
  memory. Not ticketed yet; worth measuring before ENG-006 adds per-keystroke scoring.
- **Do not solve retrieval cost per keystroke.** ADR-0003 already specifies an
  **offline-built** inverted/BM25 index for ENG-006 — build-time work, no heap-for-CPU
  trade. Per-keystroke precomputation would have been discarded by ENG-006 anyway.
- **The heap budget has no slack.** 24.4 MB against a 24.5 MB ceiling. ENG-006/ENG-007
  must argue any in-memory structure's budget up *with a measurement first*.

---

*Original ticket below, kept for the record.*

## Problem

`haystack()` is called **inside** the filter predicate (`Library.tsx:76`), so on every keystroke up to
10,000 records each get a fresh array allocation, `join(" ")` and `toLowerCase()`. Nothing is
precomputed or memoised.

Measured (ENG-002, `reports/baseline-2026-07-30.json`):

| | Measured |
|---|---|
| Filter-only search | p50 **6.97 ms** |
| `haystack()` construction alone | p50 **5.79 ms** — **~83%** of the filter cost |
| Facet-only filtering (no text) | p50 **0.64 ms** — ~11x cheaper |
| Keystroke → paint (browser) | p50 **49.9 ms**, p95 **50.6 ms** |

The work is pure re-derivation: the haystack for a given record is identical on every keystroke.

## Goal

Compute each record's haystack **once**, not per keystroke, without increasing what the browser
downloads or retains beyond the measured budgets.

## Scope

Precompute the lowercased haystack per record and reuse it across keystrokes. Options to evaluate and
**measure**, not assume:

1. **Build time** — emit the haystack as a field in `index.json`. Fastest at runtime, but adds bytes
   to a file that is already 6,908,069 B, and every byte there is parse time and heap with no
   compression relief (D1 as corrected). Must be measured against the budgets.
2. **Once after load** — derive it in a single pass when the index arrives, cached in memory
   (e.g. a parallel array or a `WeakMap`). No transfer cost, one-off ~6 ms, adds heap.
3. **Lazy per record, memoised** — build on first touch, keep it. Spreads the cost.

Option 2 is the likely answer given the byte pressure, but the ticket is to measure and choose, and to
record why the others were rejected.

## Non-Goals

- **No ranking.** ENG-006.
- **No change to which records match.** This ticket must be behaviour-neutral: identical result sets
  for identical queries, verified by the ENG-010 tests.
- **No index restructuring.** That is ENG-007, and its budgets apply here.
- **No React re-render work.** See the ceiling below.
- **No incidental cleanup.** ENG-009's debt stays untouched.

## The honest ceiling on this ticket

Keystroke→paint is p50 **49.9 ms** while the filter is only **6.97 ms**. React re-render of the 48
visible cards dominates. Eliminating the haystack cost entirely removes at most ~5.8 ms of ~50 ms —
roughly **12%** of what a user actually feels.

So this is a real but bounded win. It is worth doing because it is cheap and it removes waste that
would otherwise scale with every future ranking signal, **not** because it will make the UI feel
transformed. There is also no debounce on the input; adding one would likely help perceived latency
more than this ticket does, and is a separate change.

Stating the ceiling up front so the result is not oversold afterwards.

## Dependencies

**ENG-010 must land first.** Correctness and performance are deliberately separate changes so each has
its own measurement and neither can hide behind the other.

## Acceptance criteria

- [ ] Filter-only search p50 measurably below the **6.97 ms** baseline, by more than the measured
      **~10–15% noise floor** — or the change is reverted as unproven
- [ ] Keystroke→paint p50/p95 not worse than **49.9 / 50.6 ms**; report the actual delta honestly,
      including if it is within noise
- [ ] `index.json` ≤ **7,000,000 B** and `public/data` ≤ **32,500,000 B** (CI-enforced budgets from
      ENG-003)
- [ ] JS heap after Library load ≤ **24.5 MB**
- [ ] Time to first rendered result ≤ **323 ms**
- [ ] **Behaviour-neutral:** every ENG-010 query-matching test still passes with identical counts
- [ ] Measured with `scripts/baseline/` so the comparison is like-for-like; before/after numbers
      committed to `reports/`
- [ ] Options considered documented with measured results, **including the rejected ones**

## Tests

- Reuse the ENG-010 matching tests unchanged — they are the behaviour-neutrality proof.
- A test asserting the precomputed haystack equals the value the original `haystack()` produced, for a
  sample of records. Precomputation that silently differs would change results while all count-based
  tests still pass.
- Existing size-budget tests already guard the byte side.

## Risks

- Option 1 (build-time field) could push `index.json` over budget and make parse and heap worse in
  exchange for saving ~5.8 ms of CPU. Measure before choosing; the budgets are CI-enforced so this
  fails loudly rather than silently.
- A stale cache after the index is replaced would produce wrong results. Key any cache to the loaded
  index instance, not to a module-level global.
