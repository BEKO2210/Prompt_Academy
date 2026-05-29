import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Reveal } from "./Reveal";

interface Props {
  kicker?: string;
  title: ReactNode;
  sub?: ReactNode;
  center?: boolean;
  className?: string;
}

export function SectionHeading({ kicker, title, sub, center, className }: Props) {
  return (
    <Reveal className={cn(center && "mx-auto text-center", "max-w-2xl", className)}>
      {kicker && <span className="kicker">{kicker}</span>}
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.05]">
        {title}
      </h2>
      {sub && (
        <p className="mt-4 text-lg leading-relaxed text-slate-400">{sub}</p>
      )}
    </Reveal>
  );
}
