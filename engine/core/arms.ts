/**
 * Prompt assembly for the H1 experiment arms (ENG-008 §3, §4).
 *
 * ## The one thing this file must guarantee
 *
 * Arms differ by the INJECTED CONTEXT and by nothing else. Everything that is
 * not the independent variable is assembled here, once, from constants — so a
 * difference between arms cannot come from a stray formatting change.
 *
 * That is why `assemble()` has a single return path and every arm flows through
 * it. An arm that built its own string could drift; there is no such arm.
 *
 * ## Layer 2 is not reachable from here
 *
 * This module never imports `evaluation.ts` and never receives an object that
 * carries an `evaluation` key — see `taskset.ts`, which strips it at load. That
 * is structural, not a convention: `tests/engine-arms.test.mjs` asserts a
 * sentinel string placed in Layer 2 appears in NO assembled prompt, for ANY arm,
 * and asserts this file does not reference the evaluation module at all.
 */
import {
  actionableContext,
  descriptiveContext,
  fullInjectableContext,
  renderContext,
  type SkillRecord,
} from "./fieldSplit.ts";
import type { AssemblyTask } from "./taskset.ts";

export const ARMS = ["A", "B", "C", "D", "E"] as const;
export type Arm = (typeof ARMS)[number];

/**
 * Byte-identical across every arm (§4). The single most fragile constant in the
 * experiment and the most damaging to get wrong, so it is a frozen literal here
 * rather than something a caller passes in and can vary by accident.
 */
export const SYSTEM_WRAPPER =
  "You are a senior frontend engineer. Produce the artifact the user asks for. " +
  "Return code and only the files requested, with no commentary.";

/** Arm A injects nothing. Its context header must therefore not appear at all. */
const CONTEXT_HEADER = "# Reference context";

export interface AssembledPrompt {
  arm: Arm;
  taskId: string;
  system: string;
  user: string;
  /** Which record(s) the context came from. Empty for arm A. */
  recordIds: string[];
}

/**
 * Single assembly path. `contextText` is the ONLY thing that varies by arm.
 */
function assemble(
  arm: Arm,
  task: AssemblyTask,
  recordIds: string[],
  contextText: string | null,
): AssembledPrompt {
  const user = contextText
    ? `${CONTEXT_HEADER}\n\n${contextText}\n\n# Request\n${task.request}`
    : task.request;
  return { arm, taskId: task.task_id, system: SYSTEM_WRAPPER, user, recordIds };
}

/**
 * Build the prompt for one arm.
 *
 * `record` is the SINGLE record retrieval selected for this task. Arms B, C and
 * D must receive the identical object — same-record isolation (§3, binding). The
 * caller retrieves once per task; this function never retrieves, so it cannot
 * accidentally introduce a second retrieval and turn a B/D difference into a
 * different-record difference.
 */
export function buildPrompt(
  arm: Arm,
  task: AssemblyTask,
  record: SkillRecord | null,
  extraRecords: SkillRecord[] = [],
): AssembledPrompt {
  switch (arm) {
    case "A":
      // Fair baseline: the request, the same system wrapper, nothing else.
      return assemble("A", task, [], null);

    case "B":
      if (!record) return assemble("B", task, [], null);
      return assemble("B", task, [record.id], renderContext(fullInjectableContext(record)));

    case "C":
      if (!record) return assemble("C", task, [], null);
      return assemble("C", task, [record.id], renderContext(descriptiveContext(record)));

    case "D":
      if (!record) return assemble("D", task, [], null);
      return assemble("D", task, [record.id], renderContext(actionableContext(record)));

    case "E": {
      // Multi-record compilation: the actionable side of several records, with
      // the primary record first. Deduplication and conflict resolution are
      // NOT implemented yet — arm E is structurally present so the harness
      // schema is complete, but it must not be reported as measuring H1c until
      // the compiler exists. compileActionable() is where that will live.
      const recs = record ? [record, ...extraRecords] : extraRecords;
      if (!recs.length) return assemble("E", task, [], null);
      return assemble("E", task, recs.map((r) => r.id), compileActionable(recs));
    }
  }
}

/**
 * Compile the actionable side of several records into one context.
 *
 * Current behaviour is CONCATENATION WITH EXACT-DUPLICATE REMOVAL. That is not
 * a compiler: it does not resolve conflicts (two records demanding different
 * frameworks), does not apply precedence, and does not enforce a context budget.
 * Those are the parts ENG-008 §3 calls "compilation", and until they exist
 * `E ≈ D` would mean "concatenation adds nothing", NOT "compilation adds
 * nothing" — a much weaker claim. Reporting must say so.
 */
export function compileActionable(records: SkillRecord[]): string {
  const seen = new Set<string>();
  // Insertion-ordered, so the primary record's lines come first within a field.
  const byField = new Map<string, string[]>();
  for (const r of records) {
    for (const s of actionableContext(r).sections) {
      for (const line of s.text.split("\n")) {
        const key = `${s.field}::${line.trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!byField.has(s.field)) byField.set(s.field, []);
        byField.get(s.field)!.push(line);
      }
    }
  }
  return [...byField.entries()]
    .map(([field, lines]) => `## ${field}\n${lines.join("\n")}`)
    .join("\n\n");
}
