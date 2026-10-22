import { SiteHeader, Hero, LoopSection, OwnStackSection, SiteFooter } from './components/landing/LandingSections.tsx';
import { useTheme } from './hooks/useTheme.ts';
import { useRevealOnScroll } from './hooks/useMotion.ts';
import { useScrollSpy } from './hooks/useScrollSpy.ts';

const NAV_SECTIONS = ['how', 'own-stack'];

/** The landing page at "/": the problem, the loop, and the way into the workspace at /app. */
export default function Landing() {
  const { theme, toggleTheme } = useTheme();
  useRevealOnScroll();
  const activeSection = useScrollSpy(NAV_SECTIONS);
  return (
    <div className="va-app va-landing">
      <SiteHeader activeSection={activeSection} theme={theme} onToggleTheme={toggleTheme} />
      <main id="main">
        <Hero />
        <LoopSection />
        <OwnStackSection />
      </main>
      <SiteFooter />
    </div>
  );
}
