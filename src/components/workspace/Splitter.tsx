import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

export interface SplitterProps {
  /** Width of the panel to the splitter's left, in pixels. */
  value: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
  /** The panel the splitter resizes, for aria-controls. */
  controls: string;
  label: string;
}

const STEP = 16;

/**
 * A vertical splitter between two panels: drag it, or focus it and use the arrow keys
 * (Home and End jump to the limits). It is a focusable separator, as WAI-ARIA describes.
 */
export default function Splitter({ value, min, max, onChange, controls, label }: SplitterProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const clamp = (width: number) => Math.min(max, Math.max(min, Math.round(width)));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = value - STEP;
    else if (event.key === 'ArrowRight') next = value + STEP;
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    if (next === null) return;
    event.preventDefault();
    onChange(clamp(next));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: event.clientX, startWidth: value };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onChange(clamp(drag.current.startWidth + event.clientX - drag.current.startX));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className="va-splitter"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
