/**
 * Query formulation: user request -> retrieval query (ENG-008).
 *
 * ## Why this exists
 *
 * Measured, on the 8-task seed set against the full 10,000-record corpus:
 * **8 of 8 task requests retrieved nothing.** Not a few — all of them.
 *
 * The cause is not a bug in retrieval. `search.ts` requires ALL content terms to
 * match, which is right for a search box where a user types two or three words.
 * A task request is a sentence: "Ich brauche eine Preisseite mit drei Tarifen,
 * monatlich und jährlich umschaltbar" carries ten content words, and demanding
 * that one record contain all ten is hopeless.
 *
 * ## Why it had to be caught before the experiment, not after
 *
 * With no record retrieved, arms B, C, D and E assemble no context and become
 * byte-identical to arm A. The run would have completed cleanly, produced
 * A ≈ B ≈ C ≈ D ≈ E, and that pattern is listed in ENG-008 §7 as "H1 falsified
 * for this corpus/model. Stop before M4."
 *
 * The experiment would have answered its central question with a number that
 * measured nothing but a missing component. This is exactly the failure mode
 * §Problem calls "worse than none".
 *
 * ## Deterministic, and not model-decided
 *
 * Formulation is part of the mechanism under test, so a model choosing the query
 * would make the independent variable a function of the model. This is a rule:
 *
 *   1. tokenize, drop German and English function words
 *   2. drop terms that appear in NO record — they can only force an empty result
 *   3. rank the rest by document frequency, rarest first: a term matching 40
 *      records discriminates, one matching 4,000 does not
 *   4. take the top `k` and retrieve; on empty, back off to k-1, down to 1
 *
 * The backoff is what makes it robust without loosening AND semantics: the
 * conjunction stays strict, the number of conjuncts shrinks until it can be
 * satisfied. Every step is recorded, so the query a run actually used is visible
 * rather than inferred.
 */
import { parseQuery, matchesParsed, tokenize } from "../../site/src/lib/search.ts";
import type { Corpus, IndexProjection } from "./retrieval.ts";

export const FORMULATION_VERSION = "1.1.0";

/**
 * A term must match at least this many records to be used as a conjunct.
 *
 * ## Why a floor, not just "rarest first"
 *
 * Rarest-first is the obvious rule and it was measurably wrong. IDF assumes a
 * rare term is TOPICAL; a term matching 1 or 2 records out of 10,000 is usually
 * just out of vocabulary. The three failures, all real:
 *
 *   "modal that closes with Escape"  -> escape (df 1)  -> "Escape Room Display"
 *   "user picks a delivery option"   -> picks  (df 2)  -> "Shop with Curated Picks"
 *   "shows upload progress"          -> shows  (df 2)  -> "Climate Change Visualizer"
 *
 * In each case a rare VERB displaced a common domain NOUN. With the floor, the
 * same requests formulate to "modal", "address" and "file upload drop".
 *
 * ## What was tried and rejected
 *
 * Preferring terms that occur in record titles or subcategories — the fields
 * ranking already trusts. Rejected on measurement: "picks" and "escape" are
 * BOTH in titles ("Curated Picks", "Escape Room"), so it does not separate the
 * failing cases, and German requests have no terms in an English title set at
 * all, so it would have broken the German tasks outright.
 *
 * ## Honest limitation
 *
 * 5 was chosen by comparing floors 0, 5, 10 and 25 on EIGHT seed tasks. At 10,
 * T008 degrades to "before" -> "Best Before Display"; at 25, T004 degrades. That
 * is a real signal about the shape of the curve but it is eight data points, and
 * the value is fitted to them. It must be revalidated when the task set reaches
 * its target size. Recorded as a config constant so a run states which floor it
 * used rather than leaving it implicit.
 */
export const MIN_DOCUMENT_FREQUENCY = 5;

/**
 * Function words, German and English.
 *
 * Deliberately separate from search.ts's LOW_INFORMATION_TOKENS, which was
 * derived from corpus frequency for a different job (deciding what not to
 * enforce in a two-word query). This list is about grammar: a request is a
 * sentence, so it carries verbs and pronouns a search box never sees.
 */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  // German
  "ich", "du", "wir", "mir", "mich", "brauche", "will", "möchte", "moechte",
  "hätte", "haette", "gerne", "bitte", "mach", "mache", "baue", "bau", "erstelle",
  "schreibe", "ein", "eine", "einen", "einem", "einer", "eines", "der", "die",
  "das", "den", "dem", "des", "und", "oder", "mit", "ohne", "für", "fuer", "von",
  "vom", "zu", "zum", "zur", "im", "in", "an", "am", "auf", "aus", "bei", "nach",
  "über", "ueber", "unter", "soll", "sollen", "sein", "ist", "sind", "wird",
  "werden", "hat", "haben", "kann", "können", "koennen", "noch", "nicht", "kein",
  "keine", "alle", "allen", "als", "auch", "dann", "darunter", "danach", "es",
  // English
  "i", "we", "you", "a", "an", "the", "and", "or", "with", "without", "for",
  "of", "to", "from", "in", "on", "at", "by", "need", "want", "would", "like",
  "please", "make", "build", "write", "create", "give", "me", "my", "it", "its",
  "that", "this", "there", "is", "are", "be", "should", "must", "can", "no",
  "not", "yet", "per", "over", "under", "above", "below", "each", "all", "some",
]);

export interface FormulatedQuery {
  /** The query string handed to retrieval. */
  query: string;
  /** Every candidate term, with its document frequency. Recorded for audit. */
  candidates: Array<{ term: string; df: number }>;
  /** How many conjuncts survived the backoff. */
  k: number;
  /** True when even a single term matched nothing. */
  empty: boolean;
}

/** How many records a single term matches, using the SAME matcher retrieval uses. */
function documentFrequency(index: IndexProjection[], term: string): number {
  const parsed = parseQuery(term);
  let n = 0;
  for (const it of index) if (matchesParsed(it as never, parsed)) n++;
  return n;
}

/**
 * Build a retrieval query from a user request.
 *
 * `maxTerms` is a constant of the run: changing it changes which record every
 * arm receives, so it belongs in the recorded config, not in a call site.
 */
export function formulateQuery(
  corpus: Corpus,
  request: string,
  maxTerms = 3,
): FormulatedQuery {
  const terms = [...new Set(tokenize(request))]
    .filter((t) => t.length > 2 && !FUNCTION_WORDS.has(t));

  const present = terms
    .map((term) => ({ term, df: documentFrequency(corpus.index, term) }))
    // df 0 means the word is absent from the corpus. Keeping it guarantees an
    // empty conjunction — the "stripe checkout -> 0" case AGENTS.md records as
    // a dataset gap, not a matcher bug.
    .filter((s) => s.df > 0);

  // The floor applies only when something survives it. A request made entirely
  // of rare terms should still retrieve something rather than nothing — a bad
  // record is recoverable, an empty one silently collapses the arms.
  const aboveFloor = present.filter((s) => s.df >= MIN_DOCUMENT_FREQUENCY);
  const scored = (aboveFloor.length ? aboveFloor : present)
    // Rarest first among terms that are actually topical.
    .sort((a, b) => a.df - b.df || a.term.localeCompare(b.term));

  if (scored.length === 0) {
    return { query: "", candidates: [], k: 0, empty: true };
  }

  for (let k = Math.min(maxTerms, scored.length); k >= 1; k--) {
    const query = scored.slice(0, k).map((s) => s.term).join(" ");
    const parsed = parseQuery(query);
    const hit = corpus.index.some((it) => matchesParsed(it as never, parsed));
    if (hit) return { query, candidates: scored, k, empty: false };
  }

  return { query: "", candidates: scored, k: 0, empty: true };
}
