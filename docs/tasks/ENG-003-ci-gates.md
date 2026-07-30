# ENG-003 — CI: dataset validation, typecheck, lint, first tests

**Type:** Infrastructure
**Milestone:** M1
**Status:** **DONE** (2026-07-30)
**Complexity:** M

## Result

`.github/workflows/checks.yml` (reusable) + `deploy.yml` gains `checks → build → deploy`.
29 tests in `tests/*.test.mjs` on Node's built-in runner — **no test dependency added**.

### Why a reusable workflow rather than a separate one

The original scope said "CI workflow separate from deploy" *and* "make deploy depend on CI passing".
Those conflict: a separate workflow triggered by `push` runs **in parallel** with deploy and cannot
block it. Guaranteeing a red build cannot publish requires deploy to `needs:` the checks. So
`checks.yml` is `workflow_call` + `pull_request`, and `deploy.yml` invokes it — one definition, used
by both, with no copy to drift.

### Gate proven, not assumed

Seven corruption types injected into a real record, each reverted afterwards. Dataset confirmed
byte-exact after (`git diff` clean):

| Corruption | validate | tests | hash-check | Result |
|---|---|---|---|---|
| invalid enum value | ✗ | ✗ | ✗ | BLOCKED |
| duplicate id | ✗ | ✗ | ✗ | BLOCKED |
| missing required field | ✗ | ✗ | ✗ | BLOCKED |
| malformed JSON line | ✗ | ✗ | ✗ | BLOCKED |
| prompt too short | ✗ | ✗ | ✗ | BLOCKED |
| record count wrong | ✗ | ✗ | ✗ | BLOCKED |
| **new invalid slug** | **passed** | ✗ | **passed** | BLOCKED — *only* by the new tests |

The last row matters: `validate_dataset.py` checks slug **uniqueness only**, never the pattern, so the
new tests add coverage the existing tooling never had.

### Findings surfaced by doing this

- **10 slugs violate the schema's own pattern** (`&`, `/`, `+`, leading and double hyphens). They pass
  `validate_dataset.py` because it does not check the pattern — so the committed "Schema valid: YES"
  claim never covered slugs. Not routed today, so no live breakage. Allowlisted with a staleness test
  that forces the list to shrink; tracked as **ENG-009**.
- **5 eslint errors**, all pre-existing app code (4× `react-hooks/set-state-in-effect`,
  1× `react-refresh/only-export-components`). Downgraded to `warn` in one visible place rather than
  fixed: fixing means changing effect logic in five files in a repo that had no tests until this
  ticket. Verified that eslint still **fails on a new error** (probe file → exit 1). Tracked as
  **ENG-009**.
- **D5 fixed at the root:** `validate_dataset.py`, `dedupe_dataset.py` and `build_website_index.py`
  each wrote a *hardcoded* `2026-05-29T00:00:00Z`, so every report looked current no matter when it
  last ran. Now real UTC.
- **`website_index.json` is stale relative to its own generator** — re-running produces 2,894 changed
  lines of tag normalisation (`calm-Swiss-grid` → `calm-swiss-grid`, `navigation_bars` →
  `navigation-bars`, `velocity.js` → `velocityjs`). **Deliberately not regenerated here:**
  `velocity.js` → `velocityjs` is arguably a degradation, the file is consumed by nothing (verified),
  and a 2,894-line content change should not ride along in a CI commit. Recorded for a separate
  decision.
- **`__pycache__` was not gitignored.** Added.

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
  - `python scripts/derive_capabilities.py --check` (ENG-001; also catches a label-neutral rules edit via config_hash)
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
