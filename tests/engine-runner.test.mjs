/**
 * H1 runner, retrieval and evaluator (ENG-008 §2, §4, §5, §6, §7).
 *
 * Companion to engine-arms.test.mjs, which covers prompt assembly. This file
 * covers the parts that decide whether a completed run may be interpreted at
 * all: the self-policing constants check, arm-blind evaluation, and the shared
 * ranking that ADR-0001 requires.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertConstants, hashString, runBenchmark, shuffle, rng } from "../engine/core/runner.ts";
import { loadCorpus, projectRecord, retrieve } from "../engine/core/retrieval.ts";
import { evaluate } from "../engine/core/evaluator.ts";
import { loadEvaluation } from "../engine/core/evaluation.ts";
import { loadTasksForAssembly } from "../engine/core/taskset.ts";
import { StubProvider } from "../engine/core/provider.ts";
import { FUNCTION_WORDS, MIN_DOCUMENT_FREQUENCY, formulateQuery } from "../engine/core/queryFormulation.ts";
import { SYSTEM_WRAPPER } from "../engine/core/arms.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TASKS = join(ROOT, "benchmarks/tasks/v1/tasks.json");
const EVALS = join(ROOT, "benchmarks/tasks/v1/evaluation.json");

const taskSet = loadTasksForAssembly(TASKS);
const evalSet = loadEvaluation(EVALS);

const corpus = loadCorpus([
  join(ROOT, "data/01_landing_pages.jsonl"),
  join(ROOT, "data/02_ui_components.jsonl"),
]);

/**
 * The FULL corpus, for the query-formulation tests only.
 *
 * They were first written against the two-file corpus above and silently failed
 * to test anything: "escape" has df 0 in ~2,000 records, so it was excluded as
 * absent rather than by the frequency floor, and removing the floor changed
 * nothing. Deleting the floor and deleting function-word filtering both left the
 * suite green. Document frequency is a property of the whole corpus, so a test
 * about it has to see the whole corpus.
 */
const fullCorpus = loadCorpus(
  readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".jsonl")).map((f) => join(ROOT, "data", f)),
);

const CFG = {
  temperature: 0,
  maxTokens: 2048,
  seed: 7,
  retrievalK: 3,
  maxQueryTerms: 3,
  nRuns: 1,
  taskOrderSeed: 11,
  armOrderSeed: 13,
  datasetVersion: "test",
  taskSetVersion: taskSet.version,
  evaluationHash: "test-hash",
};

const FIXED_NOW = () => "2026-07-30T12:00:00.000Z";

// --- ADR-0001: one ranking implementation, two consumers ------------------

test("the engine imports the site ranking rather than reimplementing it", () => {
  const src = readFileSync(join(ROOT, "engine/core/retrieval.ts"), "utf8");
  assert.match(src, /from "\.\.\/\.\.\/site\/src\/lib\/ranking\.ts"/);
  assert.match(src, /from "\.\.\/\.\.\/site\/src\/lib\/search\.ts"/);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/function rankResults|function matchesParsed/.test(code), "ranking was reimplemented");
});

test("the index projection matches what the site builds", () => {
  // If this drifts, the engine ranks on different text than Library users see,
  // which is the divergence ADR-0001 exists to prevent.
  const built = JSON.parse(readFileSync(join(ROOT, "site/public/data/index.json"), "utf8"));
  const byId = new Map(built.map((it) => [it.id, it]));
  let compared = 0;
  for (const rec of corpus.records.slice(0, 200)) {
    const site = byId.get(rec.id);
    if (!site) continue;
    const mine = projectRecord(rec);
    for (const k of ["t", "hl", "sum", "fw", "in", "sc", "a"]) {
      assert.equal(mine[k], site[k] ?? "", `${rec.id}: field ${k} differs from the site index`);
    }
    assert.deepEqual(mine.tags, site.tags ?? [], `${rec.id}: tags differ`);
    assert.deepEqual(mine.kw, site.kw ?? [], `${rec.id}: keywords differ`);
    compared++;
  }
  assert.ok(compared > 50, `only ${compared} records compared — the check is not exercising much`);
});

test("retrieval returns one primary record and extras for arm E", () => {
  // A formulated query, not a raw sentence — see the query-formulation tests
  // for why a raw request retrieves nothing.
  const r = retrieve(corpus, "pricing", 3);
  assert.ok(r.primary, "no record retrieved for a query the corpus can serve");
  assert.ok(r.recordIds.length >= 1 && r.recordIds.length <= 3);
  assert.equal(r.recordIds[0], r.primary.id);
  assert.ok(!r.additional.some((x) => x.id === r.primary.id), "primary duplicated into extras");
});

test("retrieval is deterministic", () => {
  const a = retrieve(corpus, "login form with error state", 3).recordIds;
  const b = retrieve(corpus, "login form with error state", 3).recordIds;
  assert.deepEqual(a, b);
});

// --- §5 evaluator ---------------------------------------------------------

test("the evaluator cannot see the arm or the record", () => {
  // §2: arm-blind, enforced by signature. `evaluate` takes exactly two args.
  assert.equal(evaluate.length, 2, "evaluate() gained a parameter — it must take output + Layer 2 only");
  const src = readFileSync(join(ROOT, "engine/core/evaluator.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/from ["'][^"']*(arms|retrieval|runner)/.test(code), "evaluator imports arm or retrieval state");
});

test("the evaluator is deterministic", () => {
  const ev = evalSet.evaluations.T002;
  const out = '<input type="email" /><input type="password" />';
  assert.deepEqual(evaluate(out, ev), evaluate(out, ev));
});

test("human assertions are never counted as passes", () => {
  // The whole validity of "task success" rests on this. A harness that quietly
  // scored human judgement as passing would inflate every arm equally and make
  // the comparison look more decisive than it is.
  const ev = evalSet.evaluations.T007;
  const r = evaluate("nothing useful", ev);
  const humanIds = ev.assertions.filter((a) => a.kind === "human").map((a) => a.id);
  assert.ok(humanIds.length > 0, "fixture has no human assertions to test");
  for (const id of humanIds) {
    assert.equal(r.checks.find((c) => c.id === id).status, "unresolved");
  }
  assert.ok(r.unresolved >= humanIds.length);
});

test("a task with unresolved checks is not reported as a success", () => {
  // Unmeasured is neither pass nor fail. Merging it into either fabricates a
  // result, which ENG-008 forbids outright.
  const ev = evalSet.evaluations.T007;
  const perfect = 'role="dialog" aria-modal="true" Escape';
  const r = evaluate(perfect, ev);
  assert.ok(r.automatedFailed === 0, "the automated checks should pass for this output");
  assert.ok(r.unresolved > 0);
  assert.equal(r.structuralSuccess, false, "unresolved checks must block structuralSuccess");
});

test("forbidden content fails the task", () => {
  const ev = evalSet.evaluations.T006;
  const r = evaluate("const key = 'stripe_live_xxx'", ev);
  assert.ok(r.automatedFailed > 0, "a forbidden string did not fail");
});

test("a broken pattern in Layer 2 is unresolved, not a model failure", () => {
  const r = evaluate("anything", {
    assertions: [{ id: "bad", kind: "regex", value: "([unclosed" }],
    forbidden: [], required_artifacts: [], notes: "",
  });
  assert.equal(r.checks[0].status, "unresolved", "a harness typo must not be blamed on the model");
});

// --- §4 / §7 the harness policing itself ---------------------------------

test("a full stub run produces no violations", async () => {
  const provider = new StubProvider();
  const out = await runBenchmark(taskSet.tasks.slice(0, 3), corpus, provider, CFG, FIXED_NOW);
  assert.deepEqual(out.violations, [], out.violations.join("; "));
  assert.equal(out.usable, true);
  assert.equal(out.records.length, 3 * 5 * CFG.nRuns, "arm matrix incomplete");
});

test("the run record carries every §6 field", async () => {
  const out = await runBenchmark(taskSet.tasks.slice(0, 1), corpus, new StubProvider(), CFG, FIXED_NOW);
  const r = out.records[0];
  for (const k of [
    "arm", "taskId", "runIndex", "nRuns", "provider", "model", "modelVersion",
    "temperature", "outputBudget", "systemWrapperHash", "fieldSplitVersion",
    "datasetVersion", "taskSetVersion", "evaluationHash", "retrievedRecordIds",
    "taskOrderSeed", "armOrderSeed", "timestamp", "inputTokens", "outputTokens", "latencyMs",
  ]) {
    assert.ok(r[k] !== undefined, `run record is missing §6 field: ${k}`);
  }
  assert.equal(r.systemWrapperHash, hashString(SYSTEM_WRAPPER));
});

test("a differing system wrapper is caught as a violation", () => {
  const base = {
    arm: "A", taskId: "T001", runIndex: 0, nRuns: 1, provider: "stub", model: "stub",
    modelVersion: "1", temperature: 0, outputBudget: 100, systemWrapperHash: "aaa",
    fieldSplitVersion: "1.0.0", datasetVersion: "d", taskSetVersion: "t", evaluationHash: "e",
    retrievedRecordIds: [], taskOrderSeed: 1, armOrderSeed: 1, timestamp: "x", output: "",
    inputTokens: 0, outputTokens: 0, latencyMs: 0, contextChars: 0,
  };
  const v = assertConstants([base, { ...base, arm: "B", systemWrapperHash: "bbb" }]);
  assert.ok(v.some((x) => /system wrapper/.test(x)), "a differing system wrapper went undetected");
});

test("B, C and D on different records is caught as a violation", () => {
  const base = {
    arm: "B", taskId: "T001", runIndex: 0, nRuns: 1, provider: "stub", model: "stub",
    modelVersion: "1", temperature: 0, outputBudget: 100, systemWrapperHash: "aaa",
    fieldSplitVersion: "1.0.0", datasetVersion: "d", taskSetVersion: "t", evaluationHash: "e",
    retrievedRecordIds: ["PRM-1"], taskOrderSeed: 1, armOrderSeed: 1, timestamp: "x", output: "",
    inputTokens: 0, outputTokens: 0, latencyMs: 0, contextChars: 0,
  };
  const v = assertConstants([
    base,
    { ...base, arm: "C" },
    { ...base, arm: "D", retrievedRecordIds: ["PRM-2"] },
  ]);
  assert.ok(v.some((x) => /different records/.test(x)), "same-record isolation went undetected");
});

test("a model version change mid-run is caught", () => {
  const base = {
    arm: "A", taskId: "T001", runIndex: 0, nRuns: 1, provider: "stub", model: "m",
    modelVersion: "v1", temperature: 0, outputBudget: 100, systemWrapperHash: "a",
    fieldSplitVersion: "1.0.0", datasetVersion: "d", taskSetVersion: "t", evaluationHash: "e",
    retrievedRecordIds: [], taskOrderSeed: 1, armOrderSeed: 1, timestamp: "x", output: "",
    inputTokens: 0, outputTokens: 0, latencyMs: 0, contextChars: 0,
  };
  const v = assertConstants([base, { ...base, runIndex: 1, modelVersion: "v2" }]);
  assert.ok(v.some((x) => /model version/.test(x)));
});

test("arm A never carries a record id", async () => {
  const out = await runBenchmark(taskSet.tasks.slice(0, 4), corpus, new StubProvider(), CFG, FIXED_NOW);
  for (const r of out.records.filter((x) => x.arm === "A")) {
    assert.deepEqual(r.retrievedRecordIds, []);
  }
});

test("n > 1 needs no schema change", async () => {
  const out = await runBenchmark(taskSet.tasks.slice(0, 2), corpus, new StubProvider(), { ...CFG, nRuns: 3 }, FIXED_NOW);
  assert.equal(out.records.length, 2 * 5 * 3);
  assert.deepEqual(out.violations, []);
  assert.ok(out.records.every((r) => r.nRuns === 3));
});

test("order randomisation is reproducible from the recorded seed", () => {
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], 42), shuffle([1, 2, 3, 4, 5], 42));
  assert.notDeepEqual(shuffle([1, 2, 3, 4, 5], 42), shuffle([1, 2, 3, 4, 5], 43));
  const a = rng(9), b = rng(9);
  assert.equal(a(), b());
});

test("arms are not always executed in the same order", async () => {
  // A fixed order lets provider drift favour whichever arm runs first.
  const out = await runBenchmark(taskSet.tasks.slice(0, 5), corpus, new StubProvider(), CFG, FIXED_NOW);
  const first = out.records.filter((r) => r.runIndex === 0);
  const perTask = new Map();
  for (const r of first) {
    if (!perTask.has(r.taskId)) perTask.set(r.taskId, []);
    perTask.get(r.taskId).push(r.arm);
  }
  const orders = new Set([...perTask.values()].map((a) => a.join("")));
  assert.ok(orders.size >= 1);
  assert.notEqual([...orders][0], "ABCDE", "arm order was not randomised");
});

// --- query formulation ----------------------------------------------------

test("a raw task request retrieves nothing — the reason formulation exists", () => {
  // Measured, and the single most consequential finding of this slice: 8 of 8
  // seed requests retrieved zero records. Arms B-E would have collapsed onto
  // arm A and the run would have reported H1 falsified.
  let empty = 0;
  for (const t of taskSet.tasks) {
    if (!retrieve(fullCorpus, t.request, 3).primary) empty++;
  }
  assert.equal(empty, taskSet.tasks.length, "raw requests now retrieve — revisit formulation");
});

test("every seed task retrieves a record once formulated", () => {
  for (const t of taskSet.tasks) {
    const f = formulateQuery(fullCorpus, t.request, 3);
    assert.ok(!f.empty, `${t.task_id}: formulation produced no query`);
    assert.ok(retrieve(fullCorpus, f.query, 3).primary, `${t.task_id}: still retrieves nothing`);
  }
});

test("the document-frequency floor keeps rare verbs out of the query", () => {
  // Without it: "escape" (df 1) -> "Escape Room Display", "picks" (df 2) ->
  // "Shop with Curated Picks", "shows" (df 2) -> "Climate Change Visualizer".
  for (const [taskId, banned] of [["T007", "escape"], ["T006", "picks"], ["T004", "shows"]]) {
    const t = taskSet.tasks.find((x) => x.task_id === taskId);
    const f = formulateQuery(fullCorpus, t.request, 3);
    assert.ok(!f.query.split(" ").includes(banned), `${taskId}: "${banned}" is back in the query`);
  }
  assert.ok(MIN_DOCUMENT_FREQUENCY >= 1, "the floor must be a recorded constant");
});

test("formulation is deterministic and never model-decided", () => {
  const t = taskSet.tasks[0];
  assert.deepEqual(formulateQuery(fullCorpus, t.request, 3), formulateQuery(fullCorpus, t.request, 3));
  const src = readFileSync(join(ROOT, "engine/core/queryFormulation.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/provider|generate\(/i.test(code), "formulation must not call a model");
});

test("a task that retrieves nothing is excluded and reported, not scored", async () => {
  // Including it would contribute a guaranteed A = B = C = D = E tie, which
  // ENG-008 §7 reads as "H1 falsified". That must never happen silently.
  const unfindable = [{
    task_id: "TZZZ", domain: "none", language: "en",
    request: "zzzqqx wwwvvx yyyzzq",
  }];
  const out = await runBenchmark(unfindable, corpus, new StubProvider(), CFG, FIXED_NOW);
  assert.deepEqual(out.records, [], "a task with no record was scored anyway");
  assert.deepEqual(out.unretrieved, ["TZZZ"]);
});

test("function words are filtered out of the query", () => {
  // Without this, a request's verbs and pronouns become conjuncts and the
  // strict AND cannot be satisfied — the 8-of-8 empty case.
  for (const t of taskSet.tasks) {
    const f = formulateQuery(fullCorpus, t.request, 3);
    for (const term of f.query.split(" ").filter(Boolean)) {
      assert.ok(!FUNCTION_WORDS.has(term), `${t.task_id}: function word "${term}" became a conjunct`);
    }
  }
});

test("formulated queries land on plausibly on-topic records", () => {
  // Not a relevance metric — there is no ground truth for task->record yet.
  // It pins the three cases that were measurably wrong before the frequency
  // floor, so a regression is caught rather than rediscovered.
  const EXPECT = { T004: /upload|drop|file/i, T007: /modal|dialog/i, T008: /confirm|dialog|settings|account/i };
  for (const [taskId, rx] of Object.entries(EXPECT)) {
    const t = taskSet.tasks.find((x) => x.task_id === taskId);
    const f = formulateQuery(fullCorpus, t.request, 3);
    const rec = retrieve(fullCorpus, f.query, 3).primary;
    assert.ok(rec, `${taskId}: nothing retrieved`);
    assert.match(rec.title, rx, `${taskId}: q="${f.query}" retrieved "${rec.title}"`);
  }
});
