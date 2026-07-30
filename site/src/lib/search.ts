/**
 * Query matching for the Library explorer.
 *
 * History, because each layer exists for a measured reason:
 *
 *   pre-ENG-010  one substring test over the whole joined haystack, so a
 *                multi-word query only matched when the words happened to sit
 *                adjacently. "dashboard" -> 3,391 records, "accessible
 *                dashboard" -> 0.
 *   ENG-010      split the query into terms and require ALL of them. Fixed the
 *                multi-word failure.
 *   ENG-012      the terms were still matched as SUBSTRINGS ANYWHERE, which the
 *                dev-split baseline exposed as catastrophic: "sign" matched
 *                6,936 of 10,000 records because it sits inside de-SIGN-, and
 *                "in" matched 9,866 because of interface / engineering /
 *                including. "sign in screen" returned 404 records, none of them
 *                a login form. This file now matches at token boundaries.
 *
 * Scope note: this is LEXICAL MATCHING only. No ranking, no scoring, no
 * synonyms, no translation, no capability weighting. Which records match —
 * not in which order.
 */
import type { IndexItem } from "./data.ts";
import { expandPhrase, expandToken } from "./vocabulary.ts";

/** Bump when tokenisation, phrases or the low-information set change. */
export const MATCHING_VERSION = "1.0.0";

/**
 * Tokens with essentially no discriminative power in THIS corpus.
 *
 * Derived by measurement, not imported from a generic English stop-list: each
 * of these matches >=50% of the 10,000 records at a token boundary.
 *
 *   a 100.0%   an 89.3%   and 79.8%   in 74.3%   with 69.8%   for 58.8%
 *
 * They are treated as SOFT — they never become a hard AND condition — but they
 * are not deleted, because they still carry meaning inside a phrase ("sign in").
 *
 * Deliberately NOT included: "design", measured at 66.5%. It clears the
 * threshold but is a content word a user may genuinely search for
 * ("design system"), and dropping it would silently weaken such queries.
 * Frequency alone is not sufficient grounds for discarding a term.
 */
export const LOW_INFORMATION_TOKENS: ReadonlySet<string> = new Set([
  "a", "an", "and", "for", "in", "with",
]);

/**
 * Multi-word units whose meaning would be destroyed by treating their parts
 * independently. Small and hand-maintained on purpose.
 *
 * "sign in" is the reason this exists: "in" is low-information on its own, but
 * "sign in" is a specific thing a user is looking for.
 */
export const MEANINGFUL_PHRASES: readonly string[] = [
  "sign in", "sign up", "log in", "log out",
  "opt in", "opt out", "check out", "drag and drop",
];

/** Lowercase and split on anything that is not a letter or digit. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

/**
 * Escape a string for literal use inside a RegExp.
 * Kept here rather than inlined so there is one place to audit.
 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A term must begin at a token boundary, and may then be a PREFIX of that token.
 *
 * Boundary-anchoring is what kills the substring collisions:
 *   "sign"  matches "sign", "signup"      — NOT "design"
 *   "form"  matches "form", "format"      — NOT "platform", "information"
 *   "graph" matches "graph", "graphics"   — NOT "photograph", "infographic"
 *
 * Prefix (rather than whole-token) matching is deliberate: it preserves
 * incremental typing, so "dashb" still finds "dashboard" and "nav" still finds
 * "navbar" while the user is mid-word.
 */
function termPattern(term: string): RegExp {
  return new RegExp("\\b" + escapeRe(term), "i");
}

/** A phrase must appear as adjacent tokens, allowing spaces or hyphens between. */
function phrasePattern(phrase: string): RegExp {
  const parts = tokenize(phrase).map(escapeRe);
  return new RegExp("\\b" + parts.join("[^a-z0-9]+"), "i");
}

/**
 * One required condition: the user's own term, plus any vocabulary variants.
 * The condition is satisfied when ANY alternative matches — that is what lets a
 * German query reach an English corpus (ENG-013).
 */
export interface TermCondition {
  /** What the user typed. Scored at full weight. */
  term: string;
  /** term + variants, all as boundary-anchored patterns. */
  patterns: RegExp[];
  /** Variant strings only, for ranking to score at a reduced factor. */
  variants: string[];
}

export interface ParsedQuery {
  /** Multi-word units that must appear adjacently (any variant satisfies). */
  phrases: RegExp[][];
  /** Content conditions that must all be satisfied. */
  conditions: TermCondition[];
  /** The plain strings behind the conditions — what ranking scores on. */
  requiredTerms: string[];
  /** Low-information terms, kept for the record but not enforced. */
  soft: string[];
  /** True when the query carries no matchable condition at all. */
  empty: boolean;
}

/**
 * Parse a raw query into matchable conditions.
 *
 * Order matters: phrases are consumed first, so "sign in" survives as a unit
 * before "in" would otherwise be demoted to soft.
 */
export function parseQuery(query: string): ParsedQuery {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { phrases: [], conditions: [], requiredTerms: [], soft: [], empty: true };
  }

  const consumed = new Array<boolean>(tokens.length).fill(false);
  const phrases: RegExp[][] = [];

  for (const phrase of MEANINGFUL_PHRASES) {
    const pt = tokenize(phrase);
    for (let i = 0; i + pt.length <= tokens.length; i++) {
      if (consumed.slice(i, i + pt.length).some(Boolean)) continue;
      if (pt.every((p, j) => tokens[i + j] === p)) {
        // The phrase itself, plus what the corpus actually calls it.
        phrases.push([
          phrasePattern(phrase),
          ...expandPhrase(phrase).map(phrasePattern),
        ]);
        for (let j = 0; j < pt.length; j++) consumed[i + j] = true;
      }
    }
  }

  const rest = tokens.filter((_, i) => !consumed[i]);
  const content = rest.filter((t) => !LOW_INFORMATION_TOKENS.has(t));
  const soft = rest.filter((t) => LOW_INFORMATION_TOKENS.has(t));

  // If every token was low-information ("in", "a for"), enforce them anyway —
  // otherwise the query would silently match the entire corpus.
  const requiredTerms = content.length > 0 ? content : soft;
  const conditions: TermCondition[] = requiredTerms.map((term) => {
    const variants = [...expandToken(term)];
    return {
      term,
      variants,
      patterns: [termPattern(term), ...variants.map(phrasePattern)],
    };
  });

  return {
    phrases,
    conditions,
    requiredTerms,
    soft: content.length > 0 ? soft : [],
    empty: phrases.length === 0 && conditions.length === 0,
  };
}

/**
 * Fields searched, in the order the original implementation joined them.
 * Order does not affect matching; it is kept stable so the produced string
 * stays comparable across versions.
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
  ].join(" ");
}

/**
 * True when the record satisfies every phrase and every required term.
 *
 * An empty query matches everything, so clearing the box does not filter.
 * Low-information terms are never enforced, which is why "sign in screen" no
 * longer drags in every record containing "interface".
 */
export function matchesParsed(it: IndexItem, parsed: ParsedQuery): boolean {
  if (parsed.empty) return true;
  const h = haystack(it);
  // Each condition is an OR over the user's term and its variants; the
  // conditions themselves are ANDed, so ENG-010's semantics survive.
  for (const alts of parsed.phrases) {
    if (!alts.some((rx) => rx.test(h))) return false;
  }
  for (const c of parsed.conditions) {
    if (!c.patterns.some((rx) => rx.test(h))) return false;
  }
  return true;
}

// --- compatibility ---------------------------------------------------------

/** Terms of a query, low-information ones included. Kept for callers/tests. */
export function queryTerms(query: string): string[] {
  return tokenize(query);
}

/** Convenience wrapper: parse and match in one call. */
export function matchesQuery(it: IndexItem, query: string): boolean {
  return matchesParsed(it, parseQuery(query));
}
