/**
 * ENG-002 baseline harness.
 * Measures index.json parse cost, heap, and the EXACT search path from
 * site/src/pages/Library.tsx (haystack() + includes(), rebuilt per keystroke).
 * Pure V8 — same engine as Chrome. No browser-only APIs used.
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const INDEX = process.argv[2];
const raw = readFileSync(INDEX, "utf8");

const fmt = (n, d = 2) => Number(n.toFixed(d));
const mb = (b) => fmt(b / 1048576);
const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

// ---- parse cost -------------------------------------------------------
const PARSE_RUNS = 12;
const parseTimes = [];
let index;
for (let i = 0; i < PARSE_RUNS; i++) {
  global.gc?.();
  const t0 = performance.now();
  index = JSON.parse(raw);
  parseTimes.push(performance.now() - t0);
}

// ---- heap attributable to the parsed index ---------------------------
global.gc?.();
const before = process.memoryUsage().heapUsed;
const held = JSON.parse(raw);
global.gc?.();
const after = process.memoryUsage().heapUsed;
const heapDelta = after - before;
if (held.length !== 10000) throw new Error(`expected 10000, got ${held.length}`);

// ---- EXACT haystack from site/src/lib/search.ts ---------------------
function haystack(it) {
  return [it.t, it.hl, it.sum, it.fw, it.in, it.sc, it.a,
          ...(it.tags ?? []), ...(it.kw ?? [])]
    .join(" ").toLowerCase();
}

// ---- CURRENT predicate: AND over terms (ENG-010 / D3) ---------------
// Mirrors site/src/lib/search.ts. Keep in step with it, or this harness
// measures something the app no longer does.
function queryTerms(q) {
  return q.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 0);
}
function search(list, q, filters = {}) {
  const terms = queryTerms(q);
  return list.filter((it) => {
    if (filters.category && it.c !== filters.category) return false;
    if (filters.difficulty && it.d !== filters.difficulty) return false;
    if (filters.framework && it.fw !== filters.framework) return false;
    if (filters.language && it.lang !== filters.language) return false;
    if (filters.audience && it.a !== filters.audience) return false;
    if (terms.length) {
      const h = haystack(it);
      for (const t of terms) if (!h.includes(t)) return false;
    }
    return true;
  });
}

// ---- PRE-D3 predicate, retained for comparability only --------------
// One substring test over the joined haystack. This is what the ENG-002
// baseline measured. Kept so before/after numbers stay comparable on the same
// machine; it is NOT what the app does any more.
function searchLegacySubstring(list, q) {
  return list.filter((it) => (q ? haystack(it).includes(q) : true));
}

// Fixed query set — repeatable. Simulates typing "dashboard" char by char,
// plus representative real queries incl. a German one and a no-hit one.
const TYPING = "dashboard".split("").map((_, i) => "dashboard".slice(0, i + 1));
const QUERIES = [
  ...TYPING,
  "react", "pricing", "accessible dashboard", "stripe checkout",
  "barrierefrei", "dunkelmodus", "zzzznomatch",
];

const REPEATS = 10;
const perQuery = [];
const allLatencies = [];

for (const q of QUERIES) {
  const ts = [];
  let hits = 0;
  for (let r = 0; r < REPEATS; r++) {
    const t0 = performance.now();
    const res = search(index, q);
    ts.push(performance.now() - t0);
    hits = res.length;
  }
  perQuery.push({ q, hits, p50: fmt(pct(ts, 50)), p95: fmt(pct(ts, 95)) });
  allLatencies.push(...ts);
}

// facet-only (no text) for comparison
const facetTs = [];
for (let r = 0; r < REPEATS; r++) {
  const t0 = performance.now();
  search(index, "", { category: "saas_dashboards" });
  facetTs.push(performance.now() - t0);
}

// how much of the cost is haystack construction alone?
const hsTs = [];
for (let r = 0; r < REPEATS; r++) {
  const t0 = performance.now();
  for (const it of index) haystack(it);
  hsTs.push(performance.now() - t0);
}

// pre-D3 predicate on the same machine, so before/after stays comparable
const legacyTs = [];
for (const q of QUERIES) {
  for (let r = 0; r < REPEATS; r++) {
    const t0 = performance.now();
    searchLegacySubstring(index, q);
    legacyTs.push(performance.now() - t0);
  }
}

console.log(JSON.stringify({
  index_file: INDEX,
  records: index.length,
  bytes_raw: Buffer.byteLength(raw, "utf8"),
  parse: {
    runs: PARSE_RUNS,
    p50_ms: fmt(pct(parseTimes, 50)),
    p95_ms: fmt(pct(parseTimes, 95)),
    min_ms: fmt(Math.min(...parseTimes)),
    max_ms: fmt(Math.max(...parseTimes)),
  },
  heap_after_parse: { delta_bytes: heapDelta, delta_mb: mb(heapDelta) },
  predicate: "AND-over-terms (ENG-010 / D3) — mirrors site/src/lib/search.ts",
  search_all_queries: {
    n_measurements: allLatencies.length,
    p50_ms: fmt(pct(allLatencies, 50)),
    p95_ms: fmt(pct(allLatencies, 95)),
    max_ms: fmt(Math.max(...allLatencies)),
  },
  search_legacy_substring_ms: {
    note: "pre-D3 single-substring predicate, same machine, for comparability only",
    p50: fmt(pct(legacyTs, 50)),
    p95: fmt(pct(legacyTs, 95)),
  },
  search_facet_only_ms: { p50: fmt(pct(facetTs, 50)), p95: fmt(pct(facetTs, 95)) },
  haystack_build_all_10k_ms: { p50: fmt(pct(hsTs, 50)), p95: fmt(pct(hsTs, 95)) },
  per_query: perQuery,
}, null, 2));
