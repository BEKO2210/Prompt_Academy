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
- Pipeline: normalize → capabilities → retrieve+rank (reuse M2 module) → compile → local model →
  deterministic validate → telemetry JSONL.
- Prompt compiler: dedup, conflict resolution, precedence, acceptance-criteria preservation,
  provenance trace.
- Deterministic validators only (parse, typecheck, imports, forbidden packages, required exports).
- Benchmark harness with arms A/B/C/D from `benchmark-plan.md`.

**Explicitly excluded:** decomposer, DAG, reranker-as-separate-stage, repair, model routing,
composition of >1 skill if unnecessary, any UI.

**Exit criteria:**
- Benchmark run on the task set, results committed with full reproducibility metadata
  (§48: model, version, temperature, seed, dataset version, config, timestamp).
- **H1 answered with evidence.** A negative result is a valid and valuable outcome.
- Token accounting per run (§89).

**Risks:** local 8 GB model quality may be the limiting factor rather than prompt quality,
confounding H1. Mitigate by running at least one arm against a stronger model to separate
"scaffolding doesn't help" from "this model can't use it".

**Complexity:** L

**Dependencies:** M2, ADR-0001

---

## M4 — Engine build-out (contingent)

**Status:** BLOCKED — requires H1 supported in M3
**Goal:** Add only the components M3 showed were missing.

**Candidate scope, in likely order of value:** repair engine (needs validation signal first),
task decomposer (only if multi-task requests are common in real use), skill composition,
model router + second provider, execution modes, context budget manager refinement,
model-specific performance learning (§33).

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
CURRENT STATE

Completed:
  M0 Discovery & Planning — all Phase 0 docs written (architecture, security, benchmark, ADRs, tickets).
  Measured: 10,000 records, schema-clean; index.json = 6.9 MB; search = substring includes();
  no tests; CI = deploy only; no backend; no capability vocabulary.

In Progress:
  none

Blocked:
  M3 — blocked on ADR-0001 (runtime decision: local CLI vs. service vs. cloud vs. BYO-key).
       Recommendation on record: local CLI first.
  M4, M5 — contingent on H1 being supported by M3 evidence.

Tests:
  None exist. Establishing them is M1 scope (finding D4).

Important Decisions:
  - Reordered the master prompt's M0–M22: falsify the core premise (H1/H2) before building
    infrastructure that assumes it.
  - Schema evolution is additive only; provenance/license/permissions deferred until data exists
    to populate them.
  - No vector DB. Embeddings deferred pending an ablation against BM25.
  - External skill import sequenced last (largest attack-surface increase).
  - Layer 0-2 work needs no new infrastructure and is the recommended first real work.

Files Changed:
  docs/** only. No source, dataset, site, or CI files touched. Working tree otherwise untouched.

Next Recommended Ticket:
  ENG-001 (capability vocabulary) and ENG-002 (baselines + CI gates) — both in M1.
  Decide ADR-0001 before M3 planning begins.

Do Not Forget:
  - index.json is already 6.9 MB. Any retrieval enrichment MUST NOT make the page slower (D1).
  - quality.*_score values are self-reported by the generating agents, not validated (D6).
    Do not treat them as ground truth for ranking.
  - Committed reports/ have rounded/hardcoded timestamps and do not prove current state (D5).
  - The local repo `prompt-forge` is a DIFFERENT repository (Prompt-Academy), not this project.
  - RTX 3070 / 8 GB: one local model resident at a time; ComfyUI contends for VRAM.
  - H1 is unproven. Everything in P4-P6 rests on it.
```
