# ENG-006 — Isomorphic ranking module + central config

**Type:** Feature
**Milestone:** M2
**Status:** PLANNED
**Complexity:** L

## Problem

Retrieval is a binary substring test with five exact facet filters (current-state §4). There is no
scoring, no term weighting, no ranking. The `relevance` sort key does not compute relevance.

## Goal

Scored hybrid ranking, implemented once and shared by the browser and (later) the engine, with all
weights in one config and each weight justified by measurement.

## Scope

- Offline inverted index / BM25 artifact built in `build_site_data.mjs` (extends existing code).
- Ranking module: dependency-free, isomorphic — one implementation, two consumers (ADR-0003).
- Signals: BM25 over title/prompt/summary, facet match, tag overlap, keyword hit, tech-stack match,
  capability overlap (ENG-001), quality prior (deliberately low weight — finding D6),
  `w_history` defined but zero until telemetry exists.
- Single central config for all weights and thresholds: `MIN_RETRIEVAL_SCORE`, `MAX_SELECTED_SKILLS`,
  `REDUNDANCY_THRESHOLD` (§16, §73, §74). Every weight defaults to 0.
- MMR diversity selection.
- Below-threshold returns nothing and records `skill_gap` (§29).
- Explainability: per-result score breakdown (skill-engine §12).
- Ablation runner producing the R0–R6 table from `benchmark-plan.md`.

## Non-Goals

- Embeddings (arm R7 — only if R1–R6 leave measurable headroom; ADR-0003).
- Any backend or model call.
- The byte-budget fix (ENG-007) — separate ticket, but **must land together**.

## Technical notes

- Substring matching (R0) is the baseline to beat, not a fallback to keep.
- Weight tuning must use a held-out split; tuning and reporting on the same data invalidates results
  (`benchmark-plan.md` §6).
- Any signal that does not improve the metric gets weight 0 **and its code removed** (§47).

## Dependencies

ENG-001 (capabilities), ENG-002 (baseline), ENG-005 (labelled queries), ENG-007 (byte budget).

## Acceptance criteria

- [ ] precision@k measurably beats the R0 substring baseline on the held-out split, by more than the
      labelling noise floor from ENG-005.
- [ ] Search latency p50/p95 no worse than the ENG-002 baseline.
- [ ] Ablation table R0–R6 committed, **including negative results**; non-contributing signals
      removed rather than retained at low weight.
- [ ] All weights/thresholds in one config; no magic numbers scattered in code (§74).
- [ ] Ranking module has no browser-only or node-only dependencies (provably isomorphic).
- [ ] Explainability output available for any result.
- [ ] Below-threshold queries return no results rather than weak matches.

## Tests

- Unit: BM25 scoring against hand-computed fixtures.
- Unit: MMR reduces near-duplicate density in a fixture set.
- Unit: threshold behaviour returns empty rather than a poor match.
- Integration: ranking identical between a node run and a browser run on the same input.
- Regression: existing facet filtering behaviour unchanged.

## Security

None directly. Note that ranking on unvalidated `quality` scores (finding D6) would launder an
assumption into a signal — hence the deliberately low weight.

## Risks

- Could regress page performance; see ENG-007. If the regression cannot be recovered, ship behind a
  flag or not at all.
- Capability signal may prove useless if ENG-001's vocabulary is wrong — that is what arm R3 measures.
