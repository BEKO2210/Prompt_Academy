import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, SearchX } from "lucide-react";
import type { IndexItem, Stats } from "../lib/data";
import { fetchIndex, fetchStats } from "../lib/data";
import {
  ExplorerControls,
  EMPTY_FILTERS,
  type Filters,
  type SortKey,
} from "../components/ExplorerControls";
import { PromptCard } from "../components/PromptCard";
import { PromptDrawer } from "../components/PromptDrawer";

const PAGE = 48;

function haystack(it: IndexItem): string {
  return [
    it.t,
    it.hl,
    it.sum,
    it.fw,
    it.in,
    it.sc,
    it.a,
    ...(it.tags ?? []),
    ...(it.kw ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function Library() {
  const [params, setParams] = useSearchParams();
  const [index, setIndex] = useState<IndexItem[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    category: params.get("category"),
  });
  const [sort, setSort] = useState<SortKey>("relevance");
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<IndexItem | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchIndex().then((d) => alive && setIndex(d)).catch(() => {});
    fetchStats().then((s) => alive && setStats(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Keep ?category= in sync with the active filter for shareable URLs.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (filters.category) next.set("category", filters.category);
    else next.delete("category");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category]);

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!index) return [];
    let list = index.filter((it) => {
      if (filters.category && it.c !== filters.category) return false;
      if (filters.difficulty && it.d !== filters.difficulty) return false;
      if (filters.framework && it.fw !== filters.framework) return false;
      if (filters.language && it.lang !== filters.language) return false;
      if (filters.audience && it.a !== filters.audience) return false;
      if (q && !haystack(it).includes(q)) return false;
      return true;
    });

    if (sort === "quality") {
      list = [...list].sort((a, b) => (b.q ?? 0) - (a.q ?? 0));
    } else if (sort === "az") {
      list = [...list].sort((a, b) => a.t.localeCompare(b.t));
    }
    return list;
  }, [index, filters, q, sort]);

  // Reset window when the result set changes.
  useEffect(() => setVisible(PAGE), [filters, q, sort]);

  // Infinite scroll sentinel.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible((v) => Math.min(v + PAGE, results.length));
        }
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [results.length]);

  const toggle = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }));

  const clear = () => {
    setFilters(EMPTY_FILTERS);
    setQuery("");
  };

  const shown = results.slice(0, visible);

  return (
    <section className="container-px pt-32 pb-24 sm:pt-36">
      <div className="mb-8 max-w-2xl">
        <span className="kicker">Explorer</span>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Die <span className="holo-text">Prompt-Bibliothek</span>
        </h1>
        <p className="mt-3 text-lg text-slate-400">
          Durchsuche und filtere 10.000 production-ready Prompts. Klicke eine
          Karte für den vollständigen Prompt, Tech-Stack & Acceptance Criteria.
        </p>
      </div>

      <ExplorerControls
        query={query}
        onQuery={setQuery}
        filters={filters}
        onToggle={toggle}
        onClear={clear}
        sort={sort}
        onSort={setSort}
        stats={stats}
        resultCount={results.length}
        total={index?.length ?? 10000}
      />

      {/* Grid */}
      {!index ? (
        <div className="mt-16 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-holo-cyan" />
          <p className="font-mono text-sm">Lade 10.000 Prompts…</p>
        </div>
      ) : results.length === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center text-slate-500">
          <SearchX className="h-10 w-10 text-slate-600" />
          <p className="text-lg text-slate-300">Keine Treffer</p>
          <p className="max-w-sm text-sm">
            Versuch andere Suchbegriffe oder setze die Filter zurück.
          </p>
          <button
            type="button"
            onClick={clear}
            className="chip chip-active mt-2 cursor-pointer"
          >
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        <>
          <motion.div
            layout
            className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {shown.map((it) => (
              <PromptCard key={it.id} item={it} onOpen={setSelected} />
            ))}
          </motion.div>

          {visible < results.length && (
            <div
              ref={sentinel}
              className="mt-10 flex items-center justify-center py-6 text-slate-500"
            >
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-holo-cyan" />
              <span className="font-mono text-sm">
                Lade weitere… ({visible.toLocaleString("de-DE")}/
                {results.length.toLocaleString("de-DE")})
              </span>
            </div>
          )}
        </>
      )}

      <PromptDrawer item={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
