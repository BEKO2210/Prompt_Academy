/**
 * Thin CLI for the H1 harness (ADR-0001 Layer 3).
 *
 * Argument parsing, invocation, printing. No logic worth testing lives here —
 * if something in this file needs a test, it belongs in engine/core instead.
 *
 * Default provider is the stub, deliberately: running the harness must never
 * require a model to be installed, and a stub run is how you check the harness
 * before spending real inference on it.
 *
 *   node engine/cli/run-benchmark.mjs --out reports/h1-stub.json
 */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runBenchmark } from "../core/runner.ts";
import { loadCorpus } from "../core/retrieval.ts";
import { loadTasksForAssembly } from "../core/taskset.ts";
import { evaluationHash, loadEvaluation } from "../core/evaluation.ts";
import { evaluate, EVALUATOR_VERSION } from "../core/evaluator.ts";
import { CHECKS_VERSION } from "../core/checks.ts";
import { assessEligibility, summarise, ELIGIBILITY_VERSION } from "../core/eligibility.ts";
import { REVIEW_PROTOCOL_VERSION } from "../core/humanReview.ts";
import { StubProvider } from "../core/provider.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const outFile = arg("out", null);
const tasksFile = join(ROOT, arg("tasks", "benchmarks/tasks/v1/tasks.json"));
const evalsFile = join(ROOT, arg("evaluations", "benchmarks/tasks/v1/evaluation.json"));
const nRuns = Number(arg("n", "1"));

const provider = new StubProvider();
if (arg("provider", "stub") !== "stub") {
  console.error("Only the stub provider exists. An ollama adapter is not implemented.");
  process.exit(2);
}

const corpus = loadCorpus(
  readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".jsonl")).map((f) => join(ROOT, "data", f)),
);
const taskSet = loadTasksForAssembly(tasksFile);
const evalSet = loadEvaluation(evalsFile);

const cfg = {
  temperature: 0,
  maxTokens: 2048,
  seed: 7,
  retrievalK: 3,
  maxQueryTerms: 3,
  nRuns,
  taskOrderSeed: 20260730,
  armOrderSeed: 20260731,
  datasetVersion: "data-jsonl",
  taskSetVersion: taskSet.version,
  evaluationHash: evaluationHash(evalsFile),
};

const out = await runBenchmark(taskSet.tasks, corpus, provider, cfg, () => new Date().toISOString());

if (out.violations.length) {
  // ENG-008 §7: abort, do not interpret.
  console.error("HARD STOP — the run violated a §4/§7 invariant and must not be interpreted:");
  for (const v of out.violations) console.error("  " + v);
  process.exit(1);
}

const scored = out.records.map((r) => ({
  ...r,
  evaluation: evaluate(r.output, evalSet.evaluations[r.taskId]),
}));

// ENG-014 §9: only eligible tasks enter the cross-arm comparison. Ineligible
// ones are reported by reason, never deleted and never silently scored.
const elig = assessEligibility({
  tasks: taskSet.tasks,
  evaluations: evalSet,
  unretrieved: out.unretrieved,
});
const eligibleIds = new Set(elig.filter((e) => e.eligible).map((e) => e.taskId));
const es = summarise(elig);

const byArm = new Map();
for (const r of scored) {
  if (!eligibleIds.has(r.taskId)) continue;
  if (!byArm.has(r.arm)) byArm.set(r.arm, []);
  byArm.get(r.arm).push(r);
}

console.log(`\nprovider=${scored[0]?.provider} model=${scored[0]?.model} n=${nRuns}`);
console.log(`tasks scored: ${new Set(scored.map((r) => r.taskId)).size} of ${taskSet.tasks.length}`);
if (out.unretrieved.length) {
  console.log(`EXCLUDED (retrieval found nothing): ${out.unretrieved.join(", ")}`);
}
console.log(`H1-eligible: ${es.eligible}/${es.total}`);
for (const [reason, n] of Object.entries(es.byReason)) console.log(`  excluded, ${reason}: ${n}`);
console.log(`tasks with >=1 deterministic check: ${es.withDeterministic}/${es.total}`);
console.log(`human-only tasks: ${es.humanOnly}/${es.total}`);

// ENG-014 §5: three dimensions, never merged into one number by accident.
console.log("\narm  detPass  detFail  detRate  humanPending  ITS:pass/fail/pending/na  ctxChars");
for (const arm of [...byArm.keys()].sort()) {
  const rs = byArm.get(arm);
  const dp = rs.reduce((a, r) => a + r.evaluation.deterministic.passed, 0);
  const df = rs.reduce((a, r) => a + r.evaluation.deterministic.failed, 0);
  const rate = dp + df > 0 ? (dp / (dp + df)).toFixed(3) : "  n/a";
  const hp = rs.filter((r) => r.evaluation.humanVerdict === "pending").length;
  const v = (x) => rs.filter((r) => r.evaluation.independentTaskSuccess === x).length;
  const c = Math.round(rs.reduce((a, r) => a + r.contextChars, 0) / rs.length);
  console.log(
    `  ${arm}  ${String(dp).padStart(7)}  ${String(df).padStart(7)}  ${String(rate).padStart(7)}` +
    `  ${String(hp).padStart(12)}  ${`${v("pass")}/${v("fail")}/${v("pending")}/${v("not_applicable")}`.padStart(24)}` +
    `  ${String(c).padStart(8)}`,
  );
}
console.log(
  "\nNOTE: with the stub provider these numbers describe the HARNESS, not any model.\n" +
  "Deterministic checks verify STRUCTURE, not behaviour: a bound handler is not a\n" +
  "working interaction. Independent Task Success stays `pending` until a human\n" +
  "rubric pass has run — pending is not failure, and a task with no deterministic\n" +
  "check is not_applicable, not false.",
);
console.log(
  `\nversions  checks=${CHECKS_VERSION} evaluator=${EVALUATOR_VERSION} ` +
  `eligibility=${ELIGIBILITY_VERSION} review=${REVIEW_PROTOCOL_VERSION}`,
);

if (outFile) {
  const path = join(ROOT, outFile);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({
    config: cfg,
    versions: { checks: CHECKS_VERSION, evaluator: EVALUATOR_VERSION,
                eligibility: ELIGIBILITY_VERSION, review: REVIEW_PROTOCOL_VERSION },
    unretrieved: out.unretrieved, eligibility: elig, records: scored,
  }, null, 1));
  console.log(`\nwrote ${outFile}`);
}
