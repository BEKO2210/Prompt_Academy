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

export const REVIEW_PROTOCOL_VERSION = "1.0.0";

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

/** Rater output: packetId -> checkId -> verdict. */
export type ReviewResults = Record<string, Record<string, "pass" | "fail">>;

/** Re-attach verdicts to (task, arm) using the key the rater never saw. */
export function applyReviewResults(
  bundle: ReviewBundle,
  results: ReviewResults,
): Array<{ taskId: string; arm: string; runIndex: number; verdicts: Record<string, "pass" | "fail"> }> {
  return bundle.keys
    .filter((k) => results[k.packetId])
    .map((k) => ({
      taskId: k.taskId,
      arm: k.arm,
      runIndex: k.runIndex,
      verdicts: results[k.packetId]!,
    }));
}
