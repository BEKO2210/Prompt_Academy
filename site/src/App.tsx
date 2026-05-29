import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AuroraBackground } from "./components/fx/AuroraBackground";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { useSmoothScroll, scrollToTop } from "./lib/useLenis";

export default function App() {
  const { hash, pathname } = useLocation();
  useSmoothScroll();

  // On navigation: jump to an in-page anchor (/#categories) if present,
  // otherwise always start the new page at the top.
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    scrollToTop();
  }, [hash, pathname]);

  return (
    <div className="relative min-h-screen">
      <AuroraBackground />
      <Navbar />
      <main className="relative z-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
