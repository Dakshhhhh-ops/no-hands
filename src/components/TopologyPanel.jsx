import { Layers, Network, ShieldCheck, Zap } from 'lucide-react';
import { detectCycles } from '../data/graphCycle.ts';

const TYPE_ORDER = ['CLIENT', 'GATEWAY', 'SERVICE', 'CACHE', 'DATABASE', 'QUEUE', 'EXTERNAL'];
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Every reference in the model that must point at something real, and whether it does. */
export function referentialChecks(project) {
  const components = project?.components || [];
  const relationships = project?.relationships || [];
  const apiOperations = project?.apiOperations || [];
  const requirements = project?.requirements || [];
  const ids = new Set(components.map((c) => c.id));
  const seen = (list, key) => {
    const counts = new Map();
    list.forEach((item) => counts.set(key(item), (counts.get(key(item)) || 0) + 1));
    return list.map((item) => counts.get(key(item)) === 1);
  };
  const results = [
    ...relationships.map((r) => ({ ok: ids.has(r.from), problem: `Connection from unknown component "${r.from}"` })),
    ...relationships.map((r) => ({ ok: ids.has(r.to), problem: `Connection to unknown component "${r.to}"` })),
    ...apiOperations.map((a) => ({ ok: ids.has(a.componentId), problem: `API ${a.method?.toUpperCase()} ${a.path} owned by unknown component "${a.componentId}"` })),
    ...seen(components, (c) => c.id).map((ok, i) => ({ ok, problem: `Duplicate component id "${components[i].id}"` })),
    ...seen(relationships, (r) => `${r.from}>${r.to}`).map((ok, i) => ({ ok, problem: `Duplicate connection ${relationships[i].from} → ${relationships[i].to}` })),
    ...seen(requirements, (q) => q.id).map((ok, i) => ({ ok, problem: `Duplicate requirement id "${requirements[i].id}"` })),
  ];
  const passed = results.filter((r) => r.ok).length;
  return {
    total: results.length,
    passed,
    percent: results.length ? Math.round((passed / results.length) * 100) : 100,
    problems: [...new Set(results.filter((r) => !r.ok).map((r) => r.problem))],
  };
}

/**
 * Static topology of the current model. Every number is computed from the
 * project prop; nothing is measured from a running system.
 */
export default function TopologyPanel({ project }) {
  const components = project?.components || [];
  const relationships = project?.relationships || [];
  const requirements = project?.requirements || [];
  const nameOf = (id) => components.find((c) => c.id === id)?.name || id;

  const typeCounts = TYPE_ORDER
    .map((type) => ({ type, count: components.filter((c) => c.type === type).length }))
    .filter((row) => row.count > 0);

  const protocolCounts = [...relationships.reduce((map, r) => {
    const key = r.protocol?.trim();
    return key ? map.set(key, (map.get(key) || 0) + 1) : map;
  }, new Map())].sort((a, b) => b[1] - a[1]);
  const withoutProtocol = relationships.filter((r) => !r.protocol?.trim()).length;
  const maxProtocolCount = Math.max(1, ...protocolCounts.map(([, count]) => count));

  const integrity = referentialChecks(project);
  const connected = new Set(relationships.flatMap((r) => [r.from, r.to]));
  const isolated = components.filter((c) => !connected.has(c.id));
  const undocumented = components.filter((c) => !(c.responsibilities || []).some((line) => line.trim()));
  const openRequirements = requirements.filter((r) => r.status === 'unresolved' || /unresolved/i.test(r.text));
  const cycles = detectCycles(components, relationships);

  const checks = [
    {
      ok: integrity.problems.length === 0,
      title: `Referential integrity ${integrity.percent}%`,
      detail: integrity.problems.length
        ? integrity.problems.slice(0, 3).join('; ')
        : `${integrity.passed} of ${integrity.total} references resolve: connection endpoints, API owners, and unique ids.`,
    },
    {
      ok: !cycles.hasCycle,
      title: cycles.hasCycle ? plural(cycles.cycleCount, 'dependency cycle') : 'No dependency cycles',
      detail: cycles.hasCycle
        ? cycles.cycles.slice(0, 2).map((cycle) => cycle.map(nameOf).join(' → ')).join('; ')
        : 'No component depends on itself through other components.',
    },
    {
      ok: isolated.length === 0,
      title: isolated.length ? plural(isolated.length, 'isolated component') : 'Every component is connected',
      detail: isolated.length ? isolated.map((c) => c.name).join(', ') : 'Each component has at least one connection.',
    },
    {
      ok: undocumented.length === 0,
      title: undocumented.length ? `${plural(undocumented.length, 'component')} without a described role` : 'Every component has a described role',
      detail: undocumented.length ? undocumented.map((c) => c.name).join(', ') : 'Responsibilities are recorded for each component.',
    },
    {
      ok: openRequirements.length === 0,
      title: openRequirements.length ? plural(openRequirements.length, 'open requirement') : 'No open requirements',
      detail: openRequirements.length ? openRequirements.map((r) => r.id).join(', ') : 'Every recorded requirement has its decisions filled in.',
    },
  ];

  return (
    <section className="telemetry-panel" aria-label="Topology">
      <div className="panel-intro">
        <div>
          <h3>Topology</h3>
          <p>The static structure of the current model (v{project.version}). Every figure is computed from its components, connections, and requirements.</p>
        </div>
        <div className="telemetry-pills-bar">
          <span className="small-pill text-cyan"><Layers size={11} /> {plural(components.length, 'component')}</span>
          <span className="small-pill text-green"><Network size={11} /> {plural(relationships.length, 'connection')}</span>
          <span className="small-pill"><Zap size={11} /> {plural(requirements.length, 'requirement')}</span>
        </div>
      </div>

      <div className="telemetry-kpi-grid">
        {typeCounts.map(({ type, count }) => (
          <div className="telemetry-kpi-card" key={type}>
            <div className="kpi-top"><span className="kpi-label">{type.toLowerCase()}</span></div>
            <div className="kpi-val">{count}</div>
          </div>
        ))}
      </div>

      <div className="telemetry-split-layout">
        <div className="telemetry-section-box">
          <div className="box-header">
            <h4>Protocols</h4>
            <span className="badge-tag">{plural(protocolCounts.length, 'recorded protocol')}</span>
          </div>
          {protocolCounts.length > 0 && (
            <div className="protocol-list">
              {protocolCounts.map(([protocol, count]) => (
                <div key={protocol} className="protocol-item">
                  <div className="protocol-meta"><span className="protocol-name">{protocol}</span></div>
                  <div className="protocol-bar-wrap">
                    <div className="protocol-bar" style={{ width: `${(count / maxProtocolCount) * 100}%`, backgroundColor: 'var(--va-accent)' }} />
                  </div>
                  <span className="protocol-count">{plural(count, 'connection')}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-muted">
            {relationships.length === 0
              ? 'No connections yet.'
              : withoutProtocol === relationships.length
                ? 'No connection in this model records a protocol.'
                : `${plural(withoutProtocol, 'connection')} without a recorded protocol.`}
          </p>
        </div>

        <div className="telemetry-section-box">
          <div className="box-header">
            <h4>Model checks</h4>
            <span className={`badge-tag ${checks.every((c) => c.ok) ? 'status-ok' : ''}`}>
              {checks.filter((c) => c.ok).length} of {checks.length} pass
            </span>
          </div>
          <div className="governance-checklist">
            {checks.map((check) => (
              <div className="gov-item" key={check.title} data-ok={check.ok}>
                <ShieldCheck size={14} className={check.ok ? 'text-cyan' : 'text-amber'} />
                <div>
                  <b>{check.title}</b>
                  <p>{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="telemetry-table-container">
        <div className="table-header-bar">
          <h4>Components</h4>
          <span className="table-count">{components.length}</span>
        </div>
        <div className="table-responsive">
          <table className="telemetry-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Name</th>
                <th>Type</th>
                <th>Calls or sends to</th>
                <th>Used by</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => {
                const outgoing = relationships.filter((r) => r.from === c.id);
                const incoming = relationships.filter((r) => r.to === c.id);
                return (
                  <tr key={c.id}>
                    <td><code className="code-pill">{c.id}</code></td>
                    <td>
                      <b className="comp-name">{c.name}</b>
                      <small className="comp-sub">{c.sub}</small>
                    </td>
                    <td><span className={`comp-type-pill type-${c.type.toLowerCase()}`}>{c.type}</span></td>
                    <td>
                      {outgoing.length ? (
                        <div className="edge-targets">
                          {outgoing.map((e) => (
                            <span key={`${e.from}-${e.to}`} className="edge-target-chip">
                              → {nameOf(e.to)} <small>({e.label}{e.protocol ? `, ${e.protocol}` : ''})</small>
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-muted">None</span>}
                    </td>
                    <td>{incoming.length ? incoming.map((e) => nameOf(e.from)).join(', ') : <span className="text-muted">None</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
