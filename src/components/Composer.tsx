import { BookA, ChevronDown, ChevronsLeft, ClipboardCheck, FileText, History, Mic } from 'lucide-react';
import CommandPresets from './CommandPresets.tsx';
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
  onCollapse?: () => void;
}

const EMPTY_DRAFT = { rateLimitThreshold: '', redisFallback: '' };

/** The left panel: where a change is said or typed and previewed, with the Wispr Flow tools under it. */
export default function Composer({
  project, command, setCommand, setDecisionDraft, onClear, onPreview, isLive, isInterpreting, aiStatus,
  answerSource, fallbackReason, preview, onImportNotes, onCopyDictionary, micSupported, isListening, onToggleMic,
  sampleChoice, isImported, onCollapse,
}: ComposerProps) {
  const ready = Boolean(project && command.trim()) && !isInterpreting;
  // The instructions behind the applied changes, newest first, to say again or adjust.
  const recent = [...new Set((project?.changes || []).map((change) => change.originalInstruction).filter(Boolean))].slice(0, 3);
  const use = (value: string) => { setCommand(value); setDecisionDraft(EMPTY_DRAFT); };

  return (
    <section className="va-composer-panel" id="va-composer" aria-labelledby="va-composer-title">
      <div className="va-composer-panel-head">
        <h2 id="va-composer-title">Say the change</h2>
        {onCollapse && (
          <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onCollapse} aria-label="Collapse the instruction panel">
            <ChevronsLeft size={18} />
          </button>
        )}
      </div>
      <p className="va-composer-hint">
        <Mic size={16} aria-hidden="true" /> Click the box, hold your Wispr Flow hotkey, and speak, or type. English and Hinglish both work.
      </p>

      <div className="va-wave" data-live={isLive} aria-hidden="true">
        {Array.from({ length: 32 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${(i % 8) * 0.09}s` }} />
        ))}
      </div>

      <div className="va-field">
        <label htmlFor="architecture-command" className="va-sr-only">Your instruction</label>
        <textarea
          id="architecture-command"
          value={command}
          rows={7}
          onChange={(event) => use(event.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              onPreview();
            }
          }}
          placeholder="Say it or type it. For example: move session storage to Redis and keep login working if Redis is down."
        />
        <div className="va-field-hint">
          <span
            className="va-engine"
            data-ai={aiStatus.ai}
            title={aiStatus.ai ? 'Every proposal is checked against the schema before you see it.' : 'Add GROQ_API_KEY (or ANTHROPIC_API_KEY) to .env.local for full understanding.'}
          >
            {aiStatus.ai
              ? `Interpreted by ${providerLabel(aiStatus.provider)}`
              : aiStatus.recordings ? 'Recorded answers, then offline rules' : 'Offline rules only'}
          </span>
          <span aria-label="Press Control and Enter to preview"><kbd>Ctrl</kbd> <kbd>Enter</kbd></span>
          {command && <button type="button" className="va-link-btn" onClick={onClear}>Clear</button>}
        </div>
        {answerSource?.recorded && !fallbackReason && (
          <span className="va-recorded-badge" role="status">Recorded answer{answerSource.model ? ` from ${answerSource.model}` : ''}</span>
        )}
        {fallbackReason && (aiStatus.ai || (aiStatus.recordings ?? 0) > 0) && (
          <span className="va-fallback-badge" role="status">Offline rules for now: {fallbackLabel(fallbackReason)}</span>
        )}
      </div>

      {preview && (
        <div className="va-detected" aria-live="polite">
          <h3>
            {preview.items.length === 0
              ? 'No changes detected yet'
              : `${preview.items.length} change${preview.items.length === 1 ? '' : 's'} detected`}
          </h3>
          <ul>
            {preview.items.map((it) => <li key={it.key}>{it.title}</li>)}
          </ul>
        </div>
      )}

      <div className="va-composer-actions">
        <button
          type="button"
          className="va-btn va-btn-primary va-composer-preview"
          disabled={!ready}
          aria-busy={isInterpreting}
          aria-describedby="va-preview-note"
          onClick={onPreview}
        >
          <ClipboardCheck size={18} /> {isInterpreting ? 'Interpreting…' : 'Preview my change'}
        </button>
        <p className="va-composer-note" id="va-preview-note">
          {!project ? 'Load a model first.' : command.trim() ? 'Nothing applies until you review it.' : 'Type or dictate a change first.'}
        </p>
      </div>

      {recent.length > 0 && (
        <div className="va-recent">
          <h3><History size={16} aria-hidden="true" /> Recent instructions</h3>
          <ul>
            {recent.map((text) => (
              <li key={text}><button type="button" onClick={() => use(text)}>{text}</button></li>
            ))}
          </ul>
        </div>
      )}

      <details className="va-flow-tools" open>
        <summary>Wispr Flow tools <ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="va-flow-tool-row">
          <button type="button" onClick={onImportNotes} disabled={!project || isInterpreting} aria-label="Import from Wispr Flow or paste notes" title="A meeting summary or Scratchpad note becomes a reviewed proposal.">
            <FileText size={20} aria-hidden="true" /> <span>Import</span>
          </button>
          <button type="button" onClick={onCopyDictionary} disabled={!project} aria-label="Copy names for your Flow dictionary" title="So Flow spells this model's services and technologies right.">
            <BookA size={20} aria-hidden="true" /> <span>Dictionary</span>
          </button>
          {micSupported && (
            <button type="button" onClick={onToggleMic} aria-pressed={isListening} aria-label={isListening ? 'Stop browser mic' : 'Browser mic (fallback)'} title="Only for people without Wispr Flow.">
              <Mic size={20} aria-hidden="true" /> <span>{isListening ? 'Stop' : 'Mic'}</span>
            </button>
          )}
        </div>
      </details>

      <details className="va-examples">
        <summary>Examples <ChevronDown size={16} aria-hidden="true" /></summary>
        <CommandPresets
          sampleKind={sampleChoice}
          project={project}
          isImported={isImported}
          onSelectPreset={use}
          currentCommand={command}
        />
      </details>
    </section>
  );
}
