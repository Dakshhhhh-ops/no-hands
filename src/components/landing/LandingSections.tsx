import { ArrowRight, AudioLines, FileCode2, Moon, Play, Sun } from 'lucide-react';
import { Link } from '../../router.ts';
import { cssVars } from '../../utils/cssVars.ts';
import { HeroFragments } from './HeroCanvas.tsx';
import HeroProof from './HeroProof.tsx';
import { SplitWords } from './Interactions.tsx';
import LoopSteps from './LoopSteps.tsx';
import VoiceField from './VoiceField.tsx';

/* The landing page at "/": top bar, hero, the loop, your own stack, and the footer. The workspace is at /app. */

export interface SiteHeaderProps {
  activeSection: string | undefined;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function SiteHeader({ activeSection, theme, onToggleTheme }: SiteHeaderProps) {
  return (
    <header className="va-topbar">
      <a className="va-brand" href="#top" aria-label="VoiceArchitect home">
        <span className="va-brand-mark"><AudioLines size={18} /></span>
        <b>VoiceArchitect</b>
      </a>
      <nav className="va-nav" aria-label="Page sections">
        <a href="#how" aria-current={activeSection === 'how' ? 'true' : undefined}>How it works</a>
        <a href="#own-stack" aria-current={activeSection === 'own-stack' ? 'true' : undefined}>Your stack</a>
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
        <Link to="/app" className="va-btn va-btn-primary va-topbar-demo">
          Open workspace <ArrowRight size={14} />
        </Link>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="va-hero va-hero-canvas va-hero-simple" id="top" aria-labelledby="va-hero-title">
      <span className="va-canvas-grid" aria-hidden="true" />
      <VoiceField />
      <HeroFragments />

      <div className="va-canvas-center">
        <p className="va-hero-eyebrow" data-reveal>
          <span className="va-live-dot" aria-hidden="true" /> Built for Wispr Flow
          <span className="va-hero-eyebrow-more">· English and Hinglish</span>
        </p>
        <h1 id="va-hero-title" className="va-display" data-reveal>
          <SplitWords text="Say the change." />
          <SplitWords text="See what it touches." offset={3} className="va-display-serif" />
        </h1>
        {/* One row from 1280px, beside the product card; a plain part of the column below that. */}
        <div className="va-hero-lower">
          <p className="va-hero-description" data-reveal style={cssVars({ '--d': 4 })}>
            Architecture diagrams go stale the week they&rsquo;re drawn. Say the change with Wispr Flow, in English or
            Hinglish, review the exact diff, then check it against your <span className="va-nowrap">docker-compose file</span>.
          </p>
          <div className="va-hero-actions" data-reveal style={cssVars({ '--d': 5 })}>
            <Link to="/app?demo=guided" className="va-btn va-btn-primary va-btn-lg">
              <Play size={16} /> Start guided demo
            </Link>
            <Link to="/app?import=compose" className="va-btn va-btn-lg">
              Use my own stack <ArrowRight size={16} />
            </Link>
          </div>
          <p className="va-hero-note" data-reveal style={cssVars({ '--d': 6 })}>
            No sign-in. Three steps: an English change, a Hinglish change, and a check against newer code.
          </p>
        </div>
      </div>
      <HeroProof />
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

export function OwnStackSection() {
  return (
    <section className="va-section va-own-stack" id="own-stack" aria-labelledby="va-own-title">
      <div className="va-section-inner">
        <h2 id="va-own-title" className="va-section-title" data-reveal style={cssVars({ '--d': 1 })}>
          Use it on <em>your own stack</em>
        </h2>
        <ol className="va-own-steps" data-reveal style={cssVars({ '--d': 2 })}>
          <li><b>Find your compose file.</b> <code>docker-compose.yml</code> or <code>compose.yaml</code>, usually at the root of the repo.</li>
          <li><b>Import it.</b> It is read in your browser and never uploaded; the diagram is drawn from your services and their connections.</li>
          <li><b>Say a change, review it, apply it.</b> When the code moves on, check the diagram against the newer compose file.</li>
        </ol>
        <div className="va-own-actions" data-reveal style={cssVars({ '--d': 3 })}>
          <Link to="/app?import=compose" className="va-btn va-btn-primary va-btn-lg">
            <FileCode2 size={16} /> Import my docker-compose
          </Link>
          <Link to="/app?sample=commerce" className="va-btn va-btn-lg">Try a sample first</Link>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="va-footer va-footer-simple">
      <span className="va-footer-brand"><AudioLines size={14} /> VoiceArchitect</span>
      <span>Nothing changes without your review.</span>
      <nav className="va-footer-links" aria-label="Footer">
        <Link to="/app">Workspace</Link>
        <a href="https://github.com/Dakshhhhh-ops/no-hands">GitHub</a>
        <a href="https://github.com/Dakshhhhh-ops/no-hands/blob/main/docs/wispr-notes.md">Wispr Flow notes</a>
      </nav>
    </footer>
  );
}
