# ENG-001 — Capability vocabulary + subcategory mapping

**Type:** Architecture / Data
**Milestone:** M1
**Status:** READY
**Complexity:** M

## Problem

Nothing in the dataset expresses "this prompt provides authentication" in machine-readable form
(finding D2). `tags`, `subcategory` and `use_case` are presentation-oriented and were never designed
as a controlled vocabulary. Capability-based routing — the core mechanism of the target architecture —
has no field to route on.

## Goal

A versioned, controlled capability vocabulary, and a deterministic mapping that populates
`capabilities[]` for the large majority of the 10,000 records without model calls.

## Scope

- `schema/capabilities.vocabulary.json` — closed, versioned, hierarchical dotted namespaces
  (e.g. `auth.email_password`, `ui.responsive`, `a11y.keyboard_nav`, `payments.subscriptions`).
- `schema/capabilities.mapping.json` — subcategory (200 measured values) → capability set.
  Hand-authored, reviewed, diffable.
- Rule layer for capabilities not implied by subcategory (accessibility, i18n, responsive), derived
  from `tags` / `acceptance_criteria` text.
- Build-step population of `capabilities[]` (additive; see ADR-0002).
- Coverage report: how many records got capabilities, from which source, and what remains.

## Non-Goals

- Model-based labelling of the full corpus (see ADR-0002: rejected as primary method).
- Dependencies / incompatibilities / permissions (not adopted; ADR-0002).
- Using capabilities in ranking — that is ENG-006.

## Technical notes

- 200 subcategories is small enough to review by hand and is the highest-leverage artifact here:
  200 reviewed rows replace 10,000 inference calls and stay auditable.
- Vocabulary is versioned from the first commit, because later changes imply relabelling.
- Model assistance is acceptable **only** for the residual, and only with a measured agreement rate
  against a human-labelled sample. Unverified labels silently corrupt ranking (ADR-0002).

## Dependencies

None. (ENG-004 is independent but naturally batched.)

## Acceptance criteria

- [ ] Vocabulary file exists, is versioned, and every term is documented with its meaning.
- [ ] Mapping covers all 200 measured subcategories.
- [ ] ≥95% of the 10,000 records receive ≥1 capability via the deterministic path; the residual is
      listed and explained.
- [ ] A human-labelled sample (≥50 records) is compared against the generated labels and the
      agreement rate is recorded in the coverage report.
- [ ] All 10,000 records still validate against the schema; the site still builds.
- [ ] No existing field modified or removed.

## Tests

- Vocabulary file is valid JSON and self-consistent (no undefined parents, no duplicates).
- Every mapping value is a term that exists in the vocabulary.
- Coverage assertion: capability population rate does not regress below the recorded threshold.
- Dataset still passes `validate_dataset.py`.

## Security

None directly. Note that a wrong vocabulary produces plausible-looking but useless routing — a
correctness risk, not a security one. Measured by ablation arm R3 (`benchmark-plan.md`).

## Risks

Vocabulary design is the least reversible item in M1. Mitigation: version it, keep the mapping table
as the single point of change, and validate the capability signal empirically in M2 before relying on it.
