import { useEffect, useMemo, useRef } from 'react';
import { prefersReducedMotion } from '../hooks/useMotion.ts';

// Tiers from the bottom of the stack (data) to the top (clients).
const TIERS = [
  { key: 'data', label: 'Data & events', tone: 'data', types: ['DATABASE', 'CACHE', 'QUEUE', 'EXTERNAL'] },
  { key: 'services', label: 'Services', tone: 'services', types: ['SERVICE'] },
  { key: 'edge', label: 'Edge', tone: 'edge', types: ['GATEWAY'] },
  { key: 'clients', label: 'Clients', tone: 'clients', types: ['CLIENT'] },
];
const MAX_CHIPS = 3;

/**
 * Isometric 3D view of the loaded model: one floating layer per tier, holding the
 * model's real components. Purely decorative (aria-hidden); the diagram below is
 * the accessible view. Tilts toward the pointer and spreads its layers as the
 * hero scrolls away. Static when the user prefers reduced motion.
 */
export default function HeroStack3D({ project }) {
  const ref = useRef(null);

  const layers = useMemo(() => {
    const components = project?.components || [];
    return TIERS.map((tier) => {
      const items = components.filter((c) => tier.types.includes(c.type));
      return { ...tier, items: items.slice(0, MAX_CHIPS), extra: Math.max(0, items.length - MAX_CHIPS) };
    }).filter((layer) => layer.items.length > 0);
  }, [project]);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return undefined;
    const host = el.closest('section') || el;
    let frame = 0;
    let pointer = { x: 0, y: 0 };

    const apply = () => {
      frame = 0;
      const rect = host.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
      el.style.setProperty('--stack-tilt-x', `${(-pointer.y * 7).toFixed(2)}deg`);
      el.style.setProperty('--stack-tilt-y', `${(pointer.x * 9).toFixed(2)}deg`);
      el.style.setProperty('--stack-progress', progress.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onMove = (event) => {
      const rect = host.getBoundingClientRect();
      pointer = {
        x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
        y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
      };
      schedule();
    };
    const onLeave = () => {
      pointer = { x: 0, y: 0 };
      schedule();
    };

    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', schedule, { passive: true });
    apply();
    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="va-stack" ref={ref} aria-hidden="true" style={{ '--stack-layers': layers.length }}>
      <div className="va-stack-glow" />
      <div className="va-stack-scene">
        {layers.map((layer, index) => (
          <div key={layer.key} className={`va-stack-layer tone-${layer.tone}`} style={{ '--i': index }}>
            <span className="va-stack-label">{layer.label}</span>
            <div className="va-stack-chips">
              {layer.items.map((component) => (
                <span key={component.id} className="va-stack-chip">
                  <i />
                  {component.name}
                </span>
              ))}
              {layer.extra > 0 && <span className="va-stack-chip is-more">+{layer.extra} more</span>}
            </div>
          </div>
        ))}
        {layers.length > 1 && [0, 1, 2].map((beam) => <span key={beam} className="va-stack-beam" style={{ '--b': beam }} />)}
      </div>
    </div>
  );
}
