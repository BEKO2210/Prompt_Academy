/**
 * Relevance scoring for the Library explorer (ENG-006).
 *
 * Matching (search.ts) decides WHICH records qualify. This decides IN WHICH
 * ORDER they are shown — which the measured baseline showed is where the real
 * failure was: "heatmap visualization" scored P@1 1.00 but P@5 0.20, because
 * after the first accidental hit the order was arbitrary index order.
 *
 * Design constraints carried from ADR-0003:
 *   - every weight lives in ONE place, here
 *   - no vector database, no embeddings, no per-record precomputation
 *     (ENG-011 measured that precomputation costs ~10 MB heap for no gain)
 *   - only MATCHED records are scored, so cost scales with result count,
 *     not with the 10,000-record corpus
 */
import type { IndexItem } from "./data";
import type { ParsedQuery } from "./search";
import { SYNONYM_SCORE_FACTOR } from "./vocabulary";

export const RANKING_VERSION = "1.0.0";

/**
 * Ranking is bounded: at most this many matched records are scored and sorted.
 * Anything beyond keeps its incoming order and is appended.
 *
 * Why a cap exists at all. Scoring cost scales with the matched set, and the
 * expensive cases are transient TYPING states — "d" matches all 10,000 records,
 * "dash" matches 3,391 — not queries anyone submits. Without a bound, keystroke
 * latency ran 66/83 ms against a measured 49.9/50.6 ms budget.
 *
 * Why this value is safe. Every query in the dev evaluation matches far fewer
 * than this (largest: 162), so the cap changes no measured result. It only
 * bounds the mid-typing states, where the ordering of records 2,000+ is
 * invisible to a user looking at 48 cards.
 *
 * If a future query legitimately needs deeper ranking, this is the number to
 * revisit — with a latency measurement, not by intuition.
 */
export const RANK_LIMIT = 2000;

/**
 * Field weights — every one justified by the dev-split ablation below.
 */
export const WEIGHTS = {
  title: 10,
  subcategory: 8,
} as const;

/**
 * Seven further fields were implemented, measured on the dev split, and then
 * REMOVED — not set to zero, removed, per master prompt §47.
 *
 *   nDCG@10   configuration
 *   0.3320    no ranking at all (the baseline this had to beat)
 *   0.3709    title only
 *   0.4217    all nine fields
 *   0.4294    title + subcategory        <- shipped
 *
 * Per-field ablation, measured by deleting one weight at a time from the
 * nine-field version:
 *   title -0.0031, headline -0.0072, keywords -0.0035   (carried their weight)
 *   subcategory, tags, framework, industry, audience     0.0000 (no effect)
 *   summary +0.0021                                      (actively harmful)
 *
 * Two fields beat nine. The extra seven cost roughly 4x the scoring work per
 * keystroke and bought nothing measurable. Note that `subcategory` shows no
 * effect when removed from the nine-field set yet is part of the best pair —
 * the fields overlap, so single-field ablation cannot be read as an
 * independent contribution. The combination was chosen by measuring
 * combinations, not by summing deltas.
 *
 * Caveat: five real dev queries. Differences under ~0.01 are noise; the
 * decision this supports is "seven fields buy nothing", not "0.4294 is optimal".
 */

/** A whole-token hit is worth more than a prefix hit ("nav" inside "navbar"). */
export const EXACT_TOKEN_BONUS = 1.0;
export const PREFIX_ONLY_FACTOR = 0.55;

/** All query terms appearing in the title is a strong signal of aboutness. */
export const FULL_COVERAGE_TITLE_BONUS = 12;

/** A matched multi-word phrase is stronger evidence than its parts. */
export const PHRASE_BONUS = 8;

/**
 * Diminishing returns on repetition, so a record does not win by repeating a
 * word. Roughly BM25's saturation without the corpus statistics, which would
 * require an offline index this ticket does not build.
 */
function saturate(hits: number): number {
  return hits === 0 ? 0 : 1 + Math.log(hits);
}

/**
 * Is the character at `i` alphanumeric?
 *
 * charCode comparison rather than a regex: this runs several times per field
 * per term per matched record, and `/[a-z0-9]/.test()` in that loop was
 * measured at ~30 ms of p95 keystroke latency on a corpus-wide query.
 */
function isWordChar(s: string, i: number): boolean {
  if (i < 0 || i >= s.length) return false;
  const c = s.charCodeAt(i);
  return (c >= 97 && c <= 122) || (c >= 48 && c <= 57); // a-z, 0-9 (already lower-cased)
}

/** `lower` must already be lower-cased — see the note in scoreRecord. */
function fieldScore(lower: string, term: string): number {
  if (!lower) return 0;
  // Boundary-anchored, mirroring search.ts. Counted, not just tested.
  let hits = 0;
  let exact = false;
  let i = 0;
  for (;;) {
    const at = lower.indexOf(term, i);
    if (at === -1) break;
    if (!isWordChar(lower, at - 1)) {
      hits++;
      if (!isWordChar(lower, at + term.length)) exact = true;
    }
    i = at + 1;
  }
  if (hits === 0) return 0;
  return saturate(hits) * (exact ? EXACT_TOKEN_BONUS : PREFIX_ONLY_FACTOR);
}

/**
 * Score a record that has already passed matching.
 *
 * Returns 0 for an empty query so the caller can keep the unfiltered order
 * stable rather than shuffling the whole library.
 */
export function scoreRecord(it: IndexItem, parsed: ParsedQuery, terms: string[]): number {
  if (parsed.empty || terms.length === 0) return 0;

  // Lower-case each field ONCE per record, not once per term. Doing it inside
  // the term loop allocated 9 strings per term per record and cost ~30 ms at
  // p95 on a query matching the whole corpus.
  // Only two fields are scored. Keeping this to the minimum is what brought
  // keystroke latency back inside the ENG-002 budget: nine fields meant nine
  // string allocations per record per keystroke, ~90,000 of them on a query
  // that matches the whole corpus.
  const lowerTitle = (it.t ?? "").toLowerCase();
  const lowerSub = (it.sc ?? "").replace(/_/g, " ").toLowerCase();

  let score = 0;
  for (const c of parsed.conditions) {
    // The user's own word counts fully; a vocabulary variant counts less, so a
    // synonym hit never outranks a direct one (ENG-013).
    score += WEIGHTS.title * fieldScore(lowerTitle, c.term);
    score += WEIGHTS.subcategory * fieldScore(lowerSub, c.term);
    for (const v of c.variants) {
      score += SYNONYM_SCORE_FACTOR * WEIGHTS.title * fieldScore(lowerTitle, v);
      score += SYNONYM_SCORE_FACTOR * WEIGHTS.subcategory * fieldScore(lowerSub, v);
    }
  }

  // Aboutness: every query term present in the title.
  const allInTitle = terms.every((t) => {
    const at = lowerTitle.indexOf(t);
    return at !== -1 && !isWordChar(lowerTitle, at - 1);
  });
  if (allInTitle) score += FULL_COVERAGE_TITLE_BONUS;

  // Phrases already had to match for the record to be here; reward them so a
  // record containing the phrase outranks one that merely contains the words.
  score += parsed.phrases.length * PHRASE_BONUS;

  return score;
}

/**
 * Sort a matched set by descending score. Ties keep their incoming order.
 *
 * Scores go into a Float64Array and an index array is sorted, rather than
 * building one wrapper object per record. On a query that matches the whole
 * corpus the object-allocating version cost noticeably more than the scoring
 * itself — the sort, not the scoring, was the hot path.
 */
export function rankResults(
  items: IndexItem[],
  parsed: ParsedQuery,
  terms: string[],
): IndexItem[] {
  if (parsed.empty || terms.length === 0) return items;

  const n = Math.min(items.length, RANK_LIMIT);
  const scores = new Float64Array(n);
  const idx = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    scores[i] = scoreRecord(items[i], parsed, terms);
    idx[i] = i;
  }
  // Stable by construction: equal scores fall back to the incoming index.
  idx.sort((a, b) => scores[b] - scores[a] || a - b);

  const out = new Array<IndexItem>(items.length);
  for (let i = 0; i < n; i++) out[i] = items[idx[i]];
  for (let i = n; i < items.length; i++) out[i] = items[i];
  return out;
}
