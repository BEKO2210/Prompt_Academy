# ENG-011 — Haystack precomputation: measured and rejected

**Date:** 2026-07-30
**Outcome:** **Implemented, measured, reverted.** No code from this ticket ships.
**Baseline:** `reports/baseline-2026-07-30.json` · **Harness:** `scripts/baseline/`

This is a negative result, recorded because the plan requires it: a component that
does not measurably help gets removed, not kept (roadmap §Release gates, master
prompt §47). It is also the first ablation in this project to actually delete
something, which is the mechanism working rather than failing.

---

## What was tried

`haystack()` was being called inside the filter predicate, so up to 10,000 array
allocations, `join(" ")` and `toLowerCase()` calls were redone on **every
keystroke** — measured in ENG-002 at ~83% of filter cost. The strings are
identical on every keystroke, so this is pure re-derivation.

Implementation: `buildHaystacks(items)` once per loaded index, held in a `useMemo`
keyed on the index instance; the filter then tested a prebuilt string via
`matchesHaystack(hay, terms)`. Behaviour-neutral by construction, and proven so
(see §Verification).

Options 1 (build-time field in `index.json`) and 3 (lazy per-record memoisation)
were rejected before implementation:

- **Option 1** would add ~4.4 MB to a file already at 6,908,069 B, breaching the
  7,000,000 B CI budget and increasing parse time — the opposite of what D1
  (as corrected) asks for.
- **Option 3** has the same steady-state cost as option 2, because the filter
  tests *every* record on *every* query, so all 10,000 haystacks are built on the
  first keystroke anyway. No saving, extra complexity.

---

## Measurements

### Isolated filter cost — large win

| | Before | After | |
|---|---|---|---|
| Filter-only p50 | 7.73 ms | **1.21 ms** | **6.4× faster** |
| Filter-only p95 | 9.06 ms | 2.47 ms | |
| One-off build | — | 15.5 ms | paid once per index load |

### What the user actually experiences — no change at all

| | Baseline | After | Verdict |
|---|---|---|---|
| **keystroke → paint p50** | 49.9 ms | **49.7 ms** | **within noise** |
| keystroke → paint p95 | 50.6 ms | 50.1 ms | within noise |
| Time to first rendered result | 294–360 ms | 309–328 ms | within range |
| First contentful paint | 168–196 ms | 168–184 ms | within range |

### Cost — hard budget breach

| | Budget | After | Verdict |
|---|---|---|---|
| **JS heap after Library load** | **≤ 24.5 MB** | **34.2–34.5 MB** | **FAIL, +10 MB** |
| Heap after searching | (24.4 → 34 MB baseline range) | 33.6 MB | — |
| `index.json` | ≤ 7,000,000 B | unchanged | pass |

Node-level probe measured the haystack array itself at **+4.43 MB** (13.97 →
18.40 MB) across 4,356,637 characters, averaging 436 chars per record. The browser
figure is larger (~+10 MB), which was not investigated further — the budget was
already breached and the benefit was already zero, so the cause did not matter to
the decision.

---

## Verdict against the ticket's own acceptance criteria

| Criterion | Result |
|---|---|
| Filter p50 below 6.97 ms beyond the ~10–15% noise floor | **pass** (1.21 ms) |
| keystroke→paint not worse than 49.9 / 50.6 ms | pass, but **no improvement** |
| JS heap ≤ 24.5 MB | **FAIL** — 34.3 MB |
| Time to first result ≤ 323 ms | borderline (309–328) |
| Behaviour-neutral | **pass**, proven |

One hard criterion fails and the user-facing metric shows nothing. Reverted.

---

## Why it bought nothing

The ticket predicted a ceiling of ~12% of felt latency, reasoning that the filter
is ~6 ms of a ~50 ms keystroke while React re-render of the 48 visible cards
dominates. The measurement came in **below even that** — 0%.

Removing 6.5 ms from a 50 ms interaction is invisible: it is inside the frame
budget slack that React's commit and paint already consume. The conclusion is not
"the optimisation failed" but **"the filter was never the bottleneck"**.

---

## What this redirects

1. **The real lever is React re-render, not retrieval.** ~42 of ~50 ms is commit
   and paint of 48 `PromptCard`s. Anything that reduces rendered work — or defers
   it — will beat any filter optimisation by an order of magnitude.
2. **A debounce on the search input is very likely the highest-value change**, and
   it costs no memory. Explicitly out of ENG-011's scope, not yet ticketed, and
   worth measuring before ENG-006 adds per-keystroke scoring on top.
3. **Do not solve retrieval cost per keystroke.** ADR-0003 already specifies an
   **offline-built** inverted/BM25 index for ENG-006. That is the right place: the
   work happens at build time, not in the browser's hot path, and it does not
   trade heap for CPU. Per-keystroke precomputation would have been thrown away by
   ENG-006 regardless.
4. **The heap budget is tighter than it looks.** 24.4 MB baseline against a
   24.5 MB ceiling leaves essentially no room. ENG-006/ENG-007 must plan for that
   — any in-memory retrieval structure needs its budget argued up with a
   measurement first, not discovered afterwards.

---

## Verification that the reverted code was behaviour-neutral

Recorded because it justifies the "the idea was sound, the payoff was not"
reading rather than "it was buggy":

- Precomputed haystacks were **byte-identical** to the on-the-fly ones for all
  10,000 records.
- For 9 representative queries, the precomputed path selected the **same record
  ids in the same order**, not merely the same counts.
- All 47 tests passed with the change in place, including the ENG-010 corpus-count
  contract.

The tests written for this (`buildHaystacks`/`matchesHaystack` mirrors) were
reverted with the code, since they assert functions that no longer exist. The
ENG-010 drift guard correctly flagged the refactor while it was in place, which is
the guard doing its job.

---

## Files touched and reverted

`site/src/lib/search.ts`, `site/src/pages/Library.tsx`, `tests/search.test.mjs` —
all restored to their ENG-010 state (`git checkout`). Working tree verified clean;
rebuild and full test run green afterwards.
