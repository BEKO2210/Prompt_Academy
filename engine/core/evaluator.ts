/**
 * Layer 2 evaluation (ENG-008 §2 §5, ENG-014).
 *
 * ## Arm-blind by signature, not by discipline
 *
 * §2: "The evaluator receives model output + Layer 2 only. Never the arm
 * identity, never the selected record." Enforced by the function signature:
 * `evaluate()` takes exactly two arguments and there is no third to smuggle an
 * arm through. A test asserts this module imports nothing from `arms.ts`,
 * `retrieval.ts` or `runner.ts`.
 *
 * ## Why the metric was redesigned (ENG-014)
 *
 * The first version had one metric, `structuralSuccess`, defined as "every
 * automated check passed AND nothing unresolved". Measured against the real task
 * set that was **0 for every arm on every task**, because 81% of checks needed a
 * human and 24 of 50 tasks had no automated check at all. A metric that is
 * constantly zero cannot distinguish A from F; the instrument was reporting on
 * itself.
 *
 * Three separate dimensions now, never merged into one number by accident:
 *
 *   deterministicCompliance   passed / total, over checks a machine can settle.
 *                             `null` when a task has none — NOT zero.
 *   humanRubricScore          passed / total, over checks that genuinely need a
 *                             human. `null` until a human has actually judged.
 *   independentTaskSuccess    derived from both by ONE frozen rule, below.
 *
 * ## Missing measurement is not failure
 *
 * A task with no deterministic checks yields `not_applicable`, never `false`.
 * Scoring absent measurement as failure would depress every arm equally and
 * disguise a hole in the instrument as a finding about the hypothesis — the same
 * category of error as the 8-of-8 retrieval failure that would have "falsified"
 * H1 by measuring a missing component.
 */
import type { TaskEvaluation } from "./evaluation.ts";
import { DETERMINISTIC_KINDS, runCheck, type CheckOutcome } from "./checks.ts";

/** Bump on ANY change to how a verdict is derived. Frozen before an H1 run. */
export const EVALUATOR_VERSION = "2.0.0";

export type Verdict = "pass" | "fail" | "pending" | "not_applicable";

export interface Dimension {
  passed: number;
  failed: number;
  total: number;
  /** passed/total, or null when there is nothing to measure. */
  rate: number | null;
}

export interface EvaluationResult {
  checks: CheckOutcome[];
  deterministic: Dimension;
  human: Dimension;
  /**
   * Deterministic verdict for this output.
   *   pass            every deterministic check passed
   *   fail            at least one failed
   *   not_applicable  the task has no deterministic check
   */
  deterministicVerdict: Verdict;
  /**
   * Human verdict.
   *   pending         has human checks, none judged yet
   *   not_applicable  has no human checks
   */
  humanVerdict: Verdict;
  /** The frozen combination rule below. */
  independentTaskSuccess: Verdict;
}

/**
 * Human judgements supplied from outside, keyed by check id.
 *
 * Kept as a separate argument rather than folded into Layer 2 so that a run with
 * no human pass yet is `pending` rather than silently `fail`.
 */
export type HumanVerdicts = Readonly<Record<string, "pass" | "fail">>;

/**
 * THE FROZEN COMBINATION RULE.
 *
 * Written here, once, before any arm has been run, and identical for every arm.
 * It is deliberately strict and deliberately three-valued:
 *
 *   fail            any dimension that HAS been measured contains a failure
 *   pass            every dimension that has been measured passed, and at least
 *                   one dimension was measured
 *   pending         nothing failed, but human checks exist and are unjudged
 *   not_applicable  neither dimension had anything to measure
 *
 * The ordering matters: a failure anywhere outranks a pending elsewhere, so an
 * output that already broke a deterministic check is not parked as "pending"
 * waiting for a human.
 */
export function combineVerdicts(det: Verdict, human: Verdict): Verdict {
  if (det === "fail" || human === "fail") return "fail";
  if (det === "not_applicable" && human === "not_applicable") return "not_applicable";
  if (human === "pending") return "pending";
  return "pass";
}

function dimension(outcomes: CheckOutcome[]): Dimension {
  const passed = outcomes.filter((c) => c.status === "pass").length;
  const failed = outcomes.filter((c) => c.status === "fail").length;
  const total = passed + failed;
  return { passed, failed, total, rate: total > 0 ? passed / total : null };
}

/**
 * Evaluate one model output against one task's Layer 2.
 *
 * Deterministic: same output + same Layer 2 + same human verdicts -> same result,
 * every time. Asserted by test, because a non-deterministic grader makes repeated
 * runs incomparable and n > 1 meaningless.
 */
export function evaluate(
  output: string,
  ev: TaskEvaluation,
  human: HumanVerdicts = {},
): EvaluationResult {
  const checks: CheckOutcome[] = [];

  for (const a of ev.assertions ?? []) {
    const outcome = runCheck(output, a);
    if (a.kind === "human" && human[a.id]) {
      checks.push({ ...outcome, status: human[a.id]!, detail: "human judgement" });
    } else {
      checks.push(outcome);
    }
  }

  // `forbidden` is deterministic by construction: a literal that must not occur.
  for (const [i, f] of (ev.forbidden ?? []).entries()) {
    const present = output.toLowerCase().includes(f.toLowerCase());
    checks.push({
      id: `forbidden${i}`,
      kind: "absent",
      status: present ? "fail" : "pass",
      detail: present ? "forbidden content present" : "forbidden content absent",
    });
  }

  const isHumanCheck = (c: CheckOutcome) => !DETERMINISTIC_KINDS.has(c.kind);
  const detOutcomes = checks.filter((c) => !isHumanCheck(c));
  const humanOutcomes = checks.filter(isHumanCheck);

  const deterministic = dimension(detOutcomes);
  const humanDim = dimension(humanOutcomes);

  const deterministicVerdict: Verdict =
    detOutcomes.length === 0 ? "not_applicable" : deterministic.failed > 0 ? "fail" : "pass";

  const humanVerdict: Verdict =
    humanOutcomes.length === 0
      ? "not_applicable"
      : humanDim.total === 0
        ? "pending"
        : humanDim.failed > 0
          ? "fail"
          : humanDim.total < humanOutcomes.length
            ? "pending" // partially judged
            : "pass";

  return {
    checks,
    deterministic,
    human: humanDim,
    deterministicVerdict,
    humanVerdict,
    independentTaskSuccess: combineVerdicts(deterministicVerdict, humanVerdict),
  };
}
