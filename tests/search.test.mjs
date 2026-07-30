/**
 * Query-matching contract (ENG-010 semantics, ENG-012 token boundaries).
 *
 * Run: node --test tests/*.test.mjs   (needs `cd site && npm run data` first)
 *
 * The predicate is mirrored from site/src/lib/search.ts because these tests run
 * under plain Node with no TypeScript toolchain. A structural guard below fails
 * if the mirror drifts from the source.
 *
 * Corpus counts are MEASURED values, recorded so a future change that silently
 * alters what users find fails here rather than in production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INDEX_FILE = join(ROOT, "site", "public", "data", "index.json");
const SEARCH_TS = join(ROOT, "site", "src", "lib", "search.ts");

// --- the real module, not a mirror ---------------------------------------
//
// This file used to hand-mirror search.ts in JavaScript, because Node could not
// import a .ts file. It can now, and the mirror had already drifted: it carried
// no vocabulary expansion, so it asserted `sign in screen -> 0` while the app
// returned 2. The test was passing on behaviour the product no longer had, which
// is precisely the failure mode AGENTS.md warns about for mirrors here.
//
// Importing the module deletes that entire class of bug. The PHRASES list below
// is kept only for the source-level guard further down.
import { matchesParsed, parseQuery, tokenize, MEANINGFUL_PHRASES } from "../site/src/lib/search.ts";

const PHRASES = MEANINGFUL_PHRASES;
const matches = matchesParsed;
// -------------------------------------------------------------------------

const built = existsSync(INDEX_FILE);
const index = built ? JSON.parse(readFileSync(INDEX_FILE, "utf8")) : [];
const count = (q) => index.filter((it) => matches(it, parseQuery(q))).length;
const ids = (q) => index.filter((it) => matches(it, parseQuery(q))).map((it) => it.id);

function requireBuild() {
  assert.ok(built, "site/public/data/index.json missing. Run `cd site && npm run data`.");
}

const REC = {
  t: "Accessible Analytics Dashboard", hl: "Realtime KPIs",
  sum: "A responsive dashboard with keyboard navigation.",
  fw: "React", in: "saas", sc: "analytics_dashboard", a: "frontend_developer",
  tags: ["dashboard", "a11y"], kw: ["charts", "kpi"],
};
const m = (rec, q) => matches(rec, parseQuery(q));

// --- 1. ENG-010 semantics still hold -------------------------------------

test("all terms must be present (AND, not OR)", () => {
  assert.equal(m(REC, "accessible dashboard"), true);
  assert.equal(m(REC, "accessible nonexistentterm"), false);
});

test("term order is irrelevant", () => {
  assert.equal(m(REC, "dashboard accessible"), m(REC, "accessible dashboard"));
});

test("terms may match across different fields", () => {
  assert.equal(m(REC, "react kpi"), true);
});

test("empty query matches everything", () => {
  for (const q of ["", "   ", "\t\n"]) assert.equal(m(REC, q), true);
});

test("an impossible term defeats an otherwise matching query", () => {
  assert.equal(m(REC, "dashboard zzzznomatch"), false);
});

// --- 2. ENG-012 mandatory regressions ------------------------------------

test("REGRESSION: 'sign' matches 'sign', never 'design'", () => {
  assert.equal(m({ ...REC, t: "Sign Up Form", tags: [], kw: [] }, "sign"), true);
  assert.equal(m({ ...REC, t: "Design System Guide", tags: [], kw: [] }, "sign"), false);
});

test("REGRESSION: 'form' does not match platform / information / performance", () => {
  for (const t of ["Platform Overview", "Information Panel", "Performance Chart"]) {
    assert.equal(m({ ...REC, t, sum: "", hl: "", tags: [], kw: [] }, "form"), false, t);
  }
  assert.equal(m({ ...REC, t: "Contact Form", sum: "", hl: "", tags: [], kw: [] }, "form"), true);
});

test("REGRESSION: 'graph' does not match photograph / infographic", () => {
  for (const t of ["Photographer Portfolio", "Infographic Layout"]) {
    assert.equal(m({ ...REC, t, sum: "", hl: "", tags: [], kw: [] }, "graph"), false, t);
  }
  assert.equal(m({ ...REC, t: "Graph View", sum: "", hl: "", tags: [], kw: [] }, "graph"), true);
});

test("REGRESSION: 'react' does not match Preact", () => {
  assert.equal(m({ ...REC, t: "Preact Component", fw: "Preact", sum: "", hl: "", tags: [], kw: [] }, "react"), false);
  assert.equal(m({ ...REC, t: "React Component", fw: "React", sum: "", hl: "", tags: [], kw: [] }, "react"), true);
});

test("prefix matching survives, so typing still works", () => {
  // Boundary-anchored PREFIX, not whole-token: partial input must still match.
  assert.equal(m(REC, "dashb"), true);
  assert.equal(m({ ...REC, t: "Navbar", sum: "", hl: "", tags: [], kw: [] }, "nav"), true);
});

test("REGRESSION: bare 'in' no longer drags in nearly the whole corpus", () => {
  requireBuild();
  const n = count("in");
  assert.ok(n < 9000, `'in' matched ${n} records — the substring defect is back`);
  // It is still enforced when it is the ONLY token, or the query would match all.
  assert.ok(n > 0 && n < index.length, `'in' matched ${n} of ${index.length}`);
});

test("low-information terms are not hard AND conditions", () => {
  // "dashboard for a team" must not require "for" and "a" to appear.
  requireBuild();
  assert.equal(count("dashboard for a team"), count("dashboard team"),
    "low-information tokens are being enforced");
});

test("meaningful phrases survive the low-information rule", () => {
  // "in" alone is low-information; inside "sign in" it carries meaning.
  const p = parseQuery("sign in screen");
  assert.equal(p.phrases.length, 1, "'sign in' was not detected as a phrase");
  // Since ENG-013 a phrase carries ALTERNATIVES: the phrase itself plus what
  // the corpus actually calls it ("sign in" -> "login"). Any alternative
  // satisfies the condition.
  const anyOf = (alts, text) => alts.some((rx) => rx.test(text));
  assert.ok(anyOf(p.phrases[0], "please sign in here"));
  assert.ok(!anyOf(p.phrases[0], "design integration"),
    "'sign in' phrase must not match 'design integration'");
});

test("phrase matching tolerates hyphen and spacing variants", () => {
  const p = parseQuery("drag and drop");
  const anyOf = (alts, text) => alts.some((rx) => rx.test(text));
  assert.ok(anyOf(p.phrases[0], "supports drag-and-drop reordering"));
  assert.ok(anyOf(p.phrases[0], "supports drag and drop reordering"));
});

// --- 3. corpus counts ----------------------------------------------------

test("ENG-010 multi-word fix still holds", () => {
  requireBuild();
  const expected = {
    "accessible dashboard": 100, "ecommerce product page": 277,
    "react pricing table": 14, "mobile onboarding flow": 51,
    "animated hero section": 5, "file upload component": 3,
    // 2 before ENG-013. The vocabulary expands navbar -> navigation, so the
    // records the corpus calls "navigation" are now reachable. The old value
    // survived only because this file mirrored search.ts instead of importing
    // it, and the mirror had no expansion.
    "responsive navbar": 125,
  };
  for (const [q, n] of Object.entries(expected)) assert.equal(count(q), n, `"${q}"`);
});

test("single-term behaviour holds", () => {
  requireBuild();
  assert.equal(count("dashboard"), 3391);
  assert.equal(count("pricing"), 231);
  // 4,684 -> 4,552 at ENG-012: the 132 removed were Preact, not React.
  assert.equal(count("react"), 4552);
});

test("'pricing page' does not regress", () => {
  requireBuild();
  const n = count("pricing page");
  assert.ok(n >= 150 && n <= 200, `"pricing page" returned ${n}`);
  // The 50 dedicated pricing-page records must all still be found.
  const found = new Set(ids("pricing page"));
  const rel = JSON.parse(readFileSync(join(ROOT, "benchmarks/queries/relevance.json"), "utf8"));
  for (const rid of Object.keys(rel.queries.Q001.relevance)) {
    assert.ok(found.has(rid), `"pricing page" lost known-relevant ${rid}`);
  }
});

test("no-result behaviour is unchanged", () => {
  requireBuild();
  assert.equal(count("zzzznomatch"), 0);
  assert.equal(count("dashboard zzzznomatch"), 0);
  assert.equal(count("stripe checkout"), 0);   // dataset gap: "stripe" is in 0 records
  // NOT a zero any more. ENG-013 closed the language gap, and this assertion
  // was only still passing because the file mirrored search.ts instead of
  // importing it — the mirror had no vocabulary expansion.
  assert.ok(count("barrierefrei") > 1000, "German query no longer reaches the corpus");
  assert.equal(count(""), 10000);
});

test("ENG-012 removed the 'sign in screen' false-positive pile", () => {
  requireBuild();
  // Was 404 records under substring matching, none of them a login form.
  // The corpus contains no "sign in" at all, so 0 is the honest answer;
  // finding the login record needs synonyms, which ENG-012 deliberately excludes.
  // 0 under ENG-012, which had no synonyms. ENG-013 added them, so the login
  // records are now reachable — few, but no longer none.
  assert.equal(count("sign in screen"), 2);
  assert.ok(count("sign") < 200, `'sign' matched ${count("sign")} — was 6,936 as substring`);
});

// --- 4. mirror drift guard -----------------------------------------------

test("mirrored predicate still matches site/src/lib/search.ts", () => {
  const src = readFileSync(SEARCH_TS, "utf8");
  assert.match(src, /export const MATCHING_VERSION/, "matching version gone");
  // `\b` is ASCII-only in JavaScript, so it never matched before an umlaut and
  // German words were shredded by the tokenizer. The boundary is now an explicit
  // start-or-separator class over WORD, which includes the German letters.
  assert.match(src, /const WORD = "a-z0-9äöüß"/, "the word-character class changed");
  assert.match(src, /\(\?:\^\|\[\^\$\{WORD\}\]\)/, "boundary-anchored term matching changed");
  assert.match(src, /umlautAlternatives/, "umlaut alternation gone");
  assert.match(src, /LOW_INFORMATION_TOKENS/, "low-information set gone");
  assert.match(src, /MEANINGFUL_PHRASES/, "phrase list gone");
  for (const t of ["a", "an", "and", "for", "in", "with"]) {
    assert.ok(new RegExp(`"${t}"`).test(src), `low-information token ${t} missing from source`);
  }
  for (const p of PHRASES) assert.ok(src.includes(`"${p}"`), `phrase ${p} missing from source`);
});

// --- 5. German letters ----------------------------------------------------

test("German words survive tokenisation", () => {
  // Shipped bug: `[^a-z0-9]` treated ä as a separator, so "größe" became
  // ["gr", "e"] and then matched 1,625 records — a large, confidently wrong
  // result rather than a visibly empty one. Three vocabulary entries
  // ("übersicht", "schaltfläche", "oberfläche") were unreachable dead code for
  // the same reason: tokenisation could never produce their keys.
  for (const [word, expected] of [
    ["Prüfung", ["prüfung"]],
    ["Bestellbestätigung", ["bestellbestätigung"]],
    ["Übersicht", ["übersicht"]],
    ["größe", ["größe"]],
    ["Straße", ["straße"]],
  ]) {
    assert.deepEqual(tokenize(word), expected, `${word} was split`);
  }
});

test("a query spelled either way finds either spelling", () => {
  requireBuild();
  // The corpus is not normalised — rewriting 10,000 haystacks per keystroke is
  // the cost ENG-011 measured and rejected — so the alternation lives in the
  // pattern instead.
  assert.equal(count("Übersicht"), count("Uebersicht"), "ü and ue disagree");
  assert.ok(count("Übersicht") > 0, "an umlaut query finds nothing");
});

test("the umlaut fix did not loosen ordinary matching", () => {
  requireBuild();
  assert.equal(count("dashboard"), 3391);
  assert.equal(count("pricing page"), 162);
  assert.equal(count("sign in screen"), 2);
});

test("ENG-014 §11: the full German regression set", () => {
  requireBuild();
  // Every term the hardening brief names, plus the English queries that must
  // not have moved. Against the real module — there is no mirror any more.
  for (const w of ["Übersicht", "Uebersicht", "größe", "schaltfläche", "oberfläche"]) {
    assert.deepEqual(tokenize(w), [w.toLowerCase()], `${w} was split by the tokenizer`);
  }
  // schaltfläche and oberfläche are vocabulary keys that were unreachable dead
  // code before the fix, because tokenisation could never produce them.
  assert.ok(count("schaltfläche") > 0, "schaltfläche reaches nothing");
  assert.ok(count("oberfläche") > 0, "oberfläche reaches nothing");
  assert.equal(count("schaltfläche"), count("schaltflaeche"), "ä and ae disagree");
  assert.equal(count("oberfläche"), count("oberflaeche"), "ä and ae disagree");

  // German word boundaries: a term must still start at one.
  assert.equal(count("größe"), 0, "größe is absent from an English corpus");

  // Existing English queries, unmoved.
  assert.equal(count("dashboard"), 3391);
  assert.equal(count("pricing page"), 162);
  assert.equal(count("accessible dashboard"), 100);
  assert.equal(count("zzzznomatch"), 0);
});

test("the test suite imports the product, not a copy", () => {
  // ENG-014 §11: no mirror code. The mirror had drifted and was asserting
  // behaviour the product no longer had.
  const self = readFileSync(new URL(import.meta.url), "utf8");
  assert.match(self, /from "\.\.\/site\/src\/lib\/search\.ts"/, "search.ts is not imported");
  assert.ok(
    !/const tokenize = \(|function matchesParsed\(/.test(self),
    "a local reimplementation of the matcher is back",
  );
});
