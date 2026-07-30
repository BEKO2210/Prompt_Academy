/**
 * Query-matching contract (ENG-010, finding D3).
 *
 * Run: node --test tests/*.test.mjs   (needs `cd site && npm run data` first)
 *
 * Two layers:
 *   1. Fixture-level — the semantics of the predicate, independent of the corpus.
 *   2. Corpus-level — exact counts against the real 10,000-record index, so a
 *      future change that silently alters what users find fails here.
 *
 * The corpus counts are the numbers measured BEFORE implementing (recorded in
 * docs/tasks/ENG-010-multiword-search.md), not numbers read off afterwards.
 * That ordering is what makes them a check rather than a rubber stamp.
 *
 * The predicate is re-implemented here from site/src/lib/search.ts rather than
 * imported, because these tests run under plain Node with no TypeScript
 * toolchain. The duplication is deliberate and small; the "matches TS source"
 * test below guards against the copy drifting.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INDEX_FILE = join(ROOT, "site", "public", "data", "index.json");
const SEARCH_TS = join(ROOT, "site", "src", "lib", "search.ts");

// --- mirror of site/src/lib/search.ts -------------------------------------
function haystack(it) {
  return [it.t, it.hl, it.sum, it.fw, it.in, it.sc, it.a,
          ...(it.tags ?? []), ...(it.kw ?? [])]
    .join(" ")
    .toLowerCase();
}
function queryTerms(query) {
  return query.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 0);
}
function matchesTerms(it, terms) {
  if (terms.length === 0) return true;
  const h = haystack(it);
  for (const t of terms) if (!h.includes(t)) return false;
  return true;
}
// -------------------------------------------------------------------------

const built = existsSync(INDEX_FILE);
const index = built ? JSON.parse(readFileSync(INDEX_FILE, "utf8")) : [];
const count = (q) => index.filter((it) => matchesTerms(it, queryTerms(q))).length;

function requireBuild() {
  assert.ok(
    built,
    "site/public/data/index.json missing. Run `cd site && npm run data`. " +
      "Refusing to pass without checking — a skipped contract test reads as green.",
  );
}

// --- 1. semantics --------------------------------------------------------

const REC = {
  t: "Accessible Analytics Dashboard",
  hl: "Realtime KPIs",
  sum: "A responsive dashboard with keyboard navigation.",
  fw: "React", in: "saas", sc: "analytics_dashboard", a: "frontend_developer",
  tags: ["dashboard", "a11y"],
  kw: ["charts", "kpi"],
};

test("queryTerms splits on whitespace runs and lowercases", () => {
  assert.deepEqual(queryTerms("  Dark   MODE  "), ["dark", "mode"]);
  assert.deepEqual(queryTerms("react"), ["react"]);
});

test("queryTerms yields [] for empty or whitespace-only input", () => {
  for (const q of ["", "   ", "\t\n"]) assert.deepEqual(queryTerms(q), []);
});

test("empty term list matches everything (empty query does not filter)", () => {
  assert.equal(matchesTerms(REC, []), true);
});

test("all terms must be present (AND, not OR)", () => {
  assert.equal(matchesTerms(REC, ["accessible", "dashboard"]), true);
  assert.equal(matchesTerms(REC, ["accessible", "nonexistentterm"]), false);
});

test("term order is irrelevant", () => {
  assert.equal(
    matchesTerms(REC, queryTerms("accessible dashboard")),
    matchesTerms(REC, queryTerms("dashboard accessible")),
  );
  assert.equal(matchesTerms(REC, queryTerms("dashboard accessible")), true);
});

test("terms may match across different fields", () => {
  // "react" is in fw, "kpi" is in kw — adjacency was never meaningful
  assert.equal(matchesTerms(REC, queryTerms("react kpi")), true);
});

test("substring matching is preserved (partial input while typing)", () => {
  assert.equal(matchesTerms(REC, queryTerms("dashb")), true);
  assert.equal(matchesTerms(REC, queryTerms("nav")), true); // from "navigation"
});

test("an impossible term defeats an otherwise matching query", () => {
  assert.equal(matchesTerms(REC, queryTerms("dashboard zzzznomatch")), false);
});

// --- 2. guard against the mirror drifting from the TS source -------------

test("mirrored predicate still matches site/src/lib/search.ts", () => {
  const src = readFileSync(SEARCH_TS, "utf8");
  // Structural assertions, not a byte diff: these are the decisions that would
  // silently change behaviour if edited in the TS and not here.
  assert.match(src, /\.join\(" "\)/, "haystack join separator changed");
  assert.match(src, /\.toLowerCase\(\)/, "haystack lowercasing changed");
  assert.match(src, /split\(\/\\s\+\//, "term splitting changed");
  assert.match(src, /if \(terms\.length === 0\) return true;/, "empty-query semantics changed");
  assert.match(src, /if \(!h\.includes\(t\)\) return false;/, "AND-substring semantics changed");
  for (const field of ["it.t", "it.hl", "it.sum", "it.fw", "it.in", "it.sc", "it.a", "it.tags", "it.kw"]) {
    assert.ok(src.includes(field), `haystack no longer includes ${field}`);
  }
});

// --- 3. corpus counts ----------------------------------------------------
// Exact figures measured before implementing. See ENG-010.

test("D3 fixed: multi-word queries that returned 0 now return records", () => {
  requireBuild();
  const expected = {
    "accessible dashboard": 100,
    "ecommerce product page": 330,
    "react pricing table": 21,
    "mobile onboarding flow": 57,
    "animated hero section": 5,
    "responsive navbar": 2,
    "authentication form": 1,
    "file upload component": 3,
  };
  for (const [q, n] of Object.entries(expected)) {
    assert.equal(count(q), n, `"${q}" expected ${n}, got ${count(q)}`);
  }
});

test("single-term behaviour is UNCHANGED (no regression)", () => {
  requireBuild();
  assert.equal(count("dashboard"), 3391);
  assert.equal(count("react"), 4684);
  assert.equal(count("pricing"), 231);
});

test("wider-not-broken cases keep their measured counts", () => {
  requireBuild();
  // These already returned something; dropping the adjacency constraint widens
  // them. Recorded so a future ranking change cannot alter them unnoticed.
  assert.equal(count("data visualization chart"), 451);
  assert.equal(count("saas analytics dashboard"), 97);
  assert.equal(count("dark mode toggle"), 5);
});

test("guaranteed misses stay misses", () => {
  requireBuild();
  assert.equal(count("zzzznomatch"), 0);
  assert.equal(count("dashboard zzzznomatch"), 0);
});

test("corpus gaps are NOT claimed as fixed", () => {
  requireBuild();
  // "stripe" appears in 0 records — a dataset gap, not a matching bug.
  assert.equal(index.filter((it) => haystack(it).includes("stripe")).length, 0);
  assert.equal(count("stripe checkout"), 0);
  // German terms absent from a ~91% English corpus — a language gap.
  // Fixing this needs translation or embeddings (ENG-006 arm R7), not AND terms.
  for (const q of ["barrierefrei", "dunkelmodus", "anmeldeformular"]) {
    assert.equal(count(q), 0, `"${q}" unexpectedly matched — corpus changed?`);
  }
});

test("empty query returns the whole corpus", () => {
  requireBuild();
  assert.equal(count(""), 10000);
  assert.equal(count("   "), 10000);
});
