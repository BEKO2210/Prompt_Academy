/**
 * Dataset invariants (ENG-003).
 *
 * Uses Node's built-in test runner — no dependency added (AGENTS.md: no
 * dependency without benefit). Run: node --test tests/
 *
 * These are the guardrails CI needs so a bad dataset cannot reach production.
 * Before this file existed, the deploy workflow would publish a corrupted
 * dataset without complaint (finding D4).
 *
 * Values here mirror schema/prompt.schema.json and the documented dataset
 * contract, NOT whatever the data happens to be today — otherwise the tests
 * would ratify a regression instead of catching it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = join(ROOT, "data");

const EXPECTED_FILES = 10;
const RECORDS_PER_FILE = 1000;
const EXPECTED_TOTAL = 10000;

const REQUIRED_FIELDS = [
  "id", "version", "category", "subcategory", "title", "slug",
  "language", "difficulty", "audience", "use_case", "industry",
  "style", "tech_stack", "prompt", "negative_prompt",
  "acceptance_criteria", "tags", "website_card", "quality",
  "created_by_agent", "batch",
];

const CATEGORIES = new Set([
  "landing_pages", "ui_components", "saas_dashboards", "ecommerce",
  "portfolio_personal_brand", "ai_tools_agents", "education_learning",
  "mobile_apps", "games_interactive", "data_visualization",
]);
const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced", "expert"]);
const LANGUAGES = new Set(["en", "de"]);
const AUDIENCES = new Set([
  "frontend_developer", "fullstack_developer", "designer", "product_designer",
  "founder", "marketer", "teacher", "content_creator", "ai_builder",
  "game_developer",
]);
const USE_CASES = new Set([
  "website_generation", "component_generation", "app_generation",
  "dashboard_generation", "design_system_generation", "animation_generation",
  "copywriting_plus_ui", "educational_interface", "game_ui_generation",
  "data_visualization",
]);

// Documented contract, per reports/quality_report.md
const PROMPT_WORDS_MIN = 80;
const PROMPT_WORDS_MAX = 220;
const NEGATIVE_PROMPT_WORDS_MAX = 60;
const ACCEPTANCE_MIN = 3;
const ACCEPTANCE_MAX = 6;
const TAGS_MIN = 5;
const TAGS_MAX = 12;

const ID_RE = /^PRM-\d{6}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * Known slug-pattern violations, found by this test when it was introduced
 * (ENG-003). These are REAL violations of schema/prompt.schema.json, whose slug
 * pattern is ^[a-z0-9]+(-[a-z0-9]+)*$ — they contain '&', '/', '+', a leading
 * hyphen, or a double hyphen.
 *
 * They pass validate_dataset.py because that script checks slug UNIQUENESS only
 * and never the pattern, so the committed "Schema valid: YES" claim in
 * reports/quality_report.md does not cover them.
 *
 * No live impact today: slugs are carried in the index and displayed, but are
 * NOT used for routing (verified — site/src/main.tsx routes on fixed paths).
 * They would break the moment slugs became URL segments, which is the obvious
 * next use.
 *
 * Allowlisted rather than fixed here because ENG-003's scope is the CI safety
 * net, not dataset mutation; fixing them means choosing replacement text
 * ('&' -> 'and'? '+' -> 'plus'?) which is a content decision worth reviewing.
 * Tracked as ENG-009. This list must only ever shrink — a NEW violation fails.
 */
const KNOWN_BAD_SLUGS = new Set([
  "PRM-003047", // product-page-with-q&a-section
  "PRM-003197", // filter-with-view-toggle-grid/list
  "PRM-003488", // marketplace-with-seller-q&a
  "PRM-004820", // bespoke--ats-friendly-cv-site-4820
  "PRM-004840", // purpose-driven--ats-friendly-cv-site-4840
  "PRM-006128", // live-q&a-session-interface-127
  "PRM-006436", // ci/cd-pipeline-visualizer-435
  "PRM-006619", // comptia-a+-practice-lab-618
  "PRM-006786", // instructor-student-q&a-785
  "PRM-008387", // -archaeological-expedition  (leading hyphen; looks truncated)
]);

/** Load once; every test reads this. */
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".jsonl")).sort();
const byFile = new Map();
const all = [];
for (const f of files) {
  const lines = readFileSync(join(DATA_DIR, f), "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  const recs = lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      throw new Error(`${f}:${i + 1}: invalid JSON — ${e.message}`);
    }
  });
  byFile.set(f, recs);
  all.push(...recs);
}

/** Report at most `n` offending ids so a failure is actionable, not a wall. */
function sample(ids, n = 5) {
  return ids.slice(0, n).join(", ") + (ids.length > n ? ` … (+${ids.length - n})` : "");
}

test("exactly 10 jsonl files", () => {
  assert.equal(files.length, EXPECTED_FILES, `found: ${files.join(", ")}`);
});

test("every file has exactly 1000 records", () => {
  for (const [f, recs] of byFile) {
    assert.equal(recs.length, RECORDS_PER_FILE, `${f} has ${recs.length}`);
  }
});

test("10000 records total", () => {
  assert.equal(all.length, EXPECTED_TOTAL);
});

test("every record has all 21 required fields", () => {
  const missing = [];
  for (const r of all) {
    for (const f of REQUIRED_FIELDS) {
      if (!(f in r)) missing.push(`${r.id ?? "<no id>"}.${f}`);
    }
  }
  assert.equal(missing.length, 0, `missing: ${sample(missing)}`);
});

test("ids are unique and well-formed", () => {
  const seen = new Set();
  const dupes = [];
  const malformed = [];
  for (const r of all) {
    if (!ID_RE.test(r.id)) malformed.push(String(r.id));
    if (seen.has(r.id)) dupes.push(r.id);
    seen.add(r.id);
  }
  assert.equal(malformed.length, 0, `malformed ids: ${sample(malformed)}`);
  assert.equal(dupes.length, 0, `duplicate ids: ${sample(dupes)}`);
});

test("slugs are unique", () => {
  const seen = new Map();
  const dupes = [];
  for (const r of all) {
    if (seen.has(r.slug)) dupes.push(`${r.id} == ${seen.get(r.slug)}`);
    seen.set(r.slug, r.id);
  }
  assert.equal(dupes.length, 0, `duplicate slugs: ${sample(dupes)}`);
});

test("no NEW slug-pattern violations beyond the known 10 (ENG-009)", () => {
  const violating = all.filter((r) => !SLUG_RE.test(r.slug)).map((r) => r.id);
  const unexpected = violating.filter((id) => !KNOWN_BAD_SLUGS.has(id));
  assert.deepEqual(
    unexpected,
    [],
    `NEW slug-pattern violations — fix the slug or it will break URL routing: ` +
      `${sample(unexpected)}`,
  );
});

test("KNOWN_BAD_SLUGS is not stale — every allowlisted id still violates", () => {
  // Keeps the allowlist honest: once ENG-009 fixes a slug, this fails until the
  // id is removed from the list, so the allowlist can only shrink.
  const stillBad = new Set(all.filter((r) => !SLUG_RE.test(r.slug)).map((r) => r.id));
  const fixed = [...KNOWN_BAD_SLUGS].filter((id) => !stillBad.has(id));
  assert.deepEqual(
    fixed,
    [],
    `these slugs are now valid — remove them from KNOWN_BAD_SLUGS: ${sample(fixed)}`,
  );
});

test("titles are unique", () => {
  const seen = new Map();
  const dupes = [];
  for (const r of all) {
    if (seen.has(r.title)) dupes.push(`${r.id} == ${seen.get(r.title)}`);
    seen.set(r.title, r.id);
  }
  assert.equal(dupes.length, 0, `duplicate titles: ${sample(dupes)}`);
});

test("version is semver", () => {
  const bad = all.filter((r) => !SEMVER_RE.test(r.version)).map((r) => `${r.id}:${r.version}`);
  assert.equal(bad.length, 0, `bad versions: ${sample(bad)}`);
});

test("enum fields hold only permitted values", () => {
  const checks = [
    ["category", CATEGORIES],
    ["difficulty", DIFFICULTIES],
    ["language", LANGUAGES],
    ["audience", AUDIENCES],
    ["use_case", USE_CASES],
  ];
  for (const [field, allowed] of checks) {
    const bad = all
      .filter((r) => !allowed.has(r[field]))
      .map((r) => `${r.id}:${field}=${r[field]}`);
    assert.equal(bad.length, 0, `invalid ${field}: ${sample(bad)}`);
  }
});

test("category matches the file it lives in", () => {
  const mismatched = [];
  for (const [f, recs] of byFile) {
    // 01_landing_pages.jsonl -> landing_pages
    const expected = f.replace(/^\d+_/, "").replace(/\.jsonl$/, "");
    for (const r of recs) {
      if (r.category !== expected) mismatched.push(`${r.id} in ${f} is ${r.category}`);
    }
  }
  assert.equal(mismatched.length, 0, `mismatched: ${sample(mismatched)}`);
});

test("prompt word count within the documented 80-220 range", () => {
  const bad = all
    .map((r) => [r.id, r.prompt.trim().split(/\s+/).length])
    .filter(([, n]) => n < PROMPT_WORDS_MIN || n > PROMPT_WORDS_MAX)
    .map(([id, n]) => `${id}:${n}w`);
  assert.equal(bad.length, 0, `out of range: ${sample(bad)}`);
});

test("negative_prompt is present and at most 60 words", () => {
  const empty = all.filter((r) => !r.negative_prompt?.trim()).map((r) => r.id);
  assert.equal(empty.length, 0, `empty negative_prompt: ${sample(empty)}`);
  const tooLong = all
    .map((r) => [r.id, r.negative_prompt.trim().split(/\s+/).length])
    .filter(([, n]) => n > NEGATIVE_PROMPT_WORDS_MAX)
    .map(([id, n]) => `${id}:${n}w`);
  assert.equal(tooLong.length, 0, `too long: ${sample(tooLong)}`);
});

test("acceptance_criteria has 3-6 non-empty entries", () => {
  const bad = [];
  for (const r of all) {
    const ac = r.acceptance_criteria;
    if (!Array.isArray(ac) || ac.length < ACCEPTANCE_MIN || ac.length > ACCEPTANCE_MAX) {
      bad.push(`${r.id}:${Array.isArray(ac) ? ac.length : typeof ac}`);
    } else if (ac.some((c) => typeof c !== "string" || !c.trim())) {
      bad.push(`${r.id}:empty-entry`);
    }
  }
  assert.equal(bad.length, 0, `bad acceptance_criteria: ${sample(bad)}`);
});

test("tags has 5-12 entries", () => {
  const bad = all
    .filter((r) => !Array.isArray(r.tags) || r.tags.length < TAGS_MIN || r.tags.length > TAGS_MAX)
    .map((r) => `${r.id}:${Array.isArray(r.tags) ? r.tags.length : typeof r.tags}`);
  assert.equal(bad.length, 0, `bad tags: ${sample(bad)}`);
});

test("required nested keys are present", () => {
  const shape = {
    style: ["visual_style", "layout_style", "color_direction", "motion_style"],
    tech_stack: ["framework", "language", "styling"],
    website_card: ["headline", "summary", "preview_label", "search_keywords"],
    quality: [
      "specificity_score", "originality_score",
      "implementation_clarity_score", "website_readiness_score",
    ],
  };
  const missing = [];
  for (const r of all) {
    for (const [obj, keys] of Object.entries(shape)) {
      for (const k of keys) {
        if (r[obj]?.[k] === undefined) missing.push(`${r.id}.${obj}.${k}`);
      }
    }
  }
  assert.equal(missing.length, 0, `missing: ${sample(missing)}`);
});

test("quality scores are numbers in 1-10", () => {
  const bad = [];
  for (const r of all) {
    for (const [k, v] of Object.entries(r.quality ?? {})) {
      if (typeof v !== "number" || v < 1 || v > 10) bad.push(`${r.id}.${k}=${v}`);
    }
  }
  assert.equal(bad.length, 0, `out of range: ${sample(bad)}`);
});
