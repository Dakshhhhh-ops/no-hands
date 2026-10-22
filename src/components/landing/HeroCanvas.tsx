import { useEffect, useMemo, useRef } from 'react';
import { AudioLines, GitBranch, Mic } from 'lucide-react';
import { prefersReducedMotion } from '../../hooks/useMotion.ts';
import type { Component, Project } from '../../types/schema.ts';
import { cssVars } from '../../utils/cssVars.ts';

const pick = (components: Component[], type: Component['type']): Component | undefined =>
  components.find((c) => c.type === type);

export interface HeroFragmentsProps {
  project: Project | null;
}

/**
 * Floating fragments of the product scattered around the hero, like objects on a
 * design canvas. Built from the loaded model where possible (component cards, the
 * compose window), drifting slightly and following the pointer by depth.
 * Decorative: hidden from assistive tech; the workspace below is the real UI.
 * The labeled pointers mark pipeline steps (voice, review, sync), not people.
 */
export function HeroFragments({ project }: HeroFragmentsProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const components = useMemo<Component[]>(() => project?.components || [], [project]);
  const service = pick(components, 'SERVICE');
  const cache = pick(components, 'CACHE') || pick(components, 'DATABASE');
  const queue = pick(components, 'QUEUE');

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
      <div className="va-frag va-frag-window f-1" style={cssVars({ '--z': 0.9, '--r': '-5deg' })}>
        <span className="va-frag-dots"><i /><i /><i /></span>
        <svg viewBox="0 0 220 110" className="va-frag-graph">
          <path d="M40 55 C 80 55, 80 25, 115 25" /><path d="M40 55 C 80 55, 80 85, 115 85" /><path d="M155 85 C 175 85, 175 55, 190 55" />
          <rect x="10" y="42" width="34" height="26" rx="6" /><rect x="115" y="12" width="40" height="26" rx="6" />
          <rect x="115" y="72" width="40" height="26" rx="6" /><rect x="186" y="42" width="28" height="26" rx="6" />
        </svg>
      </div>

      {service && (
        <div className="va-frag va-frag-node f-2 tone-indigo" style={cssVars({ '--z': 1.4, '--r': '4deg' })}>
          <small>SERVICE</small><b>{service.name}</b><span>{service.sub}</span>
        </div>
      )}

      <div className="va-frag va-frag-tile f-3 tone-rose" style={cssVars({ '--z': 1.8, '--r': '-6deg' })}><Mic size={22} /></div>
      <div className="va-frag va-frag-tile f-4 tone-violet" style={cssVars({ '--z': 1.2, '--r': '7deg' })}><GitBranch size={22} /></div>

      <div className="va-frag va-frag-pill f-5" style={cssVars({ '--z': 1.1, '--r': '0deg' })}>
        <span className="va-mini-wave"><i /><i /><i /><i /><i /></span> Listening
      </div>

      <div className="va-frag va-frag-code f-6" style={cssVars({ '--z': 0.8, '--r': '5deg' })}>
        <span className="va-frag-dots"><i /><i /><i /><em>docker-compose.yml</em></span>
        <pre>{composeLines.join('\n')}</pre>
      </div>

      <div className="va-frag va-frag-toast f-7" style={cssVars({ '--z': 1.5, '--r': '-2deg' })}>
        <span className="va-frag-avatar"><AudioLines size={14} /></span>
        <div><b>VoiceArchitect <small>just now</small></b><span>Proposed: add Notification Service</span></div>
      </div>

      <div className="va-frag va-frag-toggle f-8" style={cssVars({ '--z': 1.3, '--r': '0deg' })}>
        Review before apply <span className="va-frag-switch"><i /></span>
      </div>

      {cache && (
        <div className="va-frag va-frag-node f-9 tone-teal" style={cssVars({ '--z': 1.0, '--r': '-4deg' })}>
          <small>{cache.type}</small><b>{cache.name}</b><span>{cache.sub}</span>
        </div>
      )}
      {queue && (
        <div className="va-frag va-frag-node f-10 tone-amber" style={cssVars({ '--z': 0.7, '--r': '3deg' })}>
          <small>QUEUE</small><b>{queue.name}</b><span>{queue.sub}</span>
        </div>
      )}

      <span className="va-pointer p-1 tone-rose"><i /><b>voice</b></span>
      <span className="va-pointer p-2 tone-indigo"><i /><b>review</b></span>
      <span className="va-pointer p-3 tone-teal"><i /><b>sync</b></span>
    </div>
  );
}
