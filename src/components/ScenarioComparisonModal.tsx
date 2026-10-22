import { X } from 'lucide-react';
import { sound } from '../utils/sound.ts';
import { useDialog } from '../hooks/useDialog.ts';
import type { BranchComparisonMetrics, ScenarioComparison } from '../data/branching.ts';
import './scenarioComparisonModal.css';

/** The numeric measures of a branch: every metric except its id and name. */
type MetricKey = Exclude<keyof BranchComparisonMetrics, 'id' | 'name'>;
type ComparisonRow = [key: MetricKey, label: string, format?: (v: number) => string];

export interface ScenarioComparisonModalProps {
  comparison: ScenarioComparison;
  onClose: () => void;
  onSelectBranch: (branchId: string) => void;
}

const ROWS: ComparisonRow[] = [
  ['version', 'Model version', (v) => `v${v}`],
  ['componentCount', 'Components'],
  ['relationshipCount', 'Connections'],
  ['serviceCount', 'Services'],
  ['storageCount', 'Data stores and queues'],
  ['databaseCount', 'Databases'],
  ['riskCount', 'Risk findings'],
  ['unresolvedCount', 'Open decisions'],
  ['maxBlastRadius', 'Largest blast radius', (v) => `${v} component${v === 1 ? '' : 's'}`],
];

function delta(a: number, b: number) {
  const d = b - a;
  return d === 0 ? 'no change' : `${d > 0 ? '+' : ''}${d}`;
}

/**
 * Compares the current branch with main. Every value is computed from the two
 * models; nothing is estimated, priced, or prewritten.
 */
export default function ScenarioComparisonModal({ comparison, onClose, onSelectBranch }: ScenarioComparisonModalProps) {
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  const { branchA, branchB, riskDelta, componentChanges, connectionChanges } = comparison;
  const { addedInB, removedInB, modifiedInB } = componentChanges;
  const noDifferences = !addedInB.length && !removedInB.length && !modifiedInB.length
    && !connectionChanges.addedInB.length && !connectionChanges.removedInB.length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Branch comparison"
        className="modal-content scenario-modal comparison-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 820, width: '92vw', maxHeight: '90vh', overflowY: 'auto', padding: 24 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{branchB.name} compared with {branchA.name}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--va-muted)' }}>Computed from both models. Nothing here is estimated.</p>
          </div>
          <button type="button" className="button compact" onClick={onClose} aria-label="Close comparison">
            <X size={15} />
          </button>
        </div>

        <div className="comparison-summary-strip">
          <div className="summary-stat">
            <span className="stat-label">Components</span>
            <b>{delta(branchA.componentCount, branchB.componentCount)}</b>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Connections</span>
            <b>{delta(branchA.relationshipCount, branchB.relationshipCount)}</b>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Risk findings</span>
            <b className={riskDelta > 0 ? 'text-amber' : riskDelta < 0 ? 'text-emerald' : ''}>{delta(branchA.riskCount, branchB.riskCount)}</b>
          </div>
        </div>

        <table className="scenario-diff-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: '6px 10px' }}>Measure</th>
              <th style={{ padding: '6px 10px' }}>{branchA.name}</th>
              <th style={{ padding: '6px 10px' }}>{branchB.name}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([key, label, format = (v: number): string | number => v]) => (
              <tr key={key} style={{ borderTop: '1px solid var(--va-line)' }}>
                <td style={{ padding: '6px 10px' }}>{label}</td>
                <td style={{ padding: '6px 10px', fontFamily: 'var(--va-mono)' }}>{format(branchA[key])}</td>
                <td style={{ padding: '6px 10px', fontFamily: 'var(--va-mono)' }}>{format(branchB[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 18 }}>
          <b style={{ fontSize: 13 }}>What {branchB.name} changes</b>
          {noDifferences ? (
            <p style={{ fontSize: 12, color: 'var(--va-muted)' }}>No differences yet. Apply a change on this branch, then compare again.</p>
          ) : (
            <ul style={{ fontSize: 12, margin: '8px 0 0', paddingLeft: 18, maxHeight: 200, overflowY: 'auto' }}>
              {addedInB.map((c) => <li key={`add-${c.id}`}>Adds {c.name} ({c.type.toLowerCase()})</li>)}
              {removedInB.map((c) => <li key={`rm-${c.id}`}>Removes {c.name} ({c.type.toLowerCase()})</li>)}
              {modifiedInB.map(({ id, before, after }) => (
                <li key={`mod-${id}`}>Changes {before.name}{before.name !== after.name ? ` to ${after.name}` : ''}{before.type !== after.type ? `, ${before.type.toLowerCase()} to ${after.type.toLowerCase()}` : ''}</li>
              ))}
              {connectionChanges.addedInB.map((e) => <li key={`ea-${e}`}>Connects {e}</li>)}
              {connectionChanges.removedInB.map((e) => <li key={`er-${e}`}>Disconnects {e}</li>)}
            </ul>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            className="button compact"
            onClick={() => {
              sound.click();
              onSelectBranch('main');
              onClose();
            }}
          >
            Switch to {branchA.name}
          </button>
          <button type="button" className="button compact accent" onClick={onClose}>
            Keep working on {branchB.name}
          </button>
        </div>
      </div>
    </div>
  );
}
