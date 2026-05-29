/**
 * build_site_data.mjs
 * Reads the raw prompt dataset (../data/*.jsonl) and emits browser-optimized
 * JSON into public/data/:
 *   - index.json            compact records for all 10k prompts (search + cards)
 *   - category/<cat>.json   FULL records per category (lazy-loaded for detail)
 *   - stats.json            real aggregate statistics computed from the dataset
 *   - meta.json             category list with labels + counts
 *
 * Run: npm run data
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(process.cwd(), "..");        // prompt_dataset_delivery/
const DATA_DIR = join(ROOT, "data");
const OUT_DIR = resolve(process.cwd(), "public", "data");
const CAT_DIR = join(OUT_DIR, "category");

mkdirSync(CAT_DIR, { recursive: true });

const CATEGORY_LABELS = {
  landing_pages: "Landing Pages",
  ui_components: "UI Components",
  saas_dashboards: "SaaS Dashboards",
  ecommerce: "E-Commerce",
  portfolio_personal_brand: "Portfolio & Brand",
  ai_tools_agents: "AI Tools & Agents",
  education_learning: "Education & Learning",
  mobile_apps: "Mobile Apps",
  games_interactive: "Games & Interactive",
  data_visualization: "Data Visualization",
};

function inc(map, key) {
  if (key == null || key === "") return;
  map.set(key, (map.get(key) || 0) + 1);
}
function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, count: v }));
}
function mapToObj(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}

const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".jsonl")).sort();
if (files.length === 0) {
  console.error("No .jsonl files found in", DATA_DIR);
  process.exit(1);
}

const index = [];
const perCategory = {};
const stats = {
  total: 0,
  byCategory: {},
  difficulty: new Map(),
  frameworks: new Map(),
  languages: new Map(),
  animation: new Map(),
  styling: new Map(),
  industries: new Map(),
  audiences: new Map(),
  visualStyles: new Map(),
  subcategories: new Set(),
  qualitySum: 0,
  qualityCount: 0,
};

for (const file of files) {
  const raw = readFileSync(join(DATA_DIR, file), "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    let p;
    try { p = JSON.parse(line); } catch { continue; }

    const framework = p.tech_stack?.framework || "";
    const animation = p.tech_stack?.animation || "";
    const styling = p.tech_stack?.styling || "";

    // compact index record (drives cards + client-side search)
    index.push({
      id: p.id,
      t: p.title,
      s: p.slug,
      c: p.category,
      sc: p.subcategory,
      d: p.difficulty,
      a: p.audience,
      in: p.industry,
      fw: framework,
      an: animation,
      lang: p.language,
      tags: p.tags || [],
      hl: p.website_card?.headline || p.title,
      sum: p.website_card?.summary || "",
      pl: p.website_card?.preview_label || "",
      kw: p.website_card?.search_keywords || [],
      q: p.quality?.website_readiness_score ?? null,
    });

    // full record per category (lazy-loaded on detail view)
    (perCategory[p.category] ||= []).push(p);

    // stats
    stats.total++;
    stats.byCategory[p.category] = (stats.byCategory[p.category] || 0) + 1;
    inc(stats.difficulty, p.difficulty);
    inc(stats.frameworks, framework);
    inc(stats.languages, p.language);
    inc(stats.animation, animation);
    inc(stats.styling, styling);
    inc(stats.industries, p.industry);
    inc(stats.audiences, p.audience);
    inc(stats.visualStyles, p.style?.visual_style);
    if (p.subcategory) stats.subcategories.add(p.subcategory);
    if (typeof p.quality?.website_readiness_score === "number") {
      stats.qualitySum += p.quality.website_readiness_score;
      stats.qualityCount++;
    }
  }
}

// write compact index
writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(index));

// write per-category full files
const meta = { total: index.length, generatedFrom: files, categories: [] };
for (const [cat, items] of Object.entries(perCategory)) {
  writeFileSync(join(CAT_DIR, `${cat}.json`), JSON.stringify(items));
  meta.categories.push({
    key: cat,
    label: CATEGORY_LABELS[cat] || cat,
    count: items.length,
    subcategories: [...new Set(items.map((i) => i.subcategory))].sort(),
  });
}
meta.categories.sort((a, b) => b.count - a.count);
writeFileSync(join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

// write aggregate stats
const statsOut = {
  total: stats.total,
  distinctCategories: Object.keys(stats.byCategory).length,
  distinctSubcategories: stats.subcategories.size,
  distinctFrameworks: stats.frameworks.size,
  distinctIndustries: stats.industries.size,
  distinctVisualStyles: stats.visualStyles.size,
  avgWebsiteReadiness: stats.qualityCount ? +(stats.qualitySum / stats.qualityCount).toFixed(2) : null,
  byCategory: stats.byCategory,
  difficulty: mapToObj(stats.difficulty),
  languages: mapToObj(stats.languages),
  topFrameworks: topN(stats.frameworks, 14),
  topAnimation: topN(stats.animation, 12),
  topStyling: topN(stats.styling, 8),
  topIndustries: topN(stats.industries, 16),
  audiences: mapToObj(stats.audiences),
};
writeFileSync(join(OUT_DIR, "stats.json"), JSON.stringify(statsOut, null, 2));

console.log(`✓ ${index.length} prompts processed`);
console.log(`✓ index.json: ${(JSON.stringify(index).length / 1e6).toFixed(2)} MB`);
console.log(`✓ ${Object.keys(perCategory).length} category files in public/data/category/`);
console.log(`✓ stats.json, meta.json written`);
console.log(`  frameworks=${stats.frameworks.size} industries=${stats.industries.size} subcats=${stats.subcategories.size} avgQ=${statsOut.avgWebsiteReadiness}`);
