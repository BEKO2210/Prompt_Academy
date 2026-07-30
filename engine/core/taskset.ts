/**
 * Task set loading for the H1 experiment (ENG-008 §1, §2).
 *
 * ## Why loading is split in two
 *
 * ENG-008 §2 requires that the prompt-assembly path CANNOT read the evaluation
 * layer — "structural enforcement, not convention". Convention here would be a
 * comment saying "don't read `task.evaluation`", which survives exactly until
 * someone writes `JSON.stringify(task)` into a prompt.
 *
 * So the two layers live in two files and are loaded by two functions:
 *
 *   tasks.json       -> loadTasksForAssembly()   this module, no evaluation
 *   evaluation.json  -> loadEvaluation()         evaluation.ts, never imported
 *                                                by arms.ts
 *
 * `loadTasksForAssembly` additionally DELETES any `evaluation` key it finds
 * rather than trusting the file to be clean, so a task file that grows one by
 * accident still cannot leak. The returned type has no such field, so reading
 * one is a type error as well as an empty value.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/** What assembly is allowed to see. Deliberately has no `evaluation` field. */
export interface AssemblyTask {
  task_id: string;
  request: string;
  domain: string;
  language: "de" | "en";
}

export interface TaskSet {
  version: string;
  tasks: AssemblyTask[];
}

/**
 * Load tasks for prompt assembly, with the evaluation layer removed.
 *
 * The strip is defensive: `tasks.json` is not supposed to contain `evaluation`
 * at all, and `validateTaskSet` fails if it does. Both exist because the failure
 * this prevents — a leaked grader — produces numbers that look valid.
 */
export function loadTasksForAssembly(file: string): TaskSet {
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    version: string;
    tasks: Array<Record<string, unknown>>;
  };
  const tasks = raw.tasks.map((t) => ({
    task_id: String(t.task_id),
    request: String(t.request),
    domain: String(t.domain),
    language: t.language === "de" ? ("de" as const) : ("en" as const),
  }));
  return { version: raw.version, tasks };
}

/**
 * Structural checks on the task file itself.
 * Returns problems rather than throwing, so a caller can report all of them.
 */
export function validateTaskSet(file: string): string[] {
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    version?: string;
    tasks?: Array<Record<string, unknown>>;
  };
  const problems: string[] = [];
  if (!raw.version) problems.push("task set has no version");
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) {
    problems.push("task set has no tasks");
    return problems;
  }
  const seen = new Set<string>();
  for (const t of raw.tasks) {
    const id = String(t.task_id ?? "");
    if (!id) problems.push("a task has no task_id");
    if (seen.has(id)) problems.push(`duplicate task_id: ${id}`);
    seen.add(id);
    if (!t.request || !String(t.request).trim()) problems.push(`${id}: empty request`);
    if (!t.domain) problems.push(`${id}: no domain`);
    if (t.language !== "de" && t.language !== "en") problems.push(`${id}: language must be de or en`);
    // The load-bearing one.
    if ("evaluation" in t) {
      problems.push(`${id}: evaluation must live in evaluation.json, never in tasks.json`);
    }
  }
  return problems;
}

/** Content hash of a file, for the §6 reproducibility record. */
export function fileHash(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
