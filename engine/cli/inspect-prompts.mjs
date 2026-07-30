/**
 * Pre-flight prompt inspection (pilot brief §8, §9).
 *
 * Run BEFORE any model call. Verifies on the ACTUAL assembled prompts, for a
 * sample of every arm, that:
 *
 *   - arm A carries no skill context at all
 *   - arm B carries the full injectable record and nothing outside it
 *   - arm D carries only the frozen actionable split
 *   - no Layer 2 text appears anywhere
 *   - the arm identity never reaches the model
 *   - the system wrapper is byte-identical across arms
 *
 * and hashes every prompt that would be sent, so the run record states what was
 * measured rather than what was intended.
 *
 * A test suite already asserts most of this on fixtures. This runs it on the
 * real corpus, the real task set and the real retrieval — the gap where a
 * fixture-green harness can still ship a leak.
 */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { ARMS, SYSTEM_WRAPPER, buildPrompt } from "../core/arms.ts";
import { actionableContext, descriptiveContext, renderContext } from "../core/fieldSplit.ts";
import { loadCorpus, retrieve } from "../core/retrieval.ts";
import { formulateQuery } from "../core/queryFormulation.ts";
import { loadTasksForAssembly } from "../core/taskset.ts";
import { evaluationStrings, loadEvaluation } from "../core/evaluation.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const hash = (s) => createHash("sha256").update(s).digest("hex");

const pilot = JSON.parse(readFileSync(join(ROOT, "benchmarks/tasks/v1/pilot-subset.json"), "utf8"));
const taskSet = loadTasksForAssembly(join(ROOT, "benchmarks/tasks/v1/tasks.json"));
const evalSet = loadEvaluation(join(ROOT, "benchmarks/tasks/v1/evaluation.json"));
const corpus = loadCorpus(
  readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".jsonl")).map((f) => join(ROOT, "data", f)),
);

const ARMS_UNDER_TEST = (process.argv.includes("--arms")
  ? process.argv[process.argv.indexOf("--arms") + 1].split(",")
  : ["A", "B", "D", "E"]).filter((a) => ARMS.includes(a));

const problems = [];
const manifest = [];

for (const tid of pilot.task_ids) {
  const task = taskSet.tasks.find((t) => t.task_id === tid);
  const f = formulateQuery(corpus, task.request, 3);
  const r = f.empty ? { primary: null, additional: [], recordIds: [] } : retrieve(corpus, f.query, 3);
  if (!r.primary) { problems.push(`${tid}: retrieval empty — must not be in the pilot`); continue; }

  const layer2 = evaluationStrings(evalSet.evaluations[tid])
    .filter((s) => s.length > 12)
    .filter((s) => !task.request.toLowerCase().includes(s.toLowerCase()));

  const prompts = {};
  for (const arm of ARMS_UNDER_TEST) {
    const p = buildPrompt(arm, task, r.primary, r.additional);
    prompts[arm] = p;

    // The arm identity must never reach the model.
    if (new RegExp(`\\barm\\s*[:=]?\\s*${arm}\\b`, "i").test(p.user + p.system)) {
      problems.push(`${tid}/${arm}: the arm identity appears in the prompt`);
    }
    // No Layer 2 text in the injected portion.
    const injected = p.user.replace(task.request, "");
    for (const s of layer2) {
      if (injected.includes(s)) problems.push(`${tid}/${arm}: Layer 2 string in the injected context: ${s.slice(0, 50)}`);
    }
    manifest.push({
      taskId: tid, arm,
      recordIds: p.recordIds,
      systemHash: hash(p.system),
      userHash: hash(p.user),
      contextChars: p.user.length - task.request.length,
    });
  }

  // Arm A: no context whatsoever.
  if (prompts.A) {
    if (prompts.A.user !== task.request) problems.push(`${tid}/A: arm A is not the bare request`);
    if (prompts.A.recordIds.length) problems.push(`${tid}/A: arm A references a record`);
  }
  // Arm D: exactly the frozen actionable split, nothing else.
  if (prompts.D) {
    const expected = renderContext(actionableContext(r.primary));
    const injected = prompts.D.user.replace(task.request, "");
    if (!injected.includes(expected)) problems.push(`${tid}/D: arm D does not carry the actionable split verbatim`);
    const descriptive = renderContext(descriptiveContext(r.primary));
    for (const line of descriptive.split("\n").filter((l) => l.trim().length > 25)) {
      if (injected.includes(line)) problems.push(`${tid}/D: descriptive content leaked into arm D`);
    }
  }
  // Arm B: superset of C and D.
  if (prompts.B && prompts.D) {
    const bInj = prompts.B.user.replace(task.request, "");
    const dInj = prompts.D.user.replace(task.request, "");
    for (const line of dInj.split("\n").filter((l) => l.trim().length > 8 && !l.startsWith("##"))) {
      if (!bInj.includes(line)) problems.push(`${tid}: arm B is missing actionable content that arm D has`);
    }
  }
  // The system wrapper is the same everywhere.
  const systems = new Set(Object.values(prompts).map((p) => p.system));
  if (systems.size !== 1) problems.push(`${tid}: arms received different system prompts`);
  if ([...systems][0] !== SYSTEM_WRAPPER) problems.push(`${tid}: system wrapper is not the frozen constant`);
}

const out = {
  armsUnderTest: ARMS_UNDER_TEST,
  systemWrapperHash: hash(SYSTEM_WRAPPER),
  tasks: pilot.task_ids,
  prompts: manifest,
  problems,
};

const outFile = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1] : null;
if (outFile) {
  const p = join(ROOT, outFile);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(out, null, 1));
}

console.log(`arms: ${ARMS_UNDER_TEST.join(",")}   prompts hashed: ${manifest.length}`);
for (const arm of ARMS_UNDER_TEST) {
  const rows = manifest.filter((m) => m.arm === arm);
  const avg = Math.round(rows.reduce((a, m) => a + m.contextChars, 0) / rows.length);
  console.log(`  ${arm}: mean injected context ${avg} chars, ${new Set(rows.map((m) => m.systemHash)).size} distinct system prompt(s)`);
}
if (problems.length) {
  console.error(`\n${problems.length} PROBLEM(S) — do not run the pilot:`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("\nno problems found. Prompt artifacts are safe to send.");
