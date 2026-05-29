import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

interface CounterProps {
  to: number;
  duration?: number;
  /** Fixed decimal places (e.g. 2 → "9,06"). Omit for integer grouping. */
  decimals?: number;
  /** Format the value for display. Overrides default formatting. */
  format?: (v: number) => string;
  className?: string;
}

/** Animated number that counts up once it scrolls into view. */
export function Counter({
  to,
  duration = 1.8,
  decimals,
  format,
  className,
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Negative margin only on the bottom edge. A symmetric "-60px" also insets the
  // left/right edges, which created a dead zone: the observed span initially holds
  // just "0" (a few px wide), so left-column counters near the viewport edge never
  // intersected and stayed stuck at 0 on mobile. Bottom-only avoids that.
  const inView = useInView(ref, { once: true, margin: "0px 0px -80px 0px" });
  const reduce = useReducedMotion();
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setVal(to);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, to, duration, reduce]);

  let text: string;
  if (format) {
    text = format(decimals != null ? val : Math.round(val));
  } else if (decimals != null) {
    text = val.toFixed(decimals).replace(".", ",");
  } else {
    text = Math.round(val).toLocaleString("de-DE");
  }
  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
