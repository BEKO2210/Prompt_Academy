import { useEffect } from "react";
import { Outlet, useLocation, ScrollRestoration } from "react-router-dom";
import { AuroraBackground } from "./components/fx/AuroraBackground";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { useSmoothScroll } from "./lib/useLenis";

export default function App() {
  const { hash, pathname } = useLocation();
  useSmoothScroll();

  // Scroll to in-page anchors (e.g. /#categories)
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }, [hash, pathname]);

  return (
    <div className="relative min-h-screen">
      <AuroraBackground />
      <Navbar />
      <main className="relative z-10">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
