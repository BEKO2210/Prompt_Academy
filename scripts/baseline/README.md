# Baseline measurement harness (ENG-002)

Reproduces the numbers in `reports/baseline-*.json`. Zero dependencies beyond Node 22 and an
installed Chrome — no Playwright, no Puppeteer.

Full procedure and interpretation: `reports/baseline-method.md`.

## Prerequisites

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"   # system node v18 CANNOT build this repo
node -v                                                     # must be >=20.19 or >=22.12 (Vite 8)
cd site && npm ci && npm run build && cd ..
```

## 1. Parse cost, heap, filter-only search latency

```bash
node --expose-gc scripts/baseline/measure_parse_and_search.mjs site/public/data/index.json
```

`--expose-gc` is **required** — without it the heap figure is meaningless.

Replicates `haystack()` (`site/src/pages/Library.tsx:18-31`) and the filter predicate
(`:70-77`) **verbatim**. If either changes in the app, update the copy here or the number stops
describing the app.

## 2. Serve the production build faithfully

```bash
node scripts/baseline/serve_dist.mjs        # 127.0.0.1:4320
```

Needed because `vite preview` serves at `/` while the build targets `/Prompt_Academy/`, and
`python3 -m http.server` has no SPA fallback. This server mirrors *measured* GitHub Pages behaviour:
base path, gzip only (no brotli — verified absent), `max-age=600`, SPA fallback.

## 3. Page load

```bash
google-chrome --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-baseline --no-first-run --no-default-browser-check \
  --disable-gpu --enable-precise-memory-info about:blank &

node scripts/baseline/measure_page_load.mjs "http://127.0.0.1:4320/Prompt_Academy/library" library
node scripts/baseline/measure_page_load.mjs "http://127.0.0.1:4320/Prompt_Academy/" landing
```

`--enable-precise-memory-info` is required for `performance.memory`.

Measures time to first rendered result by polling for `<article>` (the `PromptCard` root), which is a
truer signal than DOMContentLoaded — the page paints a spinner long before data arrives.

**Run 3+ times and report the range.** Never report the best run.

## 4. Keystroke-to-paint latency

```bash
node scripts/baseline/measure_keystroke_latency.mjs "http://127.0.0.1:4320/Prompt_Academy/library"
```

Drives the input through React's expected path (native value setter + `input` event) and waits two
animation frames, so the figure includes React's commit and the paint. Setting `input.value` directly
would silently measure ~0 ms, because React never observes it.

## Fixed query set

Both search harnesses use the same fixed set. Keep it fixed, or measurements stop being comparable:

- `dashboard` typed character by character
- `react`, `pricing`
- `accessible dashboard`, `stripe checkout` — multi-word; **both currently return 0 hits**
- `barrierefrei`, `dunkelmodus` — German against a ~91% English corpus; **both return 0 hits**
- `zzzznomatch` — guaranteed miss

The zero-hit cases are not padding. They are the R0 baseline failure modes that ENG-006 must beat.
