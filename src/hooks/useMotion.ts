import { useEffect } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** True in unit tests and automated browsers, where motion only slows tests down. */
export const isAutomated = () =>
  import.meta.env?.MODE === 'test' || (typeof navigator !== 'undefined' && Boolean(navigator.webdriver));

/**
 * Reveals every element marked `data-reveal` as it scrolls into view by adding
 * `is-revealed`. Elements added later (new sections, modals) are picked up too.
 * With reduced motion, everything is revealed immediately.
 */
export function useRevealOnScroll() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const reveal = (el: Element) => el.classList.add('is-revealed');

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll('[data-reveal]').forEach(reveal);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    const watch = (root: ParentNode) =>
      root.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach((el) => observer.observe(el));
    watch(document);

    const mutations = new MutationObserver(() => watch(document));
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);
}
