import { Faq } from "./components/Faq";
import { Audiences, Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { MacSetup } from "./components/MacSetup";
import { Platforms } from "./components/Platforms";
import { useThemeSync } from "./hooks";

export function App() {
  useThemeSync();

  return (
    <div id="top" className="min-h-dvh overflow-x-clip">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Features />
        <Audiences />
        <HowItWorks />
        <MacSetup />
        <Platforms />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
