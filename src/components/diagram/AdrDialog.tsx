import { useState } from 'react';
import { useDialog } from '../../hooks/useDialog.ts';
import { X, Download, Copy } from 'lucide-react';
import { sound } from '../../utils/sound.ts';
import { formatAdrMarkdown } from '../../data/adrWorkflow.ts';
import type { ArchitectureDecisionRecord } from '../../data/adrWorkflow.ts';
import type { SignoffRole } from './diagramTypes.ts';
import './adrDialog.css';

export interface AdrDialogProps {
  currentAdr: ArchitectureDecisionRecord;
  allSignedOff: boolean;
  toggleSignoff: (role: SignoffRole) => void;
  downloadAdrMarkdown: () => void;
  setShowAdrModal: (open: boolean) => void;
}

export default function AdrDialog({
  currentAdr,
  allSignedOff,
  toggleSignoff,
  downloadAdrMarkdown,
  setShowAdrModal,
}: AdrDialogProps) {
  const [copiedAdr, setCopiedAdr] = useState(false);

  function copyAdrMarkdown() {
    sound.apply();
    const md = formatAdrMarkdown(currentAdr);
    navigator.clipboard?.writeText(md);
    setCopiedAdr(true);
    setTimeout(() => setCopiedAdr(false), 2000);
  }

  // Focus moves in, Tab stays inside, Escape closes, and focus returns to the trigger.
  const dialogRef = useDialog<HTMLDivElement>(true, () => setShowAdrModal(false));

  return (
    <div className="modal-backdrop" onClick={() => setShowAdrModal(false)}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adr-dialog-title"
        className="modal-content"
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: 740 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <span className="eyebrow">[CHANGE_GOVERNANCE // NYGARD_ADR_FORMAT]</span>
            <h3 id="adr-dialog-title" style={{ margin: '4px 0 0' }}>Architecture Decision Record & Sign-Off</h3>
          </div>
          <button
            type="button"
            className="button compact"
            onClick={() => setShowAdrModal(false)}
            aria-label="Close decision record"
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <b style={{ color: 'var(--va-accent-strong)', fontSize: 13 }}>{currentAdr.id}: {currentAdr.title}</b>
            <span className={`telemetry-health-badge ${allSignedOff ? 'optimal' : 'degraded'}`}>
              {allSignedOff ? '✅ APPROVED FOR PRODUCTION' : '⏳ PENDING SIGN-OFFS'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="button compact" onClick={copyAdrMarkdown}>
              <Copy size={12} style={{ marginRight: 4 }} /> {copiedAdr ? 'Copied!' : 'Copy Markdown'}
            </button>
            <button type="button" className="button compact primary" onClick={downloadAdrMarkdown}>
              <Download size={12} style={{ marginRight: 4 }} /> Download ADR
            </button>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 16 }}>
          Formal compliance sign-off matrix across cross-functional roles before deploying architecture mutations.
        </p>

        {/* Sign-off checklist */}
        <div className="adr-checklist">
          {currentAdr.complianceSignoffs.map((item) => (
            <div key={item.role} className="adr-signoff-card">
              <div>
                <div className="signoff-role">{item.role}</div>
                <div className="signoff-signee">Signee: {item.signee}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`signoff-status-badge ${item.approved ? 'approved' : 'pending'}`}>
                  {item.approved ? 'APPROVED' : 'ACTION REQUIRED'}
                </span>
                <button
                  type="button"
                  className="button compact"
                  onClick={() => toggleSignoff(item.role)}
                >
                  {item.approved ? 'Revoke' : 'Sign Off'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ADR Markdown Preview */}
        <div style={{ marginTop: 14 }}>
          <span className="eyebrow" style={{ marginBottom: 6, display: 'block' }}>[PREVIEW // GENERATED_MARKDOWN]</span>
          <pre className="adr-markdown-preview" tabIndex={0} role="region" aria-label="Decision record Markdown">
            {formatAdrMarkdown(currentAdr)}
          </pre>
        </div>
      </div>
    </div>
  );
}
