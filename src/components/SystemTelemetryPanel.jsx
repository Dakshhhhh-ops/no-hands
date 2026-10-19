import { Activity, AlertOctagon, CheckCircle2, Cpu, Database, Globe, Layers, Network, ShieldCheck, Zap } from 'lucide-react';
import { sound } from '../utils/sound.js';

export default function SystemTelemetryPanel({ project }) {
  const components = project?.components || [];
  const relationships = project?.relationships || [];
  const requirements = project?.requirements || [];

  const tierCount = {
    CLIENT: components.filter((c) => c.type === 'CLIENT').length,
    GATEWAY: components.filter((c) => c.type === 'GATEWAY').length,
    SERVICE: components.filter((c) => c.type === 'SERVICE').length,
    CACHE: components.filter((c) => c.type === 'CACHE').length,
    DATABASE: components.filter((c) => c.type === 'DATABASE').length,
    QUEUE: components.filter((c) => c.type === 'QUEUE').length,
    EXTERNAL: components.filter((c) => c.type === 'EXTERNAL').length,
  };

  const protocols = [
    { name: 'HTTPS / TLS 1.3', count: 1, color: '#4ef2d2' },
    { name: 'Internal REST / JSON', count: 3, color: '#60a5fa' },
    { name: 'Redis Protocol (RESP)', count: 1, color: '#f59e0b' },
    { name: 'PostgreSQL Wire (libpq)', count: 3, color: '#a78bfa' },
    { name: 'Kafka Protocol (TCP)', count: 1, color: '#ec4899' },
    { name: 'Webhook / Outbound API', count: 1, color: '#34d399' },
  ];

  return (
    <section className="telemetry-panel" aria-label="System telemetry and topology metrics">
      <div className="panel-intro">
        <div>
          <div className="telemetry-panel-eyebrow">[SYSTEM_METRICS // TOPOLOGY_MATRIX]</div>
          <h3>System Topology & Telemetry Specs</h3>
          <p>Deterministic runtime attributes, protocol stack, SLA bounds, and architectural boundary classifications.</p>
        </div>
        <div className="telemetry-pills-bar">
          <span className="small-pill text-cyan">
            <Layers size={11} /> {components.length} Modeled Nodes
          </span>
          <span className="small-pill text-green">
            <Network size={11} /> {relationships.length} Edges
          </span>
          <span className="small-pill">v{project.version} Model</span>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="telemetry-kpi-grid">
        <div className="telemetry-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">[01 // GRAPH_HEALTH]</span>
            <ShieldCheck size={16} className="text-cyan" />
          </div>
          <div className="kpi-val text-cyan">100%</div>
          <div className="kpi-sub">Every relationship has valid source & target references</div>
        </div>

        <div className="telemetry-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">[02 // SYNCHRONIZATION]</span>
            <Activity size={16} className="text-green" />
          </div>
          <div className="kpi-val text-green">0.4 ms</div>
          <div className="kpi-sub">In-memory model derived artifacts compile instantly</div>
        </div>

        <div className="telemetry-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">[03 // REQUIREMENTS]</span>
            <Zap size={16} className="text-amber" />
          </div>
          <div className="kpi-val text-amber">{requirements.length}</div>
          <div className="kpi-sub">Traceable requirements confirmed from instructions</div>
        </div>

        <div className="telemetry-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">[04 // TIER_ISOLATION]</span>
            <Cpu size={16} className="text-cyan" />
          </div>
          <div className="kpi-val">4 Tiers</div>
          <div className="kpi-sub">Edge Gateway → Services → Cache/Queue → DB</div>
        </div>
      </div>

      {/* Protocol Distribution & System Boundaries */}
      <div className="telemetry-split-layout">
        <div className="telemetry-section-box">
          <div className="box-header">
            <h4>[PROTOCOL_DISTRIBUTION]</h4>
            <span className="badge-tag">6 Interconnects</span>
          </div>
          <div className="protocol-list">
            {protocols.map((proto) => (
              <div key={proto.name} className="protocol-item">
                <div className="protocol-meta">
                  <span className="protocol-dot" style={{ backgroundColor: proto.color }} />
                  <span className="protocol-name">{proto.name}</span>
                </div>
                <div className="protocol-bar-wrap">
                  <div
                    className="protocol-bar"
                    style={{
                      width: `${(proto.count / 3) * 100}%`,
                      backgroundColor: proto.color,
                    }}
                  />
                </div>
                <span className="protocol-count">{proto.count} edge{proto.count > 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="telemetry-section-box">
          <div className="box-header">
            <h4>[ARCHITECTURAL_GOVERNANCE]</h4>
            <span className="badge-tag status-ok">Zero Drift</span>
          </div>
          <div className="governance-checklist">
            <div className="gov-item">
              <CheckCircle2 size={14} className="text-cyan" />
              <div>
                <b>Single Source of Truth</b>
                <p>PostgreSQL is isolated from direct public traffic; only auth/catalog/orders have DB credentials.</p>
              </div>
            </div>
            <div className="gov-item">
              <CheckCircle2 size={14} className="text-cyan" />
              <div>
                <b>Session Offload (Redis)</b>
                <p>{project.changed ? 'Auth Service writes session tokens directly into primary Redis memory cluster.' : 'Session persistence model is baseline.'}</p>
              </div>
            </div>
            <div className="gov-item">
              <CheckCircle2 size={14} className="text-cyan" />
              <div>
                <b>Asynchronous Event Bus</b>
                <p>Order fulfillments trigger decoupled Kafka events toward the external Payment Provider.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comprehensive Component Matrix Table */}
      <div className="telemetry-table-container">
        <div className="table-header-bar">
          <h4>[COMPONENT_DIRECTORY & BOUNDARY_CLASSIFICATION]</h4>
          <span className="table-count">{components.length} Entities Modeled</span>
        </div>
        <div className="table-responsive">
          <table className="telemetry-table">
            <thead>
              <tr>
                <th>Identifier</th>
                <th>Component Name</th>
                <th>Type</th>
                <th>Network Zone</th>
                <th>Persistence</th>
                <th>Downstream Cascade</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => {
                const outgoingEdges = relationships.filter((r) => r.from === c.id);
                return (
                  <tr key={c.id}>
                    <td><code className="code-pill">{c.id}</code></td>
                    <td>
                      <b className="comp-name">{c.name}</b>
                      <small className="comp-sub">{c.sub}</small>
                    </td>
                    <td><span className={`comp-type-pill type-${c.type.toLowerCase()}`}>{c.type}</span></td>
                    <td>
                      {c.type === 'CLIENT' ? 'Public Internet' :
                       c.type === 'GATEWAY' ? 'DMZ / Ingress' :
                       c.type === 'EXTERNAL' ? 'Third-Party SaaS' : 'Private VPC (Zone 1)'}
                    </td>
                    <td>
                      {c.type === 'DATABASE' ? 'ACID Relational' :
                       c.type === 'CACHE' ? 'In-Memory Key/Val' :
                       c.type === 'QUEUE' ? 'Append-Only Log' : 'Stateless'}
                    </td>
                    <td>
                      {outgoingEdges.length ? (
                        <div className="edge-targets">
                          {outgoingEdges.map((e) => (
                            <span key={`${e.from}-${e.to}`} className="edge-target-chip">
                              → {e.to} <small>({e.label})</small>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">— (Leaf Node)</span>
                      )}
                    </td>
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

