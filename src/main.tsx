import React from 'react';
import { createRoot } from 'react-dom/client';
// CSS cascade order. app-shell.css (with ui-effects.css) comes first; later files win ties.
import './app-shell.css';
import Root from './Root.tsx';
import { isAutomated } from './hooks/useMotion.ts';
import { initialTheme } from './hooks/useTheme.ts';

// Self-hosted fonts, so the page needs no third-party origin.
import './fonts.css';

// Legacy layers first. They still style the older components until the bridge fully replaces them.
import './styles.css';
import './responsive.css';
import './theme.css';

// New system last, so it wins by order and specificity instead of !important.
import './tokens.css';
import './bridge.css';
import './landing.css';
import './landing-v3.css';
import './landing-canvas.css';
import './theme-editorial.css';
import './panels.css';

// Automated browsers get a static page: decorative loops only cost CPU there.
if (isAutomated()) document.documentElement.classList.add('va-automated');

// Theme before the first render, so the page never paints in the wrong palette and then
// fades (an effect would run after render). The CSP allows no inline script for this.
document.documentElement.setAttribute('data-theme', initialTheme());

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element to render into.');

createRoot(root).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);