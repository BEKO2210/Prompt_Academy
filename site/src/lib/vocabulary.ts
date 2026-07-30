/**
 * Query vocabulary expansion (ENG-013).
 *
 * The measured problem this exists for:
 *
 *   "Preisseite"      -> 0 of 22 relevant records, while the English
 *                        "pricing page" scores a perfect nDCG on the SAME set.
 *   "sign in screen"  -> 0 records. The corpus says "login"; "sign in" appears
 *                        in zero of 10,000 records.
 *   "barrierefrei"    -> 0 records, while "accessible" matches thousands.
 *
 * The corpus is ~91% English. The UI is German. Lexical matching cannot bridge
 * that, no matter how good the tokenisation gets — the words simply are not
 * there.
 *
 * ## What this is NOT
 *
 * It is **not** derived from `benchmarks/queries/query-expansions.json`. That
 * file is keyed by query ID and was hand-written for candidate pooling; using it
 * in the product would be test-set leakage of the plainest kind. This table is
 * general vocabulary, must work on queries nobody has seen, and is written from
 * domain knowledge of German/English web-UI terms.
 *
 * It is also not machine translation. It is a small, hand-maintained, versioned
 * map whose entries can each be defended.
 *
 * ## Direction
 *
 * Expansion applies to the QUERY, never to the corpus. A query term matches when
 * the term itself OR any of its variants matches. The corpus is untouched.
 */

/** Bump when entries are added or removed. */
export const VOCABULARY_VERSION = "1.0.0";

/**
 * A synonym hit is weaker evidence than the user's own word, so ranking scores
 * it lower. Measured: without this, expansions outranked exact matches.
 */
export const SYNONYM_SCORE_FACTOR = 0.6;

/**
 * term -> variants, all lower-case, all matched with the same boundary-prefix
 * rule as ordinary terms.
 *
 * German compounds are listed explicitly rather than decompounded
 * algorithmically. "Preisseite" is Preis+Seite, but a general German
 * decompounder is a large piece of machinery with its own failure modes, and
 * this corpus needs perhaps thirty compounds. Listing them is smaller, exact,
 * and auditable. The cost is that an unlisted compound gets nothing — a known
 * and accepted limitation.
 */
export const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  // --- German -> English, single words ---
  preis: ["pricing", "price"],
  preise: ["pricing", "price"],
  seite: ["page"],
  seiten: ["page"],
  startseite: ["homepage", "landing"],
  anmeldung: ["login", "signup", "registration"],
  anmelden: ["login", "sign in"],
  anmeldeformular: ["login", "form"],
  registrierung: ["registration", "signup"],
  passwort: ["password"],
  benutzer: ["user"],
  nutzer: ["user"],
  konto: ["account"],
  einstellungen: ["settings"],
  formular: ["form"],
  suche: ["search"],
  suchen: ["search"],
  warenkorb: ["cart", "shopping cart"],
  kasse: ["checkout"],
  bezahlung: ["payment", "checkout"],
  zahlung: ["payment"],
  bestellung: ["order"],
  produkt: ["product"],
  produkte: ["product"],
  onlineshop: ["ecommerce", "shop", "storefront"],
  laden: ["shop", "store"],
  barrierefrei: ["accessible", "accessibility"],
  barrierefreiheit: ["accessibility"],
  dunkelmodus: ["dark mode"],
  hell: ["light"],
  dunkel: ["dark"],
  tabelle: ["table"],
  diagramm: ["chart", "graph"],
  diagramme: ["chart", "graph"],
  uebersicht: ["overview", "dashboard"],
  übersicht: ["overview", "dashboard"],
  bericht: ["report"],
  berichte: ["report"],
  benachrichtigung: ["notification", "toast"],
  benachrichtigungen: ["notification"],
  navigation: ["navbar"],
  schaltflaeche: ["button"],
  schaltfläche: ["button"],
  knopf: ["button"],
  karte: ["card"],
  karten: ["card"],
  formulare: ["form"],
  anmeldeseite: ["login"],
  bezahlseite: ["checkout"],
  produktseite: ["product"],
  landingpage: ["landing"],
  zielseite: ["landing"],
  kalender: ["calendar", "date picker"],
  hochladen: ["upload"],
  herunterladen: ["download", "export"],
  filtern: ["filter"],
  sortieren: ["sort"],
  bewertung: ["review", "rating"],
  bewertungen: ["review", "rating"],
  lernen: ["learning", "education"],
  spiel: ["game"],
  spiele: ["game"],
  gesundheit: ["healthcare", "health"],
  finanzen: ["finance", "financial"],
  vorlage: ["template"],
  vorlagen: ["template"],

  // --- compounds and generic UI nouns, added after the first measurement
  // showed the expansion silently missing the very word that motivated it ---
  preisseite: ["pricing", "price"],
  preistabelle: ["pricing table", "pricing"],
  suchseite: ["search"],
  kontoseite: ["account"],
  uebersichtsseite: ["overview", "dashboard"],
  einstellungsseite: ["settings"],
  screen: ["page", "view", "interface", "form"],
  view: ["page", "interface"],
  maske: ["form", "page"],
  ansicht: ["view", "page", "interface"],
  oberflaeche: ["interface", "ui"],
  oberfläche: ["interface", "ui"],

  // --- English synonyms the corpus does not use ---
  signin: ["login", "sign in"],
  login: ["sign in", "authentication"],
  auth: ["authentication", "login"],
  signup: ["registration", "sign up"],
  basket: ["cart"],
  storefront: ["shop", "ecommerce"],
  a11y: ["accessibility", "accessible"],
  i18n: ["localization", "rtl"],
  navbar: ["navigation"],
  dropdown: ["menu", "select"],
  spinner: ["loading", "skeleton"],
  kpi: ["metric", "dashboard"],
  crud: ["table", "form"],
  wizard: ["multi-step", "onboarding"],
};

/**
 * Multi-word query phrases that map to a single corpus concept.
 * Checked before single-token expansion so "sign in" is not split.
 */
export const PHRASE_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "sign in": ["login", "authentication"],
  "log in": ["login", "authentication"],
  "sign up": ["registration", "signup"],
  "check out": ["checkout"],
};

/** Variants for a single token, excluding the token itself. */
export function expandToken(token: string): readonly string[] {
  return SYNONYMS[token] ?? [];
}

/** Variants for a phrase, excluding the phrase itself. */
export function expandPhrase(phrase: string): readonly string[] {
  return PHRASE_SYNONYMS[phrase] ?? [];
}
