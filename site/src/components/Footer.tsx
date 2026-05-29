// Phase-0 baseline footer — to be upgraded via 21st.dev magic MCP (Phase 1).
import { Link } from "react-router-dom";
import { CATEGORIES } from "../lib/categories";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/10 bg-ink-950/60">
      <div className="container-px py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-holo">
                <span className="font-display text-base font-bold text-ink-950">P</span>
              </span>
              <span className="font-display text-sm font-semibold text-slate-100">
                Prompt Library <span className="holo-text font-bold">10000</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              10.000 produktionsreife KI-Prompts für Websites, UI-Komponenten,
              Dashboards, Apps & interaktive Experiences — kuratiert,
              schema-validiert und qualitätsbewertet.
            </p>
          </div>

          <div>
            <h4 className="kicker mb-4">Kategorien</h4>
            <ul className="space-y-2.5">
              {CATEGORIES.slice(0, 5).map((c) => (
                <li key={c.key}>
                  <Link
                    to={`/library?category=${c.key}`}
                    className="text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="kicker mb-4">Mehr</h4>
            <ul className="space-y-2.5">
              {CATEGORIES.slice(5).map((c) => (
                <li key={c.key}>
                  <Link
                    to={`/library?category=${c.key}`}
                    className="text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Prompt Library 10000. Dataset v1.0.0.</p>
          <p className="font-mono">
            Built with React · Tailwind · Framer Motion · 21st.dev
          </p>
        </div>
      </div>
    </footer>
  );
}
