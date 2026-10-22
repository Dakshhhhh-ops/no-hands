import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { detectCycles } from '../data/graphCycle.ts';
import { referentialChecks } from '../data/referentialChecks.ts';
import type { ComponentType, Project } from '../types/schema.ts';

export interface TopologyPanelProps {
  project: Project;
}

const TYPE_ORDER: ComponentType[] = ['CLIENT', 'GATEWAY', 'SERVICE', 'CACHE', 'DATABASE', 'QUEUE', 'EXTERNAL'];
const TYPE_TONE: Record<ComponentType, string> = { CLIENT: 'violet', GATEWAY: 'amber', SERVICE: 'accent', CACHE: 'rose', DATABASE: 'teal', QUEUE: 'teal', EXTERNAL: 'muted' };
const TYPE_LABEL: Record<ComponentType, string> = { CLIENT: 'Clients', GATEWAY: 'Gateways', SERVICE: 'Services', CACHE: 'Caches', DATABASE: 'Databases', QUEUE: 'Queues', EXTERNAL: 'External' };
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Static topology of the current model. Every number is computed from the
 * project prop; nothing is measured from a running system.
 */
export default function TopologyPanel({ project }: TopologyPanelProps) {
  const components = project?.components || [];
  const relationships = project?.relationships || [];
  const requirements = project?.requirements || [];
  const nameOf = (id: string) => components.find((c) => c.id === id)?.name || id;
  // Only an imported project can tell built components from planned ones.
  const fromCode = components.some((c) => c.origin === 'code');

  const typeCounts = TYPE_ORDER
    .map((type) => ({ type, count: components.filter((c) => c.type === type).length }))
    .filter((row) => row.count > 0);

  const protocolCounts = [...relationships.reduce((map, r) => {
    const key = r.protocol?.trim();
    return key ? map.set(key, (map.get(key) || 0) + 1) : map;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
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

  const passing = checks.filter((c) => c.ok).length;

  return (
    <section className="vp" aria-label="Topology">
      <header className="vp-head">
        <div>
          <h3 className="vp-title">Topology</h3>
          <p className="vp-lead">The static structure of the current model (v{project.version}). Every figure is computed from its components, connections, and requirements.</p>
        </div>
        <p className="vp-meta">
          {plural(components.length, 'component')} · {plural(relationships.length, 'connection')} · {plural(requirements.length, 'requirement')}
        </p>
      </header>

      {typeCounts.length > 0 && (
        <div className="vp-stats" aria-label="Components by type">
          {typeCounts.map(({ type, count }) => (
            <div className="vp-stat" key={type}>
              <b>{count}</b>
              <span className="vp-tag" data-tone={TYPE_TONE[type]}>{TYPE_LABEL[type] || type}</span>
            </div>
          ))}
        </div>
      )}

      <div className="vp-split">
        <div className="vp-box">
          <p className="vp-box-title">Model checks <small>{passing} of {checks.length} pass</small></p>
          <ul className="vp-checklist">
            {checks.map((check) => (
              <li key={check.title} data-ok={check.ok}>
                {check.ok ? <CheckCircle2 size={16} className="vp-ok" aria-label="Passes" /> : <AlertTriangle size={16} className="vp-warn" aria-label="Needs attention" />}
                <div>
                  <b>{check.title}</b>
                  <span>{check.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="vp-box">
          <p className="vp-box-title">Protocols <small>{plural(protocolCounts.length, 'recorded protocol')}</small></p>
          {protocolCounts.length > 0 && (
            <ul className="vp-bars">
              {protocolCounts.map(([protocol, count]) => (
                <li key={protocol}>
                  <span>{protocol}</span>
                  <i style={{ width: `${(count / maxProtocolCount) * 100}%` }} />
                  <small>{plural(count, 'connection')}</small>
                </li>
              ))}
            </ul>
          )}
          <p className="vp-hint">
            {relationships.length === 0
              ? 'No connections yet.'
              : withoutProtocol === relationships.length
                ? 'No connection in this model records a protocol.'
                : `${plural(withoutProtocol, 'connection')} without a recorded protocol.`}
          </p>
        </div>
      </div>

      <section className="vp-section" aria-label="Components">
        <div className="vp-section-head">
          <h4>Components</h4>
          <span>{components.length}</span>
        </div>
        <div className="vp-table-wrap">
          <table className="vp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Calls or sends to</th>
                <th>Used by</th>
                {fromCode && <th>Source</th>}
              </tr>
            </thead>
            <tbody>
              {components.map((c) => {
                const outgoing = relationships.filter((r) => r.from === c.id);
                const incoming = relationships.filter((r) => r.to === c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                      <small><span className="vp-mono">{c.id}</span>{c.sub ? ` · ${c.sub}` : ''}</small>
                    </td>
                    <td><span className="vp-tag" data-tone={TYPE_TONE[c.type] || 'muted'}>{c.type.toLowerCase()}</span></td>
                    <td>
                      {outgoing.length ? (
                        <div className="vp-links">
                          {outgoing.map((e) => (
                            <span key={`${e.from}-${e.to}`} className="vp-link">
                              {nameOf(e.to)} <small>{[e.label, e.protocol].filter(Boolean).join(' · ')}</small>
                            </span>
                          ))}
                        </div>
                      ) : <span className="vp-none">None</span>}
                    </td>
                    <td>{incoming.length ? incoming.map((e) => nameOf(e.from)).join(', ') : <span className="vp-none">None</span>}</td>
                    {fromCode && (
                      <td>
                        {c.origin === 'code'
                          ? <span className="vp-tag" data-tone="teal">In code</span>
                          : <span className="vp-tag" data-tone="amber">Planned</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
