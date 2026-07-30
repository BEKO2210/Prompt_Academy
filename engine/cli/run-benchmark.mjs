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
import { evaluate } from "../core/evaluator.ts";
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

const byArm = new Map();
for (const r of scored) {
  if (!byArm.has(r.arm)) byArm.set(r.arm, []);
  byArm.get(r.arm).push(r);
}

console.log(`\nprovider=${scored[0]?.provider} model=${scored[0]?.model} n=${nRuns}`);
console.log(`tasks scored: ${new Set(scored.map((r) => r.taskId)).size} of ${taskSet.tasks.length}`);
if (out.unretrieved.length) {
  console.log(`EXCLUDED (retrieval found nothing): ${out.unretrieved.join(", ")}`);
}
console.log("\narm  structural  autoPass  autoFail  unresolved  ctxChars");
for (const arm of [...byArm.keys()].sort()) {
  const rs = byArm.get(arm);
  const s = rs.filter((r) => r.evaluation.structuralSuccess).length;
  const p = rs.reduce((a, r) => a + r.evaluation.automatedPassed, 0);
  const f = rs.reduce((a, r) => a + r.evaluation.automatedFailed, 0);
  const u = rs.reduce((a, r) => a + r.evaluation.unresolved, 0);
  const c = Math.round(rs.reduce((a, r) => a + r.contextChars, 0) / rs.length);
  console.log(`  ${arm}  ${String(s).padStart(9)}  ${String(p).padStart(8)}  ${String(f).padStart(8)}  ${String(u).padStart(10)}  ${String(c).padStart(8)}`);
}
console.log(
  "\nNOTE: with the stub provider these numbers describe the HARNESS, not any model.\n" +
  "'structural' counts only tasks whose automated checks all passed AND that have\n" +
  "no unresolved human assertions — see engine/core/evaluator.ts.",
);

if (outFile) {
  const path = join(ROOT, outFile);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ config: cfg, unretrieved: out.unretrieved, records: scored }, null, 1));
  console.log(`\nwrote ${outFile}`);
}
