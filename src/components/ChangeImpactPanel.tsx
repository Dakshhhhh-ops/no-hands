import { deriveChangeDiff, deriveManualDecisions } from '../data/changeDiff.ts';
import type { DiffEntry, DiffStatus } from '../data/changeDiff.ts';
import type { Project } from '../types/schema.ts';

export interface ChangeImpactPanelProps {
  project: Project;
}

/** Every field describe() reads from a diffed record; each record type carries only some of them. */
interface DescribedRecord {
  type?: string;
  name?: string;
  sub?: string;
  from?: string;
  to?: string;
  label?: string;
  protocol?: string;
  method?: string;
  path?: string;
  responses?: Record<string, unknown>;
  kind?: string;
  title?: string;
  description?: string;
  acceptance?: string[];
  priority?: string;
  text?: string;
  id?: string;
  status?: string;
}

const STATUS: Record<DiffStatus, { label: string; tone: string }> = {
  added: { label: 'Added', tone: 'teal' },
  modified: { label: 'Modified', tone: 'amber' },
  removed: { label: 'Removed', tone: 'rose' },
};

function describe(value: unknown): string {
  // Diff entries hold components, connections, contract operations, findings, tasks, or
  // requirements (see changeDiff.ts); the checks below tell them apart by their fields.
  const item = value as DescribedRecord | null;
  if (!item) return '—';
  if (item.type && item.name) return `${item.type}: ${item.name}${item.sub ? ` — ${item.sub}` : ''}`;
  if (item.from && item.to) return [item.label, item.protocol].filter(Boolean).join(' · ') || 'connection';
  if (item.method && item.path) return `${item.method.toUpperCase()} ${item.path} · responses ${Object.keys(item.responses || {}).join(', ') || 'none'}`;
  if (item.kind && item.title) return `${item.kind}: ${item.description}`;
  if (item.acceptance) return `${item.title} (${item.priority} priority) · ${item.acceptance.length} acceptance criteria`;
  if (item.text && item.id) return `${item.text} [${item.status}]`;
  return JSON.stringify(item);
}

export default function ChangeImpactPanel({ project }: ChangeImpactPanelProps) {
  const groups = deriveChangeDiff(project);
  const decisions = deriveManualDecisions(project);
  const change = project.changes?.[0];
  const changedGroups = groups.filter((group) => group.entries.length);
  const total = changedGroups.reduce((sum, group) => sum + group.entries.length, 0);
  const baseVersion = project.baseline?.version ?? 1;
  // Provenance is shown once, at the top; an entry repeats it only when it came from a different change.
  const fromOtherChange = (entry: DiffEntry) => change && entry.changeId !== change.id;

  return (
    <section className="vp" aria-label="What changed since the baseline">
      <header className="vp-head">
        <div>
          <h3 className="vp-title">What changed</h3>
          <p className="vp-lead">
            Everything that differs from the baseline (v{baseVersion}), grouped by artifact, with the instruction that
            caused it.
          </p>
        </div>
        <p className="vp-meta">
          v{baseVersion} → v{project.version} · {total} change{total === 1 ? '' : 's'}
        </p>
      </header>

      {change && (
        <div className="vp-quote">
          <span className="vp-tag is-plain" data-tone="accent">Instruction · {change.id}</span>
          <q>{change.originalInstruction}</q>
          {change.summary && <small>{change.summary}</small>}
        </div>
      )}

      <div className="vp-chips" aria-label="Which artifacts changed">
        {groups.map((group) => (
          <span key={group.id} className={`vp-chip ${group.entries.length ? 'is-on' : ''}`}>
            {group.label} <b>{group.entries.length || '–'}</b>
          </span>
        ))}
      </div>

      {changedGroups.length ? (
        changedGroups.map((group) => (
          <section className="vp-section" key={group.id} aria-label={group.label}>
            <div className="vp-section-head">
              <h4>{group.label}</h4>
              <span>{group.entries.length}</span>
            </div>
            <div className="vp-list">
              {group.entries.map((entry) => (
                <article className="vp-item" data-tone={STATUS[entry.status].tone} key={entry.id}>
                  <div className="vp-item-top">
                    <span className="vp-tag" data-tone={STATUS[entry.status].tone}>{STATUS[entry.status].label}</span>
                    <h4>{entry.label}</h4>
                  </div>
                  <dl className="vp-diff">
                    {entry.status !== 'added' && (
                      <div className="is-before">
                        <dt>v{baseVersion}</dt>
                        <dd>{describe(entry.before)}</dd>
                      </div>
                    )}
                    {entry.status !== 'removed' && (
                      <div className="is-after">
                        <dt>v{project.version}</dt>
                        <dd>{describe(entry.after)}</dd>
                      </div>
                    )}
                  </dl>
                  {fromOtherChange(entry) && (
                    <p className="vp-ref">From {entry.changeId}: “{entry.instruction}”</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="vp-empty">
          <b>No changes since the baseline</b>
          <p>Describe a change on the left and choose Preview my change. Once you apply it, every difference shows up here.</p>
        </div>
      )}

      {decisions.length > 0 && (
        <section className="vp-section" aria-label="Decisions still open">
          <div className="vp-section-head">
            <h4>Decisions still open</h4>
            <span>{decisions.length}</span>
          </div>
          <p className="vp-note">These are left open on purpose. VoiceArchitect records them instead of guessing a value.</p>
          <div className="vp-list">
            {decisions.map((decision) => (
              <article className="vp-item" data-tone="amber" key={decision.id}>
                <div className="vp-item-top">
                  <span className="vp-tag" data-tone="amber">Open</span>
                  <h4>{decision.title}</h4>
                  <span className="vp-ref">{decision.id}</span>
                </div>
                <p>{decision.detail}</p>
                {(!change || decision.changeId !== change.id) && (
                  <p className="vp-ref">
                    {decision.changeId === 'BASELINE' ? 'From the baseline model' : `From ${decision.changeId}: “${decision.instruction}”`}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
