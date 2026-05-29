// CategoryShowcase — card grid sourced from 21st.dev ("Dark Grid") hover treatment,
// adapted to NEXUS with per-category gradients, icons and real counts.
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { CATEGORIES } from "../lib/categories";
import type { Stats } from "../lib/data";
import { Counter } from "./Counter";
import { SectionHeading } from "./SectionHeading";

const card = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 18 },
  },
};

export function CategoryShowcase({ stats }: { stats: Stats | null }) {
  return (
    <section id="categories" className="container-px py-20 sm:py-28">
      <SectionHeading
        kicker="10 Kategorien"
        title={
          <>
            Von Landing Pages bis{" "}
            <span className="holo-text">Data-Visualization</span>.
          </>
        }
        sub="Jede Kategorie bündelt 1.000 kuratierte Prompts in 20 Subkategorien — wähle deinen Use-Case und tauche ein."
      />

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        transition={{ staggerChildren: 0.06 }}
        className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const count = stats?.byCategory?.[c.key] ?? 1000;
          return (
            <motion.div key={c.key} variants={card}>
              <Link
                to={`/library?category=${c.key}`}
                className="group relative block h-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/20"
              >
                {/* Hover gradient glow */}
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-60"
                  style={{
                    background: `radial-gradient(circle, ${c.hex[0]}, transparent 70%)`,
                  }}
                />
                {/* Corner accents on hover */}
                <span className="pointer-events-none absolute left-3 top-3 h-2.5 w-2.5 rounded-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: c.hex[0] }} />
                <span className="pointer-events-none absolute bottom-3 right-3 h-2.5 w-2.5 rounded-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: c.hex[1] }} />

                <div className="relative flex h-full flex-col">
                  <div className="flex items-start justify-between">
                    <span
                      className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${c.gradient} shadow-glow-cyan`}
                    >
                      <Icon className="h-6 w-6 text-ink-950" />
                    </span>
                    <ArrowUpRight className="h-5 w-5 text-slate-500 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
                  </div>

                  <h3 className="mt-5 font-display text-lg font-semibold text-white">
                    {c.label}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                    {c.tagline}
                  </p>

                  <div className="mt-auto flex items-center gap-2 pt-6 font-mono text-xs text-slate-500">
                    <span className="font-display text-base font-bold text-white">
                      <Counter to={count} />
                    </span>
                    Prompts
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
