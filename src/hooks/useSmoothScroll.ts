import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { prefersReducedMotion } from './useMotion.ts';

/** True in unit tests and automated browsers, where motion only slows tests down. */
export const isAutomated = () =>
  import.meta.env?.MODE === 'test' || (typeof navigator !== 'undefined' && Boolean(navigator.webdriver));

/**
 * Inertial page scrolling (Lenis). The workspace panes, dialogs, and menus keep
 * native scrolling so nothing interactive feels different. Off for reduced motion
 * and in automated runs.
 */
export function useSmoothScroll() {
  useEffect(() => {
    // Automated runs get a static page: decorative loops only cost CPU there.
    if (typeof document !== 'undefined' && isAutomated()) document.documentElement.classList.add('va-automated');
    if (typeof window === 'undefined' || prefersReducedMotion() || isAutomated()) return undefined;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.085,
      anchors: { offset: -72 },
      prevent: (node: HTMLElement) =>
        Boolean(node.closest('[data-lenis-prevent], [role="dialog"], [role="menu"], textarea, .va-output, .va-composer')),
    });
    return () => lenis.destroy();
  }, []);
}
