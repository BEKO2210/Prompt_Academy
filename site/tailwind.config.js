/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05060A",
          900: "#0A0B12",
          850: "#0E1018",
          800: "#13141F",
          700: "#1B1D2B",
        },
        holo: {
          cyan: "#22D3EE",
          sky: "#38BDF8",
          violet: "#2DD4BF", // teal (kept name for legacy refs — no purple)
          iris: "#5EEAD4", // light teal
          magenta: "#34D399", // emerald (kept name for legacy refs — no purple)
          mint: "#34F5C5",
          amber: "#FBBF24", // warm accent
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      maxWidth: {
        container: "1240px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 40px -8px rgba(45,212,191,0.35)",
        "glow-cyan": "0 0 40px -6px rgba(34,211,238,0.45)",
        "glow-lg": "0 0 80px -10px rgba(45,212,191,0.5)",
        card: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 20px 60px -20px rgba(0,0,0,0.7)",
      },
      backgroundImage: {
        holo: "linear-gradient(110deg, #22D3EE 0%, #38BDF8 50%, #34F5C5 100%)",
        "holo-soft":
          "linear-gradient(110deg, rgba(34,211,238,0.18), rgba(56,189,248,0.18), rgba(52,245,197,0.18))",
        "grid-fade": "linear-gradient(to bottom, rgba(5,6,10,0) 0%, #05060A 80%)",
      },
      keyframes: {
        aurora: {
          "0%,100%": { transform: "translate3d(0,0,0) rotate(0deg) scale(1)" },
          "33%": { transform: "translate3d(4%,-3%,0) rotate(8deg) scale(1.1)" },
          "66%": { transform: "translate3d(-3%,4%,0) rotate(-6deg) scale(1.05)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "grid-pan": {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 -800px" },
        },
        "pulse-glow": {
          "0%,100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        "gradient-x": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        aurora: "aurora 22s ease-in-out infinite",
        "aurora-slow": "aurora 34s ease-in-out infinite",
        float: "float 7s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        marquee: "marquee 40s linear infinite",
        "grid-pan": "grid-pan 24s linear infinite",
        "pulse-glow": "pulse-glow 4s ease-in-out infinite",
        "gradient-x": "gradient-x 6s ease infinite",
      },
    },
  },
  plugins: [],
};
