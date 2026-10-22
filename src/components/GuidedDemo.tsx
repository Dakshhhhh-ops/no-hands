import { GUIDED_STEPS } from '../data/guidedDemo.ts';

export interface GuidedDemoProps {
  /** 1-based step, or past the end when the demo is done. */
  step: number;
  onExit: () => void;
  onTypeIt: (say: string) => void;
  onRunCodeCheck: () => void;
}

export default function GuidedDemo({ step, onExit, onTypeIt, onRunCodeCheck }: GuidedDemoProps) {
  return (
    <section className="va-guide" aria-label="Guided demo" aria-live="polite">
      {step <= GUIDED_STEPS.length ? (() => {
        const current = GUIDED_STEPS[step - 1];
        if (!current) return null;
        return (
          <>
            <div className="va-guide-head">
              <span className="va-guide-step">Guided demo · step {step} of {GUIDED_STEPS.length}</span>
              <button type="button" className="va-link-btn" onClick={onExit}>Exit demo</button>
            </div>
            {current.drift ? (
              <p className="va-guide-say">The code moved on. {current.say}.</p>
            ) : (
              <p className="va-guide-say">
                <span>Hold your Wispr Flow hotkey and say, in {current.language}:</span>
                <q>{current.say}</q>
              </p>
            )}
            <p className="va-guide-changes">{current.changes}</p>
            <div className="va-guide-actions">
              {current.drift ? (
                <button type="button" className="va-btn va-btn-primary va-btn-sm" onClick={onRunCodeCheck}>Run the code check</button>
              ) : (
                <>
                  <span className="va-guide-note">Then preview, review the diff, and say &ldquo;apply&rdquo;. No Wispr Flow?</span>
                  <button type="button" className="va-btn va-btn-sm" onClick={() => onTypeIt(current.say)}>Type it for me</button>
                </>
              )}
              {current.drift && <span className="va-guide-note">Review the sync, then apply it.</span>}
            </div>
          </>
        );
      })() : (
        <>
          <div className="va-guide-head">
            <span className="va-guide-step">Guided demo · done</span>
            <button type="button" className="va-link-btn" onClick={onExit}>Close</button>
          </div>
          <p className="va-guide-say">The diagram changed by voice in English and Hinglish, then caught up with the code.</p>
          <p className="va-guide-changes">Every tab followed: API contract, Risks, Tasks, and What changed. Try your own stack with From code → Import docker-compose.</p>
        </>
      )}
    </section>
  );
}
