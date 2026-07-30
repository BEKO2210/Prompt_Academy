# ENG-002 — Measure and commit performance baselines

**Type:** Measurement
**Milestone:** M1
**Status:** READY
**Complexity:** S

## Problem

No performance baseline exists (current-state §11). Any later claim of "faster" or "better" is
unfalsifiable, and the measured 6.9 MB `index.json` (finding D1) constrains all retrieval work
without anyone knowing its actual runtime cost.

## Goal

Reproducible, committed baselines for the current live site, so M2 can prove it did not regress.

## Scope

Measure and record:
- `index.json` size: uncompressed (known: 6,908,075 bytes) **and** as transferred (compressed) — the
  compressed figure is currently `UNMEASURED`.
- Fetch + parse time for `index.json`.
- Library page load: TTI / time to first rendered results.
- Per-keystroke search latency at 10,000 records (p50, p95).
- JS heap after index load.
- Landing page load for comparison.

Commit as `reports/baseline-<date>.json` with a **real** timestamp (not rounded — finding D5), plus a
short `reports/baseline-method.md` describing exactly how to reproduce, including hardware and browser.

## Non-Goals

Optimizing anything. This ticket only measures.

## Technical notes

- Measure the deployed site and a local production build; record both.
- Record hardware and browser: numbers are machine-dependent and must be labelled as such.
- Search latency should be measured against a fixed set of queries so the measurement is repeatable.

## Dependencies

None. Start here.

## Acceptance criteria

- [ ] All listed metrics recorded with real values, or explicitly marked `UNMEASURED` with a reason.
- [ ] Method documented well enough for someone else to reproduce the numbers.
- [ ] Hardware/browser/build recorded.
- [ ] No invented or estimated numbers; every value traceable to an actual measurement run.

## Tests

Not applicable (measurement ticket). The method doc is the artifact that must be reviewable.

## Security

None.

## Risks

Under-specified method makes later comparison invalid. Mitigation: fixed query set, recorded
environment, both deployed and local figures.
