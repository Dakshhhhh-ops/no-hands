import { ChevronDown, ClipboardCheck, ClipboardList, FileText, Mic } from 'lucide-react';
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
}

/** Where a change is said or typed, previewed, and where the Wispr Flow tools live. */
export default function Composer({
  project, command, setCommand, setDecisionDraft, onClear, onPreview, isLive, isInterpreting, aiStatus,
  answerSource, fallbackReason, preview, onImportNotes, onCopyDictionary, micSupported, isListening, onToggleMic,
  sampleChoice, isImported,
}: ComposerProps) {
  return (
    <section className="va-composer" aria-labelledby="va-composer-title">
      <div className="va-composer-head">
        <h2 id="va-composer-title">What should change?</h2>
        {command && (
          <button
            type="button"
            className="va-link-btn"
            onClick={onClear}
          >
            Clear
          </button>
        )}
      </div>
      <p className="va-composer-hint">
        <Mic size={14} aria-hidden="true" /> Hold your Wispr Flow hotkey and speak, or type. English and Hinglish both work.
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
          rows={5}
          onChange={(event) => {
            setCommand(event.target.value);
            setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
          }}
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
          {answerSource?.recorded && !fallbackReason && (
            <span className="va-recorded-badge" role="status">Recorded answer{answerSource.model ? ` from ${answerSource.model}` : ''}</span>
          )}
          {fallbackReason && (aiStatus.ai || (aiStatus.recordings ?? 0) > 0) && (
            <span className="va-fallback-badge" role="status">Offline rules for now: {fallbackLabel(fallbackReason)}</span>
          )}
          <span aria-label="Press Control and Enter to preview"><kbd>Ctrl</kbd> <kbd>Enter</kbd></span>
        </div>
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
          disabled={!project || !command.trim() || isInterpreting}
          aria-busy={isInterpreting}
          onClick={onPreview}
        >
          <ClipboardCheck size={16} /> {isInterpreting ? 'Interpreting…' : 'Preview my change'}
        </button>
      <p className="va-composer-note">Nothing applies until you review it.</p>
      </div>

      <div className="va-voice-tools" role="group" aria-labelledby="va-voice-tools-title">
        <h3 id="va-voice-tools-title">Wispr Flow tools</h3>
        <button type="button" className="va-tool-row" onClick={onImportNotes} disabled={!project || isInterpreting}>
          <span className="va-tool-icon" aria-hidden="true"><FileText size={15} /></span>
          <span><b>Import from Wispr Flow or paste notes</b><small>A meeting summary or Scratchpad note becomes a reviewed proposal.</small></span>
        </button>
        <button type="button" className="va-tool-row" onClick={onCopyDictionary} disabled={!project}>
          <span className="va-tool-icon" aria-hidden="true"><ClipboardList size={15} /></span>
          <span><b>Copy names for your Flow dictionary</b><small>So Flow spells this model's services and technologies right.</small></span>
        </button>
        {micSupported && (
          <button type="button" className="va-tool-row" onClick={onToggleMic} aria-pressed={isListening}>
            <span className="va-tool-icon" aria-hidden="true"><Mic size={15} /></span>
            <span><b>{isListening ? 'Stop browser mic' : 'Browser mic (fallback)'}</b><small>Only for people without Wispr Flow.</small></span>
          </button>
        )}
      </div>

      <details className="va-examples">
        <summary>Examples <ChevronDown size={14} aria-hidden="true" /></summary>
        <CommandPresets
          sampleKind={sampleChoice}
          project={project}
          isImported={isImported}
          onSelectPreset={(value) => {
            setCommand(value);
            setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
          }}
          currentCommand={command}
        />
      </details>

    </section>
  );
}
