import { ArrowRight, AudioLines, Moon, Play, Sun } from 'lucide-react';
import type { Project } from '../../types/schema.ts';
import { cssVars } from '../../utils/cssVars.ts';
import { HeroFragments } from './HeroCanvas.tsx';
import { SplitWords } from './Interactions.tsx';
import LoopSteps from './LoopSteps.tsx';
import VoiceField from './VoiceField.tsx';

/* The landing page around the workspace: top bar, hero, the loop, and the footer. */

export interface SiteHeaderProps {
  activeSection: string | undefined;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onStartDemo: () => void;
}

export function SiteHeader({ activeSection, theme, onToggleTheme, onStartDemo }: SiteHeaderProps) {
  return (
    <header className="va-topbar">
      <a className="va-brand" href="#top" aria-label="VoiceArchitect home">
        <span className="va-brand-mark"><AudioLines size={18} /></span>
        <b>VoiceArchitect</b>
      </a>
      <nav className="va-nav" aria-label="Page sections">
        <a href="#how" aria-current={activeSection === 'how' ? 'true' : undefined}>How it works</a>
        <a href="#workspace" aria-current={activeSection === 'workspace' ? 'true' : undefined}>Workspace</a>
      </nav>
      <div className="va-topbar-actions">
        <button
          type="button"
          className="va-btn va-btn-ghost va-btn-icon"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" className="va-btn va-btn-primary va-topbar-demo" onClick={onStartDemo}>
          <Play size={14} /> Guided demo
        </button>
      </div>
    </header>
  );
}

export interface HeroProps {
  project: Project | null;
  onStartDemo: () => void;
}

export function Hero({ project, onStartDemo }: HeroProps) {
  return (
    <section className="va-hero va-hero-canvas va-hero-simple" id="top" aria-labelledby="va-hero-title">
      <span className="va-canvas-grid" aria-hidden="true" />
      <VoiceField />
      <HeroFragments project={project} />

      <div className="va-canvas-center">
        <p className="va-hero-eyebrow" data-reveal>
          <span className="va-live-dot" aria-hidden="true" /> Built for Wispr Flow · English and Hinglish
        </p>
        <h1 id="va-hero-title" className="va-display" data-reveal>
          <SplitWords text="Say the change." />
          <SplitWords text="See what it touches." offset={3} className="va-display-serif" />
        </h1>
        <p className="va-hero-description" data-reveal style={cssVars({ '--d': 4 })}>
          Speak a change to your architecture with Wispr Flow, in English or Hinglish. Review the exact diff before
          anything applies, then check the diagram against your docker-compose file.
        </p>
        <div className="va-hero-actions" data-reveal style={cssVars({ '--d': 5 })}>
          <button type="button" className="va-btn va-btn-primary va-btn-lg" onClick={onStartDemo}>
            <Play size={16} /> Start guided demo
          </button>
          <a className="va-btn va-btn-lg" href="#workspace">
            Use my own stack <ArrowRight size={16} />
          </a>
        </div>
        <p className="va-hero-note" data-reveal style={cssVars({ '--d': 6 })}>
          No sign-in. Three steps: an English change, a Hinglish change, and a check against newer code.
        </p>
      </div>
    </section>
  );
}

export function LoopSection() {
  return (
    <section className="va-section va-loop" id="how" aria-labelledby="va-how-title">
      <div className="va-section-inner">
        <h2 id="va-how-title" className="va-section-title" data-reveal style={cssVars({ '--d': 1 })}>
          One loop, <em>by voice</em>
        </h2>
        <LoopSteps />
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="va-footer va-footer-simple">
      <span className="va-footer-brand"><AudioLines size={14} /> VoiceArchitect</span>
      <span>Architecture docs that stay true to the code. Nothing changes without your review.</span>
    </footer>
  );
}
