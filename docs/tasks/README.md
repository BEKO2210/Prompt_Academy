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

Ordered by recommended execution sequence. The rightmost column states what each ticket unblocks —
no ticket is here because it is tidy; each one gates something downstream.

| # | ID | Title | M | Cx | Status | Unblocks |
|---|---|---|---|---|---|---|
| 1 | [ENG-002](ENG-002-baselines.md) | Measure and commit performance baselines | M1 | S | READY | Any "faster/better" claim; the D1 byte-budget constraint |
| 2 | [ENG-004](ENG-004-content-hash.md) | Per-record `content_hash` | M1 | XS | READY | Cache keys, idempotent import, benchmark traceability |
| 3 | [ENG-003](ENG-003-ci-gates.md) | CI: dataset validation, typecheck, lint, first tests | M1 | M | READY | Safe iteration on data and site (closes D4) |
| 4 | [ENG-001](ENG-001-capability-vocabulary.md) | Capability vocabulary + subcategory mapping | M1 | M | READY | Capability ranking signal (R3); the resolver |
| 5 | [ENG-005](ENG-005-labelled-query-set.md) | Labelled query set for retrieval benchmark | M2 | M | READY | H0 — makes ranking falsifiable |
| 6 | [ENG-007](ENG-007-index-byte-budget.md) | Resolve the 6.9 MB index byte budget | M2 | L | PLANNED | Lets ranking ship without a perf regression |
| 7 | [ENG-006](ENG-006-ranking-module.md) | Isomorphic ranking module + central config | M2 | L | PLANNED | H0; the retrieval stage reused by the M3 engine |
| 8 | [ENG-008](ENG-008-benchmark-harness.md) | End-to-end benchmark harness (arms A–E) | M3 | XL | BLOCKED — **spec approved** | H1a/H1b/H1c; gates all of M4 |

**Sequencing rationale:** measurement before change (1), cheap and irreversible-if-late groundwork
(2), then the safety net that makes everything after it safe (3), then the one schema addition the
whole architecture routes on (4), then ground truth before the thing it judges (5), then the
constraint before the feature that would violate it (6 before 7).

**ENG-008 is an exception to "no tickets for contingent milestones".** Its *specification* is frozen
now, ahead of implementation, because the design decisions — the hidden evaluation layer, the
same-record isolation, the constants — are what make the eventual results interpretable. Specifying
them after writing the harness would invite fitting the method to the outcome. Implementation remains
blocked on M1 and M2.

Remaining M3/M4 tickets are deliberately unwritten: their shape depends on the ENG-008 result, and
detailing contingent work before its gate produces plans that get discarded.
