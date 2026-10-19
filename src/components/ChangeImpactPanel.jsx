import { AlertTriangle, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { deriveChangeDiff, deriveManualDecisions } from '../data/changeDiff.js';

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
  return <section className="impact-panel">
    <div className="panel-intro"><div><h3>Baseline → current impact</h3><p>Compare the saved Commerce Platform baseline with the current model. Every changed entry is tied to its source instruction.</p></div><span className="small-pill">v{project.baseline?.version ?? '—'} → v{project.version}</span></div>
    {change && <div className="impact-source"><b>Latest source · {change.id}</b><p>{change.originalInstruction}</p></div>}
    <div className="impact-artifacts" aria-label="Artifact update status">{groups.map((group) => <div className={`impact-artifact ${group.entries.length ? 'updated' : ''}`} key={group.id}><b>{group.label}</b><span>{group.entries.length ? `${group.entries.length} change${group.entries.length === 1 ? '' : 's'} · updated` : 'No difference from baseline'}</span></div>)}</div>
    {changedGroups.length ? <div className="impact-groups">{changedGroups.map((group) => <section className="impact-group" key={group.id}><h4>{group.label}<span>{group.entries.length}</span></h4>{group.entries.map((entry) => <article className="impact-entry" key={entry.id}>
      <div className="impact-entry-title"><span className={`diff-status ${entry.status}`}>{entry.status === 'added' ? <ArrowUp size={12} /> : entry.status === 'removed' ? <ArrowDown size={12} /> : <Minus size={12} />}{statusLabels[entry.status]}</span><b>{entry.label}</b></div>
      {entry.status !== 'added' && <p><strong>Before:</strong> {describe(entry.before)}</p>}
      {entry.status !== 'removed' && <p><strong>After:</strong> {describe(entry.after)}</p>}
      <div className="impact-provenance"><b>{entry.changeId}</b><span>Source instruction: “{entry.instruction}”</span></div>
    </article>)}</section>)}</div> : <div className="impact-empty">No changes have been applied to this baseline yet. Preview and apply an instruction to see its impact.</div>}
    <section className="manual-decisions"><div className="manual-heading"><AlertTriangle size={16} /><div><h4>Manual decisions still required</h4><p>These remain open; the demo does not choose values or behavior for you.</p></div></div>{decisions.map((decision) => <article key={decision.id} className="manual-decision"><b>{decision.title}</b><span>{decision.detail}</span><small>{decision.changeId} · Source: “{decision.instruction}”</small></article>)}</section>
  </section>;
}
