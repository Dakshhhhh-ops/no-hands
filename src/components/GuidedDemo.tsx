import { GUIDED_STEPS } from '../data/guidedDemo.ts';

export interface GuidedDemoProps {
  /** 1-based step, or past the end when the demo is done. */
  step: number;
  onExit: () => void;
  onTypeIt: (say: string) => void;
  onRunCodeCheck: () => void;
}

/**
 * The guided demo's card above the command bar, kept to three short lines so the diagram stays
 * in view: the step and its buttons, what to say, and one line on what happens.
 */
export default function GuidedDemo({ step, onExit, onTypeIt, onRunCodeCheck }: GuidedDemoProps) {
  const current = step <= GUIDED_STEPS.length ? GUIDED_STEPS[step - 1] : undefined;
  if (step <= GUIDED_STEPS.length && !current) return null;

  return (
    <section className="va-guide" aria-label="Guided demo" aria-live="polite">
      <div className="va-guide-head">
        <span className="va-guide-step">
          {current
            ? `Guided demo · step ${step} of ${GUIDED_STEPS.length} · ${current.drift ? 'code check' : current.language}`
            : 'Guided demo · done'}
        </span>
        <div className="va-guide-actions">
          {current?.drift && (
            <button type="button" className="va-btn va-btn-primary va-btn-sm" onClick={onRunCodeCheck}>Run the code check</button>
          )}
          {current && !current.drift && (
            <button type="button" className="va-btn va-btn-sm" onClick={() => onTypeIt(current.say)} title="For people without Wispr Flow">
              Type it for me
            </button>
          )}
          <button type="button" className="va-link-btn" onClick={onExit}>{current ? 'Exit demo' : 'Close'}</button>
        </div>
      </div>

      {current?.drift && <p className="va-guide-say">The code moved on. {current.say}.</p>}
      {current && !current.drift && (
        <p className="va-guide-say">
          <span className="va-sr-only">Hold your Wispr Flow hotkey and say, in {current.language}:</span>
          <q>{current.say}</q>
        </p>
      )}
      {!current && <p className="va-guide-say">The diagram changed by voice in English and Hinglish, then caught up with the code.</p>}

      <p className="va-guide-note">
        {current?.drift && `${current.changes} Review the sync, then apply it.`}
        {current && !current.drift && <>Hold your Wispr Flow hotkey, say it, preview, then say &ldquo;apply&rdquo;. <span className="va-guide-changes">{current.changes}</span></>}
        {!current && 'Every doc followed: API contract, Risks, Tasks, and What changed. Try your own stack: Switch project → Import docker-compose.'}
      </p>
    </section>
  );
}
