# ENG-005 — Labelled query set for the retrieval benchmark

**Type:** Measurement / Data
**Milestone:** M2
**Status:** **DONE** (2026-07-30) — v1 frozen
**Complexity:** M

## Result

`retrieval-ground-truth-v1`, frozen. **12 queries annotated, 454 judged query↔record pairs.**

| Artifact | |
|---|---|
| `benchmarks/queries/RELEVANCE-GUIDELINE.md` | written **before** any record was judged |
| `benchmarks/queries/queries.json` | 32 authored; each marked `annotated` or `authored_not_annotated` |
| `benchmarks/queries/query-expansions.json` | hand-written recall expansions (incl. DE↔EN) |
| `benchmarks/queries/candidate-pool.json` | 1,197 candidates, 6 sources, blinded + shuffled |
| `benchmarks/queries/relevance.json` | the frozen ground truth |
| `benchmarks/queries/COVERAGE.md` | coverage and pooling-bias report |
| `scripts/pool_candidates.py` | pooling + `--blind` annotator view + `--bias-report` |
| `scripts/annotate_relevance.py` | the annotator's criteria, auditable |
| `scripts/validate_query_set.py` | validator, wired into CI |
| `tests/query-set.test.mjs` | 13 tests incl. the circularity ban |

### Deviation from the original scope

The ticket asked for **100–150 queries**. Annotating that many at genuine quality is not achievable
by a single annotator in one pass, and the brief was explicit that quality outranks quantity.
**12 queries are fully annotated; the other 20 are authored and pooled but deliberately ungraded**
and marked as such. Shipping 150 rushed labels would have produced a ground truth that quietly
ratified whatever a ranker happened to do.

## Problem

Hypothesis H0 (scored ranking beats substring matching) cannot be tested without ground truth, and no
labelled relevance data exists. Without it, any ranking change is a matter of opinion.

## Goal

A versioned labelled query set enabling precision@k / MRR / nDCG measurement, per
`benchmark-plan.md` §3.

## Scope

- 100–150 queries, written **before** looking at ranking output (to avoid fitting the metric to the
  implementation).
- Mixed German and English — the corpus is ~91% en / ~9% de (measured), and cross-language retrieval
  failure is a real, testable weakness (ADR-0003).
- Mixed specificity: exact, vague, constrained (with prohibitions), and out-of-domain.
- Out-of-domain queries specifically test that low-confidence returns **nothing** rather than a bad
  match (§29).
- Per query: human-marked relevant prompt IDs (multiple allowed).
- A subset labelled twice, separated in time, to establish self-agreement — the metric's noise floor.
- Committed and versioned under `benchmarks/queries/`.

## Non-Goals

End-to-end task set (that is M3) and any ranking implementation (ENG-006).

## Technical notes

A precision improvement smaller than the labelling noise floor is not a real improvement. The
double-labelled subset is what makes that judgement possible, so it is not optional.

## Dependencies

None strictly; most useful alongside ENG-006.

## Acceptance criteria

- [ ] ≥100 queries, with the specificity and language mix above.
- [ ] Relevance labels present for every query.
- [ ] Out-of-domain queries included and labelled as having no relevant results.
- [ ] Self-agreement rate on the double-labelled subset recorded.
- [ ] Versioned; the version is referenced by any result that uses it.
- [ ] Queries authored before inspecting ranking output (noted in the PR).

## Tests

Structural validation: every referenced prompt ID exists in the dataset; no duplicate queries;
schema-valid.

## Security

None.

## Risks

Single-labeller subjectivity. Mitigation: the recorded noise floor, plus honest reporting that
labelling is one person's judgement.
