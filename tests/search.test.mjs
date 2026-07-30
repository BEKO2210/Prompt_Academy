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

// --- mirror of site/src/lib/search.ts ------------------------------------
const LOW = new Set(["a", "an", "and", "for", "in", "with"]);
const PHRASES = ["sign in", "sign up", "log in", "log out",
                 "opt in", "opt out", "check out", "drag and drop"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tokenize = (t) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function parseQuery(query) {
  const tokens = tokenize(query);
  if (!tokens.length) return { phrases: [], required: [], empty: true };
  const used = new Array(tokens.length).fill(false);
  const phrases = [];
  for (const p of PHRASES) {
    const pt = tokenize(p);
    for (let i = 0; i + pt.length <= tokens.length; i++) {
      if (used.slice(i, i + pt.length).some(Boolean)) continue;
      if (pt.every((x, j) => tokens[i + j] === x)) {
        phrases.push(new RegExp("\\b" + pt.map(esc).join("[^a-z0-9]+"), "i"));
        for (let j = 0; j < pt.length; j++) used[i + j] = true;
      }
    }
  }
  const rest = tokens.filter((_, i) => !used[i]);
  const content = rest.filter((t) => !LOW.has(t));
  const soft = rest.filter((t) => LOW.has(t));
  const required = (content.length ? content : soft).map((t) => new RegExp("\\b" + esc(t), "i"));
  return { phrases, required, empty: !phrases.length && !required.length };
}
function haystack(it) {
  return [it.t, it.hl, it.sum, it.fw, it.in, it.sc, it.a,
          ...(it.tags ?? []), ...(it.kw ?? [])].join(" ");
}
function matches(it, parsed) {
  if (parsed.empty) return true;
  const h = haystack(it);
  return parsed.phrases.every((r) => r.test(h)) && parsed.required.every((r) => r.test(h));
}
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
  assert.ok(p.phrases[0].test("please sign in here"));
  assert.ok(!p.phrases[0].test("design integration"),
    "'sign in' phrase must not match 'design integration'");
});

test("phrase matching tolerates hyphen and spacing variants", () => {
  const p = parseQuery("drag and drop");
  assert.ok(p.phrases[0].test("supports drag-and-drop reordering"));
  assert.ok(p.phrases[0].test("supports drag and drop reordering"));
});

// --- 3. corpus counts ----------------------------------------------------

test("ENG-010 multi-word fix still holds", () => {
  requireBuild();
  const expected = {
    "accessible dashboard": 100, "ecommerce product page": 277,
    "react pricing table": 14, "mobile onboarding flow": 51,
    "animated hero section": 5, "responsive navbar": 2, "file upload component": 3,
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
  assert.equal(count("stripe checkout"), 0);   // dataset gap
  assert.equal(count("barrierefrei"), 0);      // language gap
  assert.equal(count(""), 10000);
});

test("ENG-012 removed the 'sign in screen' false-positive pile", () => {
  requireBuild();
  // Was 404 records under substring matching, none of them a login form.
  // The corpus contains no "sign in" at all, so 0 is the honest answer;
  // finding the login record needs synonyms, which ENG-012 deliberately excludes.
  assert.equal(count("sign in screen"), 0);
  assert.ok(count("sign") < 200, `'sign' matched ${count("sign")} — was 6,936 as substring`);
});

// --- 4. mirror drift guard -----------------------------------------------

test("mirrored predicate still matches site/src/lib/search.ts", () => {
  const src = readFileSync(SEARCH_TS, "utf8");
  assert.match(src, /export const MATCHING_VERSION/, "matching version gone");
  assert.match(src, /"\\\\b" \+ escapeRe\(term\)/, "boundary-anchored term matching changed");
  assert.match(src, /LOW_INFORMATION_TOKENS/, "low-information set gone");
  assert.match(src, /MEANINGFUL_PHRASES/, "phrase list gone");
  for (const t of ["a", "an", "and", "for", "in", "with"]) {
    assert.ok(new RegExp(`"${t}"`).test(src), `low-information token ${t} missing from source`);
  }
  for (const p of PHRASES) assert.ok(src.includes(`"${p}"`), `phrase ${p} missing from source`);
});
