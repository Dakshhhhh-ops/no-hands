import { useDialog } from '../../hooks/useDialog.ts';
import { X } from 'lucide-react';
import type { DeploymentPlan } from '../../data/graphTopology.ts';

export interface DeploymentSequenceDialogProps {
  deploymentPlan: DeploymentPlan;
  setShowDeploymentModal: (open: boolean) => void;
}

export default function DeploymentSequenceDialog({ deploymentPlan, setShowDeploymentModal }: DeploymentSequenceDialogProps) {
  // Focus moves in, Tab stays inside, Escape closes, and focus returns to the trigger.
  const dialogRef = useDialog<HTMLDivElement>(true, () => setShowDeploymentModal(false));

  return (
    <div className="modal-backdrop" onClick={() => setShowDeploymentModal(false)}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="deployment-dialog-title"
        className="modal-content"
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <span className="eyebrow">[TOPOLOGICAL_ORDER // KAHN_ALGORITHM]</span>
            <h3 id="deployment-dialog-title" style={{ margin: '4px 0 0' }}>System Boot & Deployment Sequence</h3>
          </div>
          <button
            type="button"
            className="button compact"
            onClick={() => setShowDeploymentModal(false)}
            aria-label="Close deployment order"
          >
            <X size={14} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 16 }}>
          Inverted topological sort: dependencies boot first so upstream consumers find their prerequisites online.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {deploymentPlan.stages.map((stage) => (
            <div
              key={stage.stage}
              style={{
                padding: '12px 14px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line-mid)',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                {/* The accent mixed toward the ink, so the stage label meets WCAG AA on the light panel. */}
                <b style={{ color: 'color-mix(in srgb, var(--va-accent) 70%, var(--va-ink))', fontSize: 13 }}>{stage.label}</b>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                  Wave {stage.stage}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {stage.components.map((comp) => (
                  <span
                    key={comp.id}
                    style={{
                      padding: '3px 8px',
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <b>{comp.name}</b> <small style={{ color: 'var(--text-dim)' }}>({comp.type})</small>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
