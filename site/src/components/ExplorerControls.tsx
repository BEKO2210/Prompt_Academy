// ExplorerControls — command-bar search + faceted filter chips + sort.
// Built on the 21st.dev glass/chip language, wired to the dataset facets.
import type { ReactNode } from "react";
import { Search, X, SlidersHorizontal, ArrowDownWideNarrow } from "lucide-react";
import { CATEGORIES } from "../lib/categories";
import { DIFFICULTY_ORDER, difficultyMeta, humanize } from "../lib/format";
import type { Stats } from "../lib/data";
import { cn } from "../lib/cn";

export type SortKey = "relevance" | "quality" | "az";

export interface Filters {
  category: string | null;
  difficulty: string | null;
  framework: string | null;
  language: string | null;
  audience: string | null;
}

export const EMPTY_FILTERS: Filters = {
  category: null,
  difficulty: null,
  framework: null,
  language: null,
  audience: null,
};

interface Props {
  query: string;
  onQuery: (q: string) => void;
  filters: Filters;
  onToggle: (key: keyof Filters, value: string) => void;
  onClear: () => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  stats: Stats | null;
  resultCount: number;
  total: number;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("chip cursor-pointer hover:border-white/25", active && "chip-active")}
    >
      {children}
    </button>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function ExplorerControls({
  query,
  onQuery,
  filters,
  onToggle,
  onClear,
  sort,
  onSort,
  stats,
  resultCount,
  total,
}: Props) {
  const frameworks = stats?.topFrameworks?.slice(0, 10) ?? [];
  const audiences = stats
    ? Object.entries(stats.audiences)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k]) => k)
    : [];
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="glass-strong holo-border rounded-3xl p-5 sm:p-6">
      {/* Command bar */}
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-950/60 px-4 py-3 focus-within:border-holo-cyan/50 focus-within:shadow-glow-cyan">
        <Search className="h-5 w-5 shrink-0 text-slate-500" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Suche nach Titel, Tag, Framework, Use-Case…"
          className="w-full bg-transparent font-sans text-base text-slate-100 placeholder:text-slate-600 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Suche leeren"
            onClick={() => onQuery("")}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Result count + sort + clear */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <SlidersHorizontal className="h-4 w-4 text-holo-cyan" />
          <span className="font-mono text-white">
            {resultCount.toLocaleString("de-DE")}
          </span>
          <span>von {total.toLocaleString("de-DE")} Prompts</span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="ml-2 inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-slate-400 hover:border-holo-magenta/50 hover:text-white"
            >
              <X className="h-3 w-3" /> {activeCount} Filter zurücksetzen
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ArrowDownWideNarrow className="h-4 w-4 text-slate-500" />
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortKey)}
            className="cursor-pointer rounded-lg border border-white/10 bg-ink-900 px-3 py-1.5 text-sm text-slate-200 focus:border-holo-cyan/50 focus:outline-none"
          >
            <option value="relevance">Relevanz</option>
            <option value="quality">Qualität ↓</option>
            <option value="az">A–Z</option>
          </select>
        </div>
      </div>

      {/* Facets */}
      <div className="mt-5 grid gap-4 border-t border-white/10 pt-5">
        <Group label="Kategorie">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              active={filters.category === c.key}
              onClick={() => onToggle("category", c.key)}
            >
              {c.label}
            </Chip>
          ))}
        </Group>

        <div className="grid gap-4 sm:grid-cols-2">
          <Group label="Difficulty">
            {DIFFICULTY_ORDER.map((d) => (
              <Chip
                key={d}
                active={filters.difficulty === d}
                onClick={() => onToggle("difficulty", d)}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", difficultyMeta(d).dot)} />
                {difficultyMeta(d).label}
              </Chip>
            ))}
          </Group>

          <Group label="Sprache">
            <Chip
              active={filters.language === "en"}
              onClick={() => onToggle("language", "en")}
            >
              English
            </Chip>
            <Chip
              active={filters.language === "de"}
              onClick={() => onToggle("language", "de")}
            >
              Deutsch
            </Chip>
          </Group>
        </div>

        {frameworks.length > 0 && (
          <Group label="Framework">
            {frameworks.map((f) => (
              <Chip
                key={f.name}
                active={filters.framework === f.name}
                onClick={() => onToggle("framework", f.name)}
              >
                {f.name}
              </Chip>
            ))}
          </Group>
        )}

        {audiences.length > 0 && (
          <Group label="Zielgruppe">
            {audiences.map((a) => (
              <Chip
                key={a}
                active={filters.audience === a}
                onClick={() => onToggle("audience", a)}
              >
                {humanize(a)}
              </Chip>
            ))}
          </Group>
        )}
      </div>
    </div>
  );
}
