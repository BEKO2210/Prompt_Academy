// CTASection — final call-to-action. Built on the 21st.dev glass-panel + glow CTA
// language, adapted to the NEXUS holographic system.
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "./ui/Button";

export function CTASection() {
  return (
    <section className="container-px py-20 sm:py-28">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="glass-strong holo-border relative overflow-hidden rounded-[2rem] px-6 py-16 text-center sm:px-16 sm:py-20"
      >
        {/* Aurora glow + grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 50%, #000 20%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 50% 50%, #000 20%, transparent 75%)",
          }}
        />
        <div className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 animate-aurora rounded-full bg-holo-cyan/20 blur-[110px]" />
        <div className="pointer-events-none absolute -right-24 top-1/2 h-72 w-72 -translate-y-1/2 animate-aurora-slow rounded-full bg-holo-magenta/20 blur-[110px]" />

        <div className="relative mx-auto max-w-2xl">
          <span className="chip holo-border mx-auto w-fit bg-white/5">
            <Sparkles className="h-3.5 w-3.5 text-holo-cyan" />
            <span className="font-mono text-[11px] tracking-wider text-slate-300">
              10.000 PROMPTS · SOFORT EINSATZBEREIT
            </span>
          </span>

          <h2 className="mt-6 text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Bereit, deine nächste{" "}
            <span className="holo-text-anim text-glow">Oberfläche</span> zu
            generieren?
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            Durchsuche, filtere und kopiere production-ready Prompts in Sekunden.
            Keine Anmeldung, kein Setup — nur die Bibliothek.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button to="/library" className="h-12 px-8 text-base">
              Bibliothek öffnen
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
            <Button href="#categories" variant="ghost" className="h-12 px-8 text-base">
              Kategorien durchstöbern
            </Button>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
