# Roadmap — Prompt Academy → Skill Engine

**Status:** Phase 0 complete (docs only). No implementation started.
**Date:** 2026-07-30
**Source of truth** for project status, together with `docs/adr/`.

Read `architecture/current-state.md` and `architecture/target-state.md` first.

---

## Ordering rationale (why this differs from the master prompt's M0–M22)

The master prompt suggests 22 milestones, with benchmarking at M16 and validation at M14. This
roadmap reorders deliberately, for reasons drawn from the spec's own principles:

1. **The central premise is untested.** H1 (retrieval helps) and H2 (small model + engine ≈ strong
   model) have zero supporting evidence in this repo. Building 15 milestones of machinery before
   testing them risks a large investment resting on an assumption. §47 (ablation), §90 (North Star),
   and "Measured > Assumed" all argue for testing early.
2. **Measurement must precede optimization.** No performance or quality baseline currently exists
   (see current-state §11). Any "improvement" claimed before a baseline is unfalsifiable.
3. **Risk is sequenced last.** External skill import is the largest attack-surface increase in the
   plan; current surface is near zero. Carrying that risk before there is an engine to benefit from
   it is a bad trade.
4. **The static site has no runtime.** Milestones 9–34 of the spec presuppose one. That is a
   category change requiring an explicit decision (ADR-0001), not an implicit one.

Net effect: same ambition, different order. Cheap falsification first, infrastructure second.

---

## Phase overview

| Phase | Goal | Gate to exit |
|---|---|---|
| **P0** Discovery | Understand the real system; plan honestly | Docs reviewed and approved ← **we are here** |
| **P1** Foundation | Baselines, CI safety net, capability vocabulary | Measured baselines exist; CI blocks bad data |
| **P2** Retrieval | Real ranking, shipped, measurably better | Precision@k beats substring baseline; page not slower |
| **P3** Premise test | Cheapest possible engine slice; test H1 | H1 answered with evidence — either outcome is a success |
| **P4** Engine | Build out only what P3 justified | Validated task success improves at acceptable cost |
| **P5** External skills | Importer + security + license pipeline | No untrusted content ever executed; licences resolved |
| **P6** Hardening | Tests, docs, rollback, release discipline | Release gates pass |

**P4–P6 are contingent.** If P3 falsifies H1, the correct outcome is to stop, document the negative
result, and keep the improved library from P2 — which is a genuinely good product on its own.
A roadmap that cannot end early is not being measured honestly.

---

## M0 — Discovery & Planning

**Status:** DONE
**Goal:** Replace assumptions about the project with measured facts; produce an executable plan.

**Delivered:**
- `docs/architecture/current-state.md` — measured inventory, 9 findings (D1–D9)
- `docs/architecture/target-state.md` — layered target, hypotheses H1/H2, scope boundaries
- `docs/architecture/skill-engine.md` — component design with necessity assessment
- `docs/roadmap.md` — this file
- `docs/security/skill-threat-model.md`, `docs/security/external-skill-policy.md`
- `docs/benchmark-plan.md`
- `docs/adr/` — ADR-0001 … ADR-0007
- `docs/tasks/` — tickets for M1–M3

**Key measured findings:** dataset is 10,000 records, clean, schema-conformant, with acceptance
criteria and negative prompts on every record. `index.json` is **6.9 MB**. Search is a single
substring `includes()`. There are **no tests** and CI runs only deploy. There is **no backend**.

**Exit criteria:** operator reviews and approves scope. ✅ pending review

**Dependencies:** none

---

## M1 — Foundation: baselines, safety net, vocabulary

**Status:** READY
**Goal:** Be able to detect regressions and prove improvements. Nothing user-visible.

**Why first:** every later claim depends on a baseline that does not exist yet, and every later
change risks a dataset or site regression that nothing currently catches.

**Scope:**
- Measure and record the baselines in current-state §11 (page load, `index.json` transfer/parse,
  search latency, heap). Commit as `reports/baseline-*.json` with real timestamps.
- CI: run `validate_dataset.py` + `dedupe_dataset.py` + `tsc` + `eslint` on PR and on push.
  Fail the build on dataset schema violations. This closes finding D4.
- Introduce a test runner and the first tests: dataset invariants, `build_site_data.mjs` output shape.
- Author `schema/capabilities.vocabulary.json` — controlled, versioned vocabulary (schema A1).
- Author the subcategory → capabilities mapping table (200 rows, hand-reviewed).
- Add `content_hash` per record (cheap, enables later idempotency).

**Non-goals:** changing ranking; touching the UI; embeddings; anything user-visible.

**Exit criteria:**
- Baselines committed, with the measurement method documented and reproducible.
- CI fails on an intentionally corrupted dataset record (proven, not assumed).
- Capability vocabulary covers ≥95% of records via the deterministic mapping; residual documented.
- Capability labels spot-checked against a human-labelled sample; agreement rate recorded.

**Risks:** capability vocabulary design is the one irreversible-ish decision here (later changes
mean relabelling). Mitigate by versioning the vocabulary from the start.

**Complexity:** M

**Dependencies:** M0

---

## M2 — Retrieval: real ranking in the existing static site

**Status:** PLANNED
**Goal:** Replace binary substring matching with scored hybrid ranking. Ship it. Measure it.

**Scope:**
- Build an offline inverted index / BM25 artifact in `build_site_data.mjs` (extends existing code).
- Isomorphic ranking module (one implementation, shared by browser and later engine — see
  skill-engine §5).
- Central config for all weights and thresholds; every weight defaults to 0 (§16, §73, §74).
- Solve the byte-budget problem (finding D1) *as part of this work*: split/shard/compact the index
  so the page is not slower. Non-negotiable.
- MMR diversity selection.
- Explainability: show why a result ranked where it did.
- Labelled query set (see `benchmark-plan.md`) to measure precision@k.

**Non-goals:** embeddings (deferred pending ablation); backend; any model call.

**Exit criteria:**
- precision@k measurably beats the substring baseline on the labelled query set.
- Library page load and search latency **no worse** than the M1 baseline.
- Ablation table recorded: contribution of each signal, with any non-contributing signal set to
  zero weight and its code removed (§47).

**Risks:** the byte budget could make this net-negative for performance. If the measured page load
regresses and cannot be recovered, the correct action is to ship the ranking behind a flag or not
at all — not to accept the regression.

**Complexity:** L

**Dependencies:** M1

---

## M3 — Premise test: minimal vertical slice (local only)

**Status:** PLANNED — gated on **ADR-0001**
**Goal:** Answer H1 as cheaply as possible. This milestone exists to produce evidence, not a feature.

**Scope (deliberately tiny — master prompt §66):**
- Local CLI (no service, no hosting, no public surface), against the existing isolated ollama.
- Pipeline: normalize → capabilities → retrieve+rank (reuse M2 module) → **extract/compile** →
  local model → deterministic validate → telemetry JSONL.
- **Deterministic field split** separating descriptive content (`prompt` prose, `style`) from
  actionable content (`acceptance_criteria`, `negative_prompt`, `tech_stack` constraints). Documented
  and committed — this split is the experiment's independent variable and must not be model-decided.
- Prompt compiler: dedup, conflict resolution, precedence, acceptance-criteria preservation,
  provenance trace.
- Deterministic validators only (parse, typecheck, imports, forbidden packages, required exports).
- Benchmark harness with **arms A–E** from `benchmark-plan.md` §4.

**Explicitly excluded:** decomposer, DAG, reranker-as-separate-stage, repair, model routing, any UI.
Arm F (full router/reranker/repair) is M4.

**Exit criteria:**
- Benchmark run on the task set; the §4 cross-arm table filled from real runs, with full
  reproducibility metadata (§48: model, version, temperature, seed, dataset version, config,
  timestamp, hardware).
- **H1a, H1b, H1c each answered with evidence.** Negative results are valid and valuable outcomes —
  four of the seven H1 decision branches lead to building *less* than currently planned.
- Token accounting per run (§89), including whether arm D achieves comparable success at **lower**
  input-token cost than arm B.

**Why the arms matter more than the pipeline here:** the central question is no longer "does
retrieval help" but **"description vs. instruction vs. compiled instruction"** (benchmark-plan §1a).
Published evidence (arXiv:2602.11988) found bulk repository context unhelpful while instructions
were followed. If that split reproduces here, the product's job is extraction and compilation, not
context loading — which would change the architecture's centre of gravity toward the compiler.

**Risks:**
- Local 8 GB model quality may be the limiting factor rather than context quality, confounding H1.
  Mitigate by running at least one arm against a stronger model on the identical compiled prompt, to
  separate "scaffolding doesn't help" from "this model can't use it".
- The C/D field split is the experiment's independent variable; a sloppy or shifting split would
  invalidate the result. It must be deterministic, documented, and frozen before the run.

**Complexity:** L

**Dependencies:** M2, ADR-0001

---

## M4 — Engine build-out (contingent)

**Status:** BLOCKED — requires H1 supported in M3
**Goal:** Add only the components M3 showed were missing.

**Candidate scope, in likely order of value — but the M3 result reorders this:**
arm F (full router/reranker + validation + targeted repair), repair engine (needs validation signal
first), skill composition (**only if H1c held, i.e. E > D**), task decomposer (only if multi-task
requests are common in real use), model router + second provider, execution modes, context budget
manager refinement, model-specific performance learning (§33).

If **D > B** (H1b) the compiler/extractor is the proven core and should receive the effort. If
**E ≈ D** (H1c fails) the composer is explicitly **not** built.

Each component enters scope **only** with a measurement showing the gap it closes. §47 applies:
components that do not help are removed, not kept "for completeness".

**Exit criteria:** validated task success improves against M3 baseline at acceptable cost/latency;
ablation table shows each retained component's contribution.

**Complexity:** XL

**Dependencies:** M3

---

## M5 — External skill supply chain (contingent)

**Status:** BLOCKED — requires a working engine (M4) worth feeding
**Goal:** Import external skills without ever trusting them.

**Scope:** source adapter interface (local dir, git, GitHub, single SKILL.md, manifest);
SKILL.md structural parsing (metadata / instructions / resources / scripts / requirements —
not "store as one long prompt", §Skill.md support); quarantine pipeline; content hashing;
provenance; license detection with `license_unknown` blocking redistribution; static analysis;
injection heuristics; risk scoring; human approval; versioning + upstream update candidates.

**Hard rules:** no external skill is ever executed unreviewed (§3); no third-party script execution
by default (see `security/external-skill-policy.md`); no automatic licence acceptance.

**Exit criteria:** import report produced for a real source **before** any production import (§92);
untrusted content provably cannot override system policy; `license_unknown` items are blocked.

**Risks:** highest-risk milestone in the plan. Also the one with real legal exposure (licensing).

**Complexity:** XL

**Dependencies:** M4

---

## M6 — Hardening & release discipline

**Status:** PLANNED (partially continuous)
**Goal:** Make the whole thing maintainable and safely releasable.

**Scope:** test coverage across importer/retrieval/compiler/validation; edge cases (§56);
rollback (§99); feature flags (§71); staging environment (closes finding D7); observability;
docs (§81); developer setup (§82); replace the Vite template `site/README.md` (finding D8).

**Complexity:** L

---

## Dependency graph

```
M0 (done)
 └─> M1 Foundation ──> M2 Retrieval ──> M3 Premise test ──[H1 holds?]──> M4 Engine ──> M5 External
                                              │                                          │
                                              └─[H1 fails]──> stop; keep M2              │
                                                                                          v
                                          M6 Hardening (continuous from M1, gate before any release)

ADR-0001 (runtime decision) ─────────────────> gates M3
```

---

## Cross-cutting release gates (§67, §68)

A milestone is not done unless **all** hold:

- Code implemented — no TODOs, no mocks, no placeholder UI, no fake APIs/metrics/benchmarks (§68)
- Tests exist **and were actually run** and pass
- Build green; typecheck green; lint green
- Migrations tested (when applicable)
- Security considered and documented
- Docs updated
- No regression in existing functionality (§70)
- Acceptance criteria met
- Measurements supporting any claimed improvement are committed and reproducible

No ticket is marked DONE with unmet acceptance criteria.

---

## Complexity scale

`XS | S | M | L | XL` — deliberately **not** time estimates (§63), since no real team velocity is
known for this project.

---

## Status vocabulary

`PLANNED | READY | IN PROGRESS | BLOCKED | REVIEW | DONE`

---

## Handoff

```text
CURRENT STATE                                    (last updated 2026-07-30)

Branch:
  phase-0/skill-engine-foundation  (NOT merged to main; main is production)
  Commit 1  docs: add Phase 0 skill engine discovery and roadmap      (23 files, docs/ only)
  Commit 2  docs: add AGENTS.md as agent source of truth, CLAUDE.md as import

Completed:
  M0 Discovery & Planning — all Phase 0 docs written (architecture, security, benchmark,
  7 ADRs, 7 tickets) plus AGENTS.md (92 lines) + CLAUDE.md (@AGENTS.md import).
  Measured: 10,000 records, schema-clean, 200 subcategories / 18 frameworks / 65 industries;
  acceptance_criteria (3-6) and non-empty negative_prompt on ALL 10,000 records;
  index.json = 6,908,075 bytes; search = one substring includes() + 5 exact facets;
  no tests; CI = deploy only; no backend; no capabilities[] field.

In Progress:
  none

Blocked:
  M3 — blocked on ADR-0001 (runtime: local CLI vs. self-hosted service vs. cloud vs. BYO-key).
       Recommendation on record: local CLI against existing ollama, written as a LIBRARY with a
       thin CLI entry point so later promotion is a deployment change, not a rewrite.
  M4, M5 — contingent on the M3 H1 result.

Tests:
  None exist. Establishing them is M1 scope (finding D4). CI currently publishes an invalid
  dataset without complaint.

Important Decisions:
  - Reordered the master prompt's M0-M22: falsify the core premise before building on it.
  - H1 REFINED (2026-07-30) after reviewing arXiv:2602.11988, which found repository-level
    context files do not generally improve success (+20% cost) while INSTRUCTIONS were well
    followed and OVERVIEWS were not. That study used static repo-wide context, so it does not
    refute our task-specific retrieval + extraction + compilation approach — but it lowers the
    prior on naive injection and reshapes the experiment. H1 is now tested as three sub-claims:
      H1a  instruction > description         (arm D > arm C)
      H1b  extraction > bulk injection       (arm D > arm B)   <- load-bearing
      H1c  compilation > single extraction   (arm E > arm D)
    Benchmark arms are now A-E in M3 (F deferred to M4). See benchmark-plan.md §1a and §4.
  - Schema evolution additive only; provenance/licence/permissions deferred until data exists.
  - No vector DB. Embeddings deferred pending ablation against BM25 (arm R7).
  - External skill import sequenced last (largest attack-surface increase).
  - Layers 0-2 need no new infrastructure and are the recommended first real work.
  - AGENTS.md is the single source of truth; CLAUDE.md only imports it (no duplication).

Files Changed:
  docs/**, AGENTS.md, CLAUDE.md. No source, dataset, site, CI or runtime files touched.

Next Recommended Ticket:
  ENG-002 (baselines) -> ENG-004 (content_hash) -> ENG-003 (CI gates) -> ENG-001 (capabilities)
  -> ENG-005 (labelled query set). Decide ADR-0001 before M3 is planned in detail.

Do Not Forget:
  - index.json is already 6.9 MB and is parsed by every Library visitor. Retrieval enrichment
    MUST NOT make the page slower (D1). Measure before and after.
  - quality.*_score is self-reported by the generating agents, never independently validated
    (D6). Not ground truth for ranking, not evidence of output quality.
  - reports/ has rounded/hardcoded timestamps and does NOT prove current state (D5).
  - Local repo `prompt-forge` is a DIFFERENT repository (Prompt-Academy), not this project.
  - cleanup_dataset.py once modified 6,678 records in one pass; bulk mutation needs review + diff.
  - RTX 3070 / 8 GB: one resident local model; ComfyUI contends for VRAM.
  - The C/D field split is the M3 experiment's independent variable. It must be deterministic,
    documented and frozen before the run, never model-decided.
  - Four of seven H1 decision branches lead to building LESS than planned; one leads to stopping.
    That is intended, not a failure mode.
```
