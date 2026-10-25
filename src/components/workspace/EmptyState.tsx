import { useEffect, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { FileCode2, GitBranch, Play, RotateCcw, X } from 'lucide-react';

export interface EmptyStateProps {
  onStartDemo: () => void;
  onLoadSample: () => void;
  onChooseCompose: () => void;
  onComposeText: (text: string, fileName: string) => Promise<void> | void;
  /** Imports from a public GitHub repository link; rejects with a message to show. */
  onGitHubImport?: (url: string) => Promise<void>;
  /** Shown over the canvas (for /app?import=compose) rather than in place of it. */
  asDialog?: boolean;
  onClose?: () => void;
}

/** Three ways in: the guided demo, a sample, or your own docker-compose file (pick it or drop it here). */
export default function EmptyState({ onStartDemo, onLoadSample, onChooseCompose, onComposeText, onGitHubImport, asDialog, onClose }: EmptyStateProps) {
  const [dragging, setDragging] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [repoError, setRepoError] = useState('');

  const importFromGitHub = async (event: FormEvent) => {
    event.preventDefault();
    if (!onGitHubImport || !repoUrl.trim() || importing) return;
    setImporting(true);
    setRepoError('');
    try {
      await onGitHubImport(repoUrl.trim());
    } catch (error) {
      setRepoError(error instanceof Error ? error.message : 'The repository could not be imported.');
    } finally {
      setImporting(false);
    }
  };
  const firstRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!asDialog) return undefined;
    // The import choice takes focus, and Escape closes the panel.
    firstRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [asDialog, onClose]);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void file.text().then((text) => onComposeText(text, file.name));
  };

  const choices = (
    <div className="va-empty-choices">
      <button
        ref={firstRef}
        type="button"
        className="va-empty-choice va-empty-drop"
        data-dragging={dragging}
        onClick={onChooseCompose}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <FileCode2 size={28} aria-hidden="true" />
        <b>Import your docker-compose file</b>
        <span>Choose it, or drop it here. It is read in your browser and never uploaded.</span>
      </button>
      <button type="button" className="va-empty-choice" onClick={onStartDemo}>
        <Play size={28} aria-hidden="true" />
        <b>Start the guided demo</b>
        <span>Three steps on an example stack: English, Hinglish, and a check against newer code.</span>
      </button>
      <button type="button" className="va-empty-choice" onClick={onLoadSample}>
        <RotateCcw size={28} aria-hidden="true" />
        <b>Load a sample</b>
        <span>The Commerce Platform: nine services, ready for a change.</span>
      </button>
    </div>
  );

  const github = onGitHubImport && (
    <form className="va-github-import" onSubmit={importFromGitHub} aria-busy={importing}>
      <label htmlFor="va-github-url"><GitBranch size={16} aria-hidden="true" /> Or import from a public GitHub repository</label>
      <div className="va-github-row">
        <input
          id="va-github-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(event) => { setRepoUrl(event.target.value); setRepoError(''); }}
          aria-describedby="va-github-hint"
          aria-invalid={repoError ? true : undefined}
        />
        <button type="submit" className="va-btn va-btn-primary" disabled={!repoUrl.trim() || importing}>
          {importing ? 'Importing…' : 'Import'}
        </button>
      </div>
      <small id="va-github-hint">Reads docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml at the root, or in the folder of a /tree/ link. Private repositories are not read.</small>
      {repoError && <p className="va-github-error" role="alert">{repoError}</p>}
    </form>
  );

  if (!asDialog) {
    return (
      <div className="va-empty-state">
        <h2>Start from your own stack</h2>
        {choices}
        {github}
      </div>
    );
  }
  return (
    <div className="va-empty-overlay">
      <section className="va-empty-state va-empty-dialog" role="dialog" aria-modal="true" aria-labelledby="va-import-title">
        <div className="va-empty-dialog-head">
          <h2 id="va-import-title">Start from your own stack</h2>
          <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {choices}
        {github}
      </section>
    </div>
  );
}
