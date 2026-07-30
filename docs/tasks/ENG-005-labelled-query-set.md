# ENG-005 — Labelled query set for the retrieval benchmark

**Type:** Measurement / Data
**Milestone:** M2
**Status:** READY
**Complexity:** M

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
