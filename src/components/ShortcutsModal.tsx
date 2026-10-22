import { Keyboard, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog.ts';
import './shortcutsModal.css';

const SHORTCUTS = [
  { keys: ['Ctrl', 'Enter'], action: 'Preview change' },
  { keys: ['Ctrl', 'Z'], action: 'Undo' },
  { keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo' },
  { keys: ['Ctrl', 'Y'], action: 'Redo' },
  { keys: ['?'], action: 'Show shortcuts' },
  { keys: ['Escape'], action: 'Close modal / Clear selection' },
  { keys: ['←', '→'], action: 'Switch tabs' },
  { keys: ['↑', '↓'], action: 'Navigate diagram nodes' },
  { keys: ['Enter', 'Space'], action: 'Select diagram node' }
];

export interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal(props: ShortcutsModalProps) {
  const isOpen = props.isOpen;
  const onClose = props.onClose;
  const dialogRef = useDialog<HTMLElement>(Boolean(isOpen), onClose);
  if (!isOpen) return null;
  return (
    <div className="va-backdrop" onMouseDown={function(e) { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="va-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className="va-modal-head">
          <h2 id="shortcuts-title"><Keyboard size={20} /> Keyboard Shortcuts</h2>
          <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onClose} aria-label="Close shortcuts">
            <X size={18} />
          </button>
        </div>
        <div className="va-shortcuts-list">
          {SHORTCUTS.map(function(item) {
            return (
              <div key={item.keys.join('+')} className="va-shortcut-row">
                <span className="va-shortcut-action">{item.action}</span>
                <span className="va-shortcut-keys">
                  {item.keys.map(function(k, i) {
                    return <kbd key={i} className="va-kbd">{k}</kbd>;
                  })}
                </span>
              </div>
            );
          })}
        </div>
        <div className="va-modal-actions">
          <button type="button" className="va-btn va-btn-primary" onClick={onClose}>Got it</button>
        </div>
      </section>
    </div>
  );
}

export default ShortcutsModal;