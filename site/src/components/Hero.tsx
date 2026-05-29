// Hero — sourced from 21st.dev ("Glassmorphism Trust Hero") and adapted to the
// NEXUS design system (holo palette, Space Grotesk, JetBrains Mono) + real dataset stats.
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Target, ShieldCheck, Crown } from "lucide-react";
import type { Stats } from "../lib/data";
import { Button } from "./ui/Button";
import { Counter } from "./Counter";

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

const itemV = {
  hidden: { y: 22, opacity: 0 },
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    transition: { duration: 0.7, delay: 0.1 + i * 0.1, ease: EASE },
  }),
};

export function Hero({ stats }: { stats: Stats | null }) {
  const readiness = stats?.avgWebsiteReadiness ?? 9.06;
  const readinessPct = Math.round(readiness * 10);
  const frameworks =
    stats?.topFrameworks?.slice(0, 9).map((f) => f.name) ??
    ["React", "Svelte", "Vue", "Next.js", "Angular", "Astro", "Solid", "Flutter", "SwiftUI"];

  const miniStats = [
    { v: stats?.distinctCategories ?? 10, l: "Kategorien" },
    { v: stats?.distinctSubcategories ?? 200, l: "Subkat." },
    { v: stats?.distinctFrameworks ?? 18, l: "Frameworks" },
  ];

  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-44">
      <div className="container-px grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
        {/* --- LEFT --- */}
        <motion.div
          initial="hidden"
          animate="visible"
          className="lg:col-span-7 flex flex-col gap-7"
        >
          <motion.span variants={itemV} custom={0} className="chip holo-border w-fit bg-white/5">
            <Sparkles className="h-3.5 w-3.5 text-holo-cyan" />
            <span className="font-mono text-[11px] tracking-wider text-slate-300">
              10.000 PROMPTS · 10 KATEGORIEN · v1.0.0
            </span>
          </motion.span>

          <motion.h1
            variants={itemV}
            custom={1}
            className="text-balance text-[2.5rem] font-bold leading-[1.05] tracking-tightest sm:text-6xl sm:leading-[0.95] lg:text-7xl"
          >
            Generiere Interfaces aus{" "}
            <span className="holo-text-anim text-glow">10.000</span>{" "}
            kuratierten Prompts.
          </motion.h1>

          <motion.p
            variants={itemV}
            custom={2}
            className="max-w-xl text-lg leading-relaxed text-slate-400"
          >
            Production-ready Prompts für Landing Pages, UI-Komponenten, Dashboards,
            Apps, Games und Data-Viz — schema-validiert, qualitätsbewertet{" "}
            <span className="font-mono text-holo-cyan">
              (Ø {readiness.toFixed(2).replace(".", ",")}/10)
            </span>{" "}
            und sofort einsetzbar.
          </motion.p>

          <motion.div
            variants={itemV}
            custom={3}
            className="flex flex-wrap items-center gap-3"
          >
            <Button to="/library" className="h-12 px-7 text-base">
              Bibliothek öffnen
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
            <Button href="#categories" variant="ghost" className="h-12 px-7 text-base">
              Kategorien ansehen
            </Button>
          </motion.div>

          <motion.div
            variants={itemV}
            custom={4}
            className="mt-2 grid max-w-lg grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4"
          >
            {[
              { v: stats?.total ?? 10000, l: "Prompts" },
              { v: stats?.distinctSubcategories ?? 200, l: "Subkategorien" },
              { v: stats?.distinctFrameworks ?? 18, l: "Frameworks" },
              { v: stats?.distinctIndustries ?? 65, l: "Industries" },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-display text-2xl font-bold text-white">
                  <Counter to={s.v} />
                  <span className="text-holo-cyan">+</span>
                </div>
                <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">
                  {s.l}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* --- RIGHT: glass quality card + framework marquee (21st.dev base) --- */}
        <div className="lg:col-span-5 flex flex-col gap-6 lg:mt-6">
          <motion.div
            initial={{ opacity: 0, y: 40, rotateX: 10 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.9, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong holo-border relative overflow-hidden rounded-3xl p-5 shadow-card sm:p-7"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-holo-violet/20 blur-3xl" />
            <div className="relative">
              <div className="mb-7 flex items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-holo shadow-glow-cyan">
                  <Target className="h-6 w-6 text-ink-950" />
                </span>
                <div>
                  <div className="font-display text-3xl font-bold tracking-tight text-white">
                    <Counter to={stats?.total ?? 10000} />
                  </div>
                  <div className="text-sm text-slate-400">Kuratierte Prompts</div>
                </div>
              </div>

              {/* Quality progress bar */}
              <div className="mb-7 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Ø Website-Readiness</span>
                  <span className="font-mono font-medium text-white">
                    {readiness.toFixed(2).replace(".", ",")}/10
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${readinessPct}%` }}
                    transition={{ duration: 1.2, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full bg-holo"
                  />
                </div>
              </div>

              <div className="mb-6 h-px w-full bg-white/10" />

              {/* Mini stat grid */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {miniStats.map((m) => (
                  <div key={m.l} className="flex flex-col items-center">
                    <span className="font-display text-xl font-bold text-white">
                      <Counter to={m.v} />
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      {m.l}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pills */}
              <div className="mt-7 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[10px] tracking-wide text-slate-300">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-holo-mint opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-holo-mint" />
                  </span>
                  SCHEMA-VALIDIERT
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[10px] tracking-wide text-slate-300">
                  <ShieldCheck className="h-3 w-3 text-holo-cyan" />
                  v1.0.0
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[10px] tracking-wide text-slate-300">
                  <Crown className="h-3 w-3 text-holo-magenta" />
                  PREMIUM
                </span>
              </div>
            </div>
          </motion.div>

          {/* Framework marquee */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.6 }}
            className="glass holo-border relative overflow-hidden rounded-3xl py-6"
          >
            <h3 className="kicker mb-4 px-7">Powered by · echte Frameworks</h3>
            <div className="mask-fade-x relative flex overflow-hidden">
              <div className="flex animate-marquee gap-10 whitespace-nowrap px-5">
                {[...frameworks, ...frameworks].map((fw, i) => (
                  <span
                    key={i}
                    className="font-display text-lg font-semibold tracking-tight text-slate-400 transition-colors hover:text-white"
                  >
                    {fw}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
