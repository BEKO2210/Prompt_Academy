# ENG-011 — Precompute the search haystack (D3b)

**Type:** Performance
**Milestone:** M1 (out of band — cheap win, independent of H1)
**Status:** BLOCKED — do after ENG-010 lands, so correctness and performance are measured apart
**Complexity:** S

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
