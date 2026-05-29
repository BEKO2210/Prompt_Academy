import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "ghost" | "glass";

interface BaseProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}
interface AsLink extends BaseProps {
  to: string;
  href?: never;
  onClick?: never;
}
interface AsAnchor extends BaseProps {
  href: string;
  to?: never;
  onClick?: never;
}
interface AsButton extends BaseProps {
  onClick: () => void;
  to?: never;
  href?: never;
}
type ButtonProps = AsLink | AsAnchor | AsButton;

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-holo bg-[length:200%_auto] text-ink-950 font-semibold shadow-glow hover:bg-[position:100%] hover:shadow-glow-lg",
  ghost:
    "border border-white/15 text-slate-100 hover:border-white/30 hover:bg-white/5",
  glass: "glass text-slate-100 hover:bg-white/10",
};

/** Cinematic button — renders Link / anchor / button by props. */
export function Button(props: ButtonProps) {
  const { children, variant = "primary", className } = props;
  const classes = cn(
    "group inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-6 text-sm transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-holo-cyan/70",
    VARIANTS[variant],
    className,
  );

  if ("to" in props && props.to) {
    return (
      <Link to={props.to} className={classes}>
        {children}
      </Link>
    );
  }
  if ("href" in props && props.href) {
    return (
      <a href={props.href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={(props as AsButton).onClick}
      className={classes}
    >
      {children}
    </button>
  );
}
