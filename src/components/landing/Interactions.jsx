import { Fragment, useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../hooks/useMotion.ts';
import { isAutomated } from '../../hooks/useSmoothScroll.ts';

/**
 * Splits text into words that rise out of a mask, one after another, once an
 * ancestor marked [data-reveal] becomes visible. Screen readers get the plain text.
 */
export function SplitWords({ text, offset = 0, className = '' }) {
  const words = text.split(' ');
  return (
    <span className={`va-split ${className}`}>
      <span className="va-sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <Fragment key={`${word}-${i}`}>
            <span className="va-split-mask">
              <span className="va-split-word" style={{ '--w': i + offset }}>{word}</span>
            </span>
            {i < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

/** Pulls its child toward the pointer while the pointer is near, then springs back. */
export function Magnetic({ children, strength = 0.32 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !window.matchMedia?.('(pointer: fine)').matches) return undefined;
    const onMove = (event) => {
      const rect = el.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      el.style.transform = `translate3d(${dx * strength}px, ${dy * strength}px, 0)`;
    };
    const onLeave = () => {
      el.style.transform = 'translate3d(0, 0, 0)';
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [strength]);

  return <span className="va-magnetic" ref={ref}>{children}</span>;
}

/**
 * A dot and a trailing ring that replace the pointer inside [data-cursor-zone]
 * sections (the landing story). The ring swells over links and buttons and can
 * show a short label from data-cursor. Outside those zones, and on touch devices,
 * with reduced motion, or in automated runs, the native cursor is used.
 */
export function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring || prefersReducedMotion() || isAutomated() || !window.matchMedia?.('(pointer: fine)').matches) return undefined;

    const root = document.documentElement;
    const pos = { x: -100, y: -100, rx: -100, ry: -100 };
    let frame = 0;
    const tick = () => {
      pos.rx += (pos.x - pos.rx) * 0.18;
      pos.ry += (pos.y - pos.ry) * 0.18;
      dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      ring.style.transform = `translate3d(${pos.rx}px, ${pos.ry}px, 0)`;
      frame = requestAnimationFrame(tick);
    };
    const onMove = (event) => {
      pos.x = event.clientX;
      pos.y = event.clientY;
      const target = event.target instanceof Element ? event.target : null;
      const inZone = Boolean(target?.closest('[data-cursor-zone]'));
      root.classList.toggle('va-cursor-on', inZone);
      const interactive = target?.closest('a, button, [data-cursor]');
      ring.classList.toggle('is-hover', Boolean(interactive));
      const label = interactive?.getAttribute?.('data-cursor') || '';
      if (labelRef.current) labelRef.current.textContent = label;
      ring.classList.toggle('has-label', Boolean(label));
    };
    const onLeave = () => root.classList.remove('va-cursor-on');

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      root.classList.remove('va-cursor-on');
    };
  }, []);

  return (
    <div className="va-cursor" aria-hidden="true">
      <span className="va-cursor-dot" ref={dotRef} />
      <span className="va-cursor-ring" ref={ringRef}><span ref={labelRef} /></span>
    </div>
  );
}

