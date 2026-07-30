# ENG-006 — relevance ranking: before / after

**Date:** 2026-07-30 · **Ground truth:** `retrieval-ground-truth-v1.1` · **Split:** dev, holdout untouched.

## Result

| Method | P@1 | P@5 | R@10 | **nDCG@10** | MRR |
|---|---|---|---|---|---|
| `r0_substring` | 0.200 | 0.200 | 0.069 | 0.200 | 0.200 |
| `r1_and_terms` | 0.600 | 0.560 | 0.137 | 0.332 | 0.600 |
| `r2_token_boundary` | 0.600 | 0.560 | 0.137 | 0.332 | 0.600 |
| **`r3_ranked`** | 0.400 | 0.520 | **0.142** | **0.429** | 0.467 |

**nDCG@10 +29%** (0.332 → 0.429), the rank-weighted graded measure the benchmark plan commits to.
**P@1 drops** 0.600 → 0.400, and that is not hidden: it comes entirely from one query.

## What a user sees — `heatmap visualization`, top 5

| | Results |
|---|---|
| **before** | [1] Analytics Dashboard · [1] Analytics Dashboard · [1] Analytics Dashboard · [1] Monitoring Dashboard · [2] Monitoring Dashboard |
| **after** | **[3] Heatmap** · **[3] Heatmap** · **[3] Heatmap** · **[3] Heatmap** · **[3] Heatmap** |

nDCG for that query: 0.47 → **1.00**.

## Where it got worse

`account management`, nDCG 0.18 → 0.11, and the whole P@1 drop. It is the deliberately **ambiguous**
query, and its matched set contains only 16 records, none of them the admin dashboards graded 2–3.
Both methods fail it; ranking rearranges 16 mostly-irrelevant records. With five real dev queries,
one query flipping moves P@1 by 0.20 — the aggregate is fragile at this sample size.

## A measurement error found and corrected mid-flight

The first run showed ranking making everything **worse** (nDCG 0.248 → 0.224). That was wrong, and
the cause matters: `r3` surfaced five `heatmaps` records in its top 10 that **had never been pooled
and therefore never judged**. Under the pooled-evaluation convention, unjudged counts as
non-relevant — so the ranker was penalised precisely for finding relevant records the pool missed.

Fixed by standard practice: the compared systems' top-k entered the pool, 29 candidates were judged
under the unchanged guideline, and the ground truth went to **v1.1**. **No existing label was
changed.** Labels are never revised because a ranker scores badly against them.

## Ablation — seven of nine fields removed

Removing one weight at a time from the nine-field version:

| Field | Δ nDCG@10 | Verdict |
|---|---|---|
| `headline` | −0.0072 | carried weight |
| `keywords` | −0.0035 | carried weight |
| `title` | −0.0031 | carried weight |
| `subcategory`, `tags`, `framework`, `industry`, `audience` | 0.0000 | no effect |
| `summary` | **+0.0021** | **actively harmful** |

Then by combination:

| Configuration | nDCG@10 |
|---|---|
| no ranking | 0.3320 |
| title only | 0.3709 |
| all nine fields | 0.4217 |
| **title + subcategory** | **0.4294** ← shipped |

**Two fields beat nine.** The other seven were removed, not zeroed (§47). Note that `subcategory`
shows no effect under single-field ablation yet belongs to the best pair — the fields overlap, so
per-field deltas cannot be summed. The pair was chosen by measuring pairs.

## Cost — the budget is breached, stated plainly

| | Budget (ENG-002) | After ENG-006 |
|---|---|---|
| keystroke → paint p50 | 49.9 ms | **52.9 ms** (+6%) |
| keystroke → paint p95 | 50.6 ms | **83.6 ms** (+65%) |
| keystroke → results settled | not measured before | 54.9 / 83.4 ms |
| JS heap after load | 24.4 MB | 25.9 MB |

**This exceeds the budget I enforced against ENG-011**, and the difference in verdict needs stating:
ENG-011 was rejected because it bought *nothing*. This buys +29% nDCG and turns the flagship query
perfect. That is a trade, not a free win, and it is the user's call whether to accept it.

Three optimisation attempts moved p95 by nothing: hoisting `toLowerCase` out of the term loop,
replacing regex character tests with charCode comparisons, and typed-array sorting. The cost is
structural — scoring scales with the matched set, and short prefixes match thousands of records.

Two things did help:
- **`RANK_LIMIT = 2000`** bounds the work. No dev query matches more than 162, so it changes no
  measured result; it only caps mid-typing states.
- **A 140 ms debounce**, identified in the ENG-011 report as the highest-value latency measure and
  deferred then. It brought p50 66 → 53.

p95 remains driven by single-character prefixes (`d` matches all 10,000 records). Reducing that
needs an offline index (ADR-0003), which this ticket does not build.

## Caveats

- Five real dev queries. Directional. A single query flipping moves P@1 by 0.20.
- Weights were tuned on dev, which is what dev is for. **Holdout untouched.**
- nDCG improved while P@1 and MRR fell. Different metrics, genuinely disagreeing — reported rather
  than picking the flattering one.
