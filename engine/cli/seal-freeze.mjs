/**
 * Seal the freeze manifest (ENG-016 §13).
 *
 * Everything that could change a result is hashed here. After this, a change
 * made BECAUSE an arm looked disappointing is detectable rather than a matter
 * of trust: verifyFreeze() recomputes the manifest and names what moved.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { seal, hashFile } from "../core/freeze.ts";
import { ARMS, ARM_SEMANTICS, NOT_IMPLEMENTED_ARMS, SYSTEM_WRAPPER } from "../core/arms.ts";
import { CHECKS_VERSION } from "../core/checks.ts";
import { EVALUATOR_VERSION } from "../core/evaluator.ts";
import { ELIGIBILITY_VERSION } from "../core/eligibility.ts";
import { REVIEW_PROTOCOL_VERSION } from "../core/humanReview.ts";
import { FIELD_SPLIT_VERSION } from "../core/fieldSplit.ts";
import { FORMULATION_VERSION, MIN_DOCUMENT_FREQUENCY } from "../core/queryFormulation.ts";
import { MATCHING_VERSION } from "../../site/src/lib/search.ts";
import { RANKING_VERSION } from "../../site/src/lib/ranking.ts";
import { OllamaProvider } from "../providers/ollama.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const rel = (p) => join(ROOT, p);

const FILES = [
  "benchmarks/tasks/v1/tasks.json",
  "benchmarks/tasks/v1/evaluation.json",
  "benchmarks/tasks/v1/splits.json",
  "benchmarks/tasks/v1/pilot-subset.json",
  "benchmarks/tasks/v1/check-audit.json",
  "engine/core/checks.ts",
  "engine/core/evaluator.ts",
  "engine/core/eligibility.ts",
  "engine/core/humanReview.ts",
  "engine/core/fieldSplit.ts",
  "engine/core/arms.ts",
  "engine/core/queryFormulation.ts",
  "engine/core/retrieval.ts",
  "engine/core/runner.ts",
  "engine/providers/ollama.ts",
  "site/src/lib/search.ts",
  "site/src/lib/ranking.ts",
  "site/src/lib/vocabulary.ts",
];

const files = Object.fromEntries(FILES.map((f) => [f, hashFile(rel(f))]));

// One hash over the whole corpus, so a dataset edit invalidates the freeze.
const h = createHash("sha256");
for (const f of readdirSync(rel("data")).filter((x) => x.endsWith(".jsonl")).sort()) {
  h.update(readFileSync(rel(join("data", f))));
}
const datasetHash = h.digest("hex");

const splits = JSON.parse(readFileSync(rel("benchmarks/tasks/v1/splits.json"), "utf8"));
const tasks = JSON.parse(readFileSync(rel("benchmarks/tasks/v1/tasks.json"), "utf8"));
const evals = JSON.parse(readFileSync(rel("benchmarks/tasks/v1/evaluation.json"), "utf8"));

const provider = new OllamaProvider({ model: process.argv.includes("--model")
  ? process.argv[process.argv.indexOf("--model") + 1] : "qwen2.5-coder:7b-16k" });
const info = await provider.info();

const base = {
  freezeVersion: "1.0.0",
  frozenAt: new Date().toISOString(),
  taskSetVersion: tasks.version,
  groundTruthVersion: evals.version,
  datasetHash,
  files,
  versions: {
    checks: CHECKS_VERSION,
    evaluator: EVALUATOR_VERSION,
    eligibility: ELIGIBILITY_VERSION,
    reviewProtocol: REVIEW_PROTOCOL_VERSION,
    fieldSplit: FIELD_SPLIT_VERSION,
    matching: MATCHING_VERSION,
    ranking: RANKING_VERSION,
    formulation: FORMULATION_VERSION,
  },
  model: {
    provider: info.provider, model: info.model, modelVersion: info.modelVersion,
    temperature: 0, maxTokens: 1536, seed: 7,
  },
  arms: [...ARMS],
  systemWrapperHash: createHash("sha256").update(SYSTEM_WRAPPER).digest("hex"),
};

const extra = {
  splitAlgorithmVersion: splits.version,
  splitSeed: splits.seed,
  devTasks: splits.dev.length,
  holdoutTasks: splits.holdout.length,
  holdoutIds: splits.holdout,
  holdoutPolicy:
    "UNTOUCHED. No retrieval measurement, no model call, no human evaluation, no prompt " +
    "inspection for tuning, no weight fitting. Released only after every architecture and " +
    "parameter decision is frozen.",
  retrievalConfig: { maxQueryTerms: 3, retrievalK: 3, minDocumentFrequency: MIN_DOCUMENT_FREQUENCY },
  armSemantics: ARM_SEMANTICS,
  notImplementedArms: NOT_IMPLEMENTED_ARMS,
  seedPolicy: "seed=7 on every call. Ollama does not guarantee determinism from it; measured, not assumed.",
  repetitionPolicy: "set from the measured noise floor — see reports/eng-016-readiness.md",
};

// Seal AFTER merging: hashing the base and then appending fields would leave
// those fields uncovered, and verifyFreeze correctly reported the file as
// edited. The hash must span everything the manifest asserts.
const manifest = seal({ ...base, ...extra });
writeFileSync(rel("benchmarks/tasks/v1/freeze-manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`sealed. manifestHash=${manifest.manifestHash.slice(0, 24)}`);
console.log(`files frozen: ${FILES.length}  dataset=${datasetHash.slice(0, 16)}  model=${info.modelVersion.slice(0, 16)}`);
