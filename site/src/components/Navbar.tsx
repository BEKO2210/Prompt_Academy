// Phase-0 baseline navbar — to be upgraded via 21st.dev magic MCP (Phase 1).
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";

const LINKS = [
  { label: "Kategorien", href: "/#categories" },
  { label: "Features", href: "/#features" },
  { label: "Tech", href: "/#tech" },
  { label: "Bibliothek", to: "/library" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      {/* Blurred backdrop so page content scrolling under the header stays
          legible (no text-over-text). Fades out toward the bottom. */}
      <div
        aria-hidden
        className="mask-fade-b pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink-950/70 to-transparent backdrop-blur-md"
      />
      <motion.nav
        initial={{ y: -28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "flex w-full max-w-container items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-300",
          scrolled ? "glass-strong shadow-card" : "border border-transparent",
        )}
      >
        <Link to="/" className="group flex items-center" aria-label="Prompt Library 10000 — Startseite">
          <img
            src={`${import.meta.env.BASE_URL}brand-logo.png`}
            alt="Prompt Library 10000"
            className="h-10 w-auto transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) =>
            l.to ? (
              <Link
                key={l.label}
                to={l.to}
                className="rounded-full px-3.5 py-2 text-sm text-slate-300 transition-colors duration-200 hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.label}
                href={l.href}
                className="rounded-full px-3.5 py-2 text-sm text-slate-300 transition-colors duration-200 hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </a>
            ),
          )}
        </div>

        <div className="hidden md:block">
          <Button to="/library" className="h-9 px-4">
            Explore
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label={open ? "Menü schließen" : "Menü öffnen"}
          onClick={() => setOpen((o) => !o)}
          className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-white/10 text-slate-200 md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </motion.nav>

      {/* Mobile sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="glass-strong absolute inset-x-4 top-20 z-50 rounded-2xl p-3 md:hidden"
          >
            {LINKS.map((l) =>
              l.to ? (
                <Link
                  key={l.label}
                  to={l.to}
                  className="block rounded-xl px-4 py-3 text-sm text-slate-200 hover:bg-white/5"
                >
                  {l.label}
                </Link>
              ) : (
                <a
                  key={l.label}
                  href={l.href}
                  className="block rounded-xl px-4 py-3 text-sm text-slate-200 hover:bg-white/5"
                >
                  {l.label}
                </a>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
