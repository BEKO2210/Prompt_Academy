# AGENTS.md

Guidance for coding agents working in this repository. Single source of truth;
`CLAUDE.md` imports this file.

## Core rules

- Preserve existing behaviour. The live site must keep working. Prefer extension over
  replacement, and the smallest robust change over a rewrite.
- `main` is production. There is no staging environment; a push to `main` deploys.
- Check the current state before changing it. Read the file, run the test, measure the
  baseline — do not act on assumption about what the code does.
- Never use destructive git commands (see Boundaries). Also never `pkill -f <pattern>` where the
  pattern could match your own shell command line — it kills the session. Use `fuser -k <port>/tcp`.
- Never invent tests, benchmarks, metrics or performance numbers. If something was not run,
  say it was not run.
- Distinguish measured facts from assumptions in every report. Mark unmeasured values as
  unmeasured rather than estimating them.
- Do not implement a long-term architecture component before its milestone/ticket is READY
  in `docs/`. Speculative components get deleted, not merged.

## Repository gotchas

Confirmed in Phase 0; none of these are derivable from reading the code.

- The local clone `Schreibtisch/GitHub-Repos/prompt-forge` points at
  `BEKO2210/Prompt-Academy` — a **different repository** from this one
  (`BEKO2210/Prompt_Academy`). Easy to confuse; check `git remote -v` before assuming.
- This repo is a **fully static** React/Vite site on GitHub Pages. There is no backend, no
  database, no API, no auth, and no LLM call at build or run time. Anything requiring a
  runtime cannot be added here without ADR-0001 being decided.
- Build requires **Node >=20.19 or >=22.12** (Vite 8). The system `node` is v18 and **fails**.
  Pinned in `.nvmrc` and `site/package.json` `engines` — use `.nvmrc`, do not assume `node` on PATH.
- `cd site && npm run ci` runs the whole local gate: typecheck, lint, data build, tests.
  Run it before pushing; CI runs the same checks.
- Two eslint rules are **`warn` not `error`** on purpose — five pre-existing violations, recorded in
  `site/eslint.config.js` and tracked as ENG-009. Do not add code that trips them, and do not
  "fix" the config by silencing more rules.
- Ten slugs violate the schema's own pattern and are allowlisted in `tests/dataset.test.mjs`
  (`KNOWN_BAD_SLUGS`, ENG-009). The allowlist may only ever **shrink** — a staleness test enforces it.
- `validate_dataset.py` checks slug **uniqueness only, never the pattern**. Its `PASS` does not mean
  schema-valid slugs.
- `vite preview` **cannot serve a production build here**: `vite.config.ts` sets
  `base: '/Prompt_Academy/'` only when `command === 'build'`, so preview serves at `/` and 404s its
  own assets. Use `scripts/baseline/serve_dist.mjs`.
- `site/public/data/index.json` is **6,908,069 B raw but 738,038 B as served** (GitHub Pages gzips
  at 9.36x, and offers **gzip only** — no brotli/zstd). Transfer is not the problem; **parse
  (p50 15.7 ms on the full 6.9 MB) and ~14 MB retained heap are**, and compression cannot reduce
  either. Every field added costs parse and heap directly. Measure before and after — budgets are in
  `reports/baseline-2026-07-30.json`.
- Library search is one lowercase substring `includes()` over a concatenated haystack, plus
  five exact-equality facet filters. The `relevance` sort key does **not** compute relevance.
  **It silently returns nothing for ordinary queries:** `dashboard` → 3,391 hits, but
  `accessible dashboard` → **0** and `barrierefrei` → **0**. Multi-word queries only match if the
  words appear adjacently in that order. Treat this as a defect, not merely as missing ranking.
- `haystack()` is called **inside** the filter predicate, so up to 10,000 array joins +
  `toLowerCase()` run per keystroke — ~83% of filter cost. But keystroke→paint (~50 ms) is ~7x the
  filter cost, so React re-render dominates what the user feels. There is no debounce.
- Both pages request **fonts.googleapis.com** at runtime. The site ships Impressum and Datenschutz
  pages, so this is a privacy/GDPR matter, not a performance one.
- `quality.*_score` fields are self-reported by the agents that generated the dataset. They
  are not independently validated and must not be treated as ground truth for ranking or as
  evidence of output quality.
- The dataset has **no `capabilities[]` field**. Capability-based routing has nothing to route
  on until ENG-001 lands.
- `reports/*.md` and `reports/*.json` are hand-run snapshots with rounded/hardcoded
  timestamps (`2026-05-29T00:00:00Z`). They assert PASS but do **not** prove current state.
- The Python scripts in `scripts/` are manual-only; nothing invokes them automatically. CI
  runs the deploy workflow only — it will publish a broken dataset without complaint.
- `cleanup_dataset.py` has previously modified 6,678 records in one pass. Bulk mutation
  tooling exists here; run it only with review and a recorded diff.
- `data/*.jsonl` is the source of truth. `site/public/data/` is generated by
  `site/scripts/build_site_data.mjs` — never hand-edit generated output.
- Hardware: RTX 3070, 8 GB VRAM. One local model resident at a time, and ComfyUI contends for
  the same VRAM. Do not design for concurrent local models.

## Engineering workflow

- `docs/roadmap.md`, `docs/tasks/` and `docs/adr/` are the source of truth for status and
  architecture. Read the current milestone and ticket before starting work.
- WIP limit: at most one large technical task in progress. Small directly-dependent subtasks
  may be done together.
- Per task: implement → write and **run** tests → review → update the ticket, roadmap and
  handoff section.
- Do not half-implement future milestones along the way.
- Record decisions as ADRs when they are architecturally significant. Do not ask about
  every small choice; decide, and document what matters.

## Boundaries

**Ask first** — irreversible or business-critical only:

- destructive data or schema migrations
- production deployment
- anything creating recurring external cost
- licence or security policy override
- large architectural deviation from an accepted ADR

**Never:**

- commit secrets, credentials or tokens
- fabricate benchmarks, metrics or test results
- execute unreviewed external skills or third-party scripts
- run `git reset --hard`, `git clean -fd`, or force push
- overwrite uncommitted user work — check `git status` first, stash with `-u` if needed
- treat an unknown licence as permissive

## Validation

- Claims of "better", "faster" or "cheaper" require a measurement. Without one, do not make
  the claim.
- Performance baselines exist: `reports/baseline-2026-07-30.json`, method in
  `reports/baseline-method.md`, harness in `scripts/baseline/`. Re-run the harness rather than
  inventing a new measurement, or the comparison is not like-for-like.
- **Measured noise floor is ~10–15%** on search timings at the committed repeat count. An improvement
  below that is not distinguishable from noise — exceed it or raise `n`.
- Establish the existing test/measurement state before a change, and re-run it after.
- There is currently no test suite. When adding a feature to an untested area, introduce the
  tests with the feature rather than afterwards.
- For benchmarks, record: model and version, provider, temperature, seed, config hash,
  dataset version, task-set version, skill versions, real timestamp, hardware.
- A component that does not measurably help gets removed, not kept at low weight.
