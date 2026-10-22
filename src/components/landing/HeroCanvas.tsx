import { useEffect, useMemo, useRef } from 'react';
import { prefersReducedMotion } from '../../hooks/useMotion.ts';
import type { Component, Project } from '../../types/schema.ts';
import { cssVars } from '../../utils/cssVars.ts';

export interface HeroFragmentsProps {
  project: Project | null;
}

/**
 * Two small decorations in the hero's left gutter, beside the description: the
 * loaded model's docker-compose file and a "Listening" pill, the two inputs of
 * the loop. They are grid items placed by the content (see landing-canvas.css),
 * so they never overlap the text; below 1280px they are hidden. They drift
 * slightly and follow the pointer by depth. Decorative: hidden from assistive
 * tech; the product card in the right gutter and the workspace are the real UI.
 */
export function HeroFragments({ project }: HeroFragmentsProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const components = useMemo<Component[]>(() => project?.components || [], [project]);

  const composeLines = useMemo<string[]>(() => {
    const lines = ['services:'];
    for (const c of components.filter((x) => x.type !== 'CLIENT').slice(0, 3)) {
      const image = /^[a-z0-9./_-]+:[a-z0-9._-]+$/i.test(c.sub.split(' · ')[0] || '') ? c.sub.split(' · ')[0] : null;
      lines.push(`  ${c.id}:`);
      lines.push(image ? `    image: ${image}` : '    build: .');
    }
    return lines;
  }, [components]);

  useEffect(() => {
    const el = ref.current;
    const host = el?.closest('section');
    if (!el || !host || prefersReducedMotion()) return undefined;
    let frame = 0;
    let target: { x: number; y: number } = { x: 0, y: 0 };
    const apply = () => {
      frame = 0;
      const rect = host.getBoundingClientRect();
      const scroll = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
      el.style.setProperty('--mx', target.x.toFixed(3));
      el.style.setProperty('--my', target.y.toFixed(3));
      el.style.setProperty('--sy', scroll.toFixed(3));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
    const onMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      target = { x: (event.clientX - rect.left) / rect.width - 0.5, y: (event.clientY - rect.top) / rect.height - 0.5 };
      schedule();
    };
    host.addEventListener('pointermove', onMove);
    window.addEventListener('scroll', schedule, { passive: true });
    apply();
    return () => {
      host.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="va-frags" ref={ref} aria-hidden="true">
      <div className="va-frag va-frag-code f-6" style={cssVars({ '--z': 0.8, '--r': '5deg' })}>
        <span className="va-frag-dots"><i /><i /><i /><em>docker-compose.yml</em></span>
        <pre>{composeLines.join('\n')}</pre>
      </div>
      <div className="va-frag va-frag-pill f-5" style={cssVars({ '--z': 1.1, '--r': '0deg' })}>
        <span className="va-mini-wave"><i /><i /><i /><i /><i /></span> Listening
      </div>
    </div>
  );
}
