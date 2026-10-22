import { useState } from 'react';
import { X, GitMerge, AlertTriangle, Check } from 'lucide-react';
import { sound } from '../utils/sound.ts';
import { useDialog } from '../hooks/useDialog.ts';
import type { ConflictResolutionChoice, MergeConflict } from '../data/semanticMerge.ts';

/** The choice made for each conflict, keyed by conflict id. */
type Resolutions = Record<string, ConflictResolutionChoice>;

export interface MergeConflictModalProps {
  sourceBranchName: string;
  targetBranchName: string;
  conflicts: MergeConflict[];
  onClose: () => void;
  onConfirmMerge: (resolutions: Resolutions) => void;
}

export default function MergeConflictModal({
  sourceBranchName,
  targetBranchName,
  conflicts,
  onClose,
  onConfirmMerge,
}: MergeConflictModalProps) {
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  const [resolutions, setResolutions] = useState<Resolutions>(() => {
    const initial: Resolutions = {};
    conflicts.forEach((c) => {
      initial[c.id] = 'source'; // Default to accepting incoming branch changes
    });
    return initial;
  });

  const allResolved = conflicts.every((c) => Boolean(resolutions[c.id]));

  function handleSelect(conflictId: string, choice: ConflictResolutionChoice) {
    sound.click();
    setResolutions((prev) => ({
      ...prev,
      [conflictId]: choice,
    }));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Resolve merge conflicts"
        className="modal-content conflict-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 740, width: '90vw' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <span className="eyebrow">[SEMANTIC_MERGE // 3_WAY_CONFLICT_RESOLUTION]</span>
            <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>
              Resolve Architecture Conflicts
            </h2>
          </div>
          <button type="button" className="button compact" onClick={onClose} aria-label="Cancel Merge">
            <X size={15} />
          </button>
        </div>

        <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 16 }}>
          Merging <b>{sourceBranchName}</b> into <b>{targetBranchName}</b> requires deciding between divergent architectural definitions.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 380, overflowY: 'auto', marginBottom: 20 }}>
          {conflicts.map((conflict) => {
            const currentChoice = resolutions[conflict.id];
            return (
              <div
                key={conflict.id}
                style={{
                  padding: 14,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line-mid)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <AlertTriangle size={15} className="text-amber" />
                  <b style={{ fontSize: 13 }}>{conflict.description}</b>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                  {/* Target Choice */}
                  <div
                    onClick={() => handleSelect(conflict.id, 'target')}
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: currentChoice === 'target' ? '1.5px solid var(--cyan)' : '1px solid var(--line-dim)',
                      background: currentChoice === 'target' ? 'rgba(78, 242, 210, 0.08)' : 'var(--surface-1)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="eyebrow">KEEP TARGET ({targetBranchName})</span>
                      {currentChoice === 'target' && <Check size={14} className="text-cyan" />}
                    </div>
                    <pre style={{ margin: 0, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-pure)' }}>
                      {JSON.stringify(conflict.targetValue, null, 2)}
                    </pre>
                  </div>

                  {/* Source Choice */}
                  <div
                    onClick={() => handleSelect(conflict.id, 'source')}
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: currentChoice === 'source' ? '1.5px solid var(--va-violet)' : '1px solid var(--line-dim)',
                      background: currentChoice === 'source' ? 'rgba(167, 139, 250, 0.08)' : 'var(--surface-1)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="eyebrow" style={{ color: 'var(--va-violet)' }}>ACCEPT SOURCE ({sourceBranchName})</span>
                      {currentChoice === 'source' && <Check size={14} style={{ color: 'var(--va-violet)' }} />}
                    </div>
                    <pre style={{ margin: 0, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-pure)' }}>
                      {JSON.stringify(conflict.sourceValue, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="button compact" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button compact accent"
            disabled={!allResolved}
            onClick={() => {
              sound.apply();
              onConfirmMerge(resolutions);
            }}
          >
            <GitMerge size={13} style={{ marginRight: 6 }} /> Apply 3-Way Merge
          </button>
        </div>
      </div>
    </div>
  );
}

