# ENG-007 — Resolve the 6.9 MB index byte budget

**Type:** Performance / Architecture
**Milestone:** M2
**Status:** PLANNED
**Complexity:** L

## Problem

**Restated 2026-07-30 after ENG-002 measured it.** The original framing was wrong in a way that
changes this ticket's priority.

`index.json` is **6,908,069 bytes** raw but **738,038 bytes as served** (gzip, 9.36x). Transfer is
therefore *not* the problem. The costs that compression cannot touch:

| Measured | Value |
|---|---|
| `JSON.parse` of the full index | p50 15.7 ms / p95 25.2 ms |
| Heap retained by the parsed index | 13.97 MB |
| JS heap after Library load | 24.4 MB |
| Time to first rendered result | 294–360 ms |

At ~300 ms to first result on desktop, **the page is acceptable today**. This is not an urgent
performance fix; it is a *headroom* problem. Every field added to this index costs parse time and heap
directly, with no compression relief, and mobile CPU is `UNMEASURED` and would be worse.

ENG-002 also found the cheaper, unrelated win: **`haystack()` is ~83% of filter cost** because it is
rebuilt per record per keystroke (D3b). Precomputing it needs no index restructuring at all. And the
full keystroke cost (~50 ms) is dominated by React re-render, not the filter — so index work
addresses only part of what the user feels.

## Goal

Ranking can ship without regressing the ENG-002 baseline. Given the measurements, prefer the cheapest
intervention that buys enough headroom — not the most thorough restructuring.

## Scope

Evaluate and implement one or more of (all currently `UNMEASURED`):

1. **Split** — slim card index for display + separate compact scoring index fetched on first search.
2. **Shard by category** — lazy-load per category. The pattern already exists in
   `site/src/lib/data.ts` (`categoryP` map memoizes per-category full records), so this is an
   extension of a proven approach rather than a new mechanism.
3. **Compact encoding** — typed arrays / binary for the inverted index instead of JSON.
4. **Field trimming** — drop index fields the card and search paths do not actually use.

Deliverable includes a measured comparison of the options actually tried, not just the chosen one.

## Non-Goals

- Changing ranking behaviour (ENG-006).
- A backend search API (ADR-0003 rejects it).

## Technical notes

- Search currently rebuilds a concatenated haystack string per record per keystroke
  (`Library.tsx:66-76`) — that allocation pattern is itself worth measuring, independently of size.
- Sharding interacts with search semantics: a global search cannot be satisfied by one shard, so a
  compact global scoring structure is likely needed regardless.

## Dependencies

ENG-002 (baseline). Must land together with ENG-006.

## Acceptance criteria

Measured with `scripts/baseline/` so the comparison is like-for-like. Budgets from
`reports/baseline-2026-07-30.json`:

- [ ] Time to first rendered result ≤ **323 ms** (baseline upper bound of the local range)
- [ ] JS heap after Library load ≤ **24.5 MB**
- [ ] `index.json` encoded transfer ≤ **738,038 bytes**
- [ ] `JSON.parse` p95 ≤ **25.21 ms**
- [ ] Keystroke → paint p95 ≤ **50.6 ms**
- [ ] Any claimed improvement exceeds the measured **~10–15% noise floor**, or the repeat count is
      raised until it is distinguishable
- [ ] A CI-enforced size ceiling on build artifacts, so this cannot silently regress again
- [ ] Options considered documented with measured results, **including rejected ones**
- [ ] No functional regression in filtering, paging, or the detail view

## Tests

- Build-output tests assert the expected artifact set and that no artifact exceeds an agreed size
  budget (a CI-enforced ceiling, so this cannot silently regress again).
- Regression tests for filter/paging/detail behaviour.

## Security

None.

## Risks

Sharding adds request count and complexity; a naive split could make cold search *slower* even if
initial load improves. Mitigation: measure both cold-load and first-search paths, and report both.
