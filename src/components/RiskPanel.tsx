import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { CheckCircle2, ClipboardCheck } from 'lucide-react';
import { deriveRiskFindings } from '../data/analysis.ts';
import { fixFor, resolutionProposal } from '../data/riskResolution.ts';
import { sound } from '../utils/sound.ts';
import type { FixSelection, RiskFix } from '../data/riskResolution.ts';
import type { Project, Proposal, RiskFinding, RiskFindingKind } from '../types/schema.ts';

export interface RiskPanelProps {
  project: Project;
  onResolve?: (proposal: Proposal) => void;
}

interface FixChooserProps {
  fix: RiskFix;
  pick: FixSelection | null | undefined;
  onPick: (pick: FixSelection | null) => void;
}

/** An open finding that has a fix, so it can be keyed by its fixKey. */
type FixableFinding = RiskFinding & { fixKey: string };

/** Finding kinds the analysis emits, in display order, with their filter label and tone. */
const KINDS: { kind: RiskFindingKind; label: string; tone: string }[] = [
  { kind: 'Potential risk', label: 'Potential risks', tone: 'amber' },
  { kind: 'Unresolved decision', label: 'Open decisions', tone: 'rose' },
  { kind: 'Requirement coverage', label: 'Coverage', tone: 'violet' },
  { kind: 'Consistency check', label: 'Consistency', tone: 'teal' },
];
const toneOf = (finding: RiskFinding) => (finding.status === 'resolved' ? 'teal' : KINDS.find((k) => k.kind === finding.kind)?.tone || 'muted');

/** The choices for one open finding: preset buttons plus, where it makes sense, a typed answer. */
function FixChooser({ fix, pick, onPick }: FixChooserProps) {
  const chosen = pick?.custom ? null : fix.choices.find((c) => c.id === pick?.choiceId);
  return (
    <fieldset className="vp-fix">
      <legend>{fix.question}</legend>
      <div className="vp-fix-choices">
        {fix.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            aria-pressed={!pick?.custom && pick?.choiceId === choice.id}
            onClick={() => { sound.click(); onPick(pick?.choiceId === choice.id && !pick?.custom ? null : { choiceId: choice.id }); }}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {fix.custom && (
        <input
          type="text"
          className="vp-fix-input"
          placeholder={fix.placeholder}
          aria-label={`${fix.question} Your own answer`}
          value={pick?.custom || ''}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onPick(event.target.value ? { custom: event.target.value } : null)}
        />
      )}
      {chosen && <p className="vp-fix-detail">{chosen.detail}</p>}
    </fieldset>
  );
}

export default function RiskPanel({ project, onResolve }: RiskPanelProps) {
  const [filter, setFilter] = useState<'all' | RiskFindingKind>('all');
  const [selections, setSelections] = useState<Record<string, FixSelection | null>>({});
  const findings = deriveRiskFindings(project);
  const ordered = [...findings].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1));
  const shown = filter === 'all' ? ordered : ordered.filter((f) => f.kind === filter);
  const countOf = (kind: RiskFindingKind) => findings.filter((f) => f.kind === kind).length;

  // fixFor returns null without a fixKey, so every fixable finding has one.
  const fixable = findings.filter((f): f is FixableFinding => f.status === 'open' && Boolean(fixFor(project, f.fixKey)));
  const chosen = fixable.filter((f) => {
    const pick = selections[f.fixKey];
    return pick && (pick.choiceId || pick.custom?.trim());
  });

  const choose = (value: 'all' | RiskFindingKind) => {
    sound.tab();
    setFilter(value);
  };
  const setPick = (fixKey: string, pick: FixSelection | null) => setSelections((prev) => ({ ...prev, [fixKey]: pick }));
  const suggestRest = () => {
    sound.click();
    setSelections((prev) => {
      const next = { ...prev };
      for (const finding of fixable) {
        const pick = next[finding.fixKey];
        if (!pick || !(pick.choiceId || pick.custom?.trim())) next[finding.fixKey] = { choiceId: fixFor(project, finding.fixKey)!.choices[0].id }; // fixable: fixFor is non-null
      }
      return next;
    });
  };
  const review = () => {
    const picks = Object.fromEntries(chosen.map((f): [string, FixSelection | null] => [f.fixKey, selections[f.fixKey]]));
    const proposal = resolutionProposal(project, picks);
    if (proposal && onResolve) {
      onResolve(proposal);
      setSelections({});
    }
  };

  return (
    <section className="vp" aria-label="Risks and open questions">
      <header className="vp-head">
        <div>
          <h3 className="vp-title">Risks and open questions</h3>
          <p className="vp-lead">
            Each finding comes from a rule run on the model&apos;s components, connections, and requirements, and
            lists the facts it is based on. Nothing here is a guess about production.
          </p>
        </div>
        <p className="vp-meta">
          {findings.length} finding{findings.length === 1 ? '' : 's'} · model v{project.version}
        </p>
      </header>

      {fixable.length > 0 ? (
        <div className="vp-resolve-bar" role="region" aria-label="Resolve open findings">
          <div>
            <b>{fixable.length} open finding{fixable.length === 1 ? '' : 's'} can be resolved here</b>
            <span>Choose a fix for each one, then review them together. Nothing changes until you apply.</span>
          </div>
          <div className="vp-actions">
            {chosen.length < fixable.length && (
              <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={suggestRest}>
                Choose suggested fixes
              </button>
            )}
            <button type="button" className="va-btn va-btn-primary va-btn-sm" onClick={review} disabled={!chosen.length || !onResolve}>
              <ClipboardCheck size={14} /> Review {chosen.length || ''} fix{chosen.length === 1 ? '' : 'es'}
            </button>
          </div>
        </div>
      ) : findings.length > 0 && (
        <div className="vp-resolve-bar is-clear" role="status">
          <CheckCircle2 size={18} className="vp-ok" aria-hidden="true" />
          <div>
            <b>Nothing open</b>
            <span>Every finding is resolved, recorded as accepted, or passing.</span>
          </div>
        </div>
      )}

      <div className="vp-seg" role="group" aria-label="Filter findings">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => choose('all')}>
          All findings <b>{findings.length}</b>
        </button>
        {KINDS.map(({ kind, label }) => (
          <button key={kind} type="button" aria-pressed={filter === kind} onClick={() => choose(kind)}>
            {label} <b>{countOf(kind)}</b>
          </button>
        ))}
      </div>

      {shown.length ? (
        <div className="vp-list">
          {shown.map((finding, index) => {
            const fix = finding.status === 'open' ? fixFor(project, finding.fixKey) : null;
            return (
              <article className="vp-item" data-tone={toneOf(finding)} key={`${finding.kind}-${finding.title}`}>
                <div className="vp-item-top">
                  <span className="vp-tag" data-tone={KINDS.find((k) => k.kind === finding.kind)?.tone || 'muted'}>{finding.kind}</span>
                  {finding.status === 'resolved' && <span className="vp-tag" data-tone="teal">Resolved</span>}
                  {finding.status === 'open' && <span className="vp-tag is-plain" data-tone="muted">Open</span>}
                  <span className="vp-ref">R{index + 1}</span>
                </div>
                <h4>{finding.title}</h4>
                <p>{finding.description}</p>
                {finding.evidence?.length > 0 && (
                  <div className="vp-facts">
                    <span className="vp-facts-label">Based on</span>
                    <ul>{finding.evidence.map((line) => <li key={line}>{line}</li>)}</ul>
                  </div>
                )}
                {fix && onResolve && (
                  // fix is non-null only when fixFor received a fixKey.
                  <FixChooser fix={fix} pick={selections[finding.fixKey!]} onPick={(pick) => setPick(finding.fixKey!, pick)} />
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="vp-empty">
          <b>{findings.length ? 'No findings of this kind' : 'No findings for this model'}</b>
          <p>{findings.length ? 'Choose another filter to see the rest.' : 'The rules found nothing to flag in the current components and requirements.'}</p>
        </div>
      )}

      <p className="vp-note">
        An open decision is behavior the team has deliberately left unspecified. A potential risk follows from how the
        model is drawn today, not from a measured probability. Recording a fix makes it a requirement; it does not mean
        the behavior is built yet.
      </p>
    </section>
  );
}
