/**
 * Semantic retrieval (ENG-020), provider-neutral.
 *
 * ## Why this exists, measured rather than assumed
 *
 * Lexical retrieval was measured at the task -> skill step: 2 of 20 top-1
 * records relevant, 9 topically unrelated, 2 empty. Two attempts to repair the
 * query formulation were measured and REJECTED — conjunctive backoff picks a
 * generic term, and OR-plus-ranking picks a coincidental title match.
 *
 * The cause is a vocabulary mismatch no term selection can close. A task says
 * "eine Seitenleiste, die auf dem Handy einklappt"; the corpus says "with neon
 * visual aesthetics tailored for the cybersecurity industry".
 *
 * Same 20 tasks, semantic top-1: 10 relevant, 5 partial, 5 unrelated, 0 empty.
 *
 * ## Layering
 *
 * This module takes vectors. It does not know how they were produced, so the
 * embedding provider is swappable exactly like the generation provider.
 */
import type { Corpus } from "./retrieval.ts";
import type { SkillRecord } from "./fieldSplit.ts";
import type { RetrievalResult } from "./retrieval.ts";

export const SEMANTIC_RETRIEVAL_VERSION = "1.0.0";

export interface EmbeddingIndex {
  /** Row-major, `count` vectors of `dim`, each unit-normalised. */
  vectors: Float32Array;
  dim: number;
  count: number;
  /** Record id per row. */
  ids: string[];
  /** Recorded per run: a different embedding model is a different retriever. */
  model: string;
}

/**
 * Cosine top-k. Vectors are unit-normalised at build time, so cosine is a dot
 * product and no per-query normalisation of the corpus is needed.
 */
export function semanticRetrieve(
  corpus: Corpus,
  index: EmbeddingIndex,
  queryVector: number[],
  k = 3,
): RetrievalResult {
  const { vectors, dim, count, ids } = index;
  const best: Array<{ i: number; s: number }> = [];
  for (let r = 0; r < count; r++) {
    let s = 0;
    const off = r * dim;
    for (let d = 0; d < dim; d++) s += queryVector[d]! * vectors[off + d]!;
    if (best.length < k) {
      best.push({ i: r, s });
      best.sort((a, b) => a.s - b.s);
    } else if (s > best[0]!.s) {
      best[0] = { i: r, s };
      best.sort((a, b) => a.s - b.s);
    }
  }
  best.reverse();
  const recs = best.map((b) => corpus.byId.get(ids[b.i]!)).filter(Boolean) as SkillRecord[];
  return {
    primary: recs[0] ?? null,
    additional: recs.slice(1),
    recordIds: recs.map((r) => r.id),
    matchedCount: count,
  };
}
