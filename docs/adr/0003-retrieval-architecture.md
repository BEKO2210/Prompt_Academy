# ADR-0003 — Retrieval architecture: BM25-first, no vector database

**Status:** Proposed
**Date:** 2026-07-30

## Context

Current retrieval is a single lowercase substring test (`haystack(it).includes(q)`) over a
concatenation of title, tags, keywords and card text, plus five exact-equality facet filters
(`Library.tsx:66-76`). There is no scoring, no ranking, no term weighting. A record either matches
or it does not. The `relevance` sort key does not compute relevance.

Measured constraint: the compact `index.json` is **6,908,075 bytes** (6.9 MB) of minified JSON,
downloaded and parsed by every visitor to the Library page before any result appears. Transfer is
compressed by GitHub Pages (amount `UNMEASURED`), but parse cost and heap cost are not compressible.

Corpus scale: 10,000 records, ~25.5 MB of full JSON. Prompt bodies are 80–172 words (median 88).
200 subcategories, 18 frameworks, 65 industries — so facet vocabularies are small and closed.

Master prompt §14 lists 17 desired retrieval signals; §15 explicitly warns against introducing
Pinecone/Qdrant/Elastic/Kafka/Kubernetes for a corpus of this size before benchmarking.

## Decision

**Build hybrid lexical retrieval first: BM25 over an offline-built inverted index, combined with
facet, tag, keyword, tech-stack and capability signals, with all weights in one central config.
Do not introduce a vector database. Defer embeddings until an ablation shows lexical retrieval
leaves measurable headroom.**

Specifics:

1. **Index built offline** in `build_site_data.mjs` (extends existing, proven code). No runtime
   index construction in the browser.
2. **One isomorphic ranking module**, shared by the browser and (later) the engine. Divergence
   between what users see and what the engine selects would be a correctness bug.
3. **All weights and thresholds in a single config file** (§16, §73, §74). Every weight defaults to
   **0** and is raised only by a measurement. `MIN_RETRIEVAL_SCORE`, `MAX_SELECTED_SKILLS`,
   `REDUNDANCY_THRESHOLD`, `MAX_REPAIR_ATTEMPTS` live here.
4. **`w_history` is defined but zero** until telemetry exists — named now to avoid a retrofit.
5. **`w_quality` starts very low.** `quality.*_score` values are self-reported by the generating
   agents and independently unvalidated (finding D6); treating them as ground truth would launder an
   assumption into a ranking signal.
6. **MMR diversity** after scoring, justified by measured near-duplicate clusters (26 duplicate
   first-sentences recorded; near-duplicate density otherwise `UNMEASURED`).
7. **Below-threshold means return nothing**, not a weak match (§29): a mismatched prompt actively
   misdirects and is worse than none. Emit `skill_gap` instead.
8. **The byte budget is part of this work, not a follow-up.** The index must be split, sharded, or
   compacted so the Library page is not slower than the M1 baseline. Shipping ranking at the cost of
   a page-load regression is not acceptable.

## Alternatives

**Vector search with a hosted vector DB (Pinecone/Qdrant).**
Rejected. 10,000 records is small; a hosted service adds cost, a network dependency, and an
operational surface for a corpus that fits in memory. Explicitly warned against by §15.

**Client-side embeddings, brute-force cosine.**
Deferred, not rejected. Technically reasonable — 10,000 × 384 float32 ≈ 15 MB, milliseconds to scan.
But shipping ~15 MB of vectors to a page already burdened by a 6.9 MB index is a regression by the
measure that matters (finding D1). Quantization (int8) and dimensionality reduction change the
arithmetic; that is `UNMEASURED`. Revisit as ablation arm R7 **only if** R1–R6 leave real headroom.

Additional honest point: this corpus's queries and documents share a narrow technical vocabulary
(framework names, UI component names, style terms). That is precisely the regime where lexical
matching performs well and semantic search adds least. The expected gain from embeddings here is
lower than intuition suggests, which is another reason to measure before paying for it.

**Server-side search API.**
Rejected: requires the backend that ADR-0001 declines to build, for a corpus that fits in a browser.

**Keep substring matching, just add more facets.**
Rejected: does not address ranking at all, and the retrieval benchmark exists precisely to show
whether ranking matters. Substring matching is the baseline (arm R0), not a candidate.

## Consequences

**Positive**
- No new infrastructure, no cost, no vendor dependency; ships within the existing static deployment.
- Ranking becomes measurable and explainable ("why did this rank here"), which is the main debugging
  tool for retrieval quality.
- Shared module prevents engine/site divergence.
- Central config makes ablation a configuration exercise rather than a code fork.

**Negative**
- Lexical retrieval will miss genuine paraphrase matches (query "shopping cart" vs. record wording
  "basket"). Partially mitigated by tag/keyword overlap and the closed facet vocabularies; fully
  addressed only by embeddings, if measurement justifies them.
- Bilingual queries are a real weakness: a German query against a ~91%-English corpus will not match
  lexically. This is a concrete, testable failure mode and is deliberately included in the labelled
  query set. If it dominates the error profile, that is the strongest argument for embeddings — and
  the benchmark will say so rather than us guessing.

**Risks**
- The byte budget could make the whole change net-negative for page performance. Mitigation:
  baseline first (M1), measure after, and be willing to ship behind a flag or not at all.
- Weight tuning on the same set used for reporting would invalidate results. Mitigation: hold out a
  test split (`benchmark-plan.md` §6).
