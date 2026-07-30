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
- ~~Measure and record the baselines in current-state §11~~ **DONE (ENG-002, 2026-07-30)** —
  `reports/baseline-2026-07-30.json`, `reports/baseline-method.md`, harness in `scripts/baseline/`.
- ~~CI: validation, typecheck, lint on PR and push; fail on dataset violations~~
  **DONE (ENG-003, 2026-07-30)** — `.github/workflows/checks.yml` (reusable) gates
  `deploy.yml` via `checks → build → deploy`. Closes D4; D5 fixed at the root.
- ~~Introduce a test runner and the first tests~~ **DONE** — 29 tests in `tests/*.test.mjs` on
  Node's built-in runner, zero new dependencies. Includes size budgets guarding the ENG-002 baseline.
- ~~Author `schema/capabilities.vocabulary.json`~~ **DONE (ENG-001)** — 28 functional capabilities.
- ~~Subcategory → capabilities mapping~~ **DONE** — but only 26 of 200 rows, deliberately: mapping
  all 200 would encode assumptions ("a dashboard probably has charts") rather than rules. Text
  evidence carries the rest.
- ~~Add `content_hash` per record~~ **DONE (ENG-004, 2026-07-30)** —
  `scripts/compute_content_hashes.py` → `reports/content_hashes.json`. 10,000 distinct hashes;
  `--check` and `--self-test` ready for CI.

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
  M0 Discovery & Planning — all Phase 0 docs (architecture, security, benchmark, 7 ADRs,
  8 tickets) plus AGENTS.md (92 lines) + CLAUDE.md (@AGENTS.md import).
  Dataset: 10,000 records, schema-clean, 200 subcategories / 18 frameworks / 65 industries;
  acceptance_criteria (3-6) and non-empty negative_prompt on ALL 10,000 records.

  ENG-002 Baselines — DONE 2026-07-30. reports/baseline-2026-07-30.json +
  reports/baseline-method.md + scripts/baseline/ (zero-dep harness: Node 22 + Chrome,
  re-run from committed paths to prove reproducibility).

  MEASURED (was assumed before):
    index.json          6,908,069 B raw -> 738,038 B gzip AS SERVED (9.36x)
    GitHub Pages        gzip ONLY. No brotli, no zstd, no deflate.
    JSON.parse          p50 15.7 ms / p95 25.2 ms
    heap for index      13.97 MB ; heap after Library load 24.4 MB
    time to 1st result  294-360 ms  |  FCP 168-196 ms
    filter-only search  p50 6.97 ms  |  haystack() alone 5.79 ms = ~83% of it
    facet-only search   p50 0.64 ms  (~11x cheaper than text)
    keystroke -> paint  p50 49.9 ms / p95 50.6 ms  (React re-render dominates; NO debounce)
    landing LCP         380-412 ms, driven by Qualität.png (1.49 MB, incompressible)
    noise floor         ~10-15% session-to-session on search timings at this repeat count

  ENG-004 content_hash — DONE 2026-07-30. scripts/compute_content_hashes.py ->
  reports/content_hashes.json (861 KB, NOT shipped to browser). 10,000 records ->
  10,000 distinct hashes, 0 identical-content groups, 0.39 s.
  Modes: default write | --check (CI, names changed ids) | --self-test (16/16 pass).
  Verified: byte-identical manifest across two runs; mutating one char in PRM-000001 made
  --check exit 1; index.json and dist byte-identical before/after (6,908,069 and 33,910,949).
  ALGO_VERSION=1.0.0 -- bump it if normalization changes; --check then reports
  "regenerate all" rather than "10,000 records changed".

  ENG-003 CI gates — DONE 2026-07-30. .github/workflows/checks.yml is REUSABLE
  (workflow_call + pull_request); deploy.yml now runs checks -> build -> deploy.
  A separate push-triggered workflow would have run in PARALLEL with deploy and could not
  block it -- hence the reusable form, one definition used by both, no copy to drift.
  29 tests in tests/*.test.mjs on Node's BUILT-IN runner (no test dependency added).
  Includes size budgets (index.json <= 7,000,000 B; public/data <= 32,500,000 B) so the
  ENG-002 baseline cannot silently regress -- this is ENG-007's CI-ceiling criterion, met early.
  npm run ci runs the whole gate locally: typecheck && lint && data && test.
  GATE PROVEN with 7 corruption types, each reverted (data/ byte-exact after):
    invalid enum | duplicate id | missing field | malformed JSON | short prompt |
    wrong record count | new invalid slug   -> all BLOCKED
  The last one was caught ONLY by the new tests: validate_dataset.py checks slug
  UNIQUENESS but never the slug PATTERN.

  ENG-010 multi-word search (D3) — DONE 2026-07-30. site/src/lib/search.ts: query split into
  terms, record must contain ALL of them (AND). Still a boolean filter -- NO ranking added.
  Verified IN THE RUNNING APP via CDP: "accessible dashboard" 0 -> 100, "react pricing table"
  0 -> 21 (21 cards rendered), "dashboard" unchanged at 3,391, guaranteed misses still 0.
  Performance held: keystroke->paint p50 49.9 ms (identical to baseline), p95 51.3 vs 50.6
  (inside the ~10-15% noise floor), heap 24.2-24.3 vs 24.4 MB, JS bundle +204 B.
  45 tests green.

  CORRECTED A CONFLATION OF MY OWN MAKING: the ENG-002 baseline listed three zero-hit queries
  as one defect. They have THREE causes and only one was a bug:
      "accessible dashboard"  matching BUG      both terms exist (460 + 3,391)  -> FIXED
      "stripe checkout"       DATASET gap       "stripe" in 0 records -> 0 is CORRECT
      "barrierefrei"          LANGUAGE gap      absent from ~91% English corpus -> still open
  Conflating them overstated the defect and would have set an unreachable acceptance criterion.

  FALSE NEGATIVE WORTH REMEMBERING: first UI check showed the fix NOT working, while all tests
  were green. Cause: Cache-Control max-age=600 served the previous index.html, pointing at the
  previous content-hashed bundle. Verification harness now disables cache. Tests alone would
  have shipped false confidence -- always verify in the running app.

  Also updated scripts/baseline/measure_parse_and_search.mjs: it mirrored the OLD predicate and
  would have kept measuring behaviour the app no longer has. Now mirrors AND-terms and reports
  the legacy predicate separately, labelled, so before/after stays comparable.

  ENG-011 haystack precompute (D3b) — REJECTED 2026-07-30. Implemented, measured, REVERTED.
  No code ships. Full numbers: reports/eng-011-haystack-precompute-rejected.md
      filter-only p50      7.73 -> 1.21 ms      6.4x faster
      keystroke -> paint   49.9 -> 49.7 ms      NO CHANGE (inside noise)
      JS heap after load   24.4 -> 34.3 MB      budget <=24.5 MB FAILED by 10 MB
  The filter got 6.4x faster and the user experiences nothing: React's commit+paint of the
  48 visible cards is ~42 of the ~50 ms, so removing ~6.5 ms is invisible. The ticket had
  predicted a ~12% ceiling; actual was 0%.
  Verified behaviour-neutral BEFORE rejecting (byte-identical haystacks for all 10,000
  records; 9 queries selected identical record ids in identical order) -- so this was a
  sound implementation with no payoff, not a bug.
  Rejected per release gates + master prompt §47: complexity that does not measurably help
  gets removed, not kept.

  WHAT THIS REDIRECTS (matters for ENG-006/ENG-007):
    - The bottleneck is REACT RE-RENDER, not retrieval. Any filter/scoring optimisation is
      dominated by rendered work.
    - A DEBOUNCE on the search input is likely the highest-value change and costs no memory.
      NOT ticketed yet. Worth measuring before ENG-006 adds per-keystroke scoring.
    - Solve retrieval cost OFFLINE. ADR-0003 already specifies a build-time inverted/BM25
      index -- no heap-for-CPU trade. Per-keystroke precomputation would have been discarded
      by ENG-006 anyway.
    - THE HEAP BUDGET HAS NO SLACK: 24.4 MB against a 24.5 MB ceiling. Any in-memory
      retrieval structure must have its budget argued up WITH A MEASUREMENT FIRST, not
      discovered afterwards.

  ENG-001 capability vocabulary — DONE 2026-07-30. NO MODEL USED; deterministic rules only.
      schema/capabilities.vocabulary.json   28 functional capabilities, v1.0.0
      schema/capabilities.rules.json        word-boundary regex + 26 subcategory rows, v1.1.0
      scripts/derive_capabilities.py        --check (CI) | --sample (review)
      reports/capabilities.json             per record: high / medium / uncertain
      reports/capabilities-quality.md       the precision/recall evaluation
    coverage 98.66% | mean 5.24 caps/record | all 28 terms fire | ~17 s | reproducible

  MEASURED QUALITY (this was the point of the ticket):
    round 1, rules 1.0.0, seed 7, n=20   precision 90.6%  recall 90.6%
    round 2, rules 1.1.0, seed 42 FRESH  0 false positives among 47 verified assignments
    Fresh seed on purpose -- validating fixes on the sample they came from proves nothing.

  SIX SYSTEMATIC ERROR CLASSES FOUND AND FIXED (all word-sense, hence rule-fixable):
    data.export       <- "exported props interface"        (TypeScript, not data)
    commerce.checkout <- "billing overview"                (SaaS invoicing, not payment)
    auth.accounts     <- "newsletter signup"               (mailing list, not account)
    layout.responsive <- "responsive feedback"             (reactive, not breakpoints)
    layout.dark_mode  <- "gunmetal gray dark mode"         (palette name, not theming)
    forms.validation  <- "validating web components"       (code, not input)
  Plus 5 false negatives (word order, tight collocation windows, ARIA phrasings).
  Net effect corpus-wide: ~2,100 wrong labels removed, ~2,300 missed ones recovered.

  THREE THINGS TO CARRY FORWARD:
    - motion.animation fires on ~80% of records. Real, but near-useless as a discriminator.
      Weight it at or near ZERO in ranking or it is noise.
    - Bare "WCAG 2.1 AA compliance" yields NO a11y capability, by design (no umbrella term).
      This was the most common false negative in both rounds. A deliberate trade, revisit if
      capability recall matters more than vocabulary cleanliness.
    - BOILERPLATE ACCEPTANCE CRITERIA INFLATE CAPABILITIES. A kids' recycling game promising
      "All data visualizations update dynamically in real-time" gets data.charts + data.realtime
      + data.search + data.filter_sort. The rule is right; the DATASET is internally
      inconsistent. This is the biggest risk to the capability signal in the R3 ablation --
      check it FIRST if R3 underperforms.

  VERDICT: good enough as ONE ranking signal (arm R3). NOT good enough to route on alone, and
  NOT ground truth for evaluating retrieval -- ENG-005 must be built independently of these labels.

  ENG-005 retrieval ground truth — DONE 2026-07-30. FROZEN as retrieval-ground-truth-v1.
      benchmarks/queries/RELEVANCE-GUIDELINE.md   written BEFORE any record was judged
      benchmarks/queries/queries.json             32 authored, each marked annotated / not
      benchmarks/queries/query-expansions.json    hand-written recall expansions incl. DE<->EN
      benchmarks/queries/candidate-pool.json      1,197 candidates, 6 sources, blinded+shuffled
      benchmarks/queries/relevance.json           the frozen ground truth
      benchmarks/queries/COVERAGE.md              coverage + pooling bias
      scripts/{pool_candidates,annotate_relevance,validate_query_set}.py
      tests/query-set.test.mjs                    13 tests incl. the circularity ban
    12 queries annotated | 454 judged pairs | dev 6 / holdout 6 | en 10 / de 2
    difficulty easy 2 / medium 5 / hard 5 | 10 distinct query types
    grades: 3=138 (30.4%)  2=46 (10.1%)  1=82 (18.1%)  0=188 (41.4%)

  DEVIATION: ticket asked for 100-150 queries. Not achievable at genuine quality by one
  annotator in one pass, and the brief said quality outranks quantity. 12 annotated, the
  other 20 authored+pooled but DELIBERATELY UNGRADED and marked authored_not_annotated.

  FINDINGS THAT MATTER FOR ENG-006:
    - The CURRENT search contributed only 57 of 1,197 pooled candidates (16 exclusively).
      Pooling only from the live search would have left most of the truth unjudged.
    - Q004 "sign in screen": exactly ONE relevant record in a 56-candidate pool. Vocabulary
      mismatch (corpus says login/authentication) is the sharpest failure in the set.
    - Q021 "modal dialog with focus trap": ZERO grade-3. No modal COMPONENT states focus trap,
      while 15 NON-modal records do -- via the boilerplate acceptance criterion found in
      ENG-001. The dataset's boilerplate now demonstrably distorts retrieval, not just labels.
    - Q003 (screen-reader dashboard): ZERO grade-3. The corpus claims accessibility generically
      but rarely names screen readers. Generic-WCAG boilerplate again.
    - Q001/Q025 and Q002/Q026 are EN/DE pairs on the same need, same split. The German delta
      is therefore measurable directly, not inferred.
    - Both zero-result queries verified corpus-wide (figma plugin / chrome extension = 0).

  MID-ANNOTATION CORRECTION worth remembering: I first graded accessible-dashboard candidates
  as merely partially relevant, because the 88-char prompt excerpt showed no accessibility.
  206 dashboards DO have explicit a11y -- in their acceptance_criteria. Refined rule now in the
  guideline: AC evidence counts when CONSISTENT with the record's subject, and is suspect only
  when it CONTRADICTS it (the ENG-001 kids-game case).

  BASELINE MEASUREMENT (dev split) — DONE 2026-07-30. NO new ranking written.
    reports/retrieval-baseline-dev.{json,md} | scripts/eval_retrieval.py | tests/retrieval-eval.test.mjs
                    P@1     P@5    R@10  nDCG@10    MRR
    r0 substring  0.200   0.200   0.087   0.200   0.200   (pre-ENG-010)
    r1 AND-terms  0.400   0.280   0.113   0.248   0.467   (shipped today)
    ENG-010 INDEPENDENTLY CONFIRMED -- every metric up, MRR more than doubled.
    But the absolute level is poor: 1 of 5 real queries works.

  THE FINDING THAT MATTERS -- a severe substring defect in the SHIPPED search:
    "sign in screen" returns 404 records, none of them the login form.
        'sign'   as substring: 6,936/10,000   with word boundary:  16
        'in'     as substring: 9,866/10,000   with word boundary: 664
    'sign' matches 6,936 records because it is inside de-SIGN-. 'in' matches almost
    everything. The query is effectively design ∩ anything-with-in ∩ screen.
    ENG-010 fixed multi-word AND semantics but kept SUBSTRING matching per term.
    Same error class ENG-001 measured in the capability rules -- now in the product.
    -> Highest-value fix available, and small: word-boundary + stopwords. No ranking needed.

  Cross-language is not weak, it is ZERO: "Preisseite" returns 0 of 22 relevant records
  while the English "pricing page" scores nDCG 1.00 on the SAME relevant set.

  Matching without ranking turns "nothing" into "noise": "sign in screen" went 0 -> 404
  results with P@1 still 0. "heatmap visualization" has P@1 1.00 but P@5 0.20.
  That is the concrete argument for ENG-006 which did not exist before this measurement.

  CAVEAT: 6 dev queries only, directional not tight. The easy query flatters the mean --
  excluding "pricing page", nDCG@10 over the other four is ~0.06. HOLDOUT NOT MEASURED
  and must stay untouched; the harness refuses it without an explicit final-measurement flag.

  ENG-012 token-boundary matching — DONE 2026-07-30. LEXICAL MATCHING ONLY, no ranking.
    site/src/lib/search.ts is now the single tested matching module:
      tokenize() | parseQuery() | matchesParsed() | MATCHING_VERSION 1.0.0
      LOW_INFORMATION_TOKENS = a an and for in with   (derived by measurement, >=50% of corpus)
      MEANINGFUL_PHRASES     = sign in, sign up, log in, log out, opt in/out, check out,
                               drag and drop
    Boundary-anchored PREFIX matching: kills substring collisions, keeps incremental typing.

    SUBSTRING COLLISIONS REMOVED (measured):
      sign   6,936 -> 129    (was matching de-SIGN)
      form   7,679 -> 502    (platform, information, performance)
      graph  3,617 -> 265    (photograph, infographic)
      react  4,684 -> 4,552  (the 132 lost were PREACT, a different framework)

    DEV METRICS UNCHANGED: P@1 .400 P@5 .280 R@10 .113 nDCG@10 .248 MRR .467 -- identical to
    r1. Said plainly: ENG-012 changes WHICH records match; on these six queries the relevant
    records were not in top-k either way, so P@k and nDCG cannot see it. The gain is candidate
    quality: dev total returned 643 -> 236 (-63%) with NO relevant record lost.
    "sign in screen" 404 -> 0 returned.

    LATENCY: keystroke p50 49.8 (baseline 49.9), p95 50.5 (50.6), heap 24.3 (24.4). No cost --
    regex vs substring is invisible because React re-render dominates (the ENG-011 finding).

    STOPWORD COMPONENT JUSTIFIED SEPARATELY, as required:
      on DEV alone it is NOT justified -- removes 14 candidates on one query, 6% total.
      but boundary-only loses 48% of correct records on "dashboard for a team" (200 vs 386)
      and 15% on "chart for analytics", because it enforces "for" as a hard AND.
      -> KEPT. Evidence comes from outside the dev set and is labelled as such.

    COULD NOT FIX, and no token work would: the brief required "sign in screen" to find login
    records. "sign in" appears in ZERO of 10,000 records; the target says "login form with
    social auth". That needs a synonym map, which this ticket excludes. 404 wrong answers -> 0
    answers is a better failure, still a failure. Belongs to ENG-006 / arm R7 along with the
    cross-language zero (Preisseite -> 0 of 22).

In Progress:
  none

Blocked:
  M4, M5 — contingent on the M3 H1 result.

Unblocked since last handoff:
  ADR-0001 ACCEPTED. Three-layer structure is binding:
      Layer 1  core engine library   -- PROVIDER-NEUTRAL: dataset access, retrieval, ranking,
                                        C/D field split, arm construction, compilation,
                                        validation, metrics, telemetry, benchmark logic
      Layer 2  provider adapters     -- Ollama first; knows nothing about layer 1 concerns
      Layer 3  thin CLI              -- experiment/benchmark surface only
  Compliance test: core library + its tests must run against a STUB provider with no ollama
  installed. If removing the ollama adapter breaks retrieval/ranking/benchmark, layering is
  violated. Ollama is the first provider, NOT the architecture.
  Backend only when a real requirement appears (multi-user, browser/API, remote execution,
  job queue, isolation, distributed workers) -- not on H1 succeeding.

Tests:
  29 tests, tests/*.test.mjs, Node built-in runner. Run: `cd site && npm test`
  (or `npm run ci` for the full local gate). All green.
  Coverage: dataset invariants (counts, required fields, id/slug/title uniqueness, enums,
  category-matches-file, prompt/negative_prompt word counts, acceptance_criteria 3-6, tags 5-12,
  nested key shape, quality score ranges) + build-artifact shape + size budgets.
  NOT covered: any React component behaviour. That gap matters for ENG-009, which refactors
  effect logic -- prefer keying components over restructuring state until UI tests exist.

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
  - EVALUATION LEAKAGE CORRECTION (2026-07-30). Injecting a record's acceptance_criteria and
    then grading with those same fields would make arm D win by construction. Every task now
    carries TWO separated layers:
      Layer 1  skill-provided instructions -- may be visible per arm
      Layer 2  independent evaluation      -- frozen + hashed before the run, authored from the
                                              task itself, never in ANY prompt, determines success
    Metrics split accordingly: Independent Task Success (headline) vs. Skill Instruction
    Compliance (diagnostic only). Never merged. Enforced by a test asserting no Layer 2 string
    appears in any assembled prompt, and by an arm-blind evaluator.
  - B/C/D must use the IDENTICAL retrieved record per task (retrieval runs once), so only the
    context TYPE varies. E is the first arm allowed to vary record count.
  - Constants held across arms: model, model version, temperature, seed, system wrapper,
    output budget, tool availability, evaluator, task dataset. Task and arm order randomized
    with recorded seeds. Harness supports n runs per (task, arm) from the start.
  - Schema evolution additive only; provenance/licence/permissions deferred until data exists.
  - No vector DB. Embeddings deferred pending ablation against BM25 (arm R7).
  - External skill import sequenced last (largest attack-surface increase).
  - Layers 0-2 need no new infrastructure and are the recommended first real work.
  - AGENTS.md is the single source of truth; CLAUDE.md only imports it (no duplication).

Files Changed:
  docs/**, AGENTS.md, CLAUDE.md, reports/baseline-*, scripts/baseline/**.
  No dataset, site source, or CI files touched. scripts/baseline/ is measurement-only tooling;
  nothing in the shipped site or build path was modified.

Next Recommended Ticket:
  ENG-006 (ranking). Baseline to beat: reports/eng-012-token-boundary.md.
  OLD, now done: ENG-012 word-boundary + stopword matching.
  Smallest change with the largest measured payoff. NOT ranking -- it fixes WHICH records
  match, exactly as ENG-010 did. Re-measure on dev afterwards; the baseline above is the
  number to beat.

  THEN ENG-006 (ranking), with reports/retrieval-baseline-dev.md as the baseline.
  Cross-language stays open and is the strongest concrete case for actually testing
  embeddings (arm R7) rather than assuming lexical retrieval suffices.

  ENG-005 discipline, agreed and binding:
    - Ground truth frozen BEFORE any ranking exists.
    - Build it INDEPENDENTLY of reports/capabilities.json. Using capability labels to define
      relevance would make the R3 ablation circular.
    - Separate tuning queries from final evaluation queries if the set is large enough.
      Do not optimise a ranker until it memorises the test.

  The out-of-band detour is CLOSED. ENG-010 shipped (real user-visible fix), ENG-011 was
  measured and rejected. Work returns to the H1 question as agreed:
    - ENG-001 supplies the capability ranking signal (ablation arm R3)
    - ENG-005 supplies the ground truth that makes H0 falsifiable
  Both are BETS ON H1 -- they only pay off if the engine gets built. That is fine and
  intended, now that the H1-independent win (ENG-010) is banked.

  Do NOT start ENG-011-style per-keystroke optimisation again. See the redirect above.

Findings from ENG-002 that changed the plan:
  - D1 WAS MIS-FRAMED. Transfer is 738 KB, not 6.9 MB. The uncompressible costs are parse
    (full 6.9 MB) and ~14 MB heap. At ~300 ms to first result the page is ACCEPTABLE today.
    ENG-007 is therefore a HEADROOM problem, not a rescue. Bar is "do not regress".
  - D3 IS A CORRECTNESS DEFECT, not just missing ranking:
        "dashboard"            -> 3,391 hits
        "accessible dashboard" -> 0      <-- multi-word queries silently return nothing
        "stripe checkout"      -> 0
        "barrierefrei"         -> 0      <-- German query vs ~91% English corpus
        "dunkelmodus"          -> 0
    Cause: ONE substring test over a joined string (Library.tsx:76). No term-wise matching;
    words must appear adjacently in that order. This is the R0 baseline ENG-006 must beat, and
    the German failures are the strongest concrete argument for actually running arm R7
    (embeddings) instead of assuming lexical retrieval suffices.
  - D3b CHEAP INDEPENDENT WIN: haystack() is rebuilt per record per keystroke and is ~83% of
    filter cost. Precomputing needs no index restructuring and no ranking change.
    But note keystroke->paint is ~7x the filter cost, so the filter is only ~1/7 of felt cost.
  - NEW D10 fonts.googleapis.com is requested at runtime on both pages. Site ships Impressum +
    Datenschutz, so this is GDPR-relevant, not a perf issue. Cheaply fixed by self-hosting.
  - NEW D11 Qualität.png = 1.49 MB, incompressible, ~85% of landing transfer, sets its LCP.
    Largest easy win in the repo, unrelated to retrieval.
  - NEW D12 System node v18 CANNOT build this repo (Vite 8 needs >=20.19/>=22.12). No .nvmrc,
    no engines field. CI uses 22. Also: `vite preview` serves a prod build at / while assets
    request /Prompt_Academy/ (base is set only for command==='build'), so preview 404s its own
    assets -- use scripts/baseline/serve_dist.mjs.
  - RETRACTED mid-ENG-002: a claim that site/public/data/ was not gitignored. It IS -- root
    .gitignore line 10, verified with `git check-ignore -v`. Error came from reading only
    site/.gitignore. Recorded so it is not reintroduced.

Do Not Forget:
  - Every field added to index.json costs parse time and heap directly, with NO compression
    relief. Budgets to hold in ENG-007: ttfr <=323 ms, heap <=24.5 MB, transfer <=738,038 B,
    parse p95 <=25.21 ms, keystroke p95 <=50.6 ms.
  - Improvements below ~15% are NOT distinguishable from noise at the current repeat count.
    Either exceed that margin or raise n. Do not report noise as a win.
  - Mobile CPU and slow networks are UNMEASURED and would be materially worse, especially parse.
  - NEVER use `pkill -f <pattern>` where the pattern could match the agent's own shell command
    line -- it kills the session. Use `fuser -k <port>/tcp` or a pidfile instead.
  - quality.*_score is self-reported by the generating agents, never independently validated
    (D6). Not ground truth for ranking, not evidence of output quality.
  - reports/ has rounded/hardcoded timestamps and does NOT prove current state (D5).
  - Local repo `prompt-forge` is a DIFFERENT repository (Prompt-Academy), not this project.
  - cleanup_dataset.py once modified 6,678 records in one pass; bulk mutation needs review + diff.
  - RTX 3070 / 8 GB: one resident local model; ComfyUI contends for VRAM.
  - The C/D field split is the M3 experiment's independent variable. It must be deterministic,
    documented and frozen before the run, never model-decided.
  - NEVER grade with what was injected. acceptance_criteria/negative_prompt may be Layer 1
    instructions; they must never be the Layer 2 success score. Structural enforcement, not
    convention: assembly code must not be able to read Layer 2 at all.
  - Semantic overlap between a task's Layer 2 and a record's criteria is expected and fine.
    Leakage is mechanical reuse of the same text as both instruction and grader.
  - Four of seven H1 decision branches lead to building LESS than planned; one leads to stopping.
    That is intended, not a failure mode.
```
