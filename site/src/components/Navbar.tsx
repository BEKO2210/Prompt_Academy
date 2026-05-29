// Phase-0 baseline navbar — to be upgraded via 21st.dev magic MCP (Phase 1).
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import { setScrollLock } from "../lib/useLenis";

// Each link is either an in-page section (hash, lives on "/") or a route (to).
// Hash links MUST go through React Router (Link `to`) so the app's basename
// (/Prompt_Academy/ on GitHub Pages) is preserved — a plain <a href="/#x">
// navigates to the domain root and unloads the SPA.
type NavLink = { label: string; hash?: string; to?: string };
const LINKS: NavLink[] = [
  { label: "Kategorien", hash: "#categories" },
  { label: "Features", hash: "#features" },
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

  // Lock background scroll while the mobile sheet is open.
  useEffect(() => {
    setScrollLock(open);
    return () => setScrollLock(false);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      {/* Frosted backdrop: everything scrolling behind the header is strongly
          blurred (no readable text-over-text). Fades out toward the bottom. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-ink-950/85 via-ink-950/50 to-transparent backdrop-blur-2xl [mask-image:linear-gradient(to_bottom,#000_0%,#000_62%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_62%,transparent_100%)]"
      />
      <motion.nav
        initial={{ y: -28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "relative z-10 flex w-full max-w-container items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-300",
          // Solid, crisp bar when scrolled — the blur affects the background
          // BEHIND the header, never the header itself.
          scrolled
            ? "border border-white/10 bg-ink-900/95 shadow-card"
            : "border border-transparent",
        )}
      >
        {/* The link keeps a 40px layout height (h-10), so the header bar does
            NOT grow taller or wider. The logo itself is rendered 40% larger
            (h-14 = 56px) and centered, overflowing symmetrically into the bar's
            existing vertical padding. */}
        <Link to="/" className="group flex h-10 items-center" aria-label="Prompt Library 10000 — Startseite">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Prompt Library 10000"
            className="block h-14 w-auto shrink-0 transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              to={l.to ?? `/${l.hash}`}
              className="rounded-full px-3.5 py-2 text-sm text-slate-300 transition-colors duration-200 hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
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

      {/* Mobile sheet + full-screen backdrop. The backdrop dims and blurs the
          whole page behind, and the sheet itself is fully opaque, so the menu
          text is never overlaid by page content showing through. */}
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Menü schließen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-0 cursor-default bg-ink-950/80 backdrop-blur-xl md:hidden"
            />
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-x-4 top-20 z-50 overflow-hidden rounded-2xl border border-white/10 bg-ink-900 p-3 shadow-card md:hidden"
            >
              {LINKS.map((l) => (
                <Link
                  key={l.label}
                  to={l.to ?? `/${l.hash}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-3 text-base font-medium text-slate-200 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-2 border-t border-white/10 pt-3">
                <Link
                  to="/library"
                  onClick={() => setOpen(false)}
                  className="group inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-holo bg-[length:200%_auto] px-6 text-sm font-semibold text-ink-950 shadow-glow transition-all duration-300 hover:bg-[position:100%] hover:shadow-glow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-holo-cyan/70"
                >
                  Explore
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
