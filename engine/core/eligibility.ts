/**
 * H1 eligibility (ENG-014 §9).
 *
 * Which tasks may enter the A–F comparison at all.
 *
 * ## Why this is a module and not a convention
 *
 * Two failures already found in this project came from tasks that were scored
 * when they should not have been:
 *
 *   - 8 of 8 tasks retrieved nothing, so arms B–E collapsed onto A. Scoring them
 *     would have contributed a guaranteed tie to every comparison and produced
 *     "H1 falsified" from a missing component.
 *   - T002 required `type="password"` and forbade the string "password", so it
 *     was unpassable in every arm and depressed all of them equally.
 *
 * Both are invisible in a cross-arm table. Both are caught here, before a run.
 *
 * ## Exclusion is not deletion
 *
 * An ineligible task stays in the task set with a reason attached. The retrieval
 * report keeps showing 47/50 and naming the 3 language-gap failures, so the
 * product problem cannot be quietly absorbed into a benchmark decision.
 */
import type { AssemblyTask } from "./taskset.ts";
import type { EvaluationSet } from "./evaluation.ts";
import { DETERMINISTIC_KINDS } from "./checks.ts";

export const ELIGIBILITY_VERSION = "1.0.0";

export type IneligibilityReason =
  /** Retrieval found no record, so B/C/D/E are byte-identical to A. */
  | "no_retrieval"
  /** German compound absent from a ~91% English corpus. Kept as diagnostic. */
  | "language_gap_diagnostic"
  /** A forbidden string collides with a required one — unpassable in every arm. */
  | "contradictory_ground_truth"
  /** Nothing a machine can settle and no human rubric either. */
  | "no_evaluable_check"
  /** Ground truth missing entirely. */
  | "no_ground_truth";

export interface Eligibility {
  taskId: string;
  eligible: boolean;
  reasons: IneligibilityReason[];
  deterministicChecks: number;
  humanChecks: number;
}

export interface EligibilityInput {
  tasks: AssemblyTask[];
  evaluations: EvaluationSet;
  /** Task ids for which retrieval produced no record. */
  unretrieved: readonly string[];
}

/**
 * Classify every task.
 *
 * Note that `no_retrieval` does NOT make a task ineligible for arm A on its own
 * — arm A never uses a record. It makes the task ineligible for the CROSS-ARM
 * comparison, which is the only thing H1 is about, so it is treated as
 * ineligible here and the distinction is recorded in the report.
 */
export function assessEligibility(input: EligibilityInput): Eligibility[] {
  const out: Eligibility[] = [];
  const unretrieved = new Set(input.unretrieved);

  for (const t of input.tasks) {
    const ev = input.evaluations.evaluations[t.task_id];
    const reasons: IneligibilityReason[] = [];

    if (!ev) {
      out.push({
        taskId: t.task_id, eligible: false, reasons: ["no_ground_truth"],
        deterministicChecks: 0, humanChecks: 0,
      });
      continue;
    }

    const det =
      (ev.assertions ?? []).filter((a) => DETERMINISTIC_KINDS.has(a.kind)).length +
      (ev.forbidden ?? []).length;
    const hum = (ev.assertions ?? []).filter((a) => a.kind === "human").length;

    if (unretrieved.has(t.task_id)) {
      reasons.push("no_retrieval");
      // The three known German-compound failures are a product finding, not a
      // harness defect, and are labelled so the retrieval report keeps them.
      if (t.language === "de") reasons.push("language_gap_diagnostic");
    }
    if (det === 0 && hum === 0) reasons.push("no_evaluable_check");

    // Absence-kind checks name the prohibited thing on purpose; an overlap with
    // `forbidden` is agreement, not contradiction.
    const ABSENCE_KINDS = new Set(["absent", "regex_absent", "import_absent"]);
    for (const f of ev.forbidden ?? []) {
      const fl = f.toLowerCase();
      if ((ev.assertions ?? []).some(
        (a) => !ABSENCE_KINDS.has(a.kind) && a.value.toLowerCase().includes(fl))) {
        reasons.push("contradictory_ground_truth");
        break;
      }
      if (t.request.toLowerCase().includes(fl)) {
        reasons.push("contradictory_ground_truth");
        break;
      }
    }

    out.push({
      taskId: t.task_id,
      eligible: reasons.length === 0,
      reasons,
      deterministicChecks: det,
      humanChecks: hum,
    });
  }
  return out;
}

export interface EligibilitySummary {
  total: number;
  eligible: number;
  byReason: Record<string, number>;
  withDeterministic: number;
  humanOnly: number;
}

export function summarise(rows: Eligibility[]): EligibilitySummary {
  const byReason: Record<string, number> = {};
  for (const r of rows) for (const x of r.reasons) byReason[x] = (byReason[x] ?? 0) + 1;
  return {
    total: rows.length,
    eligible: rows.filter((r) => r.eligible).length,
    byReason,
    withDeterministic: rows.filter((r) => r.deterministicChecks > 0).length,
    humanOnly: rows.filter((r) => r.deterministicChecks === 0 && r.humanChecks > 0).length,
  };
}
