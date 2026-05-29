import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AuroraBackground } from "./components/fx/AuroraBackground";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { useSmoothScroll, scrollToTop, scrollToHash } from "./lib/useLenis";

export default function App() {
  const { hash, pathname } = useLocation();
  useSmoothScroll();

  // On navigation: jump to an in-page anchor (/#categories) if present,
  // otherwise always start the new page at the top. scrollToHash retries for a
  // few frames so it works even when arriving from another route (e.g.
  // /library → /#categories), where the target isn't mounted on the first tick.
  useEffect(() => {
    if (hash) {
      scrollToHash(hash);
      return;
    }
    scrollToTop();
  }, [hash, pathname]);

  return (
    <div className="relative min-h-screen w-full overflow-x-clip">
      <AuroraBackground />
      <Navbar />
      <main className="relative z-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
