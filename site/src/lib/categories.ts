import {
  LayoutTemplate,
  Boxes,
  LayoutDashboard,
  ShoppingBag,
  User,
  Bot,
  GraduationCap,
  Smartphone,
  Gamepad2,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export interface CategoryMeta {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Tailwind gradient stops (from/to) for accents. */
  gradient: string;
  /** Two hex stops for inline glows / canvas. */
  hex: [string, string];
  tagline: string;
}

/** Visual identity per category. Order is the canonical display order. */
export const CATEGORIES: CategoryMeta[] = [
  {
    key: "landing_pages",
    label: "Landing Pages",
    icon: LayoutTemplate,
    gradient: "from-holo-cyan to-holo-sky",
    hex: ["#22D3EE", "#38BDF8"],
    tagline: "Heroes, SaaS-Homepages, Product-Launches & Conversion-Pages.",
  },
  {
    key: "ui_components",
    label: "UI Components",
    icon: Boxes,
    gradient: "from-holo-violet to-holo-iris",
    hex: ["#8B5CF6", "#A78BFA"],
    tagline: "Navbars, Cards, Modals, Bento-Grids, Forms & mehr.",
  },
  {
    key: "saas_dashboards",
    label: "SaaS Dashboards",
    icon: LayoutDashboard,
    gradient: "from-holo-sky to-holo-violet",
    hex: ["#38BDF8", "#8B5CF6"],
    tagline: "Admin, Analytics, CRM, Finance & AI-Ops Dashboards.",
  },
  {
    key: "ecommerce",
    label: "E-Commerce",
    icon: ShoppingBag,
    gradient: "from-holo-magenta to-holo-violet",
    hex: ["#E879F9", "#8B5CF6"],
    tagline: "Product-Pages, Shops, Checkout-Flows & Marktplätze.",
  },
  {
    key: "portfolio_personal_brand",
    label: "Portfolio & Brand",
    icon: User,
    gradient: "from-holo-mint to-holo-cyan",
    hex: ["#34F5C5", "#22D3EE"],
    tagline: "Developer-, Designer- & Founder-Portfolios.",
  },
  {
    key: "ai_tools_agents",
    label: "AI Tools & Agents",
    icon: Bot,
    gradient: "from-holo-violet to-holo-magenta",
    hex: ["#8B5CF6", "#E879F9"],
    tagline: "Agent-UIs, Chat-Interfaces & Workflow-Builder.",
  },
  {
    key: "education_learning",
    label: "Education & Learning",
    icon: GraduationCap,
    gradient: "from-holo-cyan to-holo-mint",
    hex: ["#22D3EE", "#34F5C5"],
    tagline: "Lernplattformen, Kurse, Quizze & Flashcards.",
  },
  {
    key: "mobile_apps",
    label: "Mobile Apps",
    icon: Smartphone,
    gradient: "from-holo-iris to-holo-magenta",
    hex: ["#A78BFA", "#E879F9"],
    tagline: "Onboarding, Tracker, Finance, Fitness & AI-Companions.",
  },
  {
    key: "games_interactive",
    label: "Games & Interactive",
    icon: Gamepad2,
    gradient: "from-holo-magenta to-holo-cyan",
    hex: ["#E879F9", "#22D3EE"],
    tagline: "Game-Landings, HUDs, Idle-Games & gamified Apps.",
  },
  {
    key: "data_visualization",
    label: "Data Visualization",
    icon: BarChart3,
    gradient: "from-holo-sky to-holo-mint",
    hex: ["#38BDF8", "#34F5C5"],
    tagline: "Charts, Infografiken, Maps, KPI-Boards & Timelines.",
  },
];

export const CATEGORY_MAP: Record<string, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
);

export function categoryMeta(key: string): CategoryMeta {
  return CATEGORY_MAP[key] ?? CATEGORIES[0];
}
