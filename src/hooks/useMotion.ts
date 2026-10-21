import { useEffect } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

/**
 * Publishes scroll progress as CSS custom properties, updated once per frame:
 *   --va-scroll on <html>            0..1 for the whole page
 *   --va-progress on [data-progress] 0..1 as that element passes through the viewport
 */
export function useScrollProgress() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const root = document.documentElement;
    let frame = 0;

    const update = () => {
      frame = 0;
      const max = root.scrollHeight - window.innerHeight;
      root.style.setProperty('--va-scroll', max > 0 ? (window.scrollY / max).toFixed(4) : '0');
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>('[data-progress]').forEach((el) => {
        const rect = el.getBoundingClientRect();
        // 0 when the element's top reaches the bottom of the viewport, 1 when its bottom passes the middle.
        const total = rect.height + vh / 2;
        const passed = vh - rect.top;
        const value = Math.min(1, Math.max(0, passed / total));
        el.style.setProperty('--va-progress', value.toFixed(4));
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
