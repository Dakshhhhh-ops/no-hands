/** "[02] How it works" over a short rule. */
export function SectionLabel({ index, children }) {
  return (
    <p className="va-label" data-reveal>
      <span className="va-label-n">[{String(index).padStart(2, '0')}]</span> {children}
    </p>
  );
}

/**
 * The problem, shown as a proofreader's correction: a stale claim from a wiki
 * diagram gets struck through and the true value is written in after it as the
 * section scrolls through the viewport (driven by --va-progress on [data-progress]).
 * It is an illustration and says so.
 */
export function RedlineStatement({ id }) {
  return (
    <section className="va-redline" data-progress aria-labelledby={id}>
      <div className="va-redline-inner">
        <aside className="va-redline-meta" aria-label="Illustration details">
          <p className="va-label"><span className="va-label-n">[00]</span> The problem</p>
          <dl>
            <div><dt>File</dt><dd>architecture-final-v3.png</dd></div>
            <div><dt>Last edited</dt><dd>14 months ago</dd></div>
            <div><dt>Matches the code</dt><dd className="is-bad">No</dd></div>
          </dl>
          <span className="va-redline-tag">Illustration</span>
        </aside>
        <div className="va-redline-body">
          <h2 id={id} className="va-redline-text">
            <span className="va-sr-only">
              The wiki diagram says sessions live in PostgreSQL. The code moved them to Redis in March.
            </span>
            <span aria-hidden="true">
              <span className="va-redline-line">The wiki diagram says</span>{' '}
              <span className="va-redline-line">
                sessions live in{' '}
                <span className="va-redline-pair">
                  <span className="va-redline-fix">
                    <span className="va-redline-del">PostgreSQL</span>
                  </span>{' '}
                  <span className="va-redline-ins">Redis.</span>
                </span>
              </span>{' '}
              <span className="va-redline-line is-quiet">The code moved them in March.</span>
            </span>
          </h2>
          <p className="va-redline-lead">
            VoiceArchitect turns what you say into reviewed changes, then checks the model against your
            docker-compose file, so the picture stays true.
          </p>
        </div>
      </div>
    </section>
  );
}
