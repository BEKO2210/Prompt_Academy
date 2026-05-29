/**
 * Fixed, full-viewport cinematic backdrop:
 * drifting aurora blobs + perspective grid + grain + vignette.
 * Rendered once in App, sits behind all content. Animations auto-pause
 * under prefers-reduced-motion (handled globally in index.css).
 */
export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="noise pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-950"
    >
      {/* Flowing grid field */}
      <div
        className="absolute inset-0 animate-grid-pan opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "58px 58px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 80%)",
        }}
      />

      {/* Aurora blobs */}
      <div className="absolute -left-40 -top-48 h-[42rem] w-[42rem] animate-aurora rounded-full bg-holo-violet/25 blur-[130px]" />
      <div className="absolute right-[-10rem] top-1/4 h-[38rem] w-[38rem] animate-aurora-slow rounded-full bg-holo-cyan/20 blur-[130px]" />
      <div className="absolute bottom-[-12rem] left-1/3 h-[34rem] w-[34rem] animate-float rounded-full bg-holo-magenta/20 blur-[150px]" />

      {/* Vignette to anchor content */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(5,6,10,0.85)_88%)]" />
    </div>
  );
}
