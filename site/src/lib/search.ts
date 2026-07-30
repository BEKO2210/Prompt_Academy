/**
 * Query matching for the Library explorer (ENG-010, finding D3).
 *
 * Extracted from Library.tsx so the matching contract is testable without a DOM.
 *
 * ## Why this exists
 *
 * The previous implementation ran ONE substring test against the joined
 * haystack:
 *
 *     haystack(it).includes(q)
 *
 * so a multi-word query only matched when those words happened to appear
 * adjacently, in that order, in the concatenation. Users type two words with no
 * such intent. Measured consequence: "dashboard" returned 3,391 records while
 * "accessible dashboard" returned 0 — even though "accessible" is present in 460
 * records. The words were there; the matching was wrong.
 *
 * ## What this is NOT
 *
 * A ranker. Matching stays a boolean filter: a record either contains all the
 * query terms or it does not. Term frequency, field weighting and BM25 belong to
 * ENG-006. Keeping this boolean is deliberate — it makes the correctness fix
 * verifiable on its own.
 *
 * Nor does it do any cross-language matching. A German query against a ~91%
 * English corpus still returns nothing, because the terms genuinely are not
 * there. That is a corpus gap, not a matching bug.
 */
import type { IndexItem } from "./data";

/**
 * Fields searched, in the order the original implementation joined them.
 * Order is irrelevant to matching but kept stable so the produced string is
 * comparable against the pre-ENG-010 behaviour (ENG-011 relies on that).
 */
export function haystack(it: IndexItem): string {
  return [
    it.t,
    it.hl,
    it.sum,
    it.fw,
    it.in,
    it.sc,
    it.a,
    ...(it.tags ?? []),
    ...(it.kw ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Split a raw query into search terms.
 *
 * Lowercases, trims, and splits on any whitespace run, so "  dark   mode  "
 * yields ["dark", "mode"]. An empty or whitespace-only query yields [], which
 * callers treat as "no text filter".
 *
 * No quoted-phrase syntax: that is a feature, not part of fixing the defect.
 */
export function queryTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 0);
}

/**
 * True when the record contains EVERY term (AND semantics), each matched as a
 * substring anywhere in the haystack.
 *
 * An empty term list matches everything, so an empty query does not filter.
 *
 * Substring rather than whole-word matching is intentional and preserves the
 * previous behaviour for single terms: "nav" continues to match "navbar", and
 * partial input matches while the user is still typing.
 *
 * Consequences worth knowing, both measured:
 *   - Term order is irrelevant. "dashboard accessible" == "accessible dashboard".
 *   - Result sets widen for queries that previously relied on adjacency
 *     ("data visualization chart": 50 -> 451). Expected: an accidental
 *     constraint was removed. Ranking (ENG-006) is what orders the wider set.
 *   - Guaranteed misses survive: adding an impossible term to a matching query
 *     still returns nothing.
 */
export function matchesTerms(it: IndexItem, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const h = haystack(it);
  for (const t of terms) {
    if (!h.includes(t)) return false;
  }
  return true;
}
