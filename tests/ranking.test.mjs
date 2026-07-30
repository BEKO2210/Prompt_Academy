/**
 * Relevance ranking (ENG-006).
 *
 * Matching decides WHICH records qualify; this decides the ORDER. The measured
 * failure it addresses: "heatmap visualization" scored P@1 1.00 but P@5 0.20,
 * because after the first accidental hit the order was arbitrary index order.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = readFileSync(join(ROOT, "site/src/lib/ranking.ts"), "utf8");
const EVAL = JSON.parse(readFileSync(join(ROOT, "reports/retrieval-eng006-dev.json"), "utf8"));

test("all weights live in one place", () => {
  assert.match(SRC, /export const WEIGHTS/, "weights must be centralised (ADR-0003)");
  assert.match(SRC, /export const RANKING_VERSION/);
});

test("scoring does not precompute per record", () => {
  // ENG-011 measured that per-record precomputation costs ~10 MB heap for no
  // felt gain. Only matched records may be scored.
  assert.ok(!/buildHaystacks|precompute/i.test(SRC), "per-record precomputation reintroduced");
  assert.match(SRC, /export function rankResults/);
});

test("a whole-token hit outranks a prefix-only hit", () => {
  assert.match(SRC, /PREFIX_ONLY_FACTOR/);
  const f = Number(SRC.match(/PREFIX_ONLY_FACTOR\s*=\s*([\d.]+)/)[1]);
  assert.ok(f > 0 && f < 1, `prefix factor ${f} must sit strictly between 0 and 1`);
});

test("repetition saturates, so a record cannot win by repeating a word", () => {
  assert.match(SRC, /Math\.log/, "term frequency must saturate");
});

test("only measured-useful fields are scored", () => {
  // The ablation removed seven of nine fields. This guards against them being
  // reintroduced without a measurement: summary was actively HARMFUL, and
  // tags/framework/industry/audience had exactly zero effect.
  const block = SRC.match(/export const WEIGHTS = \{([\s\S]*?)\} as const;/);
  assert.ok(block, "WEIGHTS not found");
  const fields = [...block[1].matchAll(/(\w+):\s*(\d+)/g)].map((m) => m[1]);
  assert.deepEqual(fields.sort(), ["subcategory", "title"],
    "a field was added to ranking without an ablation to justify it");
  const w = Object.fromEntries(
    [...block[1].matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
  );
  assert.ok(w.title > w.subcategory, "title must outrank subcategory");
});

test("ranking work is bounded so typing states cannot blow up latency", () => {
  assert.match(SRC, /export const RANK_LIMIT/);
  const n = Number(SRC.match(/RANK_LIMIT\s*=\s*(\d+)/)[1]);
  assert.ok(n >= 500 && n <= 5000, `RANK_LIMIT ${n} is outside a defensible range`);
});

// --- measured outcomes, dev split ----------------------------------------

test("ranking improves nDCG@10 over the unranked matched set", () => {
  const unranked = EVAL.methods.r2_token_boundary.aggregate["ndcg@10"];
  const ranked = EVAL.methods.r3_ranked.aggregate["ndcg@10"];
  assert.ok(ranked > unranked, `nDCG@10 ${ranked} did not beat unranked ${unranked}`);
});

test("ranking does not lose recall — it reorders the same set", () => {
  const a = EVAL.methods.r2_token_boundary.aggregate["recall@10"];
  const b = EVAL.methods.r3_ranked.aggregate["recall@10"];
  assert.ok(b >= a, `recall@10 dropped ${a} -> ${b}: ranking is discarding matches`);
});

test("the heatmap query is ordered correctly", () => {
  // The query that motivated ranking: unranked put analytics dashboards on top,
  // ranked puts actual heatmaps there.
  const q = EVAL.methods.r3_ranked.per_query.Q019;
  assert.equal(q["ndcg@10"], 1, `Q019 nDCG@10 is ${q["ndcg@10"]}, expected a perfect ordering`);
});

test("zero-result behaviour survives ranking", () => {
  const a = EVAL.methods.r3_ranked.aggregate;
  assert.equal(a.zero_result_correctly_empty, a.zero_result_queries);
  assert.equal(a.zero_result_false_positives, 0);
});

test("measured against the current ground truth version", () => {
  const rel = JSON.parse(readFileSync(join(ROOT, "benchmarks/queries/relevance.json"), "utf8"));
  assert.equal(EVAL.ground_truth_version, rel.ground_truth_version,
    "the committed evaluation is stale against the ground truth");
});
