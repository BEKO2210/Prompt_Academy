# ENG-003 — CI: dataset validation, typecheck, lint, first tests

**Type:** Infrastructure
**Milestone:** M1
**Status:** READY
**Complexity:** M

## Problem

There are **no tests**, and CI runs only the deploy workflow (finding D4). `main` deploys straight to
production (finding D7). A corrupted dataset record or a broken build artifact would be published
without anything catching it. The Python validation scripts exist and work but are manual-only, and
the committed reports have rounded timestamps so they cannot prove current state (finding D5).

## Goal

CI that blocks a bad dataset or a broken build before it reaches the live site.

## Scope

- CI workflow (separate from deploy) running on pull requests and pushes to `main`:
  - `python scripts/validate_dataset.py`
  - `python scripts/dedupe_dataset.py`
  - `python scripts/compute_content_hashes.py --check` (ENG-004; fails on a stale manifest)
  - `python scripts/compute_content_hashes.py --self-test` (16 assertions, no dataset needed)
  - `tsc --noEmit` (typecheck, independent of the build)
  - `eslint .`
  - test suite
- **Pin the Node version** (finding D12): system Node v18 cannot build this repo (Vite 8 needs
  `>=20.19` or `>=22.12`). Add `.nvmrc` and/or an `engines` field so a fresh checkout fails loudly
  with a clear message rather than a confusing Vite error.
- Introduce a test runner in `site/` and the first tests:
  - dataset invariants (10 files, 1,000 records each, schema-conformant, unique ids/slugs/titles)
  - `build_site_data.mjs` output shape (index/meta/stats/category files present, expected fields)
- Make the deploy workflow depend on CI passing, so a red build cannot publish.
- Regenerate `reports/` from a real CI run with real timestamps, or mark the existing files as
  historical snapshots.

## Non-Goals

- Full test coverage (M6).
- Staging environment (M6, finding D7).
- Changing the dataset or the ranking.

## Technical notes

- Extend the existing workflow pattern in `.github/workflows/deploy.yml`; keep CI complexity
  proportionate (§57 — no massive CI without reason).
- Python scripts already exist and pass; this ticket wires them up, it does not rewrite them.
- Prefer a lightweight runner consistent with the existing Vite/TS stack (§79: no dependency without
  benefit).

## Dependencies

None.

## Acceptance criteria

- [ ] CI runs on PR and on push to `main`.
- [ ] **Proven**, not assumed: deliberately corrupt one record on a scratch branch and show CI fails;
      revert. Record the evidence in the PR.
- [ ] Deploy cannot run when CI is red.
- [ ] At least the listed dataset-invariant and build-output tests exist and pass.
- [ ] `tsc` and `eslint` run and pass on the current tree (or existing violations are recorded and
      explicitly accepted).
- [ ] `reports/` either regenerated with real timestamps or clearly marked historical.

## Tests

This ticket is largely about creating them. The tests listed under Scope are the deliverable, and
they must actually be executed — not merely written (§68).

## Security

Positive: closes threat T4 (dataset poisoning / silent corruption) for the CI path. Keep workflow
token scopes minimal, as the deploy workflow already does correctly.

## Risks

CI that is slow or flaky gets bypassed. Keep it fast and deterministic.
