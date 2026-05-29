/** Typed loaders for the generated dataset in public/data/. */

const BASE = import.meta.env.BASE_URL;

/** Compact record (public/data/index.json) — drives cards + client search. */
export interface IndexItem {
  id: string;
  t: string; // title
  s: string; // slug
  c: string; // category key
  sc: string; // subcategory
  d: Difficulty; // difficulty
  a: string; // audience
  in: string; // industry
  fw: string; // framework
  an: string; // animation
  lang: "en" | "de";
  tags: string[];
  hl: string; // headline
  sum: string; // summary
  pl: string; // preview label
  kw: string[]; // search keywords
  q: number | null; // website readiness score
}

export type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";

/** Full record (public/data/category/<cat>.json) — used in detail view. */
export interface FullPrompt {
  id: string;
  version: string;
  category: string;
  subcategory: string;
  title: string;
  slug: string;
  language: "en" | "de";
  difficulty: Difficulty;
  audience: string;
  use_case: string;
  industry: string;
  style: {
    visual_style: string;
    layout_style: string;
    color_direction: string;
    motion_style: string;
  };
  tech_stack: {
    framework: string;
    language: string;
    styling: string;
    animation?: string;
    optional_libraries?: string[];
  };
  prompt: string;
  negative_prompt: string;
  acceptance_criteria: string[];
  tags: string[];
  website_card: {
    headline: string;
    summary: string;
    preview_label: string;
    search_keywords: string[];
  };
  quality: {
    specificity_score: number;
    originality_score: number;
    implementation_clarity_score: number;
    website_readiness_score: number;
  };
  created_by_agent: string;
  batch: string;
}

export interface Stats {
  total: number;
  distinctCategories: number;
  distinctSubcategories: number;
  distinctFrameworks: number;
  distinctIndustries: number;
  distinctVisualStyles: number;
  avgWebsiteReadiness: number;
  byCategory: Record<string, number>;
  difficulty: Record<string, number>;
  languages: Record<string, number>;
  topFrameworks: { name: string; count: number }[];
  topAnimation: { name: string; count: number }[];
  topStyling: { name: string; count: number }[];
  topIndustries: { name: string; count: number }[];
  audiences: Record<string, number>;
}

export interface MetaCategory {
  key: string;
  label: string;
  count: number;
  subcategories: string[];
}
export interface Meta {
  total: number;
  generatedFrom: string[];
  categories: MetaCategory[];
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

// --- module-level caches (promise-memoized) ---
let statsP: Promise<Stats> | null = null;
let metaP: Promise<Meta> | null = null;
let indexP: Promise<IndexItem[]> | null = null;
const categoryP = new Map<string, Promise<FullPrompt[]>>();

export const fetchStats = () => (statsP ??= getJSON<Stats>("stats.json"));
export const fetchMeta = () => (metaP ??= getJSON<Meta>("meta.json"));
export const fetchIndex = () => (indexP ??= getJSON<IndexItem[]>("index.json"));

export function fetchCategory(cat: string) {
  if (!categoryP.has(cat)) {
    categoryP.set(cat, getJSON<FullPrompt[]>(`category/${cat}.json`));
  }
  return categoryP.get(cat)!;
}

/** Resolve a full prompt by id; uses the index to find its category, then loads it. */
export async function fetchPromptById(id: string): Promise<FullPrompt | null> {
  const index = await fetchIndex();
  const item = index.find((i) => i.id === id);
  if (!item) return null;
  const list = await fetchCategory(item.c);
  return list.find((p) => p.id === id) ?? null;
}
