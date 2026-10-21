import { useRef } from 'react';
import { prefersReducedMotion } from '../hooks/useMotion.ts';

/**
 * A card that tilts in 3D toward the pointer, with a soft light that follows it.
 * Renders as an <article>; motion is skipped when the user prefers reduced motion.
 */
export default function TiltCard({ children, className = '', ...rest }) {
  const ref = useRef(null);

  const onMove = (event) => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    el.style.setProperty('--tilt-x', `${((0.5 - y) * 8).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${((x - 0.5) * 10).toFixed(2)}deg`);
    el.style.setProperty('--glow-x', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--glow-y', `${(y * 100).toFixed(1)}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  };

  return (
    <article ref={ref} className={`va-tilt ${className}`} onPointerMove={onMove} onPointerLeave={onLeave} {...rest}>
      <span className="va-tilt-glow" aria-hidden="true" />
      {children}
    </article>
  );
}
