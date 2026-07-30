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

### D1 — `index.json` is 6.9 MB (measured)

Reconstructing the compact index exactly as `build_site_data.mjs` does yields
**6,908,075 bytes** of minified JSON. Every visitor to the Library page downloads and parses all
of it before seeing results.

Gzip/Brotli over the wire will reduce transfer substantially (`UNMEASURED` — GitHub Pages does
serve compressed), but the **parse cost and heap cost are not compressible**, and the
per-keystroke search re-scans all 10,000 records with a string concat + `includes`.

This is the most consequential existing performance issue and it directly constrains any
retrieval work: adding *more* per-record data to the index makes it worse.

### D2 — No `capabilities` vocabulary

Nothing in the dataset expresses "this prompt provides authentication" in machine-readable form.
Capability-based routing — the core idea of the target architecture — has no field to route on.
`tags`, `subcategory`, and `use_case` are the closest proxies but are presentation-oriented and
were not designed as a controlled vocabulary.

### D3 — Retrieval is binary substring matching

See §4. There is no ranking signal to improve, only a filter to replace. Positively: this is a
very low baseline, so improvement should be easy to demonstrate — *provided* a measurement exists.

### D4 — No tests, no CI gates

The deploy workflow will happily publish a broken dataset. `validate_dataset.py` exists and
passes (per committed report) but is not enforced. Any dataset change is currently unguarded.

### D5 — Committed reports are stale-by-design

`reports/*.md` and `reports/*.json` are hand-run snapshots with rounded timestamps. They assert
`PASS` but cannot be trusted as current state. They should either become CI-generated artifacts
or be clearly marked as historical.

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

| Baseline | Status |
|---|---|
| Library page load time / TTI | `UNMEASURED` |
| `index.json` transfer size (compressed) | `UNMEASURED` |
| `index.json` parse time | `UNMEASURED` |
| Per-keystroke search latency at 10k records | `UNMEASURED` |
| Search result quality (precision/recall vs. any labelled set) | `UNMEASURED` — no labelled set exists |
| Whether a retrieved prompt improves model output at all | `UNMEASURED` — this is the central unproven premise |

The last row is the important one. The entire value proposition — that selecting the right prompt
from a library beats simply asking a capable model directly — is currently **an assumption with
zero supporting evidence in this repo**. Establishing a measurement for it should precede building
machinery that presumes it.
