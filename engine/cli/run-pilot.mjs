/**
 * Provider pilot (ADR-0001 Layer 3).
 *
 * NOT an H1 result. Its purpose is to run the whole path against a real model
 * once and find defects in the runner, the adapter, prompt assembly, token
 * accounting, output handling and the evaluator.
 *
 * It runs only the frozen pilot subset, which is DEV-only. The holdout is not
 * touched, here or anywhere before the final evaluation.
 *
 *   node engine/cli/run-pilot.mjs --model qwen2.5-coder:7b-16k --out reports/pilot-run.json
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runBenchmark } from "../core/runner.ts";
import { loadCorpus } from "../core/retrieval.ts";
import { loadTasksForAssembly } from "../core/taskset.ts";
import { evaluationHash, loadEvaluation } from "../core/evaluation.ts";
import { evaluate, EVALUATOR_VERSION } from "../core/evaluator.ts";
import { CHECKS_VERSION } from "../core/checks.ts";
import { assessEligibility, ELIGIBILITY_VERSION } from "../core/eligibility.ts";
import { REVIEW_PROTOCOL_VERSION } from "../core/humanReview.ts";
import { OllamaProvider } from "../providers/ollama.ts";
import { OllamaEmbeddings, normalise } from "../providers/ollamaEmbeddings.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const splits = JSON.parse(readFileSync(join(ROOT, "benchmarks/tasks/v1/splits.json"), "utf8"));
const pilot = JSON.parse(readFileSync(join(ROOT, "benchmarks/tasks/v1/pilot-subset.json"), "utf8"));
const taskSet = loadTasksForAssembly(join(ROOT, "benchmarks/tasks/v1/tasks.json"));
const evalsFile = join(ROOT, "benchmarks/tasks/v1/evaluation.json");
const evalSet = loadEvaluation(evalsFile);

// --split picks which frozen subset to run. Default stays the pilot; dev_clean
// is the untouched comparison set. `holdout` is not accepted at all — the guard
// below is a second line of defence, not the first.
const splitName = arg("split", "pilot");
if (splitName === "holdout") {
  console.error("ABORT: the holdout is not runnable from this CLI.");
  process.exit(2);
}
const selected = new Set(
  splitName === "dev_clean" ? splits.dev_clean
  : splitName === "dev_pilot" ? splits.dev_pilot
  : pilot.task_ids,
);
const holdout = new Set(splits.holdout);
for (const tid of selected) {
  if (holdout.has(tid)) {
    console.error(`ABORT: task ${tid} is in the HOLDOUT split.`);
    process.exit(2);
  }
}

const tasks = taskSet.tasks.filter((t) => selected.has(t.task_id));
if (tasks.length !== selected.size) {
  console.error("ABORT: the frozen subset references a task that is not in the task set.");
  process.exit(2);
}

const ARMS = (arg("arms", "A,B,C,D,E_concat")).split(",");
const provider = new OllamaProvider({
  model: arg("model", "qwen2.5-coder:7b-16k"),
  timeoutMs: Number(arg("timeout", "180000")),
  maxRetries: Number(arg("retries", "2")),
});

const corpus = loadCorpus(
  readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".jsonl")).map((f) => join(ROOT, "data", f)),
);

const cfg = {
  temperature: 0,
  maxTokens: 1536,
  seed: 7,
  retrievalK: 3,
  maxQueryTerms: 3,
  nRuns: Number(arg("n", "1")),
  arms: ARMS,
  taskOrderSeed: 20260730,
  armOrderSeed: 20260731,
  datasetVersion: "data-jsonl",
  taskSetVersion: taskSet.version,
  evaluationHash: evaluationHash(evalsFile),
};

// --retrieval semantic loads the prebuilt embedding index and embeds the task
// requests once. The core never embeds anything itself.
let embeddingIndex, taskVectors;
if (arg("retrieval", "lexical") === "semantic") {
  const meta = JSON.parse(readFileSync(join(ROOT, "reports/corpus-embeddings.json"), "utf8"));
  const raw = readFileSync(join(ROOT, "reports/corpus-embeddings.bin"));
  embeddingIndex = {
    vectors: new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4),
    dim: meta.dim, count: meta.count, ids: meta.ids, model: meta.model,
  };
  const emb = new OllamaEmbeddings();
  const vs = await emb.embed(tasks.map((t) => t.request));
  taskVectors = Object.fromEntries(tasks.map((t, i) => [t.task_id, normalise(vs[i])]));
  cfg.embeddingIndex = embeddingIndex;
  cfg.taskVectors = taskVectors;
  console.log(`retrieval: semantic (${meta.model}, ${meta.count} vectors)`);
} else {
  console.log("retrieval: lexical");
}

const info = await provider.info();
console.log(`provider=${info.provider} model=${info.model} version=${info.modelVersion.slice(0, 20)}`);
console.log(`arms=${ARMS.join(",")}  tasks=${tasks.length}  n=${cfg.nRuns}  split=${splitName}`);
console.log(`calls planned: ${tasks.length * ARMS.length * cfg.nRuns}\n`);

const wallStart = Date.now();
const out = await runBenchmark(tasks, corpus, provider, cfg, () => new Date().toISOString());
const wallMs = Date.now() - wallStart;

if (out.violations.length) {
  console.error("HARD STOP — a §4/§7 invariant was violated; the run must not be interpreted:");
  for (const v of out.violations) console.error("  " + v);
  process.exit(1);
}

const scored = out.records.map((r) => ({
  ...r,
  evaluation: evaluate(r.output, evalSet.evaluations[r.taskId]),
}));

const elig = assessEligibility({ tasks, evaluations: evalSet, unretrieved: out.unretrieved });
const eligible = new Set(elig.filter((e) => e.eligible).map((e) => e.taskId));

// --- provider and runner health (§6) -------------------------------------
const attempted = provider.sent.length;
const successful = out.records.length;
const byKind = {};
for (const f of provider.failures) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
const empty = scored.filter((r) => !r.output.trim()).length;

console.log("RUNNER / PROVIDER");
console.log(`  calls attempted        ${attempted}`);
console.log(`  calls successful       ${successful}`);
console.log(`  timeouts               ${byKind.timeout ?? 0}`);
console.log(`  transport errors       ${byKind.transport ?? 0}`);
console.log(`  http errors            ${byKind.http ?? 0}`);
console.log(`  malformed responses    ${byKind.malformed ?? 0}`);
console.log(`  empty outputs          ${empty}`);
console.log(`  retries performed      ${provider.failures.length}`);

const lat = scored.map((r) => r.latencyMs).sort((a, b) => a - b);
const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : 0);
console.log("\nCOST / RESOURCES");
console.log(`  input tokens (provider-reported)   ${scored.reduce((a, r) => a + r.inputTokens, 0)}`);
console.log(`  output tokens (provider-reported)  ${scored.reduce((a, r) => a + r.outputTokens, 0)}`);
console.log(`  latency p50 / p95                  ${pct(0.5)} ms / ${pct(0.95)} ms`);
console.log(`  wall clock                         ${(wallMs / 1000).toFixed(1)} s`);
console.log(`  cost                               not_applicable (local model)`);

console.log("\nEVALUATION — per arm, eligible tasks only");
console.log("arm  detPass  detFail  detRate  proxyPass/Fail  ITS pass/fail/pending/na  inTok  outTok  ctxChars");
for (const arm of [...new Set(scored.map((r) => r.arm))].sort()) {
  const rs = scored.filter((r) => r.arm === arm && eligible.has(r.taskId));
  const dp = rs.reduce((a, r) => a + r.evaluation.deterministic.passed, 0);
  const df = rs.reduce((a, r) => a + r.evaluation.deterministic.failed, 0);
  const proxyIds = (tid) =>
    new Set((evalSet.evaluations[tid].assertions ?? []).filter((a) => a.proxy).map((a) => a.id));
  let pp = 0, pf = 0;
  for (const r of rs) {
    const ids = proxyIds(r.taskId);
    for (const c of r.evaluation.checks) {
      if (!ids.has(c.id)) continue;
      if (c.status === "pass") pp++; else if (c.status === "fail") pf++;
    }
  }
  const v = (x) => rs.filter((r) => r.evaluation.independentTaskSuccess === x).length;
  const row = [
    arm.padEnd(3),
    String(dp).padStart(7), String(df).padStart(7),
    (dp + df ? (dp / (dp + df)).toFixed(3) : "n/a").padStart(7),
    `${pp}/${pf}`.padStart(14),
    `${v("pass")}/${v("fail")}/${v("pending")}/${v("not_applicable")}`.padStart(24),
    String(rs.reduce((a, r) => a + r.inputTokens, 0)).padStart(6),
    String(rs.reduce((a, r) => a + r.outputTokens, 0)).padStart(7),
    String(Math.round(rs.reduce((a, r) => a + r.contextChars, 0) / rs.length)).padStart(9),
  ];
  console.log("  " + row.join(" "));
}
console.log("\nHuman checks: pending (no human pass has run).");
console.log("Independent Task Success: pending wherever human checks exist. Pending is NOT zero.");
console.log("\nThis is an INFRASTRUCTURE PILOT. No cross-arm inference may be drawn from it.");

if (arg("out", null)) {
  const rel = arg("out", null);
  // `join(ROOT, "/tmp/x")` yields "<repo>/tmp/x" — an absolute path silently
  // wrote a 271 MB artifact into the repository once. Respect it instead.
  const p = rel.startsWith("/") ? rel : join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({
    kind: "infrastructure_pilot",
    not_an_h1_result: true,
    split: splitName,
    pilotSubsetVersion: pilot.version,
    taskSplitVersion: splits.version,
    config: { ...cfg, embeddingIndex: undefined, taskVectors: undefined },
    retrieval: cfg.embeddingIndex ? { method: "semantic", model: cfg.embeddingIndex.model, vectors: cfg.embeddingIndex.count } : { method: "lexical" },
    provider: { ...info, host: provider.cfg.host, timeoutMs: provider.cfg.timeoutMs, maxRetries: provider.cfg.maxRetries },
    versions: {
      checks: CHECKS_VERSION, evaluator: EVALUATOR_VERSION,
      eligibility: ELIGIBILITY_VERSION, review: REVIEW_PROTOCOL_VERSION,
    },
    wallMs,
    providerFailures: provider.failures,
    sentRequests: provider.sent,
    unretrieved: out.unretrieved,
    eligibility: elig,
    records: scored,
  }, null, 1));
  console.log(`\nwrote ${arg("out", null)}`);
}
