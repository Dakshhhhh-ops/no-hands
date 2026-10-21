import { useEffect, useState } from 'react';
import { FileText, Link2, RefreshCw, Unlink, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog.ts';
import { WISPR_CONNECT_URL, wisprDisconnect, wisprItemText, wisprItems, wisprStatus } from '../data/wisprClient.ts';

const MAX_NOTES = 20000;

/**
 * Turns a Wispr Flow meeting summary or Scratchpad note, or pasted notes, into
 * an ordinary proposal. The text goes to the interpreter as quoted data, and the
 * result still goes through validation and the review diff before anything applies.
 *
 * `returned` describes a return from Wispr Flow's sign-in: { connected: true } or
 * { errorCode: 'denied' }.
 */
export default function WisprImportDialog({ isOpen, onClose, onPropose, returned, isImported = false }) {
  const dialogRef = useDialog(Boolean(isOpen), onClose);
  const [connected, setConnected] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [text, setText] = useState('');
  const [picked, setPicked] = useState(null);

  async function loadItems() {
    setBusy('items');
    setMessage('');
    try {
      setItems(await wisprItems());
    } catch (error) {
      setMessage(error.message);
      if (error.code === 'unauthorized' || error.code === 'not_connected') setConnected(false);
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    wisprStatus(returned?.errorCode)
      .then((status) => {
        if (cancelled) return;
        setConnected(status.connected);
        if (status.message) setMessage(status.message);
        if (status.connected) loadItems();
      })
      .catch((error) => {
        if (!cancelled) {
          setConnected(false);
          setMessage(error.message);
        }
      });
    return () => { cancelled = true; };
  }, [isOpen, returned?.errorCode]);

  async function pick(item) {
    setBusy(item.id);
    setMessage('');
    try {
      const body = await wisprItemText(item);
      setText(body.slice(0, MAX_NOTES));
      setPicked(item);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      await wisprDisconnect();
      setConnected(false);
      setItems([]);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  function propose() {
    const notes = text.trim();
    if (!notes) return;
    onPropose(picked ? { source: 'wispr', title: picked.title, text: notes } : { source: 'pasted', text: notes });
    onClose();
  }

  if (!isOpen) return null;
  return (
    <div className="va-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="va-modal va-notes-modal" role="dialog" aria-modal="true" aria-labelledby="wispr-import-title" aria-describedby="wispr-import-sub">
        <div className="va-modal-head">
          <h2 id="wispr-import-title"><FileText size={20} aria-hidden="true" /> Import notes</h2>
          <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onClose} aria-label="Close import">
            <X size={18} />
          </button>
        </div>
        <p id="wispr-import-sub" className="va-modal-sub">
          Use a Wispr Flow meeting summary or Scratchpad note, or paste notes from anywhere. They are read as data, not commands, and nothing changes until you review the proposal.
        </p>

        <div className="va-notes-source">
          <h3>From Wispr Flow</h3>
          {connected === null && <p className="va-notes-muted">Checking the connection…</p>}
          {connected === false && (
            <div className="va-notes-connect">
              <a className="va-btn" href={WISPR_CONNECT_URL}>
                <Link2 size={15} aria-hidden="true" /> Connect Wispr Flow
              </a>
              <p className="va-notes-muted">
                Opens Wispr Flow's sign-in. The app reads only recent meeting summaries and Scratchpad notes, never transcripts or dictation history, and keeps the sign-in on its server.
              </p>
              {isImported && (
                <p className="va-notes-warn">Connecting reloads the page and the sample stack returns, so import your stack again afterwards, or paste notes below instead.</p>
              )}
            </div>
          )}
          {connected && (
            <>
              {returned?.connected && !message && <p className="va-notes-ok" role="status">Connected to Wispr Flow.</p>}
              {busy === 'items' && <p className="va-notes-muted">Loading recent summaries and notes…</p>}
              {busy !== 'items' && items.length === 0 && !message && <p className="va-notes-muted">No recent meeting summaries or Scratchpad notes.</p>}
              {items.length > 0 && (
                <ul className="va-notes-items" aria-label="Recent Wispr Flow summaries and notes">
                  {items.map((item) => (
                    <li key={`${item.kind}:${item.id}`}>
                      <button type="button" onClick={() => pick(item)} aria-pressed={picked?.id === item.id && picked?.kind === item.kind} disabled={Boolean(busy)}>
                        <span>{item.title}</span>
                        <small>{item.kind === 'meeting' ? 'Meeting summary' : 'Scratchpad note'}{item.date ? ` · ${new Date(item.date).toLocaleDateString()}` : ''}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="va-notes-row">
                <button type="button" className="va-link-btn" onClick={loadItems} disabled={Boolean(busy)}>
                  <RefreshCw size={12} aria-hidden="true" /> Refresh
                </button>
                <button type="button" className="va-link-btn" onClick={disconnect} disabled={Boolean(busy)}>
                  <Unlink size={12} aria-hidden="true" /> Disconnect
                </button>
              </div>
            </>
          )}
          {message && <p className="va-notes-error" role="alert">{message}</p>}
        </div>

        <label htmlFor="wispr-notes-text" className="va-notes-label">
          {picked ? `Notes from "${picked.title}" (edit before proposing)` : 'Or paste notes'}
        </label>
        <textarea
          id="wispr-notes-text"
          className="va-notes-text"
          rows={8}
          maxLength={MAX_NOTES}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (!event.target.value.trim()) setPicked(null);
          }}
          placeholder="For example: We agreed to put Redis in front of the trips API and add a payment service."
        />

        <div className="va-modal-actions">
          <button type="button" className="va-btn va-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="va-btn va-btn-primary" onClick={propose} disabled={!text.trim()}>
            Propose changes from these notes
          </button>
        </div>
      </section>
    </div>
  );
}
