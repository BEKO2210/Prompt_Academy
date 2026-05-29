import type { Difficulty } from "./data";

/** snake_case / kebab → Title Case. */
export function humanize(input: string): string {
  if (!input) return "";
  return input
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatNumber(n: number): string {
  return n.toLocaleString("de-DE");
}

export interface DifficultyMeta {
  label: string;
  /** chip classes */
  className: string;
  dot: string;
}

export const DIFFICULTY: Record<Difficulty, DifficultyMeta> = {
  beginner: {
    label: "Beginner",
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  intermediate: {
    label: "Intermediate",
    className: "border-holo-sky/30 bg-holo-sky/10 text-holo-sky",
    dot: "bg-holo-sky",
  },
  advanced: {
    label: "Advanced",
    className: "border-holo-violet/30 bg-holo-violet/10 text-holo-iris",
    dot: "bg-holo-violet",
  },
  expert: {
    label: "Expert",
    className: "border-holo-magenta/30 bg-holo-magenta/10 text-holo-magenta",
    dot: "bg-holo-magenta",
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
];

export function difficultyMeta(d: Difficulty): DifficultyMeta {
  return DIFFICULTY[d] ?? DIFFICULTY.intermediate;
}
