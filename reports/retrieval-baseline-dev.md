# Retrieval baseline — dev split

**Date:** 2026-07-30 · **Ground truth:** `retrieval-ground-truth-v1` (frozen)
**Split:** dev only — 6 queries. **The holdout was not measured** and must stay untouched until a
ranker is finished; measuring it during development would turn it into a tuning set.
**No new ranking was written for this.** Both methods are what the product did or does.

## Result

| Method | P@1 | P@5 | R@10 | nDCG@10 | MRR |
|---|---|---|---|---|---|
| `r0_substring` — pre-ENG-010 | 0.200 | 0.200 | 0.087 | 0.200 | 0.200 |
| `r1_and_terms` — **shipped today** | **0.400** | **0.280** | **0.113** | **0.248** | **0.467** |

**ENG-010 is independently confirmed.** The multi-word fix improves every metric — MRR more than
doubles. That is the first evidence for it from a source other than the change itself.

**And the absolute level is poor.** nDCG@10 of 0.248 and recall@10 of 0.113 mean the shipped search
fails most of these queries. One of five real queries works well.

Both methods correctly return **nothing** for the zero-result query (`Figma plugin panel`), so
thresholding is not the problem.

## Per query

| Query | Lang | Returned | Relevant | P@1 | nDCG@10 | Reading |
|---|---|---|---|---|---|---|
| `pricing page` | en | 165 | 23 | **1.00** | **1.00** | works — query vocabulary matches the data |
| `heatmap visualization` | en | 58 | 29 | 1.00 | 0.20 | first hit right, then degrades — **no ranking after the match** |
| `account management` | en | 16 | 37 | 0.00 | 0.04 | ambiguous query, essentially missed |
| `sign in screen` | en | **404** | 3 | 0.00 | 0.00 | returns a pile, the one right answer is not in it |
| `Preisseite` | **de** | **0** | 22 | 0.00 | 0.00 | **total cross-language failure** |
| `Figma plugin panel` | en | 0 | 0 | — | — | correct — nothing exists |

## Findings

### 1. A severe substring defect in the shipped search

`sign in screen` returns 404 records and none of them is the login form. The cause:

| Term | matches as substring | matches with word boundary |
|---|---|---|
| `sign` | **6,936 / 10,000** | **16** |
| `in` | **9,866 / 10,000** | 664 |
| `screen` | 500 | 344 |

`sign` matches 6,936 records because it is inside **de·sign·**. `in` matches almost everything —
*interface*, *engineering*, *including*. So the query is effectively
*design ∩ anything-containing-in ∩ screen*, and the user's actual intent never enters the ranking.

ENG-010 fixed the multi-word **AND** semantics but kept **substring** matching per term. For short
terms that is catastrophic. This is the same error class ENG-001 measured in the capability rules
(`form` inflated 176%, `graph` 586%) — now found in the shipped product.

**This is the highest-value fix available and it is small:** word-boundary matching per term, plus
stopword handling. It needs no ranking, no index, no embeddings.

### 2. Cross-language retrieval is not weak — it is zero

`Preisseite` returns **0 of 22** relevant records, in both methods. The relevant set is identical to
the English `pricing page`, which scores a perfect nDCG of 1.00. The delta is the whole metric.
No amount of lexical tuning closes this; it needs translation or embeddings (ablation arm R7).

### 3. Matching without ranking converts "nothing" into "noise"

`heatmap visualization`: P@1 = 1.00, P@5 = 0.20. The first result is right by luck of ordering;
after that, quality collapses. `sign in screen` went from 0 results (r0) to 404 (r1) with P@1 still
0. Recall improved, usefulness did not.

This is the concrete argument for ENG-006 that did not exist before this measurement.

### 4. The easy query flatters the average

`pricing page` scores a perfect 1.00 and pulls the mean up. Excluding it, nDCG@10 across the
remaining four real queries is ~0.06. Report the per-query table, not just the aggregate.

## Caveats

- **6 dev queries.** Far too few for tight confidence intervals. These are directional.
- **Pooled evaluation:** unjudged records count as non-relevant. A method that surfaces a genuinely
  relevant record nobody pooled is penalised. Pool depth is recorded per query.
- **Single annotator** — see `RELEVANCE-GUIDELINE.md` §10.
- **Recall@10 is capped by construction** where a query has more than 10 relevant records
  (`pricing page` has 23, so recall@10 cannot exceed 0.43).

## What this justifies next

1. **Word-boundary + stopword fix** in `site/src/lib/search.ts`. Small, no ranking, and it addresses
   the single worst measured defect. Re-measure on dev.
2. **Then** ranking (ENG-006), with this table as the baseline to beat.
3. Cross-language stays open and is the strongest concrete case for testing embeddings rather than
   assuming lexical retrieval suffices.
