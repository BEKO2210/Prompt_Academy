# Tickets

Engineering tickets. `docs/roadmap.md` holds milestone-level status; this directory holds the
executable units.

## Status vocabulary

`PLANNED | READY | IN PROGRESS | BLOCKED | REVIEW | DONE`

A ticket is **never** marked DONE with unmet acceptance criteria.

## Complexity

`XS | S | M | L | XL` — deliberately not time estimates, since no real velocity for this project is
known (master prompt §63).

## WIP limit

At most **one** large technical task in progress at a time. Small, directly-dependent subtasks may be
done together. The goal is not 20 half-finished features.

## Current tickets

| ID | Title | Milestone | Complexity | Status |
|---|---|---|---|---|
| [ENG-001](ENG-001-capability-vocabulary.md) | Capability vocabulary + subcategory mapping | M1 | M | READY |
| [ENG-002](ENG-002-baselines.md) | Measure and commit performance baselines | M1 | S | READY |
| [ENG-003](ENG-003-ci-gates.md) | CI: dataset validation, typecheck, lint, first tests | M1 | M | READY |
| [ENG-004](ENG-004-content-hash.md) | Per-record `content_hash` | M1 | XS | READY |
| [ENG-005](ENG-005-labelled-query-set.md) | Labelled query set for retrieval benchmark | M2 | M | PLANNED |
| [ENG-006](ENG-006-ranking-module.md) | Isomorphic ranking module + central config | M2 | L | PLANNED |
| [ENG-007](ENG-007-index-byte-budget.md) | Resolve the 6.9 MB index byte budget | M2 | L | PLANNED |

Recommended start: **ENG-002 and ENG-004** (both small, unblock measurement), then **ENG-003**,
then **ENG-001**.

M3+ tickets are deliberately not written yet: M3 is gated on ADR-0001, and writing detailed tickets
for contingent milestones before their gate is decided produces plans that get discarded.
