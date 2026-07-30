# ENG-002 — Measure and commit performance baselines

**Type:** Measurement
**Milestone:** M1
**Status:** **DONE** (2026-07-30)
**Complexity:** S

## Result

- `reports/baseline-2026-07-30.json` — all metrics, with `not_measured` listing what was not covered
  and why
- `reports/baseline-method.md` — reproduction procedure and interpretation
- `scripts/baseline/` — the harness itself (zero deps; Node 22 + installed Chrome), re-run from the
  committed paths to confirm reproducibility

**Headline numbers:** Library time-to-first-rendered-result **294–360 ms**; JS heap **24.4 MB**;
`index.json` **6,908,069 B raw → 738,038 B gzip** as actually served; `JSON.parse` **p50 15.7 ms**;
keystroke→paint **p50 49.9 ms**.

**Three findings that changed the picture:**

1. **Finding D1 was mis-framed.** Transfer is ~738 KB, not 6.9 MB — GitHub Pages gzips at 9.36x. The
   real cost is parse (on the full 6.9 MB) and ~14 MB of heap, neither of which compression touches.
2. **Search cost is re-derivation, not matching.** `haystack()` is ~83% of filter time because it is
   rebuilt per record per keystroke. Precomputing it is available independently of ranking work.
   Keystroke→paint (~50 ms) is dominated by React re-render, ~7x the filter cost; there is no debounce.
3. **Multi-word and German queries return zero results.** `dashboard` → 3,391 hits, `accessible
   dashboard` → **0**. `barrierefrei`, `dunkelmodus` → **0**. These are correctness defects, not
   performance, and they define the R0 baseline ENG-006 must beat.

Also recorded: GitHub Pages serves **no brotli/zstd**; `Qualität.png` (1.49 MB, incompressible) is
~85% of landing transfer and drives its LCP; both pages make a runtime request to
**fonts.googleapis.com** (privacy-relevant given the shipped Datenschutz page); system Node v18
cannot build this repo and nothing pins the version.

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
