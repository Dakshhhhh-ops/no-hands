import { RotateCcw, Flame, Clock, Zap } from 'lucide-react';
import { ASSUMED_INGRESS_RPS, ASSUMED_HOP_LATENCY_MS, ASSUMED_CACHE_FALLBACK_PENALTY_MS } from '../../data/chaosSimulator.ts';
import type { ChaosInjection, ChaosSimulationResult, ChaosTargetType } from '../../data/chaosSimulator.ts';
import type { ChaosTarget } from './diagramTypes.ts';
import './chaosBar.css';

export interface ChaosBarProps {
  chaosTargets: ChaosTarget[];
  chaosInjections: ChaosInjection[];
  toggleChaos: (
    targetComponentId: string,
    type: ChaosTargetType,
    label: string,
    extra?: Pick<ChaosInjection, 'latencyMs'>,
  ) => void;
  restoreAllChaos: () => void;
  telemetry: ChaosSimulationResult;
}

export default function ChaosBar({ chaosTargets, chaosInjections, toggleChaos, restoreAllChaos, telemetry }: ChaosBarProps) {
  return (
    <div className="diagram-chaos-bar">
      <div className="chaos-actions">
        <span className="chaos-label">
          <Flame size={13} style={{ color: 'var(--va-rose)' }} /> Outage simulator:
        </span>
        {chaosTargets.map(({ component, kind, label }) => {
          const active = chaosInjections.some((c) => c.targetComponentId === component.id);
          return (
            <button
              key={component.id}
              type="button"
              className={`chaos-btn ${active ? (kind === 'LATENCY_SPIKE' ? 'active-warn' : 'active-kill') : ''}`}
              aria-pressed={active}
              onClick={() => toggleChaos(component.id, kind, label, kind === 'LATENCY_SPIKE' ? { latencyMs: 1500 } : undefined)}
              title={kind === 'LATENCY_SPIKE' ? `Simulate 1500ms of added latency at ${component.name}` : `Simulate ${component.name} going down`}
            >
              {kind === 'LATENCY_SPIKE' ? <Clock size={11} /> : <Zap size={11} />} {label}
            </button>
          );
        })}
        {chaosInjections.length > 0 && (
          <button
            type="button"
            className="chaos-btn restore-btn"
            onClick={restoreAllChaos}
            title="Clear all simulated outages and latency"
          >
            <RotateCcw size={11} /> Restore All
          </button>
        )}
      </div>

      <div className="chaos-telemetry-stats" title="Modeled from this diagram, not measured.">
        <span className="telemetry-simulated-tag">Simulated</span>
        <div className={`telemetry-health-badge ${telemetry.overallSystemHealth.toLowerCase()}`}>
          {telemetry.overallSystemHealth}
        </div>
        <div className="telemetry-pill">
          <span>Flow:</span> <b>{telemetry.totalRpsThroughput} RPS</b>
        </div>
        {telemetry.droppedRps > 0 && (
          <div className="telemetry-pill" style={{ color: 'var(--va-rose)' }}>
            <span>Drop:</span> <b>{telemetry.droppedRps} RPS</b>
          </div>
        )}
        <div className="telemetry-pill">
          <span>Latency:</span> <b>{telemetry.averageLatencyMs}ms</b>
        </div>
        <div className="telemetry-pill">
          <span>Slowest path:</span> <b>{telemetry.slowestPathMs}ms</b>
        </div>
      </div>
      <p className="chaos-assumptions">
        Simulated, not measured. Assumes {ASSUMED_INGRESS_RPS.toLocaleString()} requests per second entering at the clients, {ASSUMED_HOP_LATENCY_MS}ms per component, and +{ASSUMED_CACHE_FALLBACK_PENALTY_MS}ms when a cache falls back to its database. A cache outage counts as survivable only if a requirement records a fallback.
      </p>
    </div>
  );
}
