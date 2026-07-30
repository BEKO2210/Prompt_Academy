/**
 * Human evaluation protocol (ENG-014 §7).
 *
 * 66 checks stay human because they are genuinely about semantics, layout or
 * quality: "the danger zone is visually separated", "the headline states what
 * the app does rather than a generic slogan". Turning those into regexes would
 * raise automation coverage and lower the worth of the measurement.
 *
 * ## What this module guarantees
 *
 * A human rater is the least controllable part of the experiment, so everything
 * that can be controlled is:
 *
 *   - the ARM is not shown, and is not recoverable from the packet
 *   - the MODEL is not shown
 *   - the RETRIEVED RECORD is not shown, so the injected instructions cannot be
 *     reused as a hidden grading key
 *   - the retrieval score is not shown
 *   - packet order is randomised from a recorded seed
 *   - every arm is judged against the SAME rubric text
 *   - each item is PASS / FAIL against a written criterion, not a 1–10 feeling
 *
 * ## Why PASS/FAIL and not a scale
 *
 * A 1–10 scale without anchors is a mood. The criteria are already written as
 * propositions ("focus is restored to the trigger on close"), and a proposition
 * is true or false. Where a genuine middle exists, the criterion is split into
 * two propositions rather than given half a point.
 *
 * ## Blinding is structural
 *
 * `buildReviewPackets` accepts the run records but the packet type has no arm,
 * model or record field to put them in. A reviewer file therefore cannot leak
 * them by accident; it would take a deliberate change to the type.
 */
import type { TaskEvaluation } from "./evaluation.ts";
import { shuffle } from "./runner.ts";

export const REVIEW_PROTOCOL_VERSION = "2.0.0";

/** Bump when the identity rule for reusing a judgement changes. */
export const DEDUP_VERSION = "1.0.0";

/** Bump when the covert-duplicate protocol changes. */
export const INTRA_RATER_PROTOCOL_VERSION = "1.0.0";

/**
 * Fraction of the sample duplicated covertly to measure intra-rater consistency.
 *
 * One reviewer means inter-rater reliability cannot be measured and will not be
 * claimed. Intra-rater consistency can: the same output and the same proposition
 * appear twice, under different packet ids and at unrelated positions, and the
 * reviewer is not told which. Disagreement between the two is the reviewer's own
 * noise floor.
 */
export const INTRA_RATER_DUPLICATE_SHARE = 0.1;

/**
 * A judgement may be reused ONLY across evaluation units that are identical in
 * every one of these. Similar outputs are never deduplicated: two answers that
 * differ by a line can differ by exactly the line a criterion is about.
 */
export interface EvaluationUnitKey {
  taskId: string;
  outputHash: string;
  criterionId: string;
  criterionVersion: string;
  rubricVersion: string;
}

export function evaluationUnitId(k: EvaluationUnitKey): string {
  // Field order is part of the identity; a reordering would silently change ids.
  return [k.taskId, k.outputHash, k.criterionId, k.criterionVersion, k.rubricVersion].join("|");
}

/** What a rater sees. Deliberately missing arm, model, record and score. */
export interface ReviewPacket {
  /** Opaque. Maps back to (task, arm, run) only through the sealed key below. */
  packetId: string;
  /** Shown so the rater knows what was asked. */
  request: string;
  /** The output, verbatim. */
  output: string;
  /** The criteria, in a fixed order, identical for every arm. */
  criteria: Array<{ id: string; text: string }>;
}

/** The mapping back. Held by the harness, never handed to the rater. */
export interface PacketKey {
  packetId: string;
  taskId: string;
  arm: string;
  runIndex: number;
}

export interface ReviewBundle {
  packets: ReviewPacket[];
  keys: PacketKey[];
  orderSeed: number;
  protocolVersion: string;
  /** packetId pairs that are covert duplicates of one another. Held back from the reviewer. */
  duplicatePairs?: Array<[string, string]>;
}

export interface ReviewInput {
  taskId: string;
  arm: string;
  runIndex: number;
  request: string;
  output: string;
  evaluation: TaskEvaluation;
}

/**
 * Build a blinded, randomised review bundle.
 *
 * The packet id is derived from position AFTER shuffling, so it carries no
 * information about the arm. Deriving it from the arm — even hashed — would let
 * a rater who saw two bundles correlate them.
 */
export function buildReviewPackets(items: ReviewInput[], orderSeed: number): ReviewBundle {
  const shuffled = shuffle(items, orderSeed);
  const packets: ReviewPacket[] = [];
  const keys: PacketKey[] = [];

  shuffled.forEach((it, i) => {
    const packetId = `P${String(i + 1).padStart(4, "0")}`;
    packets.push({
      packetId,
      request: it.request,
      output: it.output,
      criteria: (it.evaluation.assertions ?? [])
        .filter((a) => a.kind === "human")
        .map((a) => ({ id: a.id, text: a.value })),
    });
    keys.push({ packetId, taskId: it.taskId, arm: it.arm, runIndex: it.runIndex });
  });

  return { packets, keys, orderSeed, protocolVersion: REVIEW_PROTOCOL_VERSION };
}

/**
 * Everything a packet must NOT contain.
 *
 * Exported so the test can assert on the same list the documentation claims,
 * rather than a second list that could drift from it.
 */
export const FORBIDDEN_PACKET_FIELDS: readonly string[] = [
  "arm", "model", "modelVersion", "provider", "record", "recordId",
  "retrievedRecordIds", "retrievalQuery", "score", "rank",
];

/**
 * Insert covert duplicates for intra-rater measurement.
 *
 * The duplicate carries the SAME output and the SAME criteria, gets its own
 * packet id, and lands at a position determined by the shuffle rather than next
 * to its twin. Which packets are duplicates is returned to the harness only.
 */
export function withCovertDuplicates(
  items: ReviewInput[],
  orderSeed: number,
  share = INTRA_RATER_DUPLICATE_SHARE,
): ReviewBundle {
  const n = Math.max(1, Math.round(items.length * share));
  // Chosen by the same seeded shuffle, so the selection is reproducible and not
  // hand-picked toward easy or hard items.
  const chosen = shuffle(items.map((_, i) => i), orderSeed ^ 0x5eed).slice(0, n);
  const withDupes = [...items, ...chosen.map((i) => items[i]!)];
  const bundle = buildReviewPackets(withDupes, orderSeed);

  // Pair up: for each duplicated item, the two packet ids that carry it.
  const byUnit = new Map<string, string[]>();
  bundle.keys.forEach((k) => {
    const unit = `${k.taskId}|${k.arm}|${k.runIndex}`;
    if (!byUnit.has(unit)) byUnit.set(unit, []);
    byUnit.get(unit)!.push(k.packetId);
  });
  const duplicatePairs: Array<[string, string]> = [];
  for (const ids of byUnit.values()) {
    for (let i = 1; i < ids.length; i++) duplicatePairs.push([ids[0]!, ids[i]!]);
  }
  return { ...bundle, duplicatePairs };
}

export interface IntraRaterResult {
  comparedPropositions: number;
  agreements: number;
  rawAgreement: number | null;
  /** Cohen's kappa, or null when the class distribution cannot support it. */
  kappa: number | null;
  kappaNote: string;
}

/**
 * Intra-rater consistency over the covert duplicates.
 *
 * Explicitly NOT inter-rater reliability: it measures one reviewer against
 * themselves. Kappa is withheld rather than computed on a degenerate table,
 * because a kappa from a single-class sample is a number without a meaning.
 */
export function intraRaterConsistency(
  bundle: ReviewBundle,
  results: ReviewResults,
): IntraRaterResult {
  let compared = 0;
  let agree = 0;
  const a: string[] = [];
  const b: string[] = [];
  for (const [p1, p2] of bundle.duplicatePairs ?? []) {
    const r1 = results[p1];
    const r2 = results[p2];
    if (!r1 || !r2) continue;
    for (const cid of Object.keys(r1)) {
      if (!(cid in r2)) continue;
      compared++;
      a.push(r1[cid]!);
      b.push(r2[cid]!);
      if (r1[cid] === r2[cid]) agree++;
    }
  }
  const raw = compared ? agree / compared : null;

  const labels = [...new Set([...a, ...b])];
  if (compared < 10 || labels.length < 2) {
    return {
      comparedPropositions: compared, agreements: agree, rawAgreement: raw, kappa: null,
      kappaNote: compared < 10
        ? `withheld: only ${compared} paired propositions`
        : "withheld: every judgement fell in one class, so chance agreement is undefined",
    };
  }
  // Cohen's kappa over the observed label set.
  const idx = new Map(labels.map((l, i) => [l, i]));
  const m = labels.map(() => labels.map(() => 0));
  for (let i = 0; i < a.length; i++) m[idx.get(a[i]!)!]![idx.get(b[i]!)!]!++;
  const po = agree / compared;
  let pe = 0;
  for (let i = 0; i < labels.length; i++) {
    const rowSum = m[i]!.reduce((x, y) => x + y, 0);
    const colSum = m.reduce((x, row) => x + row[i]!, 0);
    pe += (rowSum / compared) * (colSum / compared);
  }
  return {
    comparedPropositions: compared, agreements: agree, rawAgreement: raw,
    kappa: pe === 1 ? null : (po - pe) / (1 - pe),
    kappaNote: pe === 1 ? "withheld: chance agreement is 1" : "intra-rater, single reviewer against themselves",
  };
}

/** Rater output: packetId -> checkId -> verdict. */
export type ReviewResults = Record<string, Record<string, "pass" | "fail" | "uncertain">>;

/**
 * Reuse a judgement across IDENTICAL evaluation units.
 *
 * Reduces reviewer workload without changing any result: the same task, the same
 * output bytes, the same criterion, at the same criterion and rubric versions is
 * the same question, and asking it twice cannot yield new information.
 *
 * Deliberately strict. Two outputs that differ anywhere are different units,
 * because they may differ precisely where the criterion looks.
 */
export function deduplicateUnits<T extends EvaluationUnitKey>(units: T[]): {
  unique: T[];
  duplicates: Array<{ unit: T; sameAs: T }>;
} {
  const seen = new Map<string, T>();
  const unique: T[] = [];
  const duplicates: Array<{ unit: T; sameAs: T }> = [];
  for (const u of units) {
    const id = evaluationUnitId(u);
    const first = seen.get(id);
    if (first) duplicates.push({ unit: u, sameAs: first });
    else { seen.set(id, u); unique.push(u); }
  }
  return { unique, duplicates };
}

/** Map judgements from the unique units back onto every identical unit. */
export function expandJudgements<T extends EvaluationUnitKey>(
  units: T[],
  judged: Record<string, "pass" | "fail" | "uncertain">,
): Array<{ unit: T; verdict: "pass" | "fail" | "uncertain" | null }> {
  return units.map((u) => ({ unit: u, verdict: judged[evaluationUnitId(u)] ?? null }));
}

/** Re-attach verdicts to (task, arm) using the key the rater never saw. */
export function applyReviewResults(
  bundle: ReviewBundle,
  results: ReviewResults,
): Array<{ taskId: string; arm: string; runIndex: number; verdicts: Record<string, "pass" | "fail" | "uncertain"> }> {
  return bundle.keys
    .filter((k) => results[k.packetId])
    .map((k) => ({
      taskId: k.taskId,
      arm: k.arm,
      runIndex: k.runIndex,
      verdicts: results[k.packetId]!,
    }));
}
