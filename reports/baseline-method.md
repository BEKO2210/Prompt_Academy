# Baseline measurement method (ENG-002)

How the numbers in `baseline-2026-07-30.json` were produced, in enough detail to reproduce or
challenge them. Results are in that file; this document is only the procedure.

**Why this exists:** no performance baseline existed before (finding D1/§11 of
`docs/architecture/current-state.md`). Without one, any later claim that retrieval work made the site
"faster" or "no slower" is unfalsifiable. ENG-007 and ENG-006 are measured against these numbers.

---

## 0. Environment

Record these with any re-run; the numbers are machine-dependent and do not transfer.

| | Value used |
|---|---|
| OS | Pop!_OS 24.04, Linux 6.18.7 |
| CPU threads / RAM | 16 / 15 GB |
| Node | **v22.23.1** (see warning below) |
| npm | 10.9.8 |
| Browser | Chrome 150.0.7871.128, `--headless=new` |
| Commit | `6d08696`, branch `phase-0/skill-engine-foundation` |

> **Node version matters.** The system `node` is v18.19.1 and **cannot build this project** — Vite 8
> requires Node `>=20.19` or `>=22.12`. CI uses Node 22, so measurements used v22.23.1 to match.
> Prefix every command with:
>
> ```bash
> export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
> ```

---

## 1. Build

```bash
cd site
npm ci --no-audit --no-fund
/usr/bin/time -f "wall=%es maxRSS=%MkB" npm run data     # data build only
/usr/bin/time -f "wall=%es maxRSS=%MkB" npm run build    # data + tsc + vite build
```

`npm run build` re-runs the data build via `prebuild`, so its wall time includes it.

## 2. Artifact sizes

Raw and gzip (level 6) per file:

```bash
cd site
find public/data -type f | sort | while read -r f; do
  printf "%-34s %10s %10s\n" "${f#public/data/}" "$(stat -c%s "$f")" "$(gzip -6 -c "$f" | wc -c)"
done
find dist -type f | sort | while read -r f; do
  printf "%-40s %10s %10s\n" "${f#dist/}" "$(stat -c%s "$f")" "$(gzip -6 -c "$f" | wc -c)"
done
du -sb dist
```

## 3. Deployed transfer and content negotiation

The encoding test is the important part — do not assume brotli is served:

```bash
BASE=https://beko2210.github.io/Prompt_Academy
for enc in "br" "br,gzip" "gzip, deflate, br, zstd" "zstd" "deflate" "identity"; do
  printf "%-26s " "[$enc]"
  curl -s -o /dev/null -H "Accept-Encoding: $enc" -w "bytes=%{size_download}\n" \
    "$BASE/data/index.json"
done
curl -sI -H "Accept-Encoding: gzip" "$BASE/data/index.json" \
  | grep -iE "content-encoding|content-length|cache-control|etag"
```

**Measured result:** only `gzip` is honoured. A client advertising only `br` or only `zstd` receives
the full 6,908,069 bytes with no `Content-Encoding`. Do not report brotli figures for this host.

## 4. Parse cost, heap, and filter-only search latency

Harness: `measure.mjs` (kept in the session scratchpad; reproduce from the description below).

It does three things, all against the **real** `public/data/index.json`:

1. `JSON.parse` the file 12 times with `global.gc()` between runs; report p50/p95/min/max.
2. Measure heap attributable to the parsed index: `gc()` → read `heapUsed` → parse and hold → `gc()`
   → read `heapUsed` again → difference. Asserts the record count is exactly 10,000.
3. Replicate the search path **verbatim** from source — `haystack()` from `Library.tsx:18-31` and the
   filter predicate from `Library.tsx:70-77`. Copy them literally; do not paraphrase, or the number
   measures something else.

Run with:

```bash
node --expose-gc measure.mjs site/public/data/index.json
```

`--expose-gc` is required or the heap figure is meaningless.

**Fixed query set** (repeatability depends on this being fixed):

- `dashboard` typed one character at a time: `d`, `da`, `das` … `dashboard`
- `react`, `pricing`
- `accessible dashboard`, `stripe checkout` — multi-word
- `barrierefrei`, `dunkelmodus` — German, against a ~91% English corpus
- `zzzznomatch` — guaranteed miss

10 repeats per query. Also measured separately: facet-only filtering with no text (to isolate the
text cost), and `haystack()` construction across all 10,000 records with no matching (to attribute
the cost).

## 5. Serving a production build faithfully

`vite preview` **cannot** be used: `vite.config.ts` applies `base: '/Prompt_Academy/'` only when
`command === 'build'`, so preview serves at `/` while the built assets request `/Prompt_Academy/…`
and 404. `python3 -m http.server` also fails, because it has no SPA fallback and `/library` 404s.

`serve.mjs` was used instead — a ~40-line static server that mirrors the *measured* production
behaviour:

- serves under base `/Prompt_Academy`
- **gzip only**, no brotli (matches §3)
- `Cache-Control: max-age=600` (matches §3)
- SPA fallback to `index.html` (production achieves this via the workflow's `cp dist/index.html
  dist/404.html`)
- path containment check so `..` cannot escape `dist`

```bash
node serve.mjs        # listens on 127.0.0.1:4320
```

## 6. Browser page-load measurements

No Playwright or Puppeteer install is needed. Chrome is already present, and Node 22 has a global
`WebSocket`, so `cdp.mjs` speaks CDP directly.

```bash
google-chrome --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/tmp/…/chrome-profile --no-first-run --no-default-browser-check \
  --disable-gpu --enable-precise-memory-info --js-flags="--expose-gc" about:blank &

node cdp.mjs "http://127.0.0.1:4320/Prompt_Academy/library" "library"
```

`--enable-precise-memory-info` is required for `performance.memory` to be usable.

`cdp.mjs` per run: `Network.clearBrowserCache` + `setCacheDisabled` (cold cache) → `Page.navigate` →
poll `document.querySelectorAll('article').length` every 25 ms until non-zero, recording
**time to first rendered result** → settle 1.5 s → read `performance.getEntriesByType('navigation' |
'paint' | 'resource')`, buffered LCP via `PerformanceObserver`, and `performance.memory`.

`<article>` is the `PromptCard` root element (`PromptCard.tsx:24`), which makes it a stable signal
for "results are actually on screen" — more meaningful here than DOMContentLoaded, since the page
paints a loading spinner long before any data arrives.

Run **3 times minimum** and report the range. Do not report the best run.

## 7. Keystroke-to-paint search latency

`cdp-search.mjs`. This is the number that reflects user experience; the Node figure in §4 covers only
the filter and misses React's re-render entirely.

Method: obtain the search `<input>`, then drive it the way React expects —

```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(input, value);
input.dispatchEvent(new Event('input', { bubbles: true }));
```

Setting `input.value` directly does **not** work: React's synthetic event system will not observe it,
so nothing re-renders and the measurement silently reads ~0 ms.

Timing spans from before the setter call until **two** `requestAnimationFrame` callbacks have fired,
which is what makes the figure include React's commit and the subsequent paint rather than just the
state update. The input is cleared between repeats. 5 repeats per query, same fixed query set as §4.

---

## 8. Interpreting these numbers

- **Transfer is not the problem; parse and heap are.** Compressed transfer is ~738 KB, but
  `JSON.parse` runs on the full 6.9 MB and holds ~14 MB of heap. Compression cannot help either.
  This corrects the framing in finding D1, which listed the compressed size as `UNMEASURED`.
- **Search cost is dominated by re-derivation, not by matching.** `haystack()` accounts for ~83% of
  filter time because it is rebuilt per record per keystroke. Precomputing it is the obvious lever,
  and it is available independently of any ranking change.
- **Keystroke cost is ~50 ms, dominated by React re-render**, not by the filter. Optimising the
  filter alone would improve about one seventh of the observed cost. There is no debounce.
- **Report ranges, not single runs.** Deployed run 1 was ~2x slower than runs 2-3 because of a cold
  CDN edge; presenting only the warm number would misrepresent a first visit.
- **These figures flatter reality.** One desktop machine, 16 threads, wired network, headless
  browser. Mobile CPU and slow links are UNMEASURED and would be markedly worse, especially the
  parse.

## 9. Scope note

ENG-002 measures only. It changes no production code. Several defects surfaced while building the
fixed query set — notably that multi-word queries such as `accessible dashboard` return **zero**
results while `dashboard` alone returns 3,391 — and these are recorded in
`baseline-2026-07-30.json` under `retrieval_correctness_findings` rather than fixed here. They define
the R0 baseline that ENG-006 has to beat.
