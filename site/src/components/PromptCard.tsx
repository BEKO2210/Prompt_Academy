// PromptCard — explorer grid card. Built on the 21st.dev glass-card + badge/hover
// language (corner accents, holo-border glow) and wired to the IndexItem dataset shape.
import { memo } from "react";
import { motion } from "framer-motion";
import { Copy, Check, ArrowUpRight } from "lucide-react";
import type { IndexItem } from "../lib/data";
import { categoryMeta } from "../lib/categories";
import { difficultyMeta, humanize } from "../lib/format";
import { useClipboard } from "../lib/useClipboard";
import { cn } from "../lib/cn";

interface Props {
  item: IndexItem;
  onOpen: (item: IndexItem) => void;
}

function PromptCardBase({ item, onOpen }: Props) {
  const cat = categoryMeta(item.c);
  const diff = difficultyMeta(item.d);
  const { copied, copy } = useClipboard();
  const Icon = cat.icon;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => onOpen(item)}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-card"
    >
      {/* hover glow */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-50"
        style={{ background: `radial-gradient(circle, ${cat.hex[0]}, transparent 70%)` }}
      />

      <div className="relative flex flex-1 flex-col">
        {/* top row: category badge + difficulty */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: cat.hex[0] }}
            />
            {cat.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              diff.className,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", diff.dot)} />
            {diff.label}
          </span>
        </div>

        {/* title */}
        <h3 className="mt-4 line-clamp-2 font-display text-base font-semibold leading-snug text-white">
          {item.t}
        </h3>

        {/* headline / summary */}
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-400">
          {item.hl || item.sum}
        </p>

        {/* tags */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-slate-400"
            >
              {humanize(t)}
            </span>
          ))}
        </div>

        {/* footer */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-5">
          <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-slate-500">
            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: cat.hex[0] }} />
            <span className="truncate">{item.fw}</span>
            {item.q != null && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-holo-cyan">{item.q.toFixed(1)}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Vorschau-Label kopieren"
              onClick={(e) => {
                e.stopPropagation();
                copy(item.pl || item.t);
              }}
              className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-slate-400 opacity-0 transition-all duration-200 hover:bg-white/10 hover:text-white group-hover:opacity-100"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-holo-mint" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <span className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition-colors group-hover:text-white">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export const PromptCard = memo(PromptCardBase);
