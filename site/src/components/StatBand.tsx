import { motion } from "framer-motion";
import type { Stats } from "../lib/data";
import { Counter } from "./Counter";
import { Reveal } from "./Reveal";
import { humanize } from "../lib/format";

const DIFF_COLOR: Record<string, string> = {
  beginner: "bg-emerald-400",
  intermediate: "bg-holo-sky",
  advanced: "bg-holo-violet",
  expert: "bg-holo-magenta",
};

export function StatBand({ stats }: { stats: Stats | null }) {
  if (!stats) return null;
  const diffTotal = Object.values(stats.difficulty).reduce((a, b) => a + b, 0);
  const diffOrder = ["beginner", "intermediate", "advanced", "expert"];

  const cards = [
    { v: stats.total, suffix: "", l: "Kuratierte Prompts" },
    { v: stats.distinctCategories, suffix: "", l: "Kategorien" },
    { v: stats.distinctSubcategories, suffix: "", l: "Subkategorien" },
    {
      v: stats.avgWebsiteReadiness,
      suffix: "/10",
      l: "Ø Website-Readiness",
      decimal: true,
    },
  ];

  return (
    <section className="container-px py-10">
      <Reveal className="glass holo-border overflow-hidden rounded-3xl p-8 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          {/* Big numbers */}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:border-r lg:border-white/10 lg:pr-8">
            {cards.map((c) => (
              <div key={c.l}>
                <div className="font-display text-3xl font-bold text-white sm:text-4xl">
                  <Counter
                    to={c.v}
                    format={
                      c.decimal
                        ? () => c.v.toFixed(2).replace(".", ",")
                        : undefined
                    }
                  />
                  <span className="holo-text">{c.suffix}</span>
                </div>
                <div className="mt-1.5 text-xs uppercase tracking-wider text-slate-500">
                  {c.l}
                </div>
              </div>
            ))}
          </div>

          {/* Difficulty distribution */}
          <div>
            <div className="kicker mb-3">Difficulty-Verteilung</div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
              {diffOrder.map((d) => {
                const val = stats.difficulty[d] ?? 0;
                const pct = (val / diffTotal) * 100;
                return (
                  <motion.div
                    key={d}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${pct}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    className={DIFF_COLOR[d]}
                  />
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {diffOrder.map((d) => (
                <div key={d} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${DIFF_COLOR[d]}`} />
                  <span className="text-slate-400">{humanize(d)}</span>
                  <span className="ml-auto font-mono text-slate-300">
                    {(stats.difficulty[d] ?? 0).toLocaleString("de-DE")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
