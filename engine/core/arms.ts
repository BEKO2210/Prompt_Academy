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

export const ARMS = ["A", "B", "C", "D", "E_concat"] as const;
export type Arm = (typeof ARMS)[number];

/**
 * What each arm ACTUALLY is, as implemented.
 *
 * The names are load-bearing. An arm called "compiled instructions" that merely
 * concatenates would make `E ≈ D` read as "compilation adds nothing" when the
 * measured claim is only "concatenation adds nothing" — a much weaker statement
 * about a much cheaper mechanism. So the arm is named for what it does.
 *
 * The compiler hypothesis gets its own arm when a compiler exists, and not
 * before. `F_compiled` is listed here as NOT IMPLEMENTED so its absence is
 * visible rather than assumed.
 */
export const ARM_SEMANTICS: Readonly<Record<string, string>> = {
  A: "user request only, no injected context",
  B: "the full injectable record, verbatim",
  C: "the descriptive portion of that record (prompt prose, style)",
  D: "the actionable portion of that record (acceptance_criteria, negative_prompt, tech_stack)",
  E_concat:
    "multi-skill actionable CONCATENATION with exact-duplicate removal. " +
    "No conflict resolution, no precedence, no context budget — it is not a compiler.",
};

/** Declared, deliberately unimplemented. Named so its absence cannot be missed. */
export const NOT_IMPLEMENTED_ARMS: Readonly<Record<string, string>> = {
  F_compiled:
    "compiled multi-skill instructions: dedup + conflict resolution + precedence + " +
    "context budget. Not built. It must earn its existence from evidence that " +
    "multi-skill context helps at all (E_concat vs D).",
};

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

    case "E_concat": {
      // The actionable side of several records, primary first, concatenated
      // with exact duplicates removed. Named E_concat because that is all it
      // does — see ARM_SEMANTICS and NOT_IMPLEMENTED_ARMS above.
      const recs = record ? [record, ...extraRecords] : extraRecords;
      if (!recs.length) return assemble("E_concat", task, [], null);
      return assemble("E_concat", task, recs.map((r) => r.id), concatenateActionable(recs));
    }
  }
}

/**
 * Concatenate the actionable side of several records, removing exact duplicates.
 *
 * Renamed from `concatenateActionable`: it does not compile. It does not resolve
 * conflicts (two records demanding different frameworks), apply precedence, or
 * enforce a context budget. Those are what ENG-008 §3 means by compilation, and
 * a function named for work it does not do invites a claim the experiment
 * cannot support.
 */
export function concatenateActionable(records: SkillRecord[]): string {
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
