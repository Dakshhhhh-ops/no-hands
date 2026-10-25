import { Download, FileCode2, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog.ts';
import type { ComposePatch } from '../data/composePatch.ts';
import './composeExportDialog.css';

export interface ComposeExportDialogProps {
  patch: ComposePatch;
  onClose: () => void;
  onDownload: () => void;
}

const lineClass = (line: string) => {
  if (line.startsWith('+++') || line.startsWith('---')) return 'va-diff-file';
  if (line.startsWith('@@')) return 'va-diff-hunk';
  if (line.startsWith('+')) return 'va-diff-add';
  if (line.startsWith('-')) return 'va-diff-del';
  return undefined;
};

/**
 * Review before download: the services the file will lose are listed first, then what is
 * added and connected, then the exact unified diff. Nothing is downloaded until the
 * person chooses to.
 */
export default function ComposeExportDialog({ patch, onClose, onDownload }: ComposeExportDialogProps) {
  const dialogRef = useDialog<HTMLElement>(true, onClose);
  const diffLines = patch.diff ? patch.diff.replace(/\n$/, '').split('\n') : [];

  return (
    <div className="va-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="va-modal va-compose-modal" role="dialog" aria-modal="true" aria-labelledby="compose-export-title" aria-describedby="compose-export-sub">
        <div className="va-modal-head">
          <h2 id="compose-export-title"><FileCode2 size={20} aria-hidden="true" /> Updated compose file</h2>
          <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onClose} aria-label="Close compose file review">
            <X size={18} />
          </button>
        </div>
        <p id="compose-export-sub" className="va-modal-sub">
          Your {patch.fileName} with the applied changes written in. Comments, order, and style are kept; only the lines below change.
        </p>

        {patch.removed.length > 0 && (
          <div className="va-compose-removed" role="group" aria-labelledby="compose-removed-title">
            <h3 id="compose-removed-title">Removed from the file</h3>
            <p>These services were removed from the diagram, so downloading drops them from {patch.fileName}, with every depends_on and links entry that names them:</p>
            <ul>{patch.removed.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
          </div>
        )}

        {(patch.added.length > 0 || patch.connected.length > 0 || patch.disconnected.length > 0) && (
          <ul className="va-compose-summary" aria-label="Changes written to the file">
            {patch.added.map((item) => <li key={`add-${item.service}`}>Adds <code>{item.service}</code> on <code>{item.image}</code></li>)}
            {patch.connected.map((item) => (
              <li key={`con-${item.from}-${item.to}`}>
                <code>{item.from}</code> depends on <code>{item.to}</code>{item.env ? <> and gets <code>{item.env}</code></> : null}
              </li>
            ))}
            {patch.disconnected.map((item) => <li key={`dis-${item.from}-${item.to}`}><code>{item.from}</code> no longer depends on <code>{item.to}</code></li>)}
          </ul>
        )}

        {patch.notWritten.length > 0 && (
          <p className="va-compose-note">
            Planned, not written: {patch.notWritten.map((c) => c.name).join(', ')}. Only you can name their image or build context; the code check keeps them as planned until they appear in the file.
          </p>
        )}
        {patch.warnings.map((warning) => <p key={warning} className="va-compose-warn">{warning}</p>)}

        {patch.changed ? (
          <pre className="va-compose-diff" aria-label={`Unified diff of ${patch.fileName}`} tabIndex={0}>
            {diffLines.map((line, index) => (
              // Lines repeat (blank context lines), so the position is part of the key.
              <span key={index} className={lineClass(line)}>{line}{'\n'}</span>
            ))}
          </pre>
        ) : (
          <p className="va-compose-note">Nothing to write: the applied changes add no cache, database, queue, or connection the file can hold yet.</p>
        )}

        <div className="va-modal-actions">
          <button type="button" className="va-btn va-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="va-btn va-btn-primary" onClick={onDownload} disabled={!patch.changed}>
            <Download size={15} aria-hidden="true" /> Download {patch.fileName}
          </button>
        </div>
      </section>
    </div>
  );
}
