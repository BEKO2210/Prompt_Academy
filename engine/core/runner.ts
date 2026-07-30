/**
 * H1 experiment runner (ENG-008 §3-§7).
 *
 * ## The harness polices itself
 *
 * ENG-008's acceptance criteria require the §4 constants to be "asserted equal
 * across arms by the harness itself, not by discipline". So the checks live in
 * `assertConstants()` below and run on every completed run. A run that violates
 * one is ABORTED, not annotated (§7) — a violating run produces numbers that
 * look valid and are not, which is worse than no numbers.
 *
 * ## Order randomisation
 *
 * Task order and per-task arm order are randomised with recorded seeds, because
 * a fixed order lets provider drift — thermal throttling, cache warmth, a model
 * reload — favour whichever arm always runs first. The RNG is a seeded PRNG
 * rather than Math.random precisely so the ordering is reproducible from the
 * recorded seed.
 */
import { ARMS, SYSTEM_WRAPPER, buildPrompt, type Arm } from "./arms.ts";
import { FIELD_SPLIT_VERSION } from "./fieldSplit.ts";
import type { AssemblyTask } from "./taskset.ts";
import type { Corpus } from "./retrieval.ts";
import { retrieve } from "./retrieval.ts";
import { FORMULATION_VERSION, MIN_DOCUMENT_FREQUENCY, formulateQuery } from "./queryFormulation.ts";
import type { Provider } from "./provider.ts";
import { createHash } from "node:crypto";

/** Deterministic PRNG (mulberry32). Reproducible from the recorded seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface RunConfig {
  /** §4 constants. Identical across arms by construction — one value each. */
  temperature: number;
  maxTokens: number;
  seed?: number;
  /** How many records arm E may compile. Changing it changes what arm E is. */
  retrievalK: number;
  /** Conjuncts in a formulated query. Changes which record every arm receives. */
  maxQueryTerms: number;
  /**
   * Which arms to run. Defaults to all of them.
   *
   * Exists so a pilot can exercise the infrastructure on a subset without
   * anything pilot-specific being built into the harness. Recorded per run, so
   * a partial matrix cannot be mistaken for a full one.
   */
  arms?: readonly Arm[];
  /** Runs per (task, arm). n = 1 is permitted but must be reported as n = 1. */
  nRuns: number;
  taskOrderSeed: number;
  armOrderSeed: number;
  /** Provenance, recorded verbatim (§6). */
  datasetVersion: string;
  taskSetVersion: string;
  evaluationHash: string;
}

/** One (task, arm, run_index) record. The §6 reproducibility unit. */
export interface RunRecord {
  arm: Arm;
  taskId: string;
  runIndex: number;
  nRuns: number;
  provider: string;
  model: string;
  modelVersion: string;
  temperature: number;
  seed?: number;
  outputBudget: number;
  systemWrapperHash: string;
  fieldSplitVersion: string;
  datasetVersion: string;
  taskSetVersion: string;
  evaluationHash: string;
  retrievedRecordIds: string[];
  /** The query formulation actually produced, so a run states it rather than implying it. */
  retrievalQuery: string;
  /** Content hash of each retrieved record, so a dataset edit is detectable. */
  recordHashes: string[];
  /** Hash of the assembled prompt, before the provider touches it. */
  promptHash: string;
  /** Which arms ran at all — a partial matrix must not look like a full one. */
  armsInRun: string[];
  formulationVersion: string;
  minDocumentFrequency: number;
  taskOrderSeed: number;
  armOrderSeed: number;
  timestamp: string;
  output: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  contextChars: number;
}

export function hashString(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * The §7 hard stops, checked against the records a run actually produced.
 * Returns violations; the caller aborts rather than interpreting.
 */
export function assertConstants(records: RunRecord[]): string[] {
  const v: string[] = [];
  if (records.length === 0) return ["no run records"];

  // One value each, across every arm and every task.
  const single = <K extends keyof RunRecord>(k: K, label: string) => {
    const values = new Set(records.map((r) => JSON.stringify(r[k])));
    if (values.size > 1) v.push(`${label} differed across arms: ${[...values].join(" vs ")}`);
  };
  single("systemWrapperHash", "system wrapper");
  single("outputBudget", "output budget");
  single("temperature", "temperature");
  single("modelVersion", "model version");
  single("model", "model");
  single("provider", "provider");
  single("evaluationHash", "evaluation hash");
  single("fieldSplitVersion", "field split version");
  single("taskSetVersion", "task set version");

  // §3 same-record isolation: B, C and D must share one record per task.
  const byTask = new Map<string, RunRecord[]>();
  for (const r of records) {
    if (!byTask.has(r.taskId)) byTask.set(r.taskId, []);
    byTask.get(r.taskId)!.push(r);
  }
  for (const [taskId, rs] of byTask) {
    const ids = new Set(
      rs.filter((r) => r.arm === "B" || r.arm === "C" || r.arm === "D")
        .map((r) => JSON.stringify(r.retrievedRecordIds)),
    );
    if (ids.size > 1) {
      v.push(`${taskId}: arms B/C/D used different records — abort this comparison`);
    }
    const armA = rs.filter((r) => r.arm === "A");
    for (const r of armA) {
      if (r.retrievedRecordIds.length) v.push(`${taskId}: arm A referenced a record`);
    }
  }
  return v;
}

export interface RunOutcome {
  records: RunRecord[];
  violations: string[];
  /**
   * Tasks excluded because retrieval found nothing. Reported, never silently
   * dropped: a shrinking task set is itself a result about the retriever.
   */
  unretrieved: string[];
  /** True only when the run is safe to interpret. */
  usable: boolean;
}

/**
 * Execute the full arm matrix.
 *
 * Retrieval happens ONCE per task, before the arm loop, and the same record
 * object is handed to B, C and D. That ordering is the whole of same-record
 * isolation, so it is not an implementation detail to be tidied later.
 */
export async function runBenchmark(
  tasks: AssemblyTask[],
  corpus: Corpus,
  provider: Provider,
  cfg: RunConfig,
  now: () => string,
): Promise<RunOutcome> {
  const info = await provider.info();
  const systemWrapperHash = hashString(SYSTEM_WRAPPER);
  const records: RunRecord[] = [];

  /**
   * Tasks for which retrieval found nothing.
   *
   * These MUST NOT enter the arm comparison. With no record, arms B, C, D and E
   * assemble no context and become byte-identical to arm A, so including them
   * contributes a guaranteed tie to every comparison. Enough of them and the
   * run reports "A = B = C = D = E", which ENG-008 §7 reads as "H1 falsified".
   * That would be a conclusion about the retriever masquerading as a conclusion
   * about the hypothesis. Measured on the seed set, this was 8 of 8 before
   * query formulation existed.
   */
  const unretrieved: string[] = [];

  for (const task of shuffle(tasks, cfg.taskOrderSeed)) {
    const f = formulateQuery(corpus, task.request, cfg.maxQueryTerms);
    const r = f.empty
      ? { primary: null, additional: [], recordIds: [], matchedCount: 0 }
      : retrieve(corpus, f.query, cfg.retrievalK);
    if (!r.primary) {
      unretrieved.push(task.task_id);
      continue;
    }

    const armsInRun = (cfg.arms ?? ARMS) as readonly Arm[];
    for (const arm of shuffle(armsInRun, cfg.armOrderSeed) as Arm[]) {
      const prompt = buildPrompt(arm, task, r.primary, r.additional);
      for (let i = 0; i < cfg.nRuns; i++) {
        const res = await provider.generate({
          system: prompt.system,
          user: prompt.user,
          temperature: cfg.temperature,
          maxTokens: cfg.maxTokens,
          seed: cfg.seed,
        });
        records.push({
          arm,
          taskId: task.task_id,
          runIndex: i,
          nRuns: cfg.nRuns,
          provider: info.provider,
          model: info.model,
          modelVersion: info.modelVersion,
          temperature: cfg.temperature,
          seed: cfg.seed,
          outputBudget: cfg.maxTokens,
          systemWrapperHash,
          fieldSplitVersion: FIELD_SPLIT_VERSION,
          datasetVersion: cfg.datasetVersion,
          taskSetVersion: cfg.taskSetVersion,
          evaluationHash: cfg.evaluationHash,
          retrievedRecordIds: prompt.recordIds,
          retrievalQuery: f.query,
          recordHashes: prompt.recordIds.map((id) =>
            hashString(JSON.stringify(corpus.byId.get(id) ?? null))),
          promptHash: hashString(prompt.system + "\u0000" + prompt.user),
          armsInRun: [...armsInRun],
          formulationVersion: FORMULATION_VERSION,
          minDocumentFrequency: MIN_DOCUMENT_FREQUENCY,
          taskOrderSeed: cfg.taskOrderSeed,
          armOrderSeed: cfg.armOrderSeed,
          timestamp: now(),
          output: res.text,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          latencyMs: res.latencyMs,
          contextChars: prompt.user.length - task.request.length,
        });
      }
    }
  }

  const violations = assertConstants(records);
  return { records, violations, unretrieved, usable: violations.length === 0 };
}
