import { X, DollarSign, ShieldAlert, Zap, Layers, TrendingUp, TrendingDown, Check, AlertTriangle } from 'lucide-react';
import { sound } from '../utils/sound.js';

export default function ScenarioComparisonModal({
  comparison,
  onClose,
  onSelectBranch,
}) {
  const { branchA, branchB, costDeltaMonthly, riskDelta, componentChanges } = comparison;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Scenario Comparison">
      <div
        className="modal-content scenario-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 860, width: '92vw' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <span className="eyebrow">[SCENARIO_COMPARISON // TRADE_OFF_ANALYSIS]</span>
            <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>Architecture Branch Comparison</h2>
          </div>
          <button type="button" className="button compact" onClick={onClose} aria-label="Close Comparison">
            <X size={15} />
          </button>
        </div>

        {/* Executive Summary Bar */}
        <div className="comparison-summary-strip">
          <div className="summary-stat">
            <span className="stat-label">Monthly Cost Delta</span>
            <b className={costDeltaMonthly > 0 ? 'text-amber' : 'text-emerald'}>
              {costDeltaMonthly > 0 ? `+$${costDeltaMonthly}/mo for Scenario B` : `-$${Math.abs(costDeltaMonthly)}/mo for Scenario B`}
            </b>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Resilience Trade-off</span>
            <span>
              {branchB.hasSinglePointOfFailure
                ? 'Scenario B has single DB SPOF'
                : 'Scenario B has Multi-AZ Read Replicas'}
            </span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Component Delta</span>
            <span>
              {componentChanges.addedInB.length} added · {componentChanges.removedInB.length} removed
            </span>
          </div>
        </div>

        {/* Side-by-Side Comparison Grid */}
        <div className="scenario-comparison-grid">
          {/* Card A: Serverless */}
          <div className="scenario-card">
            <div className="scenario-card-header">
              <span className="eyebrow" style={{ color: '#38bdf8' }}>SCENARIO A</span>
              <h3>{branchA.name}</h3>
            </div>

            <div className="scenario-metrics-list">
              <div className="metric-row">
                <span className="metric-name">Estimated Cost</span>
                <span className="metric-value font-mono text-emerald">
                  ${branchA.estimatedCostPerMonth} <small>/mo (On-Demand)</small>
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Compute Tier</span>
                <span className="metric-value font-mono">AWS Lambda (Serverless)</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Database Model</span>
                <span className="metric-value font-mono">DynamoDB Global Table</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Components</span>
                <span className="metric-value font-mono">{branchA.componentCount} nodes</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Open Risk Findings</span>
                <span className="metric-value font-mono">{branchA.riskCount} items</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Max Blast Radius</span>
                <span className="metric-value font-mono">{branchA.maxBlastRadius} nodes impacted</span>
              </div>
            </div>

            <button
              type="button"
              className="button compact full-width"
              onClick={() => {
                sound.click();
                onSelectBranch('branch-serverless');
                onClose();
              }}
              style={{ marginTop: 16 }}
            >
              Switch to Scenario A
            </button>
          </div>

          {/* Card B: Kubernetes & PostgreSQL Replicas */}
          <div className="scenario-card">
            <div className="scenario-card-header">
              <span className="eyebrow" style={{ color: '#a78bfa' }}>SCENARIO B</span>
              <h3>{branchB.name}</h3>
            </div>

            <div className="scenario-metrics-list">
              <div className="metric-row">
                <span className="metric-name">Estimated Cost</span>
                <span className="metric-value font-mono text-amber">
                  ${branchB.estimatedCostPerMonth} <small>/mo (Reserved Cluster)</small>
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Compute Tier</span>
                <span className="metric-value font-mono">Kubernetes Pod Replicas</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Database Model</span>
                <span className="metric-value font-mono">PostgreSQL Primary + 2 Replicas</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Components</span>
                <span className="metric-value font-mono">{branchB.componentCount} nodes</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Open Risk Findings</span>
                <span className="metric-value font-mono">{branchB.riskCount} items</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Max Blast Radius</span>
                <span className="metric-value font-mono">{branchB.maxBlastRadius} nodes impacted</span>
              </div>
            </div>

            <button
              type="button"
              className="button compact full-width"
              onClick={() => {
                sound.click();
                onSelectBranch('branch-k8s-postgres');
                onClose();
              }}
              style={{ marginTop: 16 }}
            >
              Switch to Scenario B
            </button>
          </div>
        </div>

        {/* Detailed Component Diff Table */}
        <div style={{ marginTop: 20 }}>
          <div className="inspector-box-header" style={{ marginBottom: 10 }}>
            <b>Architectural Differences (Scenario B vs Scenario A)</b>
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line-mid)', borderRadius: 8 }}>
            <table className="scenario-diff-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Action</th>
                  <th style={{ padding: '8px 12px' }}>Component</th>
                  <th style={{ padding: '8px 12px' }}>Type</th>
                  <th style={{ padding: '8px 12px' }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {componentChanges.addedInB.map((comp) => (
                  <tr key={comp.id} style={{ borderTop: '1px solid var(--line-dim)' }}>
                    <td style={{ padding: '6px 12px', color: '#4ef2d2' }}>+ Added in B</td>
                    <td style={{ padding: '6px 12px', fontWeight: 600 }}>{comp.name}</td>
                    <td style={{ padding: '6px 12px', fontFamily: 'var(--font-mono)' }}>{comp.type}</td>
                    <td style={{ padding: '6px 12px', color: 'var(--text-dim)' }}>{comp.sub}</td>
                  </tr>
                ))}
                {componentChanges.removedInB.map((comp) => (
                  <tr key={comp.id} style={{ borderTop: '1px solid var(--line-dim)' }}>
                    <td style={{ padding: '6px 12px', color: '#f87171' }}>- Removed in B</td>
                    <td style={{ padding: '6px 12px', fontWeight: 600 }}>{comp.name}</td>
                    <td style={{ padding: '6px 12px', fontFamily: 'var(--font-mono)' }}>{comp.type}</td>
                    <td style={{ padding: '6px 12px', color: 'var(--text-dim)' }}>{comp.sub}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

