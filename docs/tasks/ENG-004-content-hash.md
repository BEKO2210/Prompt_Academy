# ENG-004 — Per-record `content_hash`

**Type:** Data
**Milestone:** M1
**Status:** **DONE** (2026-07-30)
**Complexity:** XS

## Result

`scripts/compute_content_hashes.py` → `reports/content_hashes.json` (861,348 B, **not** shipped to
the browser). Runs in 0.39 s over 10,000 records. Three modes: default (write), `--check` (CI, fails
on a stale manifest with the changed ids listed), `--self-test` (verifies the hash's own properties
without needing the dataset).

**Measured:** 10,000 records, **10,000 distinct hashes**, 0 identical-content groups.

### Where it is stored, and why not elsewhere

- **Not in `site/public/data/`** — everything there ships to the browser, and `index.json` is already
  6,908,069 B (D1). None of the hash's consumers (change detection, import idempotency, cache keys,
  benchmark provenance) run in the browser.
- **Not in `data/*.jsonl`** — the hash is derived from those files. Storing it beside its own inputs
  invites the stale-hash bug, and would add churn to every dataset diff.
- **In `reports/`** — matches the existing convention (`validate_dataset.py`, `dedupe_dataset.py`
  already write there).

### Normalization (fixed; changing it requires an `ALGO_VERSION` bump)

- dict keys **sorted** — JSON key order must not affect the hash
- list order **preserved** — `acceptance_criteria` order is meaningful
- strings: CRLF/CR → LF, outer whitespace stripped, internal whitespace runs collapsed to one space
- canonical JSON: `sort_keys=True, ensure_ascii=False, separators=(',',':')`

**Hashed:** category, subcategory, title, language, difficulty, audience, use_case, industry, style,
tech_stack, prompt, negative_prompt, acceptance_criteria.

**Excluded, deliberately:** `id`/`slug` (identity, not content — a rename is not a content change);
`version` (would make the hash circular once versioning consumes it); `quality.*` (self-reported and
unvalidated per D6 — a rescore is not a content change); `website_card.*` (presentation, derived);
`tags`, `created_by_agent`, `batch` (metadata).

`ALGO_VERSION` is recorded in the manifest, and `--check` treats a version change as "all hashes
regenerated", not "content changed" — otherwise a normalization tweak would look like 10,000 edits.

## Verification performed

| Criterion | Evidence |
|---|---|
| Stable across repeated builds | Two full runs → byte-identical manifest (sha256 compared) |
| Changes when content changes | Appended one character to `PRM-000001.prompt` in the real dataset → `--check` exited 1 and named `PRM-000001`; dataset restored byte-exact (`git diff` clean) |
| Normalization documented | Above, and in the script docstring |
| Does not increase browser-shipped index | `npm run build` before/after: `index.json` **6,908,069 → 6,908,069, sha256 identical**; `dist` total **33,910,949 → 33,910,949**; `content_hashes.json` absent from `dist/` |
| Hash properties | `--self-test`: **16/16 passed** — determinism, key-order invariance, whitespace normalization, content sensitivity, list-order sensitivity, nested-field sensitivity, and non-effect of all six excluded fields |

## Problem

Records carry a static `version: "1.0.0"` with no change-detection mechanism (ADR-0007). Nothing can
answer "did this record change?" without a full diff, and future caching, idempotent import, and
benchmark traceability all need a stable per-record identity.

## Goal

A `content_hash` per record, computed deterministically at build time.

## Scope

- sha256 over a normalized projection of the content-bearing fields (`prompt`, `negative_prompt`,
  `acceptance_criteria`, `title`, `style`, `tech_stack` — exclude volatile/derived metadata).
- Normalization documented precisely, so the hash is reproducible.
- Emitted into build artifacts; decide explicitly whether it also lands in `data/*.jsonl` (ADR-0007
  stage 1 favours the artifact, given finding D1's byte pressure).

## Non-Goals

Full version history (`parent_version`, `change_reason`, `status`) — ADR-0007 stage 2, deferred until
records actually change.

## Technical notes

- Field order and whitespace normalization must be fixed, or the hash will churn spuriously.
- Cheap now, expensive to retrofit once caches and benchmark records reference record identity.

## Dependencies

None.

## Acceptance criteria

- [ ] Hash is stable across repeated builds of unchanged input (verified by running the build twice).
- [ ] Hash changes when any content-bearing field changes (verified with a fixture).
- [ ] Normalization rules documented.
- [ ] Does not increase the browser-shipped index size, or the increase is measured and justified
      against the ENG-002 baseline.

## Tests

- Determinism: same input → same hash, across two builds.
- Sensitivity: mutate one character in `prompt` → hash changes.
- Insensitivity: reorder JSON keys → hash unchanged.

## Security

Minor positive: enables integrity checking and later idempotent import (threat T3/T4).

## Risks

None significant. Getting normalization wrong causes noisy hashes; the determinism test catches it.
