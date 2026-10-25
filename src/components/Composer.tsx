import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, BookA, FileText, History, Mic, Plus, X } from 'lucide-react';
import CommandPresets from './CommandPresets.tsx';
import { useDismiss } from '../hooks/useDismiss.ts';
import { fallbackLabel, providerLabel } from '../data/aiClient.ts';
import type { AiStatus, AnswerSource, FallbackReason } from '../data/aiClient.ts';
import type { Project, Proposal } from '../types/schema.ts';

/** The choices a reviewer records while a change is open. */
export interface DecisionDraft {
  rateLimitThreshold: string;
  redisFallback: string;
}

export interface ComposerProps {
  project: Project | null;
  command: string;
  setCommand: (command: string) => void;
  setDecisionDraft: (draft: DecisionDraft) => void;
  onClear: () => void;
  onPreview: () => void;
  isLive: boolean;
  isInterpreting: boolean;
  aiStatus: AiStatus;
  answerSource: AnswerSource | null;
  fallbackReason: FallbackReason | null;
  preview: Proposal | null;
  onImportNotes: () => void;
  onCopyDictionary: () => void;
  micSupported: boolean;
  isListening: boolean;
  onToggleMic: () => void;
  sampleChoice: 'commerce' | 'food';
  isImported: boolean;
}

const EMPTY_DRAFT = { rateLimitThreshold: '', redisFallback: '' };
const MAX_HEIGHT = 168;

/**
 * The command bar floating at the bottom of the workspace: one box that Wispr Flow types into.
 * Enter previews the change. The plus button holds the Wispr Flow tools, recent instructions,
 * and examples.
 */
export default function Composer({
  project, command, setCommand, setDecisionDraft, onClear, onPreview, isLive, isInterpreting, aiStatus,
  answerSource, fallbackReason, preview, onImportNotes, onCopyDictionary, micSupported, isListening, onToggleMic,
  sampleChoice, isImported,
}: ComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useDismiss<HTMLDivElement>(menuOpen, () => setMenuOpen(false));
  const plusRef = useRef<HTMLButtonElement | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const ready = Boolean(project && command.trim()) && !isInterpreting;
  // The instructions behind the applied changes, newest first, to say again or adjust.
  const recent = [...new Set((project?.changes || []).map((change) => change.originalInstruction).filter(Boolean))].slice(0, 3);
  const write = (value: string) => { setCommand(value); setDecisionDraft(EMPTY_DRAFT); };
  const pick = (value: string) => { write(value); setMenuOpen(false); boxRef.current?.focus(); };
  const detected = preview && command.trim() ? preview.items : null;

  // The box grows with what is said, up to a few lines, then scrolls.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = 'auto';
    if (box.scrollHeight > 0) box.style.height = `${Math.min(box.scrollHeight, MAX_HEIGHT)}px`;
  }, [command]);

  return (
    <section className="va-command" id="va-composer" aria-labelledby="va-composer-title">
      <h2 id="va-composer-title" className="va-sr-only">Say the change</h2>

      <div className="va-command-detected" aria-live="polite">
        {detected && (
          <>
            <span className="va-command-detected-count">
              {detected.length === 0 ? 'No changes detected yet' : `${detected.length} change${detected.length === 1 ? '' : 's'} detected`}
            </span>
            {detected.slice(0, 3).map((item) => <span key={item.key} className="va-command-chip">{item.title}</span>)}
            {detected.length > 3 && <span className="va-command-chip">+{detected.length - 3} more</span>}
          </>
        )}
      </div>

      <div className="va-command-bar" data-live={isLive} data-busy={isInterpreting}>
        <div className="va-wave" data-live={isLive} aria-hidden="true">
          {Array.from({ length: 32 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${(i % 8) * 0.09}s` }} />
          ))}
        </div>

        <div className="va-command-tools" ref={menuRef}>
          <button
            ref={plusRef}
            type="button"
            className="va-command-plus"
            aria-label="Wispr Flow tools and examples"
            title="Wispr Flow tools and examples"
            aria-expanded={menuOpen}
            aria-controls="va-command-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Plus size={18} />
          </button>
          {menuOpen && (
            <div
              className="va-command-menu"
              id="va-command-menu"
              role="group"
              aria-label="Wispr Flow tools and examples"
              onKeyDown={(event) => { if (event.key === 'Escape') plusRef.current?.focus(); }}
            >
              <p className="va-command-menu-label">Wispr Flow</p>
              <div className="va-flow-tool-row">
                <button type="button" onClick={() => { setMenuOpen(false); onImportNotes(); }} disabled={!project || isInterpreting} aria-label="Import from Wispr Flow or paste notes" title="A meeting summary or Scratchpad note becomes a reviewed proposal.">
                  <FileText size={18} aria-hidden="true" /> <span>Import</span>
                  <small aria-hidden="true">Notes become a change</small>
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); onCopyDictionary(); }} disabled={!project} aria-label="Copy names for your Flow dictionary" title="So Flow spells this model's services and technologies right.">
                  <BookA size={18} aria-hidden="true" /> <span>Dictionary</span>
                  <small aria-hidden="true">Copy this model&rsquo;s names</small>
                </button>
                {micSupported && (
                  <button type="button" onClick={() => { setMenuOpen(false); onToggleMic(); }} aria-pressed={isListening} aria-label={isListening ? 'Stop browser mic' : 'Browser mic (fallback)'} title="Only for people without Wispr Flow.">
                    <Mic size={18} aria-hidden="true" /> <span>{isListening ? 'Stop' : 'Mic'}</span>
                    <small aria-hidden="true">Without Wispr Flow</small>
                  </button>
                )}
              </div>

              {recent.length > 0 && (
                <>
                  <p className="va-command-menu-label"><History size={14} aria-hidden="true" /> Recent</p>
                  <ul className="va-command-recent">
                    {recent.map((text) => (
                      <li key={text}><button type="button" onClick={() => pick(text)}>{text}</button></li>
                    ))}
                  </ul>
                </>
              )}

              <p className="va-command-menu-label">Examples</p>
              <CommandPresets
                sampleKind={sampleChoice}
                project={project}
                isImported={isImported}
                onSelectPreset={pick}
                currentCommand={command}
              />
            </div>
          )}
        </div>

        <label htmlFor="architecture-command" className="va-sr-only">Your instruction</label>
        <textarea
          ref={boxRef}
          id="architecture-command"
          className="va-command-input"
          value={command}
          rows={1}
          onChange={(event) => write(event.target.value)}
          onKeyDown={(event) => {
            // Enter previews; Shift+Enter starts a new line. Ctrl/Cmd+Enter previews too.
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            if (event.shiftKey && !(event.ctrlKey || event.metaKey)) return;
            event.preventDefault();
            if (ready) onPreview();
          }}
          placeholder="Say the change…"
          aria-describedby="va-command-hint"
        />

        {command && (
          <button type="button" className="va-command-clear" onClick={onClear} aria-label="Clear" title="Clear">
            <X size={16} />
          </button>
        )}
        <button
          type="button"
          className="va-command-go"
          disabled={!ready}
          aria-busy={isInterpreting}
          aria-label={isInterpreting ? 'Interpreting your change' : 'Preview my change'}
          title="Preview (Enter)"
          onClick={onPreview}
        >
          {isInterpreting ? <span className="va-command-spinner" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
          <span className="va-command-go-label">{isInterpreting ? 'Interpreting…' : 'Preview'}</span>
        </button>
      </div>

      <div className="va-command-meta">
        <span
          className="va-engine"
          data-ai={aiStatus.ai}
          title={aiStatus.ai ? 'Every proposal is checked against the schema before you see it.' : 'Add GROQ_API_KEY (or ANTHROPIC_API_KEY) to .env.local for full understanding.'}
        >
          {aiStatus.ai
            ? `Interpreted by ${providerLabel(aiStatus.provider)}`
            : aiStatus.recordings ? 'Recorded answers, then offline rules' : 'Offline rules only'}
        </span>
        {answerSource?.recorded && !fallbackReason && (
          <span className="va-recorded-badge" role="status">Recorded answer{answerSource.model ? ` from ${answerSource.model}` : ''}</span>
        )}
        {fallbackReason && (aiStatus.ai || (aiStatus.recordings ?? 0) > 0) && (
          <span className="va-fallback-badge" role="status">Offline rules for now: {fallbackLabel(fallbackReason)}</span>
        )}
        <span className="va-command-hint" id="va-command-hint">
          {!project ? 'Load a model first.' : 'Hold your Wispr Flow hotkey and speak, or type.'}
        </span>
        <span className="va-command-keys" aria-hidden="true"><kbd>Enter</kbd> to preview</span>
      </div>
    </section>
  );
}
