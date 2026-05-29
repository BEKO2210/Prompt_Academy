# Prompt Library 10000 — Design System ("NEXUS")

Cinematic, futuristic, holographic dark-mode showcase for a 10,000-prompt dataset.
Stack: Vite + React + TypeScript + Tailwind CSS v3 + Framer Motion + Lenis.

## Palette (dark, deep-space + holographic)
- Background ink: `#05060A` (base) · `#0A0B12` · `#0E1018` (surface) · `#13141F` (raised)
- Holographic accents: cyan `#22D3EE` → sky `#38BDF8` → violet `#8B5CF6` → iris `#A78BFA` → magenta `#E879F9` → mint `#34F5C5`
- Text: headings `#F8FAFC`, body `#CBD5E1`, muted `#7C8598`, faint `#4B5468`
- Hairlines: `rgba(255,255,255,0.08)`
- Signature gradient (`holo-text`, buttons, glows): `linear-gradient(110deg,#22D3EE,#8B5CF6,#E879F9)`

## Typography
- Display / headings: **Space Grotesk** (600/700) — tech, futuristic
- Body / UI: **Inter** (400/500/600)
- Mono (prompt text, IDs, tags, code): **JetBrains Mono** (400/500)
- Big type, tight tracking on display; line-height 1.6 on body; line-length ≤ 75ch.

## Motion language (cinematic)
- Lenis smooth scroll; scroll-triggered staggered reveals (whileInView, once).
- Springs for cards (stiffness ~120, damping ~18); magnetic CTA; 3D tilt on hover.
- Parallax aurora background; animated grid field; grain overlay; scan-line shimmer.
- Durations: micro 150–250ms, section reveals 500–800ms. ALWAYS respect `prefers-reduced-motion`.

## Sections / components
**Landing:** Navbar · Cinematic Hero (aurora + holo headline + live counter + floating prompt ticker) · Stat band (animated counters from real stats.json) · Bento feature grid · Category showcase (10 cinematic cards) · Tech marquee (real frameworks + animation libs) · Explorer teaser/CTA · Footer.
**Library (explorer):** command-bar search · filter chips (category / difficulty / framework / language / audience) · sort · virtualized responsive prompt-card grid · result counter · prompt detail drawer (full prompt, negative_prompt, acceptance_criteria, style, tech_stack, tags, quality, copy).

## 21st.dev (Phase 1, after Claude Code restart)
These component "slots" are baseline-built in Phase 0 and to be upgraded via the `magic` MCP:
`Navbar`, `Hero`, `BentoFeatures`, `PromptCard`, `StatBand`, `CTASection`, `Footer`.
Generation prompts must pass this palette + Space Grotesk/Inter/JetBrains Mono + Framer Motion + holographic/glass aesthetic so output matches the system.

## Data
`public/data/index.json` (compact, 10k, lazy on /library) · `category/<cat>.json` (full records, lazy for detail) · `stats.json` + `meta.json` (tiny, used on landing). Built by `npm run data` from `../data/*.jsonl`.
