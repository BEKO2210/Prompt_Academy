/**
 * Query vocabulary expansion (ENG-013).
 *
 * The corpus is ~91% English; the UI is German. Lexical matching cannot bridge
 * that on its own — "Preisseite" scored 0 of 22 relevant records while the
 * English "pricing page" scored a perfect nDCG on the SAME set.
 *
 * These tests guard the two ways this feature can quietly go wrong:
 *   1. leakage — expansions copied from the benchmark's per-query expansion
 *      file, which would make the evaluation grade its own answer key;
 *   2. over-expansion — a variant so common that it dissolves the query, which
 *      happened once when a compound expanded to the bare token "page".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = readFileSync(join(ROOT, "site/src/lib/vocabulary.ts"), "utf8");
const SEARCH_SRC = readFileSync(join(ROOT, "site/src/lib/search.ts"), "utf8");
const INDEX_FILE = join(ROOT, "site", "public", "data", "index.json");

/** Every variant string on the right-hand side of either table. */
function variants() {
  const out = [];
  for (const m of SRC.matchAll(/^\s*(?:"[^"]+"|[a-zä-ü0-9]+):\s*\[([^\]]*)\]/gmu)) {
    for (const v of m[1].matchAll(/"([^"]+)"/g)) out.push(v[1]);
  }
  return out;
}

/** Every key on the left-hand side of either table. */
function keys() {
  const out = [];
  for (const m of SRC.matchAll(/^\s*(?:"([^"]+)"|([a-zä-ü0-9]+)):\s*\[/gmu)) {
    out.push(m[1] ?? m[2]);
  }
  return out;
}

test("the table is versioned", () => {
  assert.match(SRC, /export const VOCABULARY_VERSION = "\d+\.\d+\.\d+"/);
});

test("expansion is not derived from the benchmark expansion file", () => {
  // benchmarks/queries/query-expansions.json is keyed by QUERY ID and exists to
  // widen the candidate pool for annotation. Using it in the product would mean
  // the retrieval evaluation measures a table built from its own test set.
  // Check the CODE, not the prose: the header comment names that file precisely
  // in order to state that this table is deliberately NOT derived from it.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(
    !/query-expansions|benchmarks\//.test(code),
    "vocabulary.ts must not read or reference the benchmark expansion file",
  );
});

test("expansion applies to the query, never to the corpus", () => {
  // search.ts must expand parsed query terms. If the corpus were expanded
  // instead, every record would grow synonyms and precision would collapse.
  assert.match(SEARCH_SRC, /expandToken|expandPhrase/, "search.ts must expand query terms");
  assert.ok(
    !/expandToken\(|expandPhrase\(/.test(SEARCH_SRC.split("export function haystack")[1] ?? ""),
    "haystack() must not expand — that would expand the corpus",
  );
});

test("a synonym hit scores lower than the user's own word", () => {
  const m = SRC.match(/export const SYNONYM_SCORE_FACTOR = ([\d.]+)/);
  assert.ok(m, "SYNONYM_SCORE_FACTOR must be declared");
  const f = Number(m[1]);
  assert.ok(f > 0 && f < 1, `factor must be in (0,1), got ${f}`);
});

test("keys and variants are lower-case", () => {
  // parseQuery lower-cases before lookup, so an upper-case key is dead weight
  // that silently never matches.
  for (const k of keys()) assert.equal(k, k.toLowerCase(), `key not lower-case: ${k}`);
  for (const v of variants()) assert.equal(v, v.toLowerCase(), `variant not lower-case: ${v}`);
});

test("no entry expands to itself", () => {
  for (const m of SRC.matchAll(/^\s*(?:"([^"]+)"|([a-zä-ü0-9]+)):\s*\[([^\]]*)\]/gmu)) {
    const key = m[1] ?? m[2];
    const vs = [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    assert.ok(!vs.includes(key), `${key} expands to itself`);
  }
});

test("a German compound does not expand to its bare head noun", () => {
  // Measured failure: `preisseite: [..., "page"]` returned 2,041 records because
  // "page" alone matches 1,955 of 10,000. A compound is SPECIFIC; expanding it
  // to the generic head throws that specificity away.
  const GENERIC_HEADS = new Set(["page", "view", "form", "site"]);
  for (const m of SRC.matchAll(/^\s*([a-zä-ü0-9]+seite):\s*\[([^\]]*)\]/gmu)) {
    const key = m[1];
    if (key === "seite" || key === "seiten") continue; // the bare noun itself
    for (const v of m[2].matchAll(/"([^"]+)"/g)) {
      assert.ok(
        !GENERIC_HEADS.has(v[1]),
        `compound ${key} expands to generic head "${v[1]}" — measured to dissolve the query`,
      );
    }
  }
});

const built = existsSync(INDEX_FILE);

test("no variant matches more than half the corpus", () => {
  assert.ok(built, "site/public/data/index.json missing. Run `cd site && npm run data`.");
  const items = JSON.parse(readFileSync(INDEX_FILE, "utf8"));
  const hay = items.map((it) =>
    [it.t, it.hl, it.sum, it.fw, it.in, it.sc, it.a, ...(it.tags ?? []), ...(it.kw ?? [])]
      .join(" ")
      .toLowerCase(),
  );
  // A variant this common carries no information; expanding to it makes the
  // query weaker than the word the user actually typed.
  for (const v of new Set(variants())) {
    const rx = new RegExp("\\b" + v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[^a-z0-9]+"));
    let n = 0;
    for (const h of hay) if (rx.test(h)) n++;
    assert.ok(
      n <= hay.length * 0.5,
      `variant "${v}" matches ${n}/${hay.length} records — too common to be a useful expansion`,
    );
  }
});

test("the Python evaluation mirror carries the same table", () => {
  // scripts/eval_retrieval.py hand-mirrors this table. AGENTS.md records that
  // mirrors here drift and then measure behaviour the app no longer has, so the
  // two must be compared, not trusted.
  const PY = readFileSync(join(ROOT, "scripts/eval_retrieval.py"), "utf8");
  const pyTable = PY.slice(PY.indexOf("SYN = {"), PY.indexOf("SYNONYM_FACTOR ="));
  const norm = (s) => s.replace(/\s|"/g, "");
  const pyKeys = new Set([...pyTable.matchAll(/"([^"]+)":\s*\[/g)].map((m) => m[1]));

  for (const m of SRC.matchAll(/^\s*(?:"([^"]+)"|([a-zä-ü0-9]+)):\s*\[([^\]]*)\]/gmu)) {
    const key = m[1] ?? m[2];
    assert.ok(pyKeys.has(key), `"${key}" missing from the Python mirror`);
    const tsV = norm(m[3]);
    const pyM = pyTable.match(
      new RegExp(`"${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}":\\s*\\[([^\\]]*)\\]`),
    );
    assert.equal(norm(pyM[1]), tsV, `"${key}" differs between TypeScript and the Python mirror`);
  }
  assert.equal(pyKeys.size, keys().length, "the Python mirror has entries the product does not");
});

test("r3 and r4 are not the same function", () => {
  // They were identical once: r3 silently gained vocabulary expansion, which
  // made ENG-013's measured contribution inseparable from ENG-006's.
  const PY = readFileSync(join(ROOT, "scripts/eval_retrieval.py"), "utf8");
  assert.match(PY, /def r3_ranked[\s\S]*?vocab=False/, "r3 must run without vocabulary expansion");
});
