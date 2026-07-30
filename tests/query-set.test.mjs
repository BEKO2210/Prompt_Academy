/**
 * Retrieval ground truth (ENG-005).
 *
 * The load-bearing test here is the circularity ban: if relevance were derived
 * from reports/capabilities.json, the later capability ablation (arm R3) would
 * be scoring itself. Everything else is structural hygiene.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const Q = join(ROOT, "benchmarks", "queries");
const queries = JSON.parse(readFileSync(join(Q, "queries.json"), "utf8"));
const rel = JSON.parse(readFileSync(join(Q, "relevance.json"), "utf8"));
const pool = JSON.parse(readFileSync(join(Q, "candidate-pool.json"), "utf8"));

const recordIds = new Set();
for (const f of readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".jsonl"))) {
  for (const l of readFileSync(join(ROOT, "data", f), "utf8").split("\n")) {
    if (l.trim()) recordIds.add(JSON.parse(l).id);
  }
}

test("query ids are unique and well-formed", () => {
  const ids = queries.queries.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^Q\d{3}$/);
});

test("no query is empty and every query declares its facets", () => {
  for (const q of queries.queries) {
    assert.ok(q.query.trim().length > 0, `${q.id} empty`);
    for (const f of ["language", "type", "difficulty", "split", "intent"]) {
      assert.ok(q[f], `${q.id} missing ${f}`);
    }
  }
});

test("no query is in both dev and holdout", () => {
  const seen = new Map();
  for (const q of queries.queries) {
    if (seen.has(q.id)) assert.equal(seen.get(q.id), q.split, `${q.id} split conflict`);
    seen.set(q.id, q.split);
    assert.ok(["dev", "holdout"].includes(q.split), `${q.id} bad split`);
  }
});

test("every graded record exists in the dataset", () => {
  for (const [qid, v] of Object.entries(rel.queries)) {
    for (const rid of [...Object.keys(v.relevance), ...v.judged_not_relevant]) {
      assert.ok(recordIds.has(rid), `${qid} references unknown record ${rid}`);
    }
  }
});

test("grades are 1-3 in relevance, and 0s live in judged_not_relevant", () => {
  for (const [qid, v] of Object.entries(rel.queries)) {
    for (const [rid, g] of Object.entries(v.relevance)) {
      assert.ok([1, 2, 3].includes(g), `${qid}/${rid} grade ${g}`);
    }
    for (const rid of v.judged_not_relevant) {
      assert.ok(!(rid in v.relevance), `${qid}/${rid} graded twice`);
    }
  }
});

test("the judged set is exactly the candidate pool", () => {
  // Auditability: a method cannot later claim credit for a record never seen.
  for (const [qid, v] of Object.entries(rel.queries)) {
    const judged = new Set([...Object.keys(v.relevance), ...v.judged_not_relevant]);
    const pooled = new Set(pool.pool[qid].candidate_ids);
    assert.equal(judged.size, pooled.size, `${qid}: judged ${judged.size} vs pool ${pooled.size}`);
    for (const r of pooled) assert.ok(judged.has(r), `${qid}: ${r} pooled but unjudged`);
  }
});

test("zero-result queries really have no relevant record", () => {
  for (const [qid, v] of Object.entries(rel.queries)) {
    if (v.expected_relevant_count === 0) {
      assert.equal(Object.keys(v.relevance).length, 0, `${qid} declared zero-result but has grades`);
    }
  }
});

test("versioning and dataset hash are present and consistent", () => {
  for (const k of ["ground_truth_version", "dataset_hash", "created_at", "query_schema_version"]) {
    assert.ok(rel[k], `relevance.json missing ${k}`);
  }
  assert.equal(rel.dataset_hash, pool.dataset_hash, "hash mismatch between relevance and pool");
  assert.equal(rel.frozen, true, "ground truth must be marked frozen");
});

test("the label schema supports the metrics the benchmark plan commits to", () => {
  // nDCG needs graded relevance; declaring it without grades would be a lie.
  assert.ok(rel.metrics_supported.includes("nDCG@k"));
  const grades = new Set();
  for (const v of Object.values(rel.queries)) for (const g of Object.values(v.relevance)) grades.add(g);
  assert.ok(grades.size >= 2, "nDCG is claimed but relevance is effectively binary");
  assert.deepEqual(rel.k_values, [1, 3, 5, 10]);
});

test("both splits are populated and more than one language is covered", () => {
  const split = Object.fromEntries(queries.queries.map((q) => [q.id, q.split]));
  const counts = { dev: 0, holdout: 0 };
  const langs = new Set();
  for (const qid of Object.keys(rel.queries)) {
    counts[split[qid]]++;
    langs.add(rel.queries[qid].language);
  }
  assert.ok(counts.dev > 0 && counts.holdout > 0, "a split has no annotated queries");
  assert.ok(langs.size >= 2, `single-language query set: ${[...langs]}`);
});

// --- the one that matters -------------------------------------------------

test("ground truth is NOT derived from capability labels (circularity ban)", () => {
  const capFile = join(ROOT, "reports", "capabilities.json");
  if (!existsSync(capFile)) return;
  const caps = JSON.parse(readFileSync(capFile, "utf8")).per_record;

  for (const [qid, v] of Object.entries(rel.queries)) {
    const graded = Object.keys(v.relevance);
    if (graded.length < 4) continue;
    // Had relevance been generated by selecting a capability cohort, every
    // relevant record would carry an identical capability set.
    const sets = graded.filter((r) => caps[r])
      .map((r) => [...caps[r].high, ...caps[r].medium].sort().join("|"));
    assert.ok(new Set(sets).size > 1,
      `${qid}: all relevant records share one capability set — ground truth looks capability-derived`);
  }
});

test("annotation status is explicit for every query", () => {
  // Half-annotated sets are fine; silently half-annotated ones are not.
  for (const q of queries.queries) {
    assert.ok(["annotated", "authored_not_annotated"].includes(q.annotation_status),
      `${q.id} has no annotation_status`);
    const inRel = q.id in rel.queries;
    assert.equal(inRel, q.annotation_status === "annotated",
      `${q.id}: annotation_status disagrees with relevance.json`);
  }
});

test("single-annotator limitation is declared, not hidden", () => {
  assert.equal(rel.annotator_count, 1);
  assert.match(rel.annotator_note, /inter-annotator/i);
});
