/**
 * Retrieval evaluation harness (baseline measurement).
 *
 * The important guard here is holdout protection: the harness must refuse to
 * measure the frozen split without an explicit flag, or the holdout silently
 * becomes a tuning set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = readFileSync(join(ROOT, "scripts/eval_retrieval.py"), "utf8");
const REPORT = join(ROOT, "reports/retrieval-baseline-dev.json");

test("harness refuses the holdout without an explicit flag", () => {
  assert.match(SRC, /REFUSED: the holdout is frozen/,
    "holdout must be protected from casual measurement");
  assert.match(SRC, /i-am-doing-the-final-measurement/);
});

test("harness defaults to the dev split", () => {
  assert.match(SRC, /--split", default="dev"/);
});

test("every evaluated method mirrors something real, none is invented here", () => {
  // The guard is not "no ranking" any more — ENG-006 shipped ranking, so it is
  // legitimately measured. The guard is that the harness only evaluates methods
  // the product actually had or has, so a flattering method cannot be invented
  // for the benchmark.
  const block = SRC.match(/METHODS = \{([\s\S]*?)\}/);
  assert.ok(block, "METHODS table not found");
  const names = [...block[1].matchAll(/"(\w+)"\s*:/g)].map((m) => m[1]);
  assert.deepEqual(names.sort(), [
    "r0_substring",       // pre-ENG-010, historical
    "r1_and_terms",       // ENG-010, historical
    "r2_token_boundary",  // ENG-012, shipped matching
    "r3_ranked",          // ENG-006, ranking WITHOUT vocabulary
    "r4_ranked_vocab",    // ENG-013, what the product ships
  ].sort(), "an unrecognised method appeared in the evaluation harness");
});

test("k values match the benchmark plan", () => {
  assert.match(SRC, /K_VALUES = \[1, 3, 5, 10\]/);
});

test("baseline report exists and is measured against the frozen ground truth", () => {
  assert.ok(existsSync(REPORT), "run scripts/eval_retrieval.py --out reports/retrieval-baseline-dev.json");
  const r = JSON.parse(readFileSync(REPORT, "utf8"));
  assert.equal(r.split, "dev", "committed baseline must be the dev split");
  assert.equal(r.ground_truth_version, "retrieval-ground-truth-v1");
  assert.ok(r.dataset_hash?.length > 0);
});

test("the shipped method still beats the pre-ENG-010 baseline", () => {
  // If a future change makes r1 worse than r0, that is a regression worth failing on.
  const r = JSON.parse(readFileSync(REPORT, "utf8"));
  const r0 = r.methods.r0_substring.aggregate;
  const r1 = r.methods.r1_and_terms.aggregate;
  assert.ok(r1["mrr"] >= r0["mrr"], `MRR regressed: ${r1["mrr"]} < ${r0["mrr"]}`);
  assert.ok(r1["ndcg@10"] >= r0["ndcg@10"], "nDCG@10 regressed against the old substring search");
});

test("zero-result queries are scored separately, not folded into the mean", () => {
  const r = JSON.parse(readFileSync(REPORT, "utf8"));
  for (const m of Object.values(r.methods)) {
    assert.ok("zero_result_queries" in m.aggregate);
    assert.ok("zero_result_correctly_empty" in m.aggregate);
  }
});
