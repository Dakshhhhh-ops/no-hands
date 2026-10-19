import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle, FileText, GitCompare, Minus, Sparkles, Terminal } from 'lucide-react';
import { deriveChangeDiff, deriveManualDecisions } from '../data/changeDiff.js';
import { sound } from '../utils/sound.js';

const statusLabels = { added: 'Added', modified: 'Modified', removed: 'Removed' };

function describe(item) {
  if (!item) return '—';
  if (item.type && item.name) return `${item.type}: ${item.name}${item.sub ? ` — ${item.sub}` : ''}`;
  if (item.from && item.to) return `${item.label || 'relationship'}`;
  if (item.method && item.path) return `${item.method.toUpperCase()} ${item.path}; responses: ${Object.keys(item.responses || {}).join(', ') || 'none'}`;
  if (item.kind && item.title) return `${item.kind}: ${item.description}`;
  if (item.acceptance) return `${item.title} (${item.priority} priority); ${item.acceptance.length} proposed acceptance criteria`;
  if (item.text && item.id) return `${item.text} [${item.status}]`;
  return JSON.stringify(item);
}

export default function ChangeImpactPanel({ project }) {
  const groups = deriveChangeDiff(project);
  const decisions = deriveManualDecisions(project);
  const change = project.changes?.[0];
  const changedGroups = groups.filter((group) => group.entries.length);

  return (
    <section className="impact-panel" aria-label="Change impact and before-after diff">
      <div className="panel-intro">
        <div>
          <div className="panel-lead-tag">[DIFF // BASELINE_TO_CURRENT_AUDIT]</div>
          <h3>Baseline → Current Delta Impact</h3>
          <p>
            Verify every modification made to the system model. Every modified component, relationship, API operation,
            risk finding, and proposed task is bound to its source instruction.
          </p>
        </div>
        <div className="panel-pills-bar">
          <span className="small-pill text-cyan">
            <GitCompare size={12} /> v{project.baseline?.version ?? 1} → v{project.version}
          </span>
          <span className="small-pill">
            {changedGroups.reduce((acc, g) => acc + g.entries.length, 0)} Total Delta{changedGroups.reduce((acc, g) => acc + g.entries.length, 0) === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {change && (
        <div className="impact-source-banner">
          <div className="source-header">
            <span className="source-tag">[SOURCE_RECORD // {change.id}]</span>
            <span className="source-version">Triggered at v{change.version}</span>
          </div>
          <p className="source-text">“{change.originalInstruction}”</p>
          <div className="source-footer">
            <small>Summary: {change.summary}</small>
          </div>
        </div>
      )}

      {/* Artifact Status Row */}
      <div className="impact-artifacts-grid" aria-label="Artifact update status">
        {groups.map((group) => {
          const count = group.entries.length;
          return (
            <div className={`impact-artifact-card ${count ? 'is-updated' : ''}`} key={group.id}>
              <div className="art-card-top">
                <b>{group.label}</b>
                <span className={`art-status-dot ${count ? 'updated' : ''}`} />
              </div>
              <span className="art-sub">
                {count ? `${count} change${count === 1 ? '' : 's'} · updated` : 'Unchanged from baseline'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Changed Groups Diff List */}
      {changedGroups.length ? (
        <div className="impact-groups-container">
          {changedGroups.map((group) => (
            <section className="impact-group-box" key={group.id}>
              <div className="impact-group-header">
                <h4>
                  <span className="group-bracket">[GROUP]</span> {group.label}
                </h4>
                <span className="group-count-chip">{group.entries.length} entries</span>
              </div>

              <div className="impact-entries-list">
                {group.entries.map((entry) => (
                  <article className="impact-entry-card" key={entry.id}>
                    <div className="entry-card-title">
                      <span className={`diff-status-pill status-${entry.status}`}>
                        {entry.status === 'added' ? <ArrowUp size={11} /> : entry.status === 'removed' ? <ArrowDown size={11} /> : <Minus size={11} />}
                        {statusLabels[entry.status]}
                      </span>
                      <b className="entry-label">{entry.label}</b>
                    </div>

                    <div className="diff-comparison-table">
                      {entry.status !== 'added' && (
                        <div className="diff-row before">
                          <span className="diff-tag">BEFORE (v1):</span>
                          <span className="diff-val">{describe(entry.before)}</span>
                        </div>
                      )}
                      {entry.status !== 'removed' && (
                        <div className="diff-row after">
                          <span className="diff-tag">AFTER (v{project.version}):</span>
                          <span className="diff-val">{describe(entry.after)}</span>
                        </div>
                      )}
                    </div>

                    <div className="impact-provenance-bar">
                      <span className="prov-change-id">{entry.changeId}</span>
                      <span className="prov-inst">Provenance: “{entry.instruction}”</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="impact-empty-state">
          <GitCompare size={26} className="text-muted" />
          <b>No deltas detected on this baseline</b>
          <p>Dictate or select a prompt and click "Review & Apply Change" to generate a complete architectural diff.</p>
        </div>
      )}

      {/* Manual Decisions Section */}
      <section className="manual-decisions-card">
        <div className="manual-decisions-header">
          <AlertTriangle size={18} className="text-amber flex-none" />
          <div>
            <h4>[GOVERNANCE // UNRESOLVED_DECISIONS]</h4>
            <p>These architectural points are deliberately preserved as open requirements; the system does not guess values.</p>
          </div>
        </div>

        <div className="manual-decisions-list">
          {decisions.map((decision) => (
            <article key={decision.id} className="manual-decision-item">
              <div className="decision-item-top">
                <b>{decision.title}</b>
                <span className="decision-id-tag">{decision.id}</span>
              </div>
              <p className="decision-detail">{decision.detail}</p>
              <div className="decision-item-meta">
                <span>Provenance: {decision.changeId}</span>
                <span>Source: “{decision.instruction}”</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
