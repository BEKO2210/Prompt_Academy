# ENG-004 — Per-record `content_hash`

**Type:** Data
**Milestone:** M1
**Status:** READY
**Complexity:** XS

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
