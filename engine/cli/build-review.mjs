/**
 * Build a blinded human-review bundle (ENG-016 §4, §5).
 *
 * Reads a completed run, emits packets that carry the request, the output and
 * the criteria — and nothing that identifies the arm, the model, the record or
 * any score. The key mapping back to (task, arm, run) is written to a SEPARATE
 * file that the reviewer must not open.
 *
 *   node engine/cli/build-review.mjs --run reports/pilot-run-3.json \
 *        --packets reports/review-packets.json --key reports/review-key.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildReviewPackets, FORBIDDEN_PACKET_FIELDS } from "../core/humanReview.ts";
import { loadTasksForAssembly } from "../core/taskset.ts";
import { loadEvaluation } from "../core/evaluation.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const run = JSON.parse(readFileSync(join(ROOT, arg("run", "reports/pilot-run-3.json")), "utf8"));
const taskSet = loadTasksForAssembly(join(ROOT, "benchmarks/tasks/v1/tasks.json"));
const evalSet = loadEvaluation(join(ROOT, "benchmarks/tasks/v1/evaluation.json"));
const byId = new Map(taskSet.tasks.map((t) => [t.task_id, t]));

const items = run.records.map((r) => ({
  taskId: r.taskId,
  arm: r.arm,
  runIndex: r.runIndex,
  request: byId.get(r.taskId).request,
  output: r.output,
  evaluation: evalSet.evaluations[r.taskId],
}));

const bundle = buildReviewPackets(items, Number(arg("seed", "424242")));

// Refuse to write a packet that leaks. Checked on the serialised form, so a
// nested field cannot slip through.
for (const p of bundle.packets) {
  const s = JSON.stringify(p).toLowerCase();
  for (const f of FORBIDDEN_PACKET_FIELDS) {
    if (`"${f.toLowerCase()}"` in p || s.includes(`"${f.toLowerCase()}":`)) {
      console.error(`ABORT: packet ${p.packetId} exposes ${f}`);
      process.exit(1);
    }
  }
}

const write = (file, data) => {
  const p = join(ROOT, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 1));
};

write(arg("packets", "reports/review-packets.json"), {
  protocolVersion: bundle.protocolVersion,
  orderSeed: bundle.orderSeed,
  note:
    "BLINDED. No arm, model, record or score appears here. Judge each criterion " +
    "as its own proposition against the output — never by overall impression. " +
    "PASS / FAIL / UNCERTAIN. Uncertain is a real answer; do not guess.",
  packets: bundle.packets,
});
write(arg("key", "reports/review-key.json"), {
  warning: "THE REVIEWER MUST NOT OPEN THIS FILE UNTIL JUDGEMENTS ARE RECORDED.",
  orderSeed: bundle.orderSeed,
  keys: bundle.keys,
});

const criteria = bundle.packets.reduce((a, p) => a + p.criteria.length, 0);
console.log(`packets: ${bundle.packets.length}`);
console.log(`individual propositions to judge: ${criteria}`);
console.log(`packets with no human criterion: ${bundle.packets.filter((p) => !p.criteria.length).length}`);
