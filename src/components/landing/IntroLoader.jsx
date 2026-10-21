import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../hooks/useMotion.ts';
import { isAutomated } from '../../hooks/useSmoothScroll.ts';

const SEEN_KEY = 'va-intro-seen';

function shouldShow() {
  if (typeof window === 'undefined' || prefersReducedMotion() || isAutomated()) return false;
  try {
    return !sessionStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

/**
 * First-visit intro: a counter fills to 100 while the wordmark rises, then the
 * curtain lifts. Shown once per browser session; never with reduced motion or in
 * automated runs. It never blocks input for more than about 1.6 seconds.
 */
export default function IntroLoader() {
  const [visible, setVisible] = useState(shouldShow);
  const [count, setCount] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage can be unavailable; the intro then simply plays again next time.
    }
    const start = performance.now();
    const duration = 1000;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      setCount(Math.round((1 - (1 - t) ** 3) * 100));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setLeaving(true);
    });
    const done = setTimeout(() => setVisible(false), duration + 700);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div className={`va-intro${leaving ? ' is-leaving' : ''}`} aria-hidden="true">
      <div className="va-intro-mark">
        <span className="va-intro-word">Voice</span>
        <span className="va-intro-word is-serif">Architect</span>
      </div>
      <span className="va-intro-count">{String(count).padStart(3, '0')}</span>
      <span className="va-intro-bar" style={{ transform: `scaleX(${count / 100})` }} />
    </div>
  );
}
