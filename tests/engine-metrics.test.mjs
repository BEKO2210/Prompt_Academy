/**
 * Secondary metric, human deduplication and intra-rater protocol (ENG-017).
 *
 * All three are defined and tested BEFORE any clean-DEV result exists, so no
 * weighting or threshold can be chosen after seeing which arm it favours.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  METRICS_VERSION, REPORTING_LEVELS, averageRepetitions, secondaryMetric, taskCompliance,
} from "../engine/core/metrics.ts";
import { evaluate, withheldUncertain } from "../engine/core/evaluator.ts";
import {
  DEDUP_VERSION, INTRA_RATER_DUPLICATE_SHARE, INTRA_RATER_PROTOCOL_VERSION,
  deduplicateUnits, evaluationUnitId, expandJudgements,
  intraRaterConsistency, withCovertDuplicates,
} from "../engine/core/humanReview.ts";
import { loadEvaluation } from "../engine/core/evaluation.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const evalSet = loadEvaluation(join(ROOT, "benchmarks/tasks/v1/evaluation.json"));

// --- §2 secondary metric --------------------------------------------------

test("each task carries equal weight regardless of how many criteria it has", () => {
  // Pooling would let a 14-criterion task outweigh a 4-criterion one by more
  // than three to one, so the metric would partly measure how verbosely a task
  // was specified.
  const big = { taskId: "BIG", passed: 14, failed: 0, resolved: 14, ratio: 1 };
  const small = { taskId: "SMALL", passed: 0, failed: 2, resolved: 2, ratio: 0 };
  const m = secondaryMetric([big, small]);
  assert.equal(m.taskNormalisedCompliance, 0.5, "the metric is pooling, not task-normalising");
  const pooled = (14 + 0) / (14 + 2);
  assert.notEqual(m.taskNormalisedCompliance, pooled);
});

test("unresolved criteria leave the denominator, never count as failure", () => {
  const ev = evaluate("nothing", {
    assertions: [
      { id: "d1", kind: "regex", value: "nothing" },
      { id: "h1", kind: "human", value: "someone must look" },
    ],
    forbidden: [], required_artifacts: [], notes: "",
  });
  const t = taskCompliance("T", ev);
  assert.equal(t.resolved, 1, "the unjudged human check entered the denominator");
  assert.equal(t.ratio, 1, "an unresolved check dragged the ratio down");
});

test("a task with nothing resolved is reported, not averaged in as zero", () => {
  const m = secondaryMetric([
    { taskId: "OK", passed: 1, failed: 1, resolved: 2, ratio: 0.5 },
    { taskId: "NONE", passed: 0, failed: 0, resolved: 0, ratio: null },
  ]);
  assert.equal(m.taskNormalisedCompliance, 0.5);
  assert.equal(m.contributingTasks, 1);
  assert.deepEqual(m.unmeasuredTasks, ["NONE"]);
});

test("repetitions are collapsed before the task-level mean", () => {
  // Otherwise a task with more repetitions gains weight — the same pooling error
  // one level down.
  const a = averageRepetitions("T", [
    { taskId: "T", passed: 2, failed: 0, resolved: 2, ratio: 1 },
    { taskId: "T", passed: 0, failed: 2, resolved: 2, ratio: 0 },
    { taskId: "T", passed: 0, failed: 0, resolved: 0, ratio: null },
  ]);
  assert.equal(a.ratio, 0.5, "the unresolved repetition was counted");
});

test("the reporting order puts the primary metric first and cannot be reordered silently", () => {
  assert.deepEqual(REPORTING_LEVELS.primary, ["independentTaskSuccess"]);
  assert.deepEqual(REPORTING_LEVELS.secondary, ["taskNormalisedIndependentCriterionCompliance"]);
  assert.ok(REPORTING_LEVELS.diagnostic.includes("deterministicCompliance"));
  assert.ok(!REPORTING_LEVELS.primary.includes("deterministicCompliance"));
  assert.match(METRICS_VERSION, /^\d+\.\d+\.\d+$/);
});

// --- §4 human deduplication ----------------------------------------------

const unit = (o) => ({
  taskId: "T014", outputHash: "h1", criterionId: "a2h",
  criterionVersion: "task-set-v1-eval4", rubricVersion: "1.0.0", ...o,
});

test("an identical evaluation unit is judged once", () => {
  const { unique, duplicates } = deduplicateUnits([unit(), unit(), unit({ criterionId: "a3h" })]);
  assert.equal(unique.length, 2);
  assert.equal(duplicates.length, 1);
});

test("a difference in ANY identity field blocks deduplication", () => {
  // Two outputs differing by one line can differ by exactly the line a criterion
  // is about, so only exact identity may be reused.
  for (const diff of [
    { outputHash: "h2" }, { taskId: "T015" }, { criterionId: "a3h" },
    { criterionVersion: "task-set-v1-eval3" }, { rubricVersion: "0.9.0" },
  ]) {
    const { unique } = deduplicateUnits([unit(), unit(diff)]);
    assert.equal(unique.length, 2, `deduplicated across a difference in ${Object.keys(diff)[0]}`);
  }
});

test("a judgement expands back onto every identical unit", () => {
  const units = [unit(), unit(), unit({ criterionId: "a3h" })];
  const { unique } = deduplicateUnits(units);
  const judged = Object.fromEntries(unique.map((u, i) => [evaluationUnitId(u), i === 0 ? "pass" : "fail"]));
  const expanded = expandJudgements(units, judged);
  assert.deepEqual(expanded.map((e) => e.verdict), ["pass", "pass", "fail"]);
  assert.match(DEDUP_VERSION, /^\d+\.\d+\.\d+$/);
});

// --- §3 intra-rater protocol ---------------------------------------------

const item = (i) => ({
  taskId: `T0${i}`, arm: i % 2 ? "A" : "D", runIndex: 0,
  request: `req ${i}`, output: `out ${i}`, evaluation: evalSet.evaluations.T014,
});

test("covert duplicates are inserted, paired, and not adjacent to their twin", () => {
  const items = Array.from({ length: 20 }, (_, i) => item(i));
  const b = withCovertDuplicates(items, 1234);
  assert.equal(b.packets.length, 22, `expected 10% duplicates, got ${b.packets.length - 20}`);
  assert.equal(b.duplicatePairs.length, 2);
  for (const [p1, p2] of b.duplicatePairs) {
    const i1 = b.packets.findIndex((p) => p.packetId === p1);
    const i2 = b.packets.findIndex((p) => p.packetId === p2);
    assert.notEqual(i1, i2);
    // Same content, different id — which is what makes the duplicate covert.
    assert.equal(b.packets[i1].output, b.packets[i2].output);
    assert.deepEqual(b.packets[i1].criteria, b.packets[i2].criteria);
  }
  assert.equal(INTRA_RATER_DUPLICATE_SHARE, 0.1);
  assert.match(INTRA_RATER_PROTOCOL_VERSION, /^\d+\.\d+\.\d+$/);
});

test("the packet itself never reveals that it is a duplicate", () => {
  const b = withCovertDuplicates(Array.from({ length: 20 }, (_, i) => item(i)), 7);
  const flagged = b.packets.filter((p) => JSON.stringify(p).match(/duplicate|repeat|twin/i));
  assert.deepEqual(flagged, [], "a packet advertises its duplicate status");
});

test("intra-rater consistency is computed, and kappa is withheld when it would be meaningless", () => {
  const items = Array.from({ length: 20 }, (_, i) => item(i));
  const b = withCovertDuplicates(items, 99);
  const results = {};
  for (const [p1, p2] of b.duplicatePairs) {
    results[p1] = { a2h: "pass", a3h: "pass" };
    results[p2] = { a2h: "pass", a3h: "fail" };   // one disagreement per pair
  }
  const r = intraRaterConsistency(b, results);
  assert.equal(r.comparedPropositions, 4);
  assert.equal(r.agreements, 2);
  assert.equal(r.rawAgreement, 0.5);
  assert.equal(r.kappa, null, "kappa must be withheld on a sample this small");
  assert.match(r.kappaNote, /only 4 paired propositions/);
});

test("kappa is withheld when every judgement fell in one class", () => {
  const b = withCovertDuplicates(Array.from({ length: 60 }, (_, i) => item(i)), 5);
  const results = {};
  for (const [p1, p2] of b.duplicatePairs) {
    results[p1] = { a2h: "pass", a3h: "pass" };
    results[p2] = { a2h: "pass", a3h: "pass" };
  }
  const r = intraRaterConsistency(b, results);
  assert.ok(r.comparedPropositions >= 10);
  assert.equal(r.rawAgreement, 1);
  assert.equal(r.kappa, null);
  assert.match(r.kappaNote, /one class/);
});

test("the result is named intra-rater, never inter-rater", () => {
  const src = readFileSync(join(ROOT, "engine/core/humanReview.ts"), "utf8");
  assert.match(src, /NOT inter-rater reliability/);
  assert.ok(!/export function interRater/i.test(src));
});

// --- uncertain must never be coerced -------------------------------------

test("an UNCERTAIN judgement is withheld, not turned into pass or fail", () => {
  const raw = { h1: "pass", h2: "uncertain", h3: "fail" };
  assert.deepEqual(withheldUncertain(raw), { h1: "pass", h3: "fail" });
  const ev = evaluate("x", {
    assertions: [{ id: "h1", kind: "human", value: "p" }, { id: "h2", kind: "human", value: "q" }],
    forbidden: [], required_artifacts: [], notes: "",
  }, withheldUncertain({ h1: "pass", h2: "uncertain" }));
  assert.equal(ev.independentTaskSuccess, "pending", "an uncertain check resolved the task anyway");
});

// --- §1 DEV subdivision ---------------------------------------------------

test("DEV_PILOT, DEV_CLEAN and HOLDOUT are disjoint and complete", () => {
  const s = JSON.parse(readFileSync(join(ROOT, "benchmarks/tasks/v1/splits.json"), "utf8"));
  const pilot = new Set(s.dev_pilot), clean = new Set(s.dev_clean), hold = new Set(s.holdout);
  assert.equal(pilot.size, 10);
  assert.equal(clean.size, 20);
  assert.equal(hold.size, 20);
  for (const t of clean) assert.ok(!pilot.has(t) && !hold.has(t), `${t} is in more than one split`);
  for (const t of pilot) assert.ok(!hold.has(t), `${t} is in both pilot and holdout`);
  assert.deepEqual([...pilot, ...clean].sort(), [...s.dev].sort(), "the subdivision lost or gained a DEV task");
});

test("DEV_PILOT is exactly the set already exposed, not a reselection", () => {
  // Membership must follow from what was already run, never from what looks
  // convenient. The pilot subset file is the record of what was spent.
  const s = JSON.parse(readFileSync(join(ROOT, "benchmarks/tasks/v1/splits.json"), "utf8"));
  const spent = JSON.parse(readFileSync(join(ROOT, "benchmarks/tasks/v1/pilot-subset.json"), "utf8"));
  assert.deepEqual([...s.dev_pilot].sort(), [...spent.task_ids].sort());
});

test("the freeze manifest carries the subdivision and the new protocol versions", () => {
  const m = JSON.parse(readFileSync(join(ROOT, "benchmarks/tasks/v1/freeze-manifest.json"), "utf8"));
  assert.equal(m.devPilotIds.length, 10);
  assert.equal(m.devCleanIds.length, 20);
  assert.equal(m.holdoutTasks, 20);
  assert.equal(m.secondaryMetric.version, METRICS_VERSION);
  assert.equal(m.humanDeduplication.version, DEDUP_VERSION);
  assert.equal(m.intraRaterProtocol.version, INTRA_RATER_PROTOCOL_VERSION);
  assert.match(m.capacityGateRule, /\+0\.20/);
  assert.match(m.modelReferencePolicy, /No hosted API|explicit approval/);
  // The holdout policy must still be absolute.
  assert.match(m.holdoutPolicy, /UNTOUCHED/);
});
