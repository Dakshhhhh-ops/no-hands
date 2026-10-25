import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../hooks/useMotion.ts';
import { DictationChip, StoryActions, StoryDiff } from './StoryParts.tsx';
import type { StoryDiffLine } from './StoryParts.tsx';

/*
 * The product in the hero: the guided demo's payment-service step, said in
 * English, from dictation to a reviewed change. The strings are hard-coded (the change the recorded step
 * produces) so the landing page imports nothing from src/data.
 */
const SAID = 'Move the payment service into its own container and connect it to the gateway';
const DIFF: StoryDiffLine[] = [
  { kind: 'add', text: '+ payment-service (new service, own container)' },
  { kind: 'add', text: '+ gateway → payment-service' },
];

// One loop, in milliseconds: type the sentence, show each diff line, highlight
// "apply", hold, then clear and start again.
const LOOP = 8000;
const TYPE_FROM = 400;
const PER_CHAR = 28;
const TYPED = TYPE_FROM + SAID.length * PER_CHAR;
const LINES_AT = [TYPED + 500, TYPED + 1100];
const APPLY_AT = TYPED + 1900;
const CLEAR_AT = 7400;

interface Frame {
  chars: number;
  lines: number;
  applied: boolean;
}

const FINAL: Frame = { chars: SAID.length, lines: DIFF.length, applied: true };

function frameAt(t: number): Frame {
  if (t >= CLEAR_AT) return { chars: 0, lines: 0, applied: false };
  return {
    chars: Math.min(SAID.length, Math.max(0, Math.floor((t - TYPE_FROM) / PER_CHAR))),
    lines: LINES_AT.filter((at) => t >= at).length,
    applied: t >= APPLY_AT,
  };
}

const same = (a: Frame, b: Frame) => a.chars === b.chars && a.lines === b.lines && a.applied === b.applied;

export default function HeroProof() {
  const ref = useRef<HTMLElement | null>(null);
  // With reduced motion the card shows the finished change and never animates.
  const [frame, setFrame] = useState<Frame>(() => (prefersReducedMotion() ? FINAL : frameAt(0)));

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const start = performance.now();
    let timer = 0;
    let onScreen = true;
    const tick = () => {
      const next = frameAt((performance.now() - start) % LOOP);
      setFrame((current) => (same(current, next) ? current : next));
    };
    const run = () => {
      if (!timer && onScreen && !document.hidden) timer = window.setInterval(tick, PER_CHAR);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
    };
    // Paused while scrolled away or in a background tab.
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      if (onScreen) run(); else stop();
    });
    if (ref.current) observer?.observe(ref.current);
    const onVisibility = () => (document.hidden ? stop() : run());
    document.addEventListener('visibilitychange', onVisibility);
    run();
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const typing = frame.chars < SAID.length;
  return (
    <figure className="va-story-card va-proof" ref={ref}>
      <figcaption className="va-sr-only">Example: a spoken instruction becomes a reviewed change</figcaption>
      {/* The untyped rest of the sentence keeps its place, invisible, so the card never changes size. */}
      <div aria-hidden="true">
        <p className="va-story-transcript va-proof-said">
          <span className={typing ? 'va-proof-caret' : undefined}>{SAID.slice(0, frame.chars)}</span>
          <span className="va-proof-ghost">{SAID.slice(frame.chars)}</span>
        </p>
        <DictationChip />
        <p className="va-story-heading">Proposed change</p>
        <StoryDiff lines={DIFF} shown={frame.lines} />
        <StoryActions applied={frame.applied} />
      </div>
    </figure>
  );
}
