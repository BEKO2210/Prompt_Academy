# Retrieval ground truth — coverage report (ENG-005)

**Version:** `retrieval-ground-truth-v1` · **Frozen:** True · **Created:** 2026-07-30T15:32:08Z
**Dataset hash:** `7bb8bec4fda48bd9c6f3e6918130a1c5…`

## Scale

| | |
|---|---|
| Queries authored | 32 |
| Queries annotated | **12** |
| Judged query↔record pairs | **454** |
| Candidate pool (all 32 queries) | 1197 |

## Splits, languages, difficulty, types

- **Split:** {'dev': 6, 'holdout': 6}
- **Language:** {'en': 10, 'de': 2}
- **Difficulty:** {'medium': 5, 'hard': 5, 'easy': 2}
- **Type:** {'exact_lexical': 2, 'out_of_domain': 2, 'multi_word': 1, 'natural_language': 1, 'synonym_mismatch': 1, 'ambiguous': 1, 'narrow': 1, 'feature_composition': 1, 'german_exact': 1, 'german_multi_word': 1}

## Relevance distribution

| Grade | Meaning | Count | Share |
|---|---|---|---|
| 3 | highly relevant | 138 | 30.4% |
| 2 | relevant | 46 | 10.1% |
| 1 | partially relevant | 82 | 18.1% |
| 0 | not relevant | 188 | 41.4% |

## Per query

| Query | Split | Lang | Diff | Pool | 3 | 2 | 1 | 0 | Flags |
|---|---|---|---|---|---|---|---|---|---|
| `Q001` pricing page | dev | en | easy | 25 | 23 | 0 | 0 | 2 | many_relevant_by_design |
| `Q002` accessible dashboard | holdout | en | medium | 53 | 25 | 0 | 7 | 21 | many_relevant_by_design |
| `Q003` design a dashboard that works well | holdout | en | hard | 53 | 0 | 7 | 19 | 27 | — |
| `Q004` sign in screen | dev | en | medium | 56 | 1 | 1 | 1 | 53 | — |
| `Q009` account management | dev | en | medium | 54 | 21 | 7 | 9 | 17 | many_relevant_by_design |
| `Q019` heatmap visualization | dev | en | easy | 29 | 16 | 0 | 13 | 0 | many_relevant_by_design |
| `Q021` modal dialog with focus trap | holdout | en | medium | 33 | 0 | 18 | 15 | 0 | — |
| `Q024` data table with sorting and pagina | holdout | en | medium | 40 | 1 | 13 | 12 | 14 | — |
| `Q025` Preisseite | dev | de | hard | 23 | 20 | 0 | 2 | 1 | many_relevant_by_design |
| `Q026` barrierefreies Dashboard | holdout | de | hard | 51 | 31 | 0 | 4 | 16 | many_relevant_by_design |
| `Q031` Figma plugin panel | dev | en | hard | 15 | 0 | 0 | 0 | 15 | zero_relevant_verified |
| `Q032` Chrome browser extension popup | holdout | en | hard | 22 | 0 | 0 | 0 | 22 | zero_relevant_verified |

## Candidate pooling

Six independent recall sources; per-source cap **14**; shuffle seed base `20260730`.

| Source | Candidates contributed |
|---|---|
| `synonyms` | 448 |
| `any_term` | 410 |
| `facet` | 406 |
| `facet_and_synonym` | 381 |
| `all_terms` | 240 |
| `substring` | 57 |

