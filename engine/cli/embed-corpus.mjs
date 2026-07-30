/**
 * Embed the corpus once, to disk (ENG-020).
 *
 * The retrievable text per record is title + subcategory + tags + keywords +
 * the prompt's first sentences — the same fields the lexical index used, so the
 * comparison is retrieval METHOD, not retrieval INPUT.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus } from "../core/retrieval.ts";
import { OllamaEmbeddings, normalise } from "../providers/ollamaEmbeddings.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "reports/corpus-embeddings.bin");
const META = join(ROOT, "reports/corpus-embeddings.json");

const corpus = loadCorpus(
  readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".jsonl")).map((f) => join(ROOT, "data", f)),
);

export function retrievableText(r) {
  const wc = r.website_card ?? {};
  return [
    r.title, String(r.subcategory ?? "").replace(/_/g, " "),
    (r.tags ?? []).join(" "), (wc.search_keywords ?? []).join(" "),
    String(r.prompt ?? "").slice(0, 400),
  ].filter(Boolean).join(". ");
}

const emb = new OllamaEmbeddings();
const BATCH = 64;
const dim = 768;
const buf = new Float32Array(corpus.records.length * dim);
const started = Date.now();

for (let i = 0; i < corpus.records.length; i += BATCH) {
  const slice = corpus.records.slice(i, i + BATCH);
  const vecs = await emb.embed(slice.map(retrievableText));
  vecs.forEach((v, j) => buf.set(normalise(v), (i + j) * dim));
  if ((i / BATCH) % 20 === 0) {
    const done = i + slice.length;
    const rate = done / ((Date.now() - started) / 1000);
    process.stdout.write(`  ${done}/${corpus.records.length}  ${rate.toFixed(0)}/s  eta ${((corpus.records.length - done) / rate / 60).toFixed(1)} min\n`);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(buf.buffer));
writeFileSync(META, JSON.stringify({
  model: emb.cfg.model, dim, count: corpus.records.length,
  ids: corpus.records.map((r) => r.id),
  textRecipe: "title. subcategory. tags. search_keywords. prompt[:400] — the same fields the lexical index uses",
}, null, 1));
console.log(`\nwrote ${corpus.records.length} vectors, dim ${dim}, in ${((Date.now() - started) / 1000).toFixed(0)}s`);
