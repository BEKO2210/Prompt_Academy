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

/** Smooth-scroll to an in-page anchor (Lenis-aware). Retries for a few frames
 *  so it still works right after a route change, when the target section may
 *  not be mounted yet (e.g. /library → /#categories). The loop self-terminates
 *  once the element is found or the retry budget runs out. */
export function scrollToHash(hash: string, offset = -80) {
  if (typeof document === "undefined") return;
  let tries = 0;
  const tick = () => {
    const el = document.querySelector(hash);
    if (el) {
      if (activeLenis) activeLenis.scrollTo(el as HTMLElement, { offset });
      else el.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (tries++ < 40) requestAnimationFrame(tick); // ~0.65s budget
  };
  requestAnimationFrame(tick);
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
