import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { FileCode2, Play, RotateCcw, X } from 'lucide-react';

export interface EmptyStateProps {
  onStartDemo: () => void;
  onLoadSample: () => void;
  onChooseCompose: () => void;
  onComposeText: (text: string, fileName: string) => Promise<void> | void;
  /** Shown over the canvas (for /app?import=compose) rather than in place of it. */
  asDialog?: boolean;
  onClose?: () => void;
}

/** Three ways in: the guided demo, a sample, or your own docker-compose file (pick it or drop it here). */
export default function EmptyState({ onStartDemo, onLoadSample, onChooseCompose, onComposeText, asDialog, onClose }: EmptyStateProps) {
  const [dragging, setDragging] = useState(false);
  const firstRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!asDialog) return undefined;
    // The import choice takes focus, and Escape closes the panel.
    firstRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [asDialog, onClose]);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void file.text().then((text) => onComposeText(text, file.name));
  };

  const choices = (
    <div className="va-empty-choices">
      <button
        ref={firstRef}
        type="button"
        className="va-empty-choice va-empty-drop"
        data-dragging={dragging}
        onClick={onChooseCompose}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <FileCode2 size={28} aria-hidden="true" />
        <b>Import your docker-compose file</b>
        <span>Choose it, or drop it here. It is read in your browser and never uploaded.</span>
      </button>
      <button type="button" className="va-empty-choice" onClick={onStartDemo}>
        <Play size={28} aria-hidden="true" />
        <b>Start the guided demo</b>
        <span>Three steps on an example stack: English, Hinglish, and a check against newer code.</span>
      </button>
      <button type="button" className="va-empty-choice" onClick={onLoadSample}>
        <RotateCcw size={28} aria-hidden="true" />
        <b>Load a sample</b>
        <span>The Commerce Platform: nine services, ready for a change.</span>
      </button>
    </div>
  );

  if (!asDialog) {
    return (
      <div className="va-empty-state">
        <h2>Start from your own stack</h2>
        {choices}
      </div>
    );
  }
  return (
    <div className="va-empty-overlay">
      <section className="va-empty-state va-empty-dialog" role="dialog" aria-modal="true" aria-labelledby="va-import-title">
        <div className="va-empty-dialog-head">
          <h2 id="va-import-title">Start from your own stack</h2>
          <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {choices}
      </section>
    </div>
  );
}
