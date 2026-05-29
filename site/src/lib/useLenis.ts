import { useEffect } from "react";
import Lenis from "lenis";

// Active Lenis instance, so overlays (e.g. the prompt drawer) can pause it.
let activeLenis: Lenis | null = null;

/** Cinematic smooth scrolling. Auto-disabled when prefers-reduced-motion. */
export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    activeLenis = lenis;

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      if (activeLenis === lenis) activeLenis = null;
    };
  }, [enabled]);
}

/** Jump to the top of the page (Lenis-aware), e.g. on route change. */
export function scrollToTop() {
  if (activeLenis) activeLenis.scrollTo(0, { immediate: true });
  else if (typeof window !== "undefined") window.scrollTo(0, 0);
}

/** Lock/unlock page scroll — pauses Lenis (which bypasses body overflow) AND
 *  native scroll, so background content stays put behind modals/drawers. */
export function setScrollLock(locked: boolean) {
  if (activeLenis) {
    if (locked) activeLenis.stop();
    else activeLenis.start();
  }
  if (typeof document !== "undefined") {
    document.body.style.overflow = locked ? "hidden" : "";
  }
}
