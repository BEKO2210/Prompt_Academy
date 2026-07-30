# Current State — Prompt Academy

**Status:** Phase 0 Discovery
**Date:** 2026-07-30
**Method:** Direct inspection of `BEKO2210/Prompt_Academy` @ `main`, plus measured dataset analysis.
Everything below is observed or measured. Values that were *not* measured are marked `UNMEASURED`.

---

## 1. What this project actually is today

A **fully static, client-side prompt gallery** deployed to GitHub Pages.

There is **no backend, no database, no API, no authentication, no server-side runtime, and no LLM
invocation anywhere** — at build time or at run time. The site ships JSON files and filters them
in the browser.

Live URL: <https://beko2210.github.io/Prompt_Academy/>

### Repository disambiguation (important)

Two similarly-named repos exist and are easy to confuse:

| Repo | Role |
|---|---|
| `BEKO2210/Prompt_Academy` | **This project.** The live site + the 10,000-prompt dataset. GitHub Pages enabled. |
| `BEKO2210/Prompt-Academy` | Unrelated. Cloned locally at `Schreibtisch/GitHub-Repos/prompt-forge`. Contains a separate `output/` prompt-generation experiment (1,000 records, v1/v2/v3 pipeline, `v3_report.md` reports gate FAILs). Not the live site. |

The local clone `prompt-forge` is **not** this project's source. Work happens in `Prompt_Academy`.

---

## 2. Repository layout

```
Prompt_Academy/
├── data/                 10 × .jsonl — the dataset (source of truth)
├── schema/               prompt.schema.json, manifest.schema.json (draft-07)
├── scripts/              4 Python scripts — validate, dedupe, cleanup, build index
├── reports/              generated quality/validation/duplicate reports (committed)
├── manifest.json         dataset metadata + per-category counts
├── website_index.json    flattened legacy index
├── site/                 the React app (Vite + TS + Tailwind)
└── .github/workflows/
    └── deploy.yml        build → GitHub Pages
```

Working tree is clean; local `main` == `origin/main`. Only branch is `main`.

---

## 3. Data model (as it exists)

Source of truth: `data/*.jsonl`, 10 files × 1,000 records = **10,000 records exactly** (measured).

Schema `schema/prompt.schema.json` is JSON Schema draft-07 with 21 required fields. Measured field
union across all 10,000 records matches the schema exactly — no drift, no extra keys, no missing keys:

```
acceptance_criteria, audience, batch, category, created_by_agent, difficulty, id,
industry, language, negative_prompt, prompt, quality, slug, style, subcategory,
tags, tech_stack, title, use_case, version, website_card
```

### Measured dataset properties

| Property | Measured value |
|---|---|
| Total records | 10,000 |
| Categories | 10 × exactly 1,000 |
| Distinct subcategories | 200 |
| Distinct frameworks | 18 |
| Distinct industries | 65 |
| Prompt length (words) | min 80 / median 88 / max 172 |
| `acceptance_criteria` per record | 3–6 (3:2718, 4:3603, 5:2545, 6:1134) — always present |
| `negative_prompt` non-empty | 10,000 / 10,000 |
| `tags` per record | 8–12 |
| Full corpus size (JSON) | ~25.5 MB |

Framework distribution (measured, top): React 2541, Svelte 1575, Vue 1547, Next.js 1130,
Angular 1075, Astro 200, Solid 171, then React Native / Flutter / SwiftUI / Kotlin / Ionic ~167 each.

### Structured sub-objects already present

- `style` — `visual_style`, `layout_style`, `color_direction`, `motion_style`
- `tech_stack` — `framework`, `language`, `styling`, `animation`, `optional_libraries[]`
- `website_card` — `headline`, `summary`, `preview_label`, `search_keywords[]`
- `quality` — `specificity_score`, `originality_score`, `implementation_clarity_score`, `website_readiness_score`

**This matters:** the dataset is *already* far richer than a flat prompt list. It has acceptance
criteria, negative prompts, tech-stack facets, and per-record quality scores. Much of the "Skill
Schema" in the master prompt is partially satisfied by fields that already exist.

### What the schema does NOT have

Relevant to the target architecture:

- **`capabilities[]`** — no machine-readable capability vocabulary. This is the single biggest
  schema gap for any capability-based routing/resolver.
- No `dependencies` / `incompatible_with`
- No `license` / `source` / provenance (dataset is self-generated, so no upstream to track — yet)
- No `security` block, no `required_permissions`, no `required_tools`, no `required_secrets`
- No `type` discriminator (everything is implicitly one type: a text prompt)
- `version` is a per-record semver string (all records `1.0.0`) — there is **no version history
  mechanism**; a record is simply overwritten in place.

---

## 4. Frontend architecture

`site/` — React 19 + TypeScript ~6.0 + Vite 8 + Tailwind 3.4 + framer-motion 12 +
react-router-dom 7 + lenis (smooth scroll) + lucide-react.

```
site/src/
├── pages/         Landing.tsx, Library.tsx, legal.tsx
├── components/    Hero, Navbar, PromptCard, PromptDrawer, ExplorerControls,
│                  CategoryShowcase, BentoFeatures, StatBand, CTASection,
│                  Reveal, SectionHeading, Counter, Footer, fx/AuroraBackground, ui/Button
└── lib/           data.ts (typed loaders), categories.ts, format.ts, cn.ts,
                   useClipboard.ts, useLenis.ts
```

### Build-time data pipeline

`site/scripts/build_site_data.mjs` runs on `predev` and `prebuild`. It reads `../data/*.jsonl` and
emits into `site/public/data/`:

| Output | Content |
|---|---|
| `index.json` | one compact record per prompt (all 10,000) — drives cards + search |
| `category/<cat>.json` | **full** records, per category — lazy-loaded for the detail view |
| `stats.json` | real aggregates computed from the dataset |
| `meta.json` | category list with labels, counts, subcategories |

Loaders in `site/src/lib/data.ts` are promise-memoized (`statsP`, `metaP`, `indexP`,
`categoryP` Map) so each file is fetched at most once per session. This is a sound design.

### Retrieval as implemented today

This is the honest description of the "search":

- **Filtering:** 5 exact-equality facets — `category`, `difficulty`, `framework`, `language`,
  `audience` (`Filters` in `ExplorerControls.tsx`).
- **Text search:** one lowercase `haystack(it).includes(q)` substring test per record
  (`Library.tsx:66-76`). The haystack concatenates title, tags, keywords, and card text.
- **Sort:** 3 modes — `relevance` | `quality` | `az` (`SortKey`).
- **Paging:** client-side, `PAGE`-sized increments.

There is **no scoring, no ranking, no term weighting, no BM25, no embeddings, no vector search,
no reranking, and no relevance model.** "relevance" as a sort key is not a computed relevance
score. A query either substring-matches or it does not — binary.

---

## 5. Build & deployment

`.github/workflows/deploy.yml`: on push to `main` (or manual dispatch) →
checkout → Node 22 + npm cache → `npm ci` → `npm run build` (which re-runs the data build, then
`tsc -b && vite build`) → copy `dist/index.html` to `dist/404.html` for SPA fallback →
`upload-pages-artifact` → `deploy-pages`.

Pages config (verified via API): `build_type: workflow`, source `main` `/`, HTTPS enforced,
no custom domain.

Concurrency group `pages` with `cancel-in-progress: true`. Permissions correctly scoped
(`contents: read`, `pages: write`, `id-token: write`).

**Notable:** there is exactly **one** environment. No staging. `main` is production.

---

## 6. Tests and CI

**There are no tests.** No test runner, no test files, no test script in `site/package.json`.

CI runs *only* the deploy workflow. It does not run `lint`, does not typecheck independently
(only implicitly via `tsc -b` inside `build`), and does not run the Python validation scripts.

The Python scripts in `scripts/` (1,290 lines total: `validate_dataset.py` 367,
`cleanup_dataset.py` 549, `dedupe_dataset.py` 285, `build_website_index.py` 89) are **manual-only**
— nothing invokes them automatically. The reports in `reports/` are committed snapshots of past
manual runs, not CI artifacts. Their timestamps (`2026-05-29T00:00:00Z`) are hardcoded/rounded,
so they cannot be used to prove current dataset state.

---

## 7. Measured findings & technical debt

Ordered by significance.

### D1 — `index.json` is 6.9 MB; the cost is parse and heap, not transfer

**Updated 2026-07-30 with ENG-002 measurements** (`reports/baseline-2026-07-30.json`). The original
framing of this finding was partly wrong and is corrected here.

The built index is **6,908,069 bytes** of minified JSON. Every Library visitor downloads and parses
all of it before seeing results.

What was `UNMEASURED` and is now measured:

| | Measured |
|---|---|
| Transfer as actually served (gzip) | **738,038 bytes** — 9.36x compression |
| Encodings GitHub Pages offers | **gzip only** — no brotli, no zstd, no deflate |
| `JSON.parse` cost | p50 **15.7 ms**, p95 **25.2 ms** |
| Heap attributable to the parsed index | **13.97 MB** |
| JS heap after Library load | **24.4 MB** |
| Time to first rendered result | **294–360 ms** (local prod build and warm CDN) |

**Correction:** transfer is not the problem. ~738 KB over the wire is unremarkable. The costs that
matter are the **parse of the full 6.9 MB** and the **~14 MB of retained heap** — neither of which
compression reduces. The original claim that this is "the most consequential existing performance
issue" overstated it: at ~300 ms to first result on desktop, the page is acceptable today.

The constraint on retrieval work still holds, and for the original reason: adding per-record data to
this index increases parse time and heap directly, with no compression relief. Mobile CPU is
`UNMEASURED` and would be materially worse.

### D2 — No `capabilities` vocabulary

Nothing in the dataset expresses "this prompt provides authentication" in machine-readable form.
Capability-based routing — the core idea of the target architecture — has no field to route on.
`tags`, `subcategory`, and `use_case` are the closest proxies but are presentation-oriented and
were not designed as a controlled vocabulary.

### D3 — Multi-word search returned nothing — **RESOLVED 2026-07-30 (ENG-010)**

*Original finding (ENG-002):* the filter was one substring test against a single joined string
(`Library.tsx:76`), so a multi-word query matched only if those words appeared **adjacently in that
order** in the concatenation. There was no term-wise matching.

| Query | Before | After |
|---|---|---|
| `dashboard` | 3,391 | 3,391 *(unchanged)* |
| `accessible dashboard` | **0** | **100** |
| `react pricing table` | **0** | **21** |
| `ecommerce product page` | **0** | **330** |
| `mobile onboarding flow` | **0** | **57** |
| `zzzznomatch` | 0 | 0 *(correct)* |

**Fixed** in `site/src/lib/search.ts`: the query is split into terms and a record must contain **all**
of them. Still a boolean filter, not a ranker — ranking remains ENG-006. Verified in the running
application, not only in tests. Performance unchanged (keystroke→paint p50 49.9 ms, identical to
baseline; JS bundle +204 B).

**Correction to the original finding.** It listed three zero-hit queries together, implying one cause.
Measurement during ENG-010 showed **three distinct causes**, and only the first was a bug:

| Query | Cause | Status |
|---|---|---|
| `accessible dashboard` | **matching bug** — both terms present in corpus (460 + 3,391) | fixed |
| `stripe checkout` | **dataset gap** — `stripe` occurs in **0** records | not a bug; returning nothing is correct |
| `barrierefrei`, `dunkelmodus` | **language gap** — absent from a ~91% English corpus | open, see below |

Conflating these overstated the defect. `stripe checkout` returning nothing over a corpus with no
Stripe content is correct behaviour and a useful *skill-gap* signal for the dataset.

**Still open:** cross-language retrieval. German queries against an English corpus cannot be fixed by
term splitting, and are the strongest concrete argument for actually running the embeddings ablation
(arm R7) rather than assuming lexical retrieval suffices.

**Still open:** ranking. Some result sets are now *wide* rather than empty
(`data visualization chart`: 50 → 451). A wide unranked set beats an empty one, but ordering it is
ENG-006.

### D3b — Search cost is re-derivation, but fixing it changes nothing (ENG-011, rejected)

Measured 2026-07-30. `haystack()` is called **inside** the filter predicate (`Library.tsx:76`), so up
to 10,000 array joins plus `toLowerCase()` are redone on every keystroke; nothing is precomputed or
memoised per record.

| | Measured |
|---|---|
| Filter-only search | p50 **6.97 ms**, p95 8.08 ms |
| `haystack()` construction alone | p50 **5.79 ms** — ~83% of the above |
| Facet-only (no text) | p50 **0.64 ms** — ~11x cheaper |
| Keystroke → paint (browser) | p50 **49.9 ms**, p95 50.6 ms |

**Tested and rejected 2026-07-30 (ENG-011).** Precomputing the haystack once per index made the filter
**6.4× faster** (7.73 → 1.21 ms) and changed keystroke→paint by **nothing** (49.9 → 49.7 ms, inside noise),
while pushing JS heap from 24.4 MB to **34.3 MB** — breaching the 24.5 MB budget by 10 MB. Reverted.
Full measurement: `reports/eng-011-haystack-precompute-rejected.md`.

The finding stands but its reading is inverted: the filter was **never the bottleneck**. React's commit and
paint of the 48 visible cards is ~42 of the ~50 ms. Consequences for later work:

- Retrieval cost must be solved **offline** (ADR-0003's build-time BM25 index), not per keystroke.
- A **debounce** on the input is the likely high-value change and costs no memory. Not ticketed yet.
- The heap budget has essentially no slack (24.4 vs 24.5 MB) — any in-memory retrieval structure needs
  its budget argued up with a measurement *before* implementation.

### D4 — No tests, no CI gates — **RESOLVED 2026-07-30 (ENG-003)**

*Original finding:* the deploy workflow would happily publish a broken dataset.
`validate_dataset.py` existed and passed but was not enforced. Any dataset change was unguarded.

**Resolved.** `.github/workflows/checks.yml` is a reusable workflow gating `deploy.yml`
(`checks → build → deploy`), plus 29 tests in `tests/*.test.mjs` on Node's built-in runner (no test
dependency added). Proven with seven injected corruption types — invalid enum, duplicate id, missing
field, malformed JSON, short prompt, wrong record count, invalid slug — all blocked, dataset restored
byte-exact afterwards.

Note on the workflow shape: a *separate* push-triggered CI workflow would run in **parallel** with
deploy and could not block it. Blocking requires deploy to `needs:` the checks, hence `workflow_call`.

**Residual gap:** no React component tests. The suite covers the dataset and build layers only, which
matters for ENG-009's effect refactors.

### D5 — Committed reports were stale-by-design — **ROOT CAUSE FIXED 2026-07-30 (ENG-003)**

*Original finding:* `reports/*` asserted `PASS` but carried rounded timestamps and could not be
trusted as current state.

**Root cause found and fixed:** the timestamps were not rounded, they were **hardcoded**.
`validate_dataset.py:341`, `dedupe_dataset.py:227` and `build_website_index.py:69` each wrote a
literal `"2026-05-29T00:00:00Z"`, so every report looked current regardless of when it last ran. All
three now emit real UTC. CI runs the validators for their exit code, so drift surfaces as a red build
rather than a stale file.

**Related, still open:** `website_index.json` is stale relative to its own generator — re-running
`build_website_index.py` changes 2,894 lines (tag normalisation: `calm-Swiss-grid` →
`calm-swiss-grid`, `navigation_bars` → `navigation-bars`, `velocity.js` → `velocityjs`). Deliberately
not regenerated: the file is consumed by nothing (verified), `velocity.js` → `velocityjs` is arguably
a degradation, and a 2,894-line content change should be its own reviewed decision rather than a
side effect of a CI ticket.

### D6 — Quality scores are self-reported, not validated

`quality.*_score` values came from the generating agents. There is no independent measurement
behind them, and no benchmark ties any score to a real outcome. They must not be treated as
ground truth for ranking without validation.

### D7 — No staging environment

`main` deploys straight to the live site. Any regression is a production regression.

### D8 — `site/README.md` is the untouched Vite template

Contains no project-specific information.

### D9 — Duplicate first sentences

`reports/duplicate_report.json` records 26 duplicate first-sentences (pairs) — IDs are listed.
Exact/title/slug duplicates are 0. This is minor and *not* urgent.

### D10 — Third-party font request (privacy, not performance)

Measured 2026-07-30. Both pages request `fonts.googleapis.com` at runtime (22,494 bytes decoded,
32–104 ms — the slowest resource on the landing page). This sends every visitor's IP address to
Google.

The site ships **Impressum and Datenschutz pages**, which makes this a GDPR consideration rather than
a performance one. Out of ENG-002's scope; recorded because it was observed and because it is
cheaply fixable by self-hosting the fonts. Severity: medium (legal/privacy).

### D11 — 1.49 MB incompressible image drives landing LCP

`site/public/Qualität.png` is **1,490,614 bytes** and compresses to 1,480,042 — effectively not at
all. It is ~85% of the landing page's 1,753,242-byte transfer and is what sets its LCP
(380–412 ms vs. a 180–196 ms first contentful paint).

The filename also contains a non-ASCII character, which is a portability smell (it is served
URL-encoded as `Qualit%C3%A4t.png`).

Severity: low-medium, but it is the single largest easy win in the repo and is unrelated to any
retrieval work.

### D12 — Build environment is unpinned and the system Node cannot build

Measured 2026-07-30. System `node` is **v18.19.1**; Vite 8 requires `>=20.19` or `>=22.12`. There is
no `.nvmrc`, no `engines` field, and no documentation of the requirement, so a fresh checkout on this
machine fails to build with a version error. CI uses Node 22 and works.

Related: `vite.config.ts` applies `base: '/Prompt_Academy/'` only when `command === 'build'`, so
`vite preview` serves a production build at `/` while its assets request `/Prompt_Academy/` — preview
404s its own assets. Local verification of a production build therefore needs a custom server
(`scripts/baseline/serve_dist.mjs`).

Severity: low individually; collectively they are a guaranteed stumble for a new contributor.

> **Retraction.** A draft of this finding also claimed `site/public/data/` was not gitignored. That
> was wrong: the **root** `.gitignore` covers it at line 10 with an explicit comment. The error came
> from reading only `site/.gitignore`. Verified with `git check-ignore -v`. Noted rather than deleted
> so the claim is not reintroduced.

---

## 8. Security posture (current)

Current attack surface is small precisely *because* the system does so little:

- Static site. No user input reaches a server. No secrets in the repo (verified: no `.env`,
  no `.env.example`, no credential files).
- The only privileged thing in the repo is the Actions workflow, which uses the default
  `GITHUB_TOKEN` with correctly minimal scopes.
- Dataset content is self-generated. **No third-party content is ingested today**, so there is
  currently no prompt-injection or supply-chain exposure through skill import.

This is the state to protect. Every capability in the target architecture — external import,
script execution, model calls — *adds* attack surface where there is presently almost none.
That asymmetry should drive sequencing.

---

## 9. Relevant local environment

From operator context (not repo state):

- Machine: Pop!_OS 24.04, RTX 3070 8 GB VRAM, 16 GB RAM.
- A local LLM stack already exists and is isolated: `ollama` + Open-WebUI via compose in
  `~/open-webui`. Curated 8 GB-class models.
- Known constraint: **VRAM contention** — ComfyUI and ollama conflict over the 8 GB card.
- Preference on record: installs stay isolated, not bloating the system.

Implication: a `local-only` execution mode is genuinely feasible via the existing ollama
endpoint, and is the cheapest path to *any* execution capability. But an 8 GB card means one
model resident at a time; parallel multi-model routing is not realistic locally.

---

## 10. Honest gap assessment vs. the master prompt

The master prompt specifies a Universal Skill Engine: skill registry, universal importer,
quarantine + security firewall, license management, provenance, versioning, upstream updates,
intent router, task decomposer, execution DAG, capability resolver, hybrid retrieval, reranker,
diversity/MMR, skill composer, prompt compiler, context budget manager, model provider
abstraction, model router, 4 execution modes, validation engine, repair engine, failure taxonomy,
skill-gap tracking, generated skills, quality scoring, performance telemetry, explainability,
threat model, permission system, secret management, sandboxing, observability, caching, and a
benchmark platform with ablation studies — across 22 milestones.

**What exists that is genuinely reusable:**

- A clean, validated, 10,000-record dataset with acceptance criteria and negative prompts already
  in place — a real asset, and better raw material than most projects start with.
- A working build pipeline (`build_site_data.mjs`) that already transforms source data into
  optimized artifacts. The natural insertion point for any index-building.
- A working, deployed frontend with faceted filtering UI already wired to dataset facets.
- Python validation/dedupe tooling that works.
- A local, isolated ollama runtime.

**What does not exist at all:**

Every runtime component. There is no backend to put an engine in, no execution environment, no
telemetry store, no evaluation harness, and no capability vocabulary to route on.

**The structural blocker:** components 9–34 of the master prompt (normalizer → router →
decomposer → retrieval → compiler → execution → validation → repair) all presuppose a runtime
that can call a model and run code. A GitHub Pages static site cannot do any of that. Introducing
one is not a feature — it is a change of project category, with consequences for hosting, cost,
security surface, and maintenance.

That decision is the real first architectural decision, and it is deliberately deferred to an ADR
rather than assumed. See `docs/adr/`.

**Scope reality check:** the master prompt's own §15, §65, §88 and "NICHT ERLAUBT" section argue
against oversized infrastructure for 10,000 records, against agents-for-agents' sake, and against
unmeasured complexity. Those constraints are correct and are treated in this plan as binding, not
decorative. See `docs/architecture/target-state.md` and `docs/roadmap.md`.

---

## 11. Baselines that must be established before any optimization

Per the master prompt's "Measured > Assumed", these are **not yet measured** and are prerequisites
for claiming any improvement:

**Updated 2026-07-30: the performance rows are now measured (ENG-002).**

| Baseline | Status |
|---|---|
| Library time to first rendered result | **294–360 ms** (local prod build; warm CDN) |
| Library first contentful paint | **168–196 ms** |
| JS heap after Library load | **24.4 MB** |
| `index.json` transfer size (compressed) | **738,038 bytes** (gzip; brotli not offered) |
| `index.json` parse time | **p50 15.7 ms / p95 25.2 ms** |
| Heap attributable to the parsed index | **13.97 MB** |
| Per-keystroke search latency, filter only | **p50 6.97 ms / p95 8.08 ms** |
| Per-keystroke latency, keystroke → paint | **p50 49.9 ms / p95 50.6 ms** |
| Landing LCP | **380–412 ms** (driven by a 1.49 MB PNG — D11) |
| Search result quality (precision/recall vs. a labelled set) | `UNMEASURED` — no labelled set exists yet (ENG-005) |
| Whether retrieved context improves model output | `UNMEASURED` — the central unproven premise (ENG-008) |

Full figures, environment, and what was deliberately not measured:
`reports/baseline-2026-07-30.json`. Method: `reports/baseline-method.md`. Harness:
`scripts/baseline/`.

**Measured noise floor:** search-path timings vary ~10–15% between sessions on an idle machine at
this repeat count. A claimed improvement below that margin is not distinguishable from noise and must
not be reported as one.

The last two rows remain the important ones. The entire value proposition is still unsupported by
evidence in this repository.

The last row is the important one. The entire value proposition — that selecting the right prompt
from a library beats simply asking a capable model directly — is currently **an assumption with
zero supporting evidence in this repo**. Establishing a measurement for it should precede building
machinery that presumes it.
