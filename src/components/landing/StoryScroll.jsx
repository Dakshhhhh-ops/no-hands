import { useEffect, useRef, useState } from 'react';

const STEPS = [
  {
    title: 'Say it',
    body: 'Describe the change out loud or type it. Plain language is enough; transcription slips like "red is" for Redis are read through.',
  },
  {
    title: 'Review it',
    body: 'The model proposes explicit operations. Each one is checked against your architecture, and anything it could not resolve is asked, not guessed.',
  },
  {
    title: 'See what follows',
    body: 'Apply it, and the diagram, API contract, risk audit, and task list update together from one model, so they never disagree.',
  },
  {
    title: 'Keep it true',
    body: 'When the code moves on, check the diagram against the new docker-compose file. Built work syncs; planned work is kept.',
  },
];

function SayVisual() {
  return (
    <div className="va-story-card">
      <div className="va-story-wave">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--k': i }} />)}</div>
      <p className="va-story-transcript">
        Add a notification service that listens to order events<span className="va-caret" />
      </p>
      <span className="va-story-chip tone-indigo">Interpreting the instruction</span>
    </div>
  );
}

function ReviewVisual() {
  return (
    <div className="va-story-card">
      <p className="va-story-heading">Proposed change</p>
      <ul className="va-story-diff">
        <li className="is-add">+ Add Notification Service</li>
        <li className="is-add">+ Connect Kafka → Notification Service</li>
        <li className="is-ask">? Which channels: email, SMS, or push</li>
      </ul>
      <div className="va-story-actions"><span>Keep editing</span><span className="is-primary">Apply</span></div>
    </div>
  );
}

function FollowVisual() {
  return (
    <div className="va-story-card">
      <svg className="va-story-graph" viewBox="0 0 300 150" role="presentation">
        <path d="M60 75 C 110 75, 110 40, 150 40" />
        <path d="M60 75 C 110 75, 110 110, 150 110" />
        <path className="is-new" d="M190 110 C 220 110, 220 75, 245 75" />
        <rect x="20" y="60" width="44" height="30" rx="7" />
        <rect x="150" y="25" width="44" height="30" rx="7" />
        <rect x="150" y="95" width="44" height="30" rx="7" />
        <rect className="is-new" x="240" y="60" width="44" height="30" rx="7" />
      </svg>
      <div className="va-story-chips">
        <span className="va-story-chip tone-teal">Contract updated</span>
        <span className="va-story-chip tone-teal">Risk audit re-run</span>
        <span className="va-story-chip tone-teal">Task list refreshed</span>
      </div>
    </div>
  );
}

function TrueVisual() {
  return (
    <div className="va-story-card">
      <pre className="va-story-code">{`services:
  postgres:
    image: postgres:17
  search:
    image: opensearch:2.15
  # pricing-worker removed`}</pre>
      <div className="va-story-chips">
        <span className="va-story-chip tone-teal">In code: search</span>
        <span className="va-story-chip tone-amber is-dashed">Planned: audit-service</span>
      </div>
    </div>
  );
}

const VISUALS = [SayVisual, ReviewVisual, FollowVisual, TrueVisual];

/**
 * "How it works" as a pinned story: the visual stays in place while the steps
 * scroll past, and switches to match the step in the middle of the screen.
 * The visuals are illustrations of the product, marked as such.
 */
export default function StoryScroll() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number(entry.target.getAttribute('data-step')));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    stepRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="va-story">
      <div className="va-story-pin" aria-hidden="true">
        <div className="va-story-stage">
          <span className="va-story-count">
            <b>{String(active + 1).padStart(2, '0')}</b> / {String(STEPS.length).padStart(2, '0')}
          </span>
          <span className="va-story-tag">Illustration</span>
          {VISUALS.map((Visual, i) => (
            <div key={i} className={`va-story-scene${i === active ? ' is-active' : ''}${i < active ? ' is-past' : ''}`}>
              <Visual />
            </div>
          ))}
        </div>
      </div>
      <ol className="va-story-steps">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            ref={(el) => { stepRefs.current[i] = el; }}
            data-step={i}
            className={i === active ? 'is-active' : ''}
          >
            <span className="va-story-n">{String(i + 1).padStart(2, '0')}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
