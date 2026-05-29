// BentoFeatures — asymmetric bento grid sourced from 21st.dev ("Bento Product Features")
// and adapted to the NEXUS design system + real dataset facts.
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Gauge,
  Boxes,
  Copy,
  Layers,
  Sparkles,
} from "lucide-react";
import type { Stats } from "../lib/data";
import { Counter } from "./Counter";
import { SectionHeading } from "./SectionHeading";

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 18 },
  },
};

function Cell({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div variants={item} className={className}>
      <div className="glass holo-border group relative flex h-full flex-col overflow-hidden rounded-3xl p-6 transition-transform duration-300 hover:-translate-y-1">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-holo-violet/10 blur-3xl transition-opacity duration-300 group-hover:opacity-100 opacity-60" />
        <div className="relative flex h-full flex-col">{children}</div>
      </div>
    </motion.div>
  );
}

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span className="mb-4 grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-holo-cyan">
      {children}
    </span>
  );
}

export function BentoFeatures({ stats }: { stats: Stats | null }) {
  const readiness = stats?.avgWebsiteReadiness ?? 9.06;
  const frameworks = stats?.distinctFrameworks ?? 18;
  const subcats = stats?.distinctSubcategories ?? 200;
  const industries = stats?.distinctIndustries ?? 65;
  const styles = stats?.distinctVisualStyles ?? 319;

  return (
    <section id="features" className="container-px py-20 sm:py-28">
      <SectionHeading
        center
        kicker="Warum diese Bibliothek"
        title={
          <>
            Nicht nur Prompts — ein{" "}
            <span className="holo-text">kuratiertes System</span>.
          </>
        }
        sub="Jeder einzelne Prompt ist strukturiert, validiert und qualitätsbewertet — bereit für den Produktionseinsatz."
      />

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="mt-12 grid auto-rows-[minmax(150px,auto)] grid-cols-1 gap-5 md:grid-cols-3 md:grid-rows-3"
      >
        {/* Tall feature */}
        <Cell className="md:col-span-1 md:row-span-3">
          <IconBadge>
            <ShieldCheck className="h-5 w-5" />
          </IconBadge>
          <h3 className="font-display text-xl font-semibold text-white">
            Schema-validiert
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Jeder Prompt folgt einem strikten JSON-Schema — mit{" "}
            <span className="text-slate-200">prompt</span>,{" "}
            <span className="text-slate-200">negative_prompt</span>,{" "}
            <span className="text-slate-200">acceptance_criteria</span>,
            tech_stack und style. Konsistent, parsebar, automatisierbar.
          </p>
          <div className="mt-auto space-y-2 pt-6">
            {[
              "version · slug · language",
              "tech_stack · style · tags",
              "acceptance_criteria[]",
              "quality scores",
            ].map((f) => (
              <div
                key={f}
                className="flex items-center gap-2 font-mono text-xs text-slate-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-holo-mint" />
                {f}
              </div>
            ))}
          </div>
        </Cell>

        {/* Quality */}
        <Cell className="md:col-span-1 md:row-span-1">
          <IconBadge>
            <Gauge className="h-5 w-5" />
          </IconBadge>
          <h3 className="font-display text-base font-semibold text-white">
            Qualitätsbewertet
          </h3>
          <div className="mt-auto flex items-end gap-1">
            <span className="font-display text-4xl font-bold text-white">
              <Counter to={readiness} decimals={2} />
            </span>
            <span className="mb-1 font-mono text-sm text-holo-cyan">/10</span>
          </div>
          <p className="text-xs text-slate-500">Ø Website-Readiness</p>
        </Cell>

        {/* Big statistic */}
        <Cell className="md:col-span-1 md:row-span-1">
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />
          <div className="relative flex h-full flex-col items-center justify-center text-center">
            <span className="holo-text font-display text-5xl font-bold sm:text-6xl">
              <Counter to={stats?.total ?? 10000} />
            </span>
            <span className="mt-1 text-xs uppercase tracking-wider text-slate-500">
              Prompts insgesamt
            </span>
          </div>
        </Cell>

        {/* Frameworks */}
        <Cell className="md:col-span-1 md:row-span-1">
          <IconBadge>
            <Boxes className="h-5 w-5" />
          </IconBadge>
          <h3 className="font-display text-base font-semibold text-white">
            <Counter to={frameworks} /> Frameworks
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            React, Vue, Svelte, Next.js, Angular, SwiftUI, Flutter & mehr.
          </p>
        </Cell>

        {/* Copy ready */}
        <Cell className="md:col-span-1 md:row-span-1">
          <IconBadge>
            <Copy className="h-5 w-5" />
          </IconBadge>
          <h3 className="font-display text-base font-semibold text-white">
            Copy-Ready
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Ein Klick — vollständiger Prompt im Clipboard. Direkt in dein
            LLM oder deinen Editor.
          </p>
        </Cell>

        {/* Wide */}
        <Cell className="md:col-span-2 md:row-span-1">
          <div className="flex h-full flex-wrap items-center justify-between gap-6">
            <div>
              <IconBadge>
                <Layers className="h-5 w-5" />
              </IconBadge>
              <h3 className="font-display text-base font-semibold text-white">
                Breite & Tiefe
              </h3>
              <p className="mt-1 max-w-xs text-sm text-slate-400">
                10 Kategorien, {subcats} Subkategorien, {industries} Industries
                und {styles} visuelle Stile — von Landing Pages bis Data-Viz.
              </p>
            </div>
            <div className="flex gap-6">
              {[
                { v: 10, l: "Kategorien" },
                { v: subcats, l: "Subkat." },
                { v: industries, l: "Industries" },
              ].map((s) => (
                <div key={s.l} className="text-center">
                  <div className="font-display text-2xl font-bold text-white">
                    <Counter to={s.v} />
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <Sparkles className="h-3 w-3 text-holo-violet" />
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Cell>
      </motion.div>
    </section>
  );
}
