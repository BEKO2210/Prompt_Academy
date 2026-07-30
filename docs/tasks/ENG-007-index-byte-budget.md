# ENG-007 — Resolve the 6.9 MB index byte budget

**Type:** Performance / Architecture
**Milestone:** M2
**Status:** PLANNED
**Complexity:** L

## Problem

`index.json` is **6,908,075 bytes** measured (finding D1). Every Library visitor downloads and parses
all of it before seeing a result. Transfer is compressed, but parse and heap cost are not. Adding
ranking data to this index would make the most consequential existing performance problem worse.

## Goal

Ranking can ship without the Library page getting slower than the ENG-002 baseline.

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

- [ ] Library TTI and search latency ≤ ENG-002 baseline, measured the same way.
- [ ] Bytes transferred for a first Library visit measured before and after.
- [ ] Parse time and heap measured before and after.
- [ ] Options considered are documented with their measured results, including rejected ones.
- [ ] No functional regression in filtering, paging, or the detail view.

## Tests

- Build-output tests assert the expected artifact set and that no artifact exceeds an agreed size
  budget (a CI-enforced ceiling, so this cannot silently regress again).
- Regression tests for filter/paging/detail behaviour.

## Security

None.

## Risks

Sharding adds request count and complexity; a naive split could make cold search *slower* even if
initial load improves. Mitigation: measure both cold-load and first-search paths, and report both.
