/**
 * Retrieval for the H1 experiment (ENG-008 §3, ADR-0001).
 *
 * ## One implementation, two consumers
 *
 * ADR-0001 requires the ranking module to be SHARED with the static site, "so
 * engine behaviour cannot silently diverge from what Library users see". This
 * file imports `site/src/lib/search.ts` and `site/src/lib/ranking.ts` directly.
 * It does not reimplement them, and it must never be allowed to: a benchmark
 * measuring a copy of the ranker tells you nothing about the ranker that ships.
 *
 * (Making that literally true required adding explicit `.ts` extensions to the
 * imports inside site/src/lib. Vite resolves extensionless specifiers; Node does
 * not, so the shared import failed until then. The site typechecks and builds
 * unchanged — `allowImportingTsExtensions` was already set.)
 *
 * ## Retrieve once per task
 *
 * §3 binds arms B, C and D to the IDENTICAL retrieved record. This module
 * returns that record once; `runner.ts` passes the same object to all three. If
 * retrieval ran per arm, a B/D difference could be a different-record difference
 * and the comparison would have to be aborted (§7).
 */
import { readFileSync } from "node:fs";
import { parseQuery } from "../../site/src/lib/search.ts";
import { matchesParsed } from "../../site/src/lib/search.ts";
import { rankResults } from "../../site/src/lib/ranking.ts";
import type { SkillRecord } from "./fieldSplit.ts";

/**
 * The shared modules operate on the site's compact IndexItem shape, not on the
 * full JSONL record. The engine needs the full record (arms inject
 * acceptance_criteria, which the index does not carry), so it retrieves against
 * an index projection and then returns the full records.
 *
 * The projection must match site/scripts/build_site_data.mjs. If it drifts, the
 * engine ranks on different text than the site does — which is exactly the
 * divergence ADR-0001 forbids. `tests/engine-runner.test.mjs` compares the two.
 */
export interface IndexProjection {
  id: string;
  t: string;
  hl: string;
  sum: string;
  fw: string;
  in: string;
  sc: string;
  a: string;
  tags: string[];
  kw: string[];
}

export function projectRecord(r: Record<string, any>): IndexProjection {
  const wc = (r.website_card ?? {}) as Record<string, any>;
  return {
    id: String(r.id),
    t: String(r.title ?? ""),
    hl: String(wc.headline ?? r.title ?? ""),
    sum: String(wc.summary ?? ""),
    fw: String(r.tech_stack?.framework ?? ""),
    in: String(r.industry ?? ""),
    sc: String(r.subcategory ?? ""),
    a: String(r.audience ?? ""),
    tags: (r.tags ?? []) as string[],
    kw: (wc.search_keywords ?? []) as string[],
  };
}

export interface Corpus {
  records: SkillRecord[];
  index: IndexProjection[];
  byId: Map<string, SkillRecord>;
}

export function loadCorpus(files: string[]): Corpus {
  const records: SkillRecord[] = [];
  for (const f of files) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      records.push(JSON.parse(line) as SkillRecord);
    }
  }
  const index = records.map((r) => projectRecord(r as Record<string, any>));
  const byId = new Map(records.map((r) => [r.id, r]));
  return { records, index, byId };
}

export interface RetrievalResult {
  /** The single record arms B, C and D all receive. Null when nothing matched. */
  primary: SkillRecord | null;
  /** Further records for arm E, best first, excluding the primary. */
  additional: SkillRecord[];
  /** Recorded per run (§6). */
  recordIds: string[];
  matchedCount: number;
}

/**
 * Retrieve for one task, using the same matching and ranking the site uses.
 *
 * `k` bounds how many records arm E may compile. It is a constant of the run and
 * is recorded, because changing it changes what arm E is.
 */
export function retrieve(corpus: Corpus, query: string, k = 3): RetrievalResult {
  const parsed = parseQuery(query.toLowerCase());
  const matched = corpus.index.filter((it) => matchesParsed(it as any, parsed));
  const ranked = rankResults(matched as any, parsed, parsed.requiredTerms) as IndexProjection[];
  const top = ranked.slice(0, k);
  const recs = top.map((it) => corpus.byId.get(it.id)!).filter(Boolean);
  return {
    primary: recs[0] ?? null,
    additional: recs.slice(1),
    recordIds: recs.map((r) => r.id),
    matchedCount: matched.length,
  };
}
