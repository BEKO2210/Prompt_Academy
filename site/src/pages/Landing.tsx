import { useEffect, useState } from "react";
import type { Stats } from "../lib/data";
import { fetchStats } from "../lib/data";
import { Hero } from "../components/Hero";
import { StatBand } from "../components/StatBand";
import { BentoFeatures } from "../components/BentoFeatures";
import { CategoryShowcase } from "../components/CategoryShowcase";
import { CTASection } from "../components/CTASection";

export function Landing() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    fetchStats()
      .then((s) => alive && setStats(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <Hero stats={stats} />
      <StatBand stats={stats} />
      <BentoFeatures stats={stats} />
      <CategoryShowcase stats={stats} />
      <CTASection />
    </>
  );
}
