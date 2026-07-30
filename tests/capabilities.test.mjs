/**
 * Capability vocabulary and derived labels (ENG-001).
 *
 * Run: node --test tests/*.test.mjs
 *
 * Guards three separate things:
 *   1. The vocabulary stays small, defined and free of near-duplicates.
 *   2. The rules file stays consistent with the vocabulary and keeps the
 *      word-boundary discipline that the measured false positives forced.
 *   3. The derived manifest matches the committed rules and stays within the
 *      coverage envelope measured in reports/capabilities-quality.md.
 *
 * The regression floors below are deliberately a little under the measured
 * values: they exist to catch a rules change that silently guts coverage, not
 * to freeze the numbers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const VOCAB = JSON.parse(readFileSync(join(ROOT, "schema/capabilities.vocabulary.json"), "utf8"));
const RULES = JSON.parse(readFileSync(join(ROOT, "schema/capabilities.rules.json"), "utf8"));
const MANIFEST_FILE = join(ROOT, "reports/capabilities.json");

const IDS = VOCAB.capabilities.map((c) => c.id);

// --- 1. vocabulary hygiene ------------------------------------------------

test("vocabulary is versioned and non-empty", () => {
  assert.match(VOCAB.vocabulary_version, /^\d+\.\d+\.\d+$/);
  assert.ok(VOCAB.capabilities.length > 0);
});

test("vocabulary stays small enough to route on", () => {
  // The brief was explicit about not being unnecessarily fine-grained.
  assert.ok(IDS.length <= 40, `${IDS.length} capabilities — too fine-grained`);
});

test("capability ids are unique and namespaced", () => {
  assert.equal(new Set(IDS).size, IDS.length, "duplicate capability id");
  for (const id of IDS) {
    assert.match(id, /^[a-z0-9]+\.[a-z0-9_]+$/, `malformed id: ${id}`);
  }
});

test("every capability has a definition", () => {
  for (const c of VOCAB.capabilities) {
    assert.ok(c.label?.length > 0, `${c.id} has no label`);
    assert.ok(c.definition?.length > 20, `${c.id} has no usable definition`);
  }
});

test("no near-duplicate capabilities", () => {
  // An umbrella term implied by its own members makes overlap analysis
  // meaningless — that is why a11y.wcag was deliberately not adopted.
  const collisions = [];
  for (let i = 0; i < IDS.length; i++) {
    for (let j = i + 1; j < IDS.length; j++) {
      const a = IDS[i].split(".")[1];
      const b = IDS[j].split(".")[1];
      if (a === b && IDS[i].split(".")[0] !== IDS[j].split(".")[0]) {
        collisions.push(`${IDS[i]} ~ ${IDS[j]}`);
      }
    }
  }
  assert.deepEqual(collisions, [], "same leaf name in two namespaces");
});

// --- 2. rules consistency -------------------------------------------------

test("rules declare the vocabulary version they were written against", () => {
  assert.equal(RULES.vocabulary_version, VOCAB.vocabulary_version);
  assert.match(RULES.rules_version, /^\d+\.\d+\.\d+$/);
});

test("every rule targets a capability that exists", () => {
  const known = new Set(IDS);
  for (const cap of Object.keys(RULES.text_rules)) {
    assert.ok(known.has(cap), `text rule for unknown capability: ${cap}`);
  }
  for (const [sub, caps] of Object.entries(RULES.subcategory_rules)) {
    if (sub === "_note") continue;
    for (const cap of caps) {
      assert.ok(known.has(cap), `subcategory rule ${sub} -> unknown ${cap}`);
    }
  }
});

test("all patterns compile and use word boundaries", () => {
  // Substring matching was measured to inflate 'form' by 176%, 'graph' by 586%
  // and 'live' by 456% on this corpus. It is not allowed.
  for (const [cap, spec] of Object.entries(RULES.text_rules)) {
    assert.ok(spec.patterns?.length > 0, `${cap} has no patterns`);
    for (const p of spec.patterns) {
      assert.doesNotThrow(() => new RegExp(p, "i"), `${cap}: bad regex ${p}`);
      assert.ok(p.includes("\\b") || p.includes("(?<"), `${cap}: no word boundary in ${p}`);
    }
  }
});

test("negation handling is configured", () => {
  const neg = RULES.negated_context;
  assert.ok(neg.window_chars > 0);
  assert.ok(neg.markers.length >= 5, "too few negation markers to be useful");
});

test("subcategory rules stay a short, justified list", () => {
  const n = Object.keys(RULES.subcategory_rules).filter((k) => k !== "_note").length;
  // Mapping all 200 would mean asserting 'a dashboard probably has charts',
  // which is an assumption, not a rule.
  assert.ok(n <= 40, `${n} subcategory rules — becoming assumption rather than rule`);
});

// --- 3. derived manifest --------------------------------------------------

const built = existsSync(MANIFEST_FILE);
const M = built ? JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) : null;

function requireManifest() {
  assert.ok(built, "reports/capabilities.json missing — run scripts/derive_capabilities.py");
}

test("manifest was generated from the committed vocabulary and rules", () => {
  requireManifest();
  assert.equal(M.vocabulary_version, VOCAB.vocabulary_version,
    "manifest is stale: vocabulary changed since it was generated");
  assert.equal(M.rules_version, RULES.rules_version,
    "manifest is stale: rules changed since it was generated");
});

test("manifest covers every record", () => {
  requireManifest();
  assert.equal(M.total_records, 10000);
  assert.equal(Object.keys(M.per_record).length, 10000);
});

test("coverage does not regress below the measured envelope", () => {
  requireManifest();
  assert.ok(M.coverage_pct >= 95,
    `coverage ${M.coverage_pct}% — measured 98.66%, floor is 95%`);
});

test("every capability in the vocabulary actually fires", () => {
  requireManifest();
  assert.deepEqual(M.unused_capabilities, [],
    "a capability no record matches is either mis-specified or should be removed");
});

test("manifest references no capability outside the vocabulary", () => {
  requireManifest();
  const known = new Set(IDS);
  const seen = new Set();
  for (const v of Object.values(M.per_record)) {
    for (const c of [...v.high, ...v.medium, ...Object.keys(v.uncertain)]) seen.add(c);
  }
  const unknown = [...seen].filter((c) => !known.has(c));
  assert.deepEqual(unknown, [], "manifest contains capabilities not in the vocabulary");
});

test("high and medium never overlap for a record", () => {
  requireManifest();
  const bad = [];
  for (const [id, v] of Object.entries(M.per_record)) {
    const high = new Set(v.high);
    if (v.medium.some((c) => high.has(c))) bad.push(id);
    if (Object.keys(v.uncertain).some((c) => high.has(c) || v.medium.includes(c))) bad.push(id);
  }
  assert.deepEqual(bad.slice(0, 5), [], "a capability is both assigned and uncertain");
});

test("labels stay plausible per record", () => {
  requireManifest();
  const p = M.capabilities_per_record;
  assert.ok(p.mean >= 3 && p.mean <= 9, `mean ${p.mean} outside the measured 5.24 envelope`);
  assert.ok(p.max <= IDS.length, "a record claims more capabilities than exist");
});

test("motion.animation is flagged as low-discriminative, not silently trusted", () => {
  requireManifest();
  const pct = M.capability_frequency_pct["motion.animation"];
  assert.ok(pct > 50, "if this dropped below 50% the note in the rules file is now wrong");
  assert.ok(
    RULES.known_false_positive_risks.some((r) => r.includes("motion.animation")),
    "a capability on >50% of records must carry a documented low-signal warning",
  );
});
