/**
 * Build-artifact shape and size budgets (ENG-003).
 *
 * Run: node --test tests/*.test.mjs   (after `cd site && npm run data`)
 *
 * Two jobs:
 *   1. The artifacts the browser fetches have the shape site/src/lib/data.ts
 *      expects. A build that silently drops a field would otherwise reach
 *      production, because nothing checks it today (finding D4).
 *   2. Size budgets are enforced, so the measured ENG-002 baseline cannot
 *      silently regress. ENG-007 requires exactly this.
 *
 * Budgets come from reports/baseline-2026-07-30.json with deliberate headroom.
 * They are ceilings, not targets: raising one is a decision that must be argued
 * with a measurement, not a convenience.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_OUT = join(ROOT, "site", "public", "data");

const EXPECTED_TOTAL = 10000;
const EXPECTED_CATEGORIES = 10;

// Measured 2026-07-30: index.json = 6,908,069 B. Ceiling adds ~1.3% headroom.
// Rationale for a tight ceiling: every byte here is parse time and heap in the
// browser, and compression does not reduce either (finding D1 as corrected).
const INDEX_JSON_MAX_BYTES = 7_000_000;
// Measured: 31,579,590 B across public/data. Ceiling ~32.5 MB.
const DATA_DIR_MAX_BYTES = 32_500_000;

const CATEGORY_KEYS = [
  "landing_pages", "ui_components", "saas_dashboards", "ecommerce",
  "portfolio_personal_brand", "ai_tools_agents", "education_learning",
  "mobile_apps", "games_interactive", "data_visualization",
];

/** Keys site/src/lib/data.ts declares on IndexItem — the browser relies on these. */
const INDEX_ITEM_KEYS = [
  "id", "t", "s", "c", "sc", "d", "a", "in", "fw", "an",
  "lang", "tags", "hl", "sum", "pl", "kw", "q",
];

let index, meta, stats;
let built = false;

before(() => {
  built = existsSync(join(DATA_OUT, "index.json"));
  if (!built) return;
  index = JSON.parse(readFileSync(join(DATA_OUT, "index.json"), "utf8"));
  meta = JSON.parse(readFileSync(join(DATA_OUT, "meta.json"), "utf8"));
  stats = JSON.parse(readFileSync(join(DATA_OUT, "stats.json"), "utf8"));
});

/**
 * Fail loudly rather than skip: a silently skipped budget test is worse than no
 * test, because CI would report green while checking nothing.
 */
function requireBuild() {
  assert.ok(
    built,
    `site/public/data/ is missing. Run \`cd site && npm run data\` first. ` +
      `Refusing to pass without checking — a skipped budget test reads as green.`,
  );
}

test("build artifacts exist", () => {
  requireBuild();
  for (const f of ["index.json", "meta.json", "stats.json"]) {
    assert.ok(existsSync(join(DATA_OUT, f)), `missing ${f}`);
  }
  for (const c of CATEGORY_KEYS) {
    assert.ok(
      existsSync(join(DATA_OUT, "category", `${c}.json`)),
      `missing category/${c}.json`,
    );
  }
});

test("index.json holds one compact record per prompt", () => {
  requireBuild();
  assert.equal(index.length, EXPECTED_TOTAL);
});

test("every index record has the keys data.ts declares", () => {
  requireBuild();
  const missing = [];
  for (const it of index) {
    for (const k of INDEX_ITEM_KEYS) {
      if (!(k in it)) missing.push(`${it.id ?? "<no id>"}.${k}`);
    }
  }
  assert.equal(missing.length, 0, `missing keys: ${missing.slice(0, 5).join(", ")}`);
});

test("index ids are unique and match the dataset count", () => {
  requireBuild();
  assert.equal(new Set(index.map((i) => i.id)).size, EXPECTED_TOTAL);
});

test("index tags and kw are arrays", () => {
  requireBuild();
  const bad = index
    .filter((i) => !Array.isArray(i.tags) || !Array.isArray(i.kw))
    .map((i) => i.id);
  assert.equal(bad.length, 0, `non-array tags/kw: ${bad.slice(0, 5).join(", ")}`);
});

test("meta lists all 10 categories with counts summing to 10000", () => {
  requireBuild();
  assert.equal(meta.categories.length, EXPECTED_CATEGORIES);
  assert.equal(meta.total, EXPECTED_TOTAL);
  const sum = meta.categories.reduce((n, c) => n + c.count, 0);
  assert.equal(sum, EXPECTED_TOTAL);
  const keys = new Set(meta.categories.map((c) => c.key));
  for (const c of CATEGORY_KEYS) assert.ok(keys.has(c), `meta missing ${c}`);
});

test("meta categories carry a label and subcategories", () => {
  requireBuild();
  for (const c of meta.categories) {
    assert.ok(c.label && c.label.length > 0, `${c.key} has no label`);
    assert.ok(Array.isArray(c.subcategories) && c.subcategories.length > 0,
      `${c.key} has no subcategories`);
  }
});

test("stats totals agree with the dataset", () => {
  requireBuild();
  assert.equal(stats.total, EXPECTED_TOTAL);
  assert.equal(stats.distinctCategories, EXPECTED_CATEGORIES);
  const byCat = Object.values(stats.byCategory).reduce((a, b) => a + b, 0);
  assert.equal(byCat, EXPECTED_TOTAL);
  const byDiff = Object.values(stats.difficulty).reduce((a, b) => a + b, 0);
  assert.equal(byDiff, EXPECTED_TOTAL);
  const byLang = Object.values(stats.languages).reduce((a, b) => a + b, 0);
  assert.equal(byLang, EXPECTED_TOTAL);
});

test("category files hold full records totalling 10000", () => {
  requireBuild();
  let total = 0;
  for (const c of CATEGORY_KEYS) {
    const recs = JSON.parse(readFileSync(join(DATA_OUT, "category", `${c}.json`), "utf8"));
    total += recs.length;
    // full records, unlike the compact index
    assert.ok(recs[0].prompt, `${c}: first record has no prompt`);
    assert.ok(Array.isArray(recs[0].acceptance_criteria),
      `${c}: first record has no acceptance_criteria`);
    const wrong = recs.filter((r) => r.category !== c).map((r) => r.id);
    assert.equal(wrong.length, 0, `${c}.json contains foreign records: ${wrong.slice(0, 3)}`);
  }
  assert.equal(total, EXPECTED_TOTAL);
});

test(`index.json stays within its ${INDEX_JSON_MAX_BYTES} byte budget`, () => {
  requireBuild();
  const size = statSync(join(DATA_OUT, "index.json")).size;
  assert.ok(
    size <= INDEX_JSON_MAX_BYTES,
    `index.json is ${size} B, over the ${INDEX_JSON_MAX_BYTES} B budget. ` +
      `Every byte here costs browser parse time and heap, and gzip does not ` +
      `reduce either. Either shrink it or argue the budget up with a measurement ` +
      `(see reports/baseline-method.md).`,
  );
});

test(`public/data stays within its ${DATA_DIR_MAX_BYTES} byte budget`, () => {
  requireBuild();
  let total = 0;
  total += statSync(join(DATA_OUT, "index.json")).size;
  total += statSync(join(DATA_OUT, "meta.json")).size;
  total += statSync(join(DATA_OUT, "stats.json")).size;
  for (const c of CATEGORY_KEYS) {
    total += statSync(join(DATA_OUT, "category", `${c}.json`)).size;
  }
  assert.ok(
    total <= DATA_DIR_MAX_BYTES,
    `public/data is ${total} B, over the ${DATA_DIR_MAX_BYTES} B budget.`,
  );
});
