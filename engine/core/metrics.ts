/**
 * Reporting metrics (ENG-017 §2).
 *
 * Defined, tested and frozen BEFORE any clean-DEV result exists, so no threshold
 * and no weighting can be chosen after seeing which arm it favours.
 *
 * ## Why a second metric at all
 *
 * Independent Task Success is all-or-nothing per task: one failed criterion
 * makes the task a failure. On the pilot that produced 1 pass out of 40 cells,
 * which is a plausible floor effect — a metric pinned at zero cannot distinguish
 * arms even if they genuinely differ.
 *
 * The response is NOT to loosen a check or relax the pass rule. Independent Task
 * Success stays exactly as frozen. A second, finer-grained metric is added
 * alongside it, and its subordinate status is part of the definition.
 *
 * ## Task-normalised, not pooled
 *
 * Pooling every criterion into one ratio lets a task with 14 criteria outweigh a
 * task with 4 by more than three to one, so the metric would partly measure how
 * verbosely a task happened to be specified. Each task therefore contributes one
 * ratio, and the ratios are averaged with equal weight.
 *
 * ## Unresolved is excluded, never counted as failure
 *
 * The denominator is RESOLVED criteria. An UNCERTAIN human judgement or an
 * unresolvable pattern leaves the criterion out of both numerator and
 * denominator — the missing-measurement rule already frozen in evaluator.ts. A
 * task with nothing resolved contributes nothing and is reported separately,
 * rather than entering the mean as a zero.
 */
import type { EvaluationResult } from "./evaluator.ts";

/** Bump on ANY change to how a metric is computed. Frozen before a run. */
export const METRICS_VERSION = "1.0.0";

export interface TaskCompliance {
  taskId: string;
  passed: number;
  failed: number;
  resolved: number;
  /** passed / resolved, or null when nothing was resolvable. */
  ratio: number | null;
}

export interface SecondaryMetric {
  /** Equal-weight mean over tasks that resolved at least one criterion. */
  taskNormalisedCompliance: number | null;
  /** Tasks that contributed to the mean. */
  contributingTasks: number;
  /** Tasks with nothing resolved. Reported, never folded in as zero. */
  unmeasuredTasks: string[];
  perTask: TaskCompliance[];
}

/**
 * Per-task compliance over INDEPENDENT criteria — every Layer 2 check, both
 * deterministic and human, since Independent Task Success combines both.
 */
export function taskCompliance(taskId: string, ev: EvaluationResult): TaskCompliance {
  const passed = ev.checks.filter((c) => c.status === "pass").length;
  const failed = ev.checks.filter((c) => c.status === "fail").length;
  const resolved = passed + failed;
  return { taskId, passed, failed, resolved, ratio: resolved > 0 ? passed / resolved : null };
}

/**
 * Task-Normalized Independent Criterion Compliance.
 *
 * One entry per task. Passing the same task twice (repetitions) must be averaged
 * by the caller BEFORE this is applied, or a task with more repetitions would
 * gain weight — the same pooling error at a different level.
 */
export function secondaryMetric(rows: TaskCompliance[]): SecondaryMetric {
  const contributing = rows.filter((r) => r.ratio !== null);
  const unmeasured = rows.filter((r) => r.ratio === null).map((r) => r.taskId);
  return {
    taskNormalisedCompliance: contributing.length
      ? contributing.reduce((a, r) => a + (r.ratio as number), 0) / contributing.length
      : null,
    contributingTasks: contributing.length,
    unmeasuredTasks: unmeasured,
    perTask: rows,
  };
}

/**
 * Average a task's repetitions into ONE row before the task-level mean.
 *
 * Without this, a task whose repetitions all resolved would outweigh one where
 * some repetition went unresolved.
 */
export function averageRepetitions(taskId: string, reps: TaskCompliance[]): TaskCompliance {
  const usable = reps.filter((r) => r.ratio !== null);
  return {
    taskId,
    passed: reps.reduce((a, r) => a + r.passed, 0),
    failed: reps.reduce((a, r) => a + r.failed, 0),
    resolved: reps.reduce((a, r) => a + r.resolved, 0),
    ratio: usable.length
      ? usable.reduce((a, r) => a + (r.ratio as number), 0) / usable.length
      : null,
  };
}

/**
 * The reporting order, frozen. Primary first, secondary second, diagnostics last
 * — so a diagnostic can never be presented as the headline.
 */
export const REPORTING_LEVELS = {
  primary: ["independentTaskSuccess"],
  secondary: ["taskNormalisedIndependentCriterionCompliance"],
  diagnostic: [
    "deterministicCompliance",
    "humanCompliance",
    "proxyCompliance",
    "inputTokens",
    "outputTokens",
    "outputLength",
    "latencyMs",
  ],
} as const;
