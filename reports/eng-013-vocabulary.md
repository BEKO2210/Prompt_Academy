# ENG-013 — Query vocabulary expansion

**Measured:** 2026-07-30 · **Split:** dev (6 annotated queries) · **Ground truth:**
`retrieval-ground-truth-v1.1` · **Holdout: not touched.**

## The problem

The corpus is ~91% English. The UI is German. Two measured consequences:

| query | before |
|---|---|
| `Preisseite` | **0** of 22 relevant records — while the English `pricing page` scored nDCG 1.00 on the same set |
| `sign in screen` | **0** records — the corpus says "login"; the string "sign in" occurs in **0** of 10,000 records |
| `barrierefrei` | **0** records — while "accessible" matches thousands |

Better tokenisation cannot fix this. The words are not in the corpus.

## What was built

`site/src/lib/vocabulary.ts` — a hand-written table, ~90 entries, German→English plus
English synonyms the corpus does not use. Expansion applies to the **query**, never to the
corpus: a term matches when the user's own word **or** any variant matches. A synonym hit is
scored at `SYNONYM_SCORE_FACTOR = 0.6`, so an expansion never outranks a direct hit.

It is **not** derived from `benchmarks/queries/query-expansions.json`. That file is keyed by
query ID and exists to widen the annotation candidate pool; using it in the product would mean
the evaluation grades a table built from its own answer key. `tests/vocabulary.test.mjs`
enforces this.

## Result

Contributions are now separable, because `r3_ranked` was fixed to run **without** vocabulary
expansion — see "What went wrong" below.

| | r2 matching only | r3 + ranking (ENG-006) | r4 + vocabulary (ENG-013) |
|---|---|---|---|
| P@1 | 0.600 | 0.400 | **0.800** |
| P@5 | 0.560 | 0.520 | **0.760** |
| R@10 | 0.137 | 0.142 | **0.300** |
| nDCG@10 | 0.332 | 0.429 | **0.755** |
| MRR | 0.600 | 0.467 | **0.867** |

nDCG@10 more than doubled (0.332 → 0.755). Ranking contributed +0.097, vocabulary +0.326.

Per query (r4):

| query | lang | returned | relevant | P@1 | nDCG@10 |
|---|---|---|---|---|---|
| Q001 `pricing page` | en | 162 | 29 | 1.00 | 1.00 |
| Q004 `sign in screen` | en | 2 | 3 | 1.00 | 0.63 |
| Q009 `account management` | en | 16 | 41 | 0.00 | 0.15 |
| Q019 `heatmap visualization` | en | 58 | 41 | 1.00 | 1.00 |
| Q025 `Preisseite` | de | 254 | 22 | 1.00 | 1.00 |
| Q031 `Figma plugin panel` | en | 0 | 0 | — | — |

The out-of-domain query still correctly returns nothing.

Verified in the running app (cache disabled, debounce awaited): `Preisseite` 254,
`pricing page` 162, `warenkorb` 128, `zzzznomatch` 0 — matching the Python harness exactly.

## What went wrong, and what it cost

**Three measurements in this ticket were wrong before they were right.** Recorded because the
failure modes are reusable, not because the outcome was.

1. **The first measurement showed no effect at all.** `preisseite` — the exact word that
   motivated the ticket — was missing from the table. Nothing in the harness noticed; a table
   lookup that misses returns an empty list, which is indistinguishable from "expansion did not
   help". Now covered by the corpus-frequency and compound tests.

2. **`preisseite: [..., "page"]` returned 2,041 records.** The bare token "page" matches 1,955
   of 10,000. A compound is specific; expanding it to its generic head throws that specificity
   away. `tests/vocabulary.test.mjs` now fails on this class of entry — which immediately caught
   two more (`zielseite`, `landingpage`) that had shipped with the same defect.

3. **`r3_ranked` and `r4_ranked_vocab` were the same function.** `r3` had silently gained
   vocabulary expansion when `_ranked` was extended, and `r3` had been dropped from `METHODS`,
   so nothing exercised it. Any claim about ENG-013's contribution would have been unfounded.
   Fixed by threading a `vocab` flag; `r3` now measures 0.429, which matches the 0.4294 recorded
   in the `ranking.ts` ablation table from ENG-006 — independent confirmation the separation is
   correct.

## Honest caveats

- **Six dev queries.** These numbers carry real uncertainty. The direction (German queries go
  from unusable to working) is far larger than that uncertainty; the exact values are not.
- **`screen → [page, view, interface, form]` was added after seeing Q004 fail.** That is
  legitimate — dev is the tuning split — but it *is* tuning, and Q004 is one of the six queries
  the result is reported on. The holdout remains the only honest test of this table.
- **`sign in screen` returns 2 records for 3 relevant ones.** Recall is thin, not solved.
- **`account management` got worse at rank 1** (P@1 1.00 → 0.00) while its nDCG stayed flat.
  Not investigated. It is the weakest query in the set under every method.
- **An unlisted compound gets nothing.** German decompounding is not implemented; ~30 compounds
  are listed by hand. This is a known limitation, not an oversight.

## Latency — a correction

The previously reported **p50 33.3 ms / p95 33.4 ms was measured wrong** and must not be used.
That harness waited two animation frames (~32 ms) after a keystroke, but `Library.tsx` debounces
by 140 ms, so it read the state *before* the search ran. The same fault made every verification
query report 10,000 results, including `zzzznomatch`.

Measured with a harness that waits for the result set to actually change:

| | keystroke → results |
|---|---|
| p50 | **174.7 ms** |
| p95 | **179.6 ms** |

Of which 140 ms is the deliberate debounce. This is slower to first result than the 49.9 / 50.6 ms
ENG-002 baseline, which measured an undebounced app; the work per keystroke is lower, but the
user waits longer after they stop typing. Whether that trade is right is a UX question this
ticket does not settle.
