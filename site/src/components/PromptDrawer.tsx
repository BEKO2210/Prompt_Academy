// PromptDrawer — slide-in detail panel showing the full prompt record.
// Glass + holo language from 21st.dev, wired to fetchPromptById.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Ban, ListChecks, Palette, Cpu } from "lucide-react";
import type { IndexItem, FullPrompt } from "../lib/data";
import { fetchPromptById } from "../lib/data";
import { categoryMeta } from "../lib/categories";
import { difficultyMeta, humanize } from "../lib/format";
import { useClipboard } from "../lib/useClipboard";
import { setScrollLock } from "../lib/useLenis";
import { cn } from "../lib/cn";

interface Props {
  item: IndexItem | null;
  onClose: () => void;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export function PromptDrawer({ item, onClose }: Props) {
  const [full, setFull] = useState<FullPrompt | null>(null);
  const [loading, setLoading] = useState(false);
  const { copied, copy } = useClipboard();

  useEffect(() => {
    if (!item) return;
    setFull(null);
    setLoading(true);
    let alive = true;
    fetchPromptById(item.id)
      .then((p) => alive && setFull(p))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [item]);

  // Close on Escape + lock scroll (pauses Lenis so the background stays put)
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    setScrollLock(true);
    return () => {
      window.removeEventListener("keydown", onKey);
      setScrollLock(false);
    };
  }, [item, onClose]);

  const cat = item ? categoryMeta(item.c) : null;
  const diff = item ? difficultyMeta(item.d) : null;

  return createPortal(
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-ink-950/85 backdrop-blur-2xl"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 32 }}
            className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-xl flex-col border-l border-white/10 bg-ink-950/95 backdrop-blur-2xl shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.8)]"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {cat && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.hex[0] }} />
                      {cat.label}
                    </span>
                  )}
                  {diff && (
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", diff.className)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", diff.dot)} />
                      {diff.label}
                    </span>
                  )}
                  {item.lang && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase text-slate-400">
                      {item.lang}
                    </span>
                  )}
                </div>
                <h2 className="mt-3 font-display text-xl font-bold leading-tight text-white">
                  {item.t}
                </h2>
                {item.sc && (
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {humanize(item.sc)}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Schließen"
                onClick={onClose}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body — data-lenis-prevent lets the mouse wheel scroll the drawer
                natively while Lenis keeps the page behind locked. */}
            <div data-lenis-prevent className="flex-1 overflow-y-auto overscroll-contain p-6">
              {loading && (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="h-4 animate-pulse rounded bg-white/5"
                      style={{ width: `${90 - i * 8}%` }}
                    />
                  ))}
                </div>
              )}

              {!loading && full && (
                <>
                  <p className="text-sm leading-relaxed text-slate-300">
                    {full.website_card?.summary || item.sum}
                  </p>

                  <Section
                    icon={<Cpu className="h-3.5 w-3.5 text-holo-cyan" />}
                    title="Tech Stack"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        full.tech_stack.framework,
                        full.tech_stack.language,
                        full.tech_stack.styling,
                        full.tech_stack.animation,
                        ...(full.tech_stack.optional_libraries ?? []),
                      ]
                        .filter(Boolean)
                        .map((t, i) => (
                          <span
                            key={`${t}-${i}`}
                            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-300"
                          >
                            {t}
                          </span>
                        ))}
                    </div>
                  </Section>

                  <Section
                    icon={<Palette className="h-3.5 w-3.5 text-holo-violet" />}
                    title="Visual Style"
                  >
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {[
                        ["Visual", full.style.visual_style],
                        ["Layout", full.style.layout_style],
                        ["Farben", full.style.color_direction],
                        ["Motion", full.style.motion_style],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
                          <div className="mt-0.5 text-slate-300">{v}</div>
                        </div>
                      ))}
                    </div>
                  </Section>

                  {/* Prompt */}
                  <Section
                    icon={<span className="font-mono text-holo-mint">{">_"}</span>}
                    title="Prompt"
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => copy(full.prompt)}
                        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-900/80 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-holo-mint" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "Kopiert" : "Kopieren"}
                      </button>
                      <pre className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-ink-950/70 p-4 pr-24 font-mono text-[13px] leading-relaxed text-slate-300 whitespace-pre-wrap">
                        {full.prompt}
                      </pre>
                    </div>
                  </Section>

                  {full.negative_prompt && (
                    <Section
                      icon={<Ban className="h-3.5 w-3.5 text-holo-magenta" />}
                      title="Negative Prompt"
                    >
                      <p className="rounded-xl border border-holo-magenta/20 bg-holo-magenta/5 p-3 font-mono text-[12px] leading-relaxed text-slate-400">
                        {full.negative_prompt}
                      </p>
                    </Section>
                  )}

                  {full.acceptance_criteria?.length > 0 && (
                    <Section
                      icon={<ListChecks className="h-3.5 w-3.5 text-holo-mint" />}
                      title="Acceptance Criteria"
                    >
                      <ul className="space-y-2">
                        {full.acceptance_criteria.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-holo-mint" />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {full.tags?.length > 0 && (
                    <Section icon={<span className="text-holo-cyan">#</span>} title="Tags">
                      <div className="flex flex-wrap gap-1.5">
                        {full.tags.map((t) => (
                          <span key={t} className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Quality */}
                  <Section icon={<span className="text-holo-cyan">★</span>} title="Quality Scores">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["Specificity", full.quality.specificity_score],
                        ["Originality", full.quality.originality_score],
                        ["Clarity", full.quality.implementation_clarity_score],
                        ["Readiness", full.quality.website_readiness_score],
                      ].map(([k, v]) => (
                        <div key={k as string} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                          <span className="text-xs text-slate-400">{k}</span>
                          <span className="font-mono text-sm text-holo-cyan">{(v as number).toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </Section>

                  <div className="mt-6 font-mono text-[10px] text-slate-600">
                    {full.id} · v{full.version} · {full.batch}
                  </div>
                </>
              )}

              {!loading && !full && (
                <p className="text-sm text-slate-500">
                  Details konnten nicht geladen werden.
                </p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
