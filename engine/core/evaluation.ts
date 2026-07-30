/**
 * Layer 2 — the hidden evaluation ground truth (ENG-008 §2).
 *
 * ## Read this before importing it
 *
 * Nothing on the prompt-assembly path may import this module. `arms.ts` does
 * not, `fieldSplit.ts` does not, and `tests/engine-arms.test.mjs` fails if
 * either starts to. The evaluator imports it; the prompt builder must not.
 *
 * ## What makes it valid
 *
 * Layer 2 is authored per task, from the task's own requirements, WITHOUT
 * knowing which record retrieval will pick. It is identical across arms A-F and
 * frozen and hashed before the first run. Those three properties are what let a
 * cross-arm difference be attributed to the injected context rather than to the
 * grader.
 *
 * Semantic overlap with an injected record is expected and is not leakage: a
 * pricing-page task and a pricing-page record will both mention a responsive
 * layout. Leakage is MECHANICAL REUSE of the same text as both instruction and
 * grader — a code-path property, which is why it is tested as one.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { CheckSpec } from "./checks.ts";

export interface TaskEvaluation {
  /**
   * Checks the artifact must satisfy.
   *
   * The kind union lives in checks.ts, so adding a check kind does not require
   * editing this file — a duplicate union here drifted once already and made a
   * valid `breakpoint` check look like a schema error.
   */
  assertions: CheckSpec[];
  /** Things whose presence is a failure. */
  forbidden: string[];
  /** Files the output must produce. */
  required_artifacts: string[];
  notes: string;
}

export interface EvaluationSet {
  version: string;
  /** task_id -> Layer 2 */
  evaluations: Record<string, TaskEvaluation>;
}

export function loadEvaluation(file: string): EvaluationSet {
  return JSON.parse(readFileSync(file, "utf8")) as EvaluationSet;
}

/**
 * `evaluation_hash` for the §6 run record.
 *
 * Recomputed per run and compared: it is what proves Layer 2 did not change
 * between the arms being compared. A mid-run edit without a version bump is a
 * hard stop (§7), and this hash is how that is detected rather than trusted.
 */
export function evaluationHash(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * Every Layer 2 string for one task, flattened.
 *
 * Exists for the leakage test: it is the list of strings that must appear in NO
 * assembled prompt. Nothing on the assembly path calls it.
 */
export function evaluationStrings(ev: TaskEvaluation): string[] {
  return [
    ...ev.assertions.map((a) => a.value),
    ...ev.forbidden,
    ...ev.required_artifacts,
    ev.notes,
  ].filter((s) => s && s.trim().length > 0);
}

/**
 * Structural checks. Returns problems rather than throwing.
 *
 * `requests` is optional and enables the contradiction checks below. They exist
 * because of a real defect found in the seed set: T002 required
 * `type="password"` AND forbade the string "password". That task could not pass
 * in ANY arm, so it would have depressed every arm equally — invisible in a
 * cross-arm table, and pure noise added to the primary metric.
 */
export function validateEvaluationSet(
  evs: EvaluationSet,
  taskIds: string[],
  requests?: Record<string, string>,
): string[] {
  const problems: string[] = [];
  if (!evs.version) problems.push("evaluation set has no version");
  for (const id of taskIds) {
    const ev = evs.evaluations[id];
    if (!ev) {
      problems.push(`${id}: no evaluation — every task must be gradeable`);
      continue;
    }
    if (!ev.assertions?.length && !ev.required_artifacts?.length) {
      problems.push(`${id}: evaluation has neither assertions nor required_artifacts`);
    }
    const seenIds = new Set<string>();
    for (const a of ev.assertions ?? []) {
      if (!a.id) problems.push(`${id}: an assertion has no id`);
      if (seenIds.has(a.id)) problems.push(`${id}: duplicate assertion id ${a.id}`);
      seenIds.add(a.id);
      // `breakpoint` is the one kind that takes no value — it asks whether ANY
      // breakpoint is declared, so there is nothing to parameterise.
      if (a.kind !== "breakpoint" && !a.value?.trim()) {
        problems.push(`${id}: assertion ${a.id} has an empty value`);
      }
    }

    // A forbidden string that an assertion also requires makes the task
    // unpassable in every arm.
    for (const f of ev.forbidden ?? []) {
      const fl = f.toLowerCase();
      for (const a of ev.assertions ?? []) {
        if (a.value.toLowerCase().includes(fl)) {
          problems.push(`${id}: forbidden "${f}" is required by assertion ${a.id} — unpassable`);
        }
      }
      // A forbidden string the USER wrote is a scope trap of a different kind:
      // a faithful answer would echo it and fail.
      if (requests?.[id]?.toLowerCase().includes(fl)) {
        problems.push(`${id}: forbidden "${f}" appears in the request itself`);
      }
    }
  }
  const extra = Object.keys(evs.evaluations).filter((k) => !taskIds.includes(k));
  for (const k of extra) problems.push(`${k}: evaluation for a task that does not exist`);
  return problems;
}
