# ENG-012 — token-boundary matching: before / after

**Date:** 2026-07-30 · **Ground truth:** `retrieval-ground-truth-v1` · **Split:** dev only
**Holdout untouched.** Lexical matching only — no ranking, no synonyms, no translation, no embeddings.

## Retrieval metrics (dev, 6 queries)

| Method | P@1 | P@5 | R@10 | nDCG@10 | MRR |
|---|---|---|---|---|---|
| `r0_substring` (pre-ENG-010) | 0.200 | 0.200 | 0.087 | 0.200 | 0.200 |
| `r1_and_terms` (ENG-010) | 0.400 | 0.280 | 0.113 | 0.248 | 0.467 |
| **`r2_token_boundary` (ENG-012)** | **0.400** | **0.280** | **0.113** | **0.248** | **0.467** |

**The ranking metrics did not move.** Stated plainly rather than buried: ENG-012 changes *which*
records match, and on these six queries the relevant records were not in the top-k either way. P@k
and nDCG cannot see the change.

What did move is the size and quality of the candidate set.

## Per query

| Query | r1 returned | **r2 returned** | Relevant found | Note |
|---|---|---|---|---|
| `pricing page` | 165 | **162** | same | 3 substring artefacts removed |
| `sign in screen` | **404** | **0** | 0 → 0 | 404 wrong results eliminated |
| `account management` | 16 | 16 | same | unchanged |
| `heatmap visualization` | 58 | 58 | same | unchanged |
| `Preisseite` | 0 | 0 | 0 | cross-language, out of scope |
| `Figma plugin panel` | 0 | 0 | — | correct, nothing exists |

**Total candidates returned across dev: 643 → 236 (−63%), with no relevant record lost.**

## The substring collisions that are now gone

| Term | substring (r1) | **boundary (r2)** | What it was matching |
|---|---|---|---|
| `sign` | **6,936** | **129** | de·**sign** |
| `in` | 9,866 | 7,426* | **in**terface, eng**in**eering |
| `form` | 7,679 | **502** | plat**form**, in**form**ation, per**form**ance |
| `graph` | 3,617 | **265** | photo**graph**, info**graph**ic |
| `react` | 4,684 | **4,552** | **P**react — a different framework |

\* `in` is still enforced when it is the *only* token in a query, otherwise the query would match
everything. As part of a larger query it is soft — see below.

Two count changes that look like losses and are not:

- `authentication form` 1 → 0. The single old hit was *API Integration Workshop*, matching `form`
  inside plat**form**.
- `react` lost 132 records, all of them **Preact**.

## Verified in the running application

| Query | Shown |
|---|---|
| `sign` | **129** (was 6,936) |
| `sign in screen` | **0** (was 404) |
| `dashboard for a team` | **386** |
| `pricing page` | 162 · `dashboard` 3,391 · `accessible dashboard` 100 · `zzzznomatch` 0 |

## Performance — no regression

| | ENG-002 baseline | After ENG-012 |
|---|---|---|
| keystroke → paint p50 | 49.9 ms | **49.8 ms** |
| keystroke → paint p95 | 50.6 ms | **50.5 ms** |
| Time to first result | 294–360 ms | 308–329 ms |
| JS heap after load | 24.4 MB | 24.3 MB |

Regex matching costs nothing measurable against substring matching, for the reason ENG-011
established: React re-render dominates the interaction, so filter-side cost is invisible.

## The stopword decision, made on evidence

The brief required the low-information component to justify itself separately. Measured by isolating
boundary-matching alone:

| Query | boundary only | + phrases/low-info |
|---|---|---|
| `sign in screen` | 14 | **0** |
| all other dev queries | identical | identical |
| **dev total returned** | 250 | 236 (−6%) |

On the dev set alone the component is **not** justified: it removes 14 candidates on one query.

But the dev set contains no natural-language phrasing, and that is where it earns its place:

| Query | boundary only | + low-info | Reference (function words removed by hand) |
|---|---|---|---|
| `dashboard for a team` | **200** | **386** | 386 |
| `chart for analytics` | **355** | **420** | 420 |
| `form with validation` | 2 | 2 | 2 |
| `landing page for a startup` | 64 | 64 | 64 |

Boundary-only loses **48%** of correct records for `dashboard for a team`, because it enforces `for`
as a hard AND condition. The low-information set prevents that.

**Decision: keep both components.** Word boundaries do the heavy lifting (404 → 14 on the worst
query); the low-information set prevents a 15–48% recall loss on natural-language phrasing that the
dev queries happen not to exercise. The evidence for the second part comes from outside the dev set
and is labelled as such.

The phrase list exists for one reason: `in` is low-information alone but meaningful in `sign in`.
Without it, the phrase would be dismantled by its own optimisation.

## What ENG-012 could not fix, and why

The brief listed as a mandatory regression: *"sign in screen" must be able to find real login
records*. **It cannot, and no amount of token work would achieve it.**

`sign in` appears in **zero** of 10,000 records. The target record (PRM-001302) says *"login form
with social auth"*. Bridging that needs a synonym map `sign in → login`, which this ticket
deliberately excludes. ENG-012's honest achievement on that query is **404 wrong answers → 0
answers**, which is a better failure but still a failure.

That gap belongs to ranking/expansion work (ENG-006, arm R7), alongside the cross-language failure
(`Preisseite` → 0 of 22).

## Caveats

- Six dev queries. Directional, not tight.
- The unchanged headline metrics are the honest result; the gain is in candidate-set precision,
  which these metrics do not measure. A ranking metric was never going to show it.
- `design` measures 66.5% frequency and clears the low-information threshold, but is deliberately
  **excluded** — it is a content word a user may genuinely search (`design system`). Frequency alone
  is not sufficient grounds for discarding a term.
