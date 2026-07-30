# ENG-013 — Query vocabulary expansion

**Type:** Retrieval quality
**Milestone:** M2
**Status:** **DONE** (2026-07-30)
**Complexity:** S
**Report:** `reports/eng-013-vocabulary.md`

## Problem

The corpus is ~91% English; the UI is German. Measured on the dev split, cross-language
retrieval failed completely — not partially:

- `Preisseite` → **0** of 22 relevant records, while `pricing page` scored nDCG 1.00 on the
  same set.
- `barrierefrei` → **0**, while "accessible" matches thousands.
- `sign in screen` → **0**, because the string "sign in" occurs in **0** of 10,000 records.
  The corpus says "login".

ENG-012 fixed *how* terms match. It could not fix terms that are absent from the corpus.

## Goal

A German query reaches the English corpus, and English queries reach synonyms the corpus
actually uses, without loosening precision.

## Approach

`site/src/lib/vocabulary.ts` — ~90 hand-written entries, versioned. Expansion applies to the
**query**, never to the corpus; a term is satisfied by the user's own word OR any variant. A
variant hit is scored at `SYNONYM_SCORE_FACTOR = 0.6` so it cannot outrank a direct hit.

Hand-written rather than machine-translated or decompounded: the corpus needs roughly thirty
German compounds, and each entry must be defensible individually.

## Non-Goals

Embeddings (arm R7), general German decompounding, per-query tuning.

## Acceptance criteria

- [x] German dev queries return relevant records.
- [x] Measured on dev against a frozen ground truth; holdout untouched.
- [x] Not derived from `benchmarks/queries/query-expansions.json` — enforced by test.
- [x] Expansion cannot outrank the user's own word.
- [x] Tests cover leakage, expansion direction, over-expansion, and mirror drift.

## Result

nDCG@10 on dev: 0.332 (matching only) → 0.429 (+ ranking) → **0.755** (+ vocabulary).
`Preisseite` went from 0 to nDCG 1.00. Full numbers and caveats in the report.

## Caveats

Six dev queries; the direction is far larger than the uncertainty, the exact values are not.
`screen → form` was added after seeing Q004 fail — legitimate tuning on the tuning split, but
it is tuning, and the holdout remains the honest test. `account management` regressed at rank 1
and is not investigated. Unlisted compounds get nothing.

## Follow-ups

- Cross-language recall is now non-zero but thin (`sign in screen`: 2 records for 3 relevant).
- The 140 ms debounce puts keystroke→results at p50 174.7 ms. Whether that trade is right is a
  UX question no ticket currently owns.
