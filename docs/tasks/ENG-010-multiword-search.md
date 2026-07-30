# ENG-010 — Multi-word search returns nothing (D3)

**Type:** Correctness / Bug
**Milestone:** M1 (out of band — user-visible defect, independent of H1)
**Status:** **DONE** (2026-07-30)
**Complexity:** S

## Result

`site/src/lib/search.ts` — `queryTerms()` + `matchesTerms()`, extracted from `Library.tsx` so the
matching contract is testable without a DOM. `Library.tsx` now calls `matchesTerms(it, terms)` with
`terms` memoised on the query. Still a boolean filter; no ranking introduced.

**Verified in the running application** via CDP, not only in tests:

| Query | Cards rendered | Count shown |
|---|---|---|
| `accessible dashboard` | 48 (of 100) | **100** |
| `react pricing table` | **21** | **21** |
| `dashboard` | 48 | **3.391** *(unchanged)* |
| `zzzznomatch` | 0 | 0 |
| `dashboard zzzznomatch` | 0 | 0 |
| `stripe checkout` | 0 | 0 *(dataset gap, correct)* |
| `barrierefrei` | 0 | 0 *(language gap, correct)* |

**Performance held** (baseline in `reports/baseline-2026-07-30.json`):

| | Baseline | After | |
|---|---|---|---|
| keystroke→paint p50 | 49.9 ms | **49.9 ms** | identical |
| keystroke→paint p95 | 50.6 ms | 51.3 ms | +0.7 ms, inside the ~10–15% noise floor |
| time to first result | 294–360 ms | 294–349 ms | within range |
| JS heap | 24.4 MB | 24.2–24.3 MB | same or slightly better |
| JS bundle | 528,998 B | 529,202 B | **+204 B** |
| filter-only p50 | 6.97 ms *(legacy predicate)* | 7.94 ms *(AND-terms)* | +0.15 ms vs. legacy re-measured on the same machine (7.79 ms) — noise |

**A false negative worth recording.** The first UI verification showed the fix *not* working. Cause:
`Cache-Control: max-age=600` (measured in ENG-002) meant the browser served the previous
`index.html`, which points at the previous content-hashed bundle. The verification harness now
disables cache. Tests alone would not have caught this, and the tests alone were green — which is
precisely why the app was checked.

**Measurement instrument updated.** `scripts/baseline/measure_parse_and_search.mjs` mirrored the old
single-substring predicate and would otherwise have kept measuring behaviour the app no longer has. It
now mirrors the AND-terms predicate and additionally reports the legacy one, labelled, so before/after
figures stay comparable on the same machine.

44 tests green (`cd site && npm run ci`) — 29 from ENG-003 plus 15 new in `tests/search.test.mjs`,
which assert the exact counts above plus a structural guard against the mirrored predicate drifting
from the TypeScript source.

## Problem

Library search returns an **empty result set** for ordinary two-word queries.

`Library.tsx:76` runs one substring test against a single joined string:

```ts
if (q && !haystack(it).includes(q)) return false;
```

So a multi-word query matches only if those words appear **adjacently, in that exact order**, in the
concatenation of title, headline, summary, framework, industry, subcategory, audience, tags and
keywords. Nothing about that ordering is meaningful to a user typing two words.

Measured (2026-07-30, `site/public/data/index.json`):

| Query | Hits today |
|---|---|
| `dashboard` | 3,391 |
| `accessible dashboard` | **0** |
| `react pricing table` | **0** |
| `ecommerce product page` | **0** |

Both terms of `accessible dashboard` exist in the corpus — `accessible` in 460 records, `dashboard`
in 3,391. The words are there; the matching is wrong.

## Goal

A multi-word query returns records containing **all** of its terms. Nothing else changes.

## Scope

Change the text-matching predicate in `Library.tsx` from one substring test to
**all-terms-must-be-present** (AND semantics) over the same haystack.

- Split the trimmed, lowercased query on whitespace.
- A record matches if **every** term is a substring of its haystack.
- Empty query → unchanged (no text filter).
- Single term → behaviour identical to today.
- Facet filters, sort, and paging unchanged.

## Non-Goals — important, this ticket is narrow

- **No ranking.** Term frequency, field weighting, BM25 and scoring are ENG-006. This ticket keeps
  search a boolean filter and only fixes which records pass it.
- **No performance work.** `haystack()` is still rebuilt per record per keystroke. That is **ENG-011**
  and is deliberately a separate change so correctness and performance are measured apart.
- **No cross-language matching.** German queries against a ~91% English corpus stay at 0 hits and
  **this ticket does not claim to fix that** — see the honesty note below.
- **No quoted-phrase syntax.** `"exact phrase"` support is a feature, not a defect fix. Note it and
  move on.
- **No incidental cleanup.** ENG-009's debt stays untouched.

## Honesty note: three different causes produced the same symptom

The ENG-002 baseline listed three zero-hit queries together, implying one cause. Measurement shows
three:

| Query | Cause | Fixed by this ticket? |
|---|---|---|
| `accessible dashboard` | **matching bug** — both terms present in corpus | **yes** |
| `stripe checkout` | **dataset gap** — `stripe` appears in **0** records | no |
| `barrierefrei` | **language gap** — term absent from a ~91% English corpus | no |

Only the first is a bug. `stripe checkout` returning nothing after this fix is **correct behaviour**
over a corpus with no Stripe content — that is a skill-gap signal for the dataset, not a search
defect. `reports/baseline-2026-07-30.json` is corrected accordingly.

## Measured expected effect

Measured before implementing, so the acceptance criteria are grounded rather than hoped for:

| Query | Now | With AND-terms |
|---|---|---|
| `accessible dashboard` | 0 | **100** |
| `ecommerce product page` | 0 | **330** |
| `react pricing table` | 0 | **21** |
| `mobile onboarding flow` | 0 | **57** |
| `animated hero section` | 0 | **5** |
| `responsive navbar` | 0 | **2** |
| `authentication form` | 0 | **1** |
| `file upload component` | 0 | **3** |
| `data visualization chart` | 50 | 451 |
| `saas analytics dashboard` | 1 | 97 |
| `dark mode toggle` | 2 | 5 |
| `dashboard` | 3,391 | 3,391 *(unchanged)* |
| `react` | 4,684 | 4,684 *(unchanged)* |
| `pricing` | 231 | 231 *(unchanged)* |
| `stripe checkout` | 0 | 0 *(dataset gap)* |
| `barrierefrei` | 0 | 0 *(language gap)* |
| `zzzznomatch` | 0 | 0 *(correct miss)* |
| `dashboard zzzznomatch` | 0 | 0 *(correct miss)* |

8 of 12 multi-word queries go from zero to non-zero. Every single-term query is unchanged. The
guaranteed-miss property survives: adding an impossible term to a matching query still yields 0.

Note that some queries get **wider**, not just non-zero (`data visualization chart` 50 → 451). That is
the expected consequence of dropping an accidental adjacency constraint, and it is exactly why
ranking matters — but ranking is ENG-006, and a wide unranked result set is still strictly better than
an empty one.

## Dependencies

None. The test suite and baselines from ENG-002/ENG-003 exist to make this change verifiable.

## Acceptance criteria

- [ ] `accessible dashboard` returns **100** records; `ecommerce product page` returns **330**;
      `react pricing table` returns **21** (exact figures from the table above)
- [ ] `dashboard` → **3,391**, `react` → **4,684**, `pricing` → **231** — single-term behaviour
      **unchanged**
- [ ] `zzzznomatch` → 0 and `dashboard zzzznomatch` → 0 — AND semantics preserves guaranteed misses
- [ ] Empty query returns all 10,000 (subject to facets)
- [ ] Facet filtering, sort modes and paging behave identically
- [ ] `cd site && npm run ci` green (typecheck, lint, data, 29+ tests)
- [ ] Tests added asserting the query-matching contract, including the unchanged single-term cases
      and the guaranteed-miss cases
- [ ] Keystroke→paint latency **not worse** than the ENG-002 baseline (p95 ≤ 50.6 ms), measured with
      `scripts/baseline/measure_keystroke_latency.mjs`. This ticket is not a performance ticket, but
      it must not regress performance.

## Tests

- Query matching is exercised through a pure, exported predicate so it is testable without a DOM.
- Fixture-level: multi-term AND, single term, empty query, term order irrelevance
  (`dashboard accessible` == `accessible dashboard`), guaranteed miss, extra whitespace.
- Corpus-level: the exact counts in the acceptance criteria, asserted against the real index.

## Risks

- Result sets widen for some queries. Without ranking, the most relevant record may not be near the
  top. **Accepted:** a wide result set is better than an empty one, and ranking is the next ticket.
  Recorded so it is not mistaken for a regression.
- Extracting the predicate for testability touches `Library.tsx`, which also carries an ENG-009
  eslint warning at line 89. **Do not fix that here** — separate ticket, separate risk.
