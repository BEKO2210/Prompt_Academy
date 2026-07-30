/**
 * Layer 2 evaluation (ENG-008 §2, §5).
 *
 * ## Arm-blind by signature, not by discipline
 *
 * §2: "The evaluator receives model output + Layer 2 only. Never the arm
 * identity, never the selected record — so it cannot become arm-aware even by
 * accident." That is enforced here by the function signature: `evaluate()` takes
 * exactly two arguments and there is no third to pass an arm through. A test
 * asserts this module imports nothing from `arms.ts` or `retrieval.ts`.
 *
 * ## Human assertions never auto-pass
 *
 * Most of what actually distinguishes a good artifact from a bad one is not
 * regex-checkable — "focus is restored to the trigger on close" is the substance
 * of the accessibility task, and no string match decides it. Those are marked
 * `kind: "human"` and returned as UNRESOLVED. They are never counted as passes.
 *
 * The consequence has to be stated wherever results are reported: automated
 * "task success" means "passed the structural checks", which is a weaker claim
 * than "solved the task". ENG-008 §Risks says the same thing. A harness that
 * quietly scored human assertions as passing would inflate every arm equally and
 * make the whole comparison look more decisive than it is.
 */
import type { TaskEvaluation } from "./evaluation.ts";

export type CheckStatus = "pass" | "fail" | "unresolved";

export interface CheckResult {
  id: string;
  status: CheckStatus;
  /** Why, in one line. Never quotes Layer 2 back into a repair prompt (§2). */
  detail: string;
}

export interface EvaluationResult {
  checks: CheckResult[];
  automatedPassed: number;
  automatedFailed: number;
  /** Human-only assertions. Counted separately; never a pass. */
  unresolved: number;
  /**
   * True only when every AUTOMATED check passed AND nothing is unresolved.
   * A task with unresolved checks is not a success and not a failure — it is
   * unmeasured, and merging it into either would be fabricating a result.
   */
  structuralSuccess: boolean;
  /** Automated checks only. Undefined when a task has none. */
  automatedRate: number | null;
}

function checkAssertion(
  output: string,
  a: TaskEvaluation["assertions"][number],
): CheckResult {
  switch (a.kind) {
    case "contains":
      return output.includes(a.value)
        ? { id: a.id, status: "pass", detail: "expected content present" }
        : { id: a.id, status: "fail", detail: "expected content missing" };
    case "absent":
      return output.includes(a.value)
        ? { id: a.id, status: "fail", detail: "content that must not appear was present" }
        : { id: a.id, status: "pass", detail: "absent as required" };
    case "regex": {
      let rx: RegExp;
      try {
        rx = new RegExp(a.value, "i");
      } catch {
        // A broken pattern is a harness defect, not a model failure. Scoring it
        // as a fail would blame the model for our typo.
        return { id: a.id, status: "unresolved", detail: "invalid pattern in Layer 2" };
      }
      return rx.test(output)
        ? { id: a.id, status: "pass", detail: "pattern matched" }
        : { id: a.id, status: "fail", detail: "pattern did not match" };
    }
    case "human":
      return { id: a.id, status: "unresolved", detail: "requires human judgement" };
  }
}

/**
 * Evaluate one model output against one task's Layer 2.
 *
 * Deterministic: same output + same Layer 2 -> same verdict, every time. Asserted
 * by test, because a non-deterministic grader would make repeated runs
 * incomparable and n > 1 meaningless.
 */
export function evaluate(output: string, ev: TaskEvaluation): EvaluationResult {
  const checks: CheckResult[] = [];

  for (const a of ev.assertions ?? []) {
    checks.push(checkAssertion(output, a));
  }

  for (const [i, f] of (ev.forbidden ?? []).entries()) {
    checks.push(
      output.toLowerCase().includes(f.toLowerCase())
        ? { id: `forbidden${i}`, status: "fail", detail: "forbidden content present" }
        : { id: `forbidden${i}`, status: "pass", detail: "forbidden content absent" },
    );
  }

  // Artifact requirements are prose descriptions ("a form component"), not file
  // globs, so they cannot be checked automatically without inventing a mapping
  // that would be doing the grading itself.
  for (const [i, r] of (ev.required_artifacts ?? []).entries()) {
    checks.push({
      id: `artifact${i}`,
      status: "unresolved",
      detail: `artifact requirement needs human judgement: ${r}`,
    });
  }

  const automatedPassed = checks.filter((c) => c.status === "pass").length;
  const automatedFailed = checks.filter((c) => c.status === "fail").length;
  const unresolved = checks.filter((c) => c.status === "unresolved").length;
  const automated = automatedPassed + automatedFailed;

  return {
    checks,
    automatedPassed,
    automatedFailed,
    unresolved,
    structuralSuccess: automatedFailed === 0 && unresolved === 0 && automated > 0,
    automatedRate: automated > 0 ? automatedPassed / automated : null,
  };
}
