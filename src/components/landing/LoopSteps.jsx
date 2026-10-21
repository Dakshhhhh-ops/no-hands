import { BookA, FileText, Languages, Mic, WandSparkles } from 'lucide-react';

/*
 * "How it works": the one loop, each step with a small illustration of the real
 * product, then the Wispr Flow features the app is built around. Every Wispr Flow
 * statement here is sourced in docs/wispr-notes.md.
 */

function SayVisual() {
  return (
    <div className="va-story-card va-loop-visual" aria-hidden="true">
      <div className="va-story-wave">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--k': i }} />)}</div>
      <p className="va-story-transcript">
        order service ko Kafka se connect karo<span className="va-caret" />
      </p>
      <span className="va-story-chip tone-indigo">Dictated with Wispr Flow</span>
    </div>
  );
}

function ReviewVisual() {
  return (
    <div className="va-story-card va-loop-visual" aria-hidden="true">
      <p className="va-story-heading">Proposed change</p>
      <ul className="va-story-diff">
        <li className="is-add">+ Connect order-service → kafka</li>
        <li className="is-ask">? Which topic: orders or order-events</li>
      </ul>
      <div className="va-story-actions"><span>Keep editing</span><span className="is-primary">&ldquo;apply&rdquo;</span></div>
    </div>
  );
}

function CheckVisual() {
  return (
    <div className="va-story-card va-loop-visual" aria-hidden="true">
      <pre className="va-story-code">{`services:
  postgres:
    image: postgres:17
  search:
    image: opensearch:2.15
  # pricing-worker removed`}</pre>
      <div className="va-story-chips">
        <span className="va-story-chip tone-teal">In code: search</span>
        <span className="va-story-chip tone-amber is-dashed">Planned: kept</span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: 'Say it',
    body: 'Click the instruction box, hold your Wispr Flow hotkey, and say the change. English and Hinglish both work.',
    Visual: SayVisual,
  },
  {
    title: 'Review it',
    body: 'A model proposes explicit operations, each one is checked against your model, and you see the exact diff. Say “apply”, or “make it PostgreSQL instead”.',
    Visual: ReviewVisual,
  },
  {
    title: 'Check it against code',
    body: 'Compare the diagram with a newer docker-compose file. New and retired services become one reviewed sync, and planned work is kept.',
    Visual: CheckVisual,
  },
];

const FLOW_FEATURES = [
  { icon: Mic, title: 'Dictation', body: 'Flow types into the focused box. The whole review loop, including “apply”, works by voice.' },
  { icon: Languages, title: 'Hinglish', body: 'Flow supports Hinglish, and so does the interpreter, from the first instruction to “haan apply karo”.' },
  { icon: WandSparkles, title: 'Command Mode', body: 'Select your instruction and have Flow rewrite it in place before you preview. Needs a paid plan or trial.' },
  { icon: BookA, title: 'Dictionary', body: 'Copy the model’s service and technology names into your Flow dictionary, so they are spelled right.' },
  { icon: FileText, title: 'Notetaker and Scratchpad', body: 'Turn a meeting summary or Scratchpad note into a reviewed proposal, or paste notes instead.' },
];

export default function LoopSteps() {
  return (
    <>
      <ol className="va-loop-steps">
        {STEPS.map(({ title, body, Visual }, i) => (
          <li key={title} data-reveal style={{ '--d': i + 1 }}>
            <Visual />
            <div className="va-loop-text">
              <span className="va-loop-num" aria-hidden="true">{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="va-flow-strip" data-reveal style={{ '--d': 2 }}>
        <h3 className="va-flow-strip-title">Built around Wispr Flow</h3>
        <ul>
          {FLOW_FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <span className="va-flow-icon" aria-hidden="true"><Icon size={16} /></span>
              <b>{title}</b>
              <span>{body}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
