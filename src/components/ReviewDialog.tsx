import type { Dispatch, FormEvent, RefObject, SetStateAction } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { sound } from '../utils/sound.ts';
import type { DiffGroup } from '../data/changeDiff.ts';
import type { ImportedNotes } from '../data/aiClient.ts';
import type { Project, Proposal } from '../types/schema.ts';
import type { DecisionDraft } from './Composer.tsx';

/** The fields describeProposalValue reads; a diff entry may be any of the model's records. */
interface DescribedValue {
  name?: string; type?: string; sub?: string;
  from?: string; to?: string; label?: string;
  method?: string; path?: string; responses?: Record<string, unknown>;
  kind?: string; title?: string; description?: string;
  acceptance?: string[]; priority?: string;
  id?: string; text?: string;
}

function describeProposalValue(input: unknown): string {
  // Diff entries carry components, connections, operations, findings, tasks, or requirements.
  const value = input as DescribedValue | null;
  if (!value) return 'No existing value';
  if (value.name && value.type) return `${value.type}: ${value.name}${value.sub ? ` — ${value.sub}` : ''}`;
  if (value.from && value.to) return `${value.from} → ${value.to}${value.label ? ` · ${value.label}` : ''}`;
  if (value.method && value.path) return `${value.method.toUpperCase()} ${value.path} · responses ${Object.keys(value.responses || {}).join(', ') || 'none'}`;
  if (value.kind && value.title) return `${value.kind}: ${value.description || value.title}`;
  if (value.acceptance) return `${value.title} · ${value.priority} priority`;
  if (value.id && value.text) return `${value.id}: ${value.text}`;
  return value.title || JSON.stringify(value);
}

export interface ReviewDialogProps {
  proposal: Proposal;
  project: Project | null;
  modalRef: RefObject<HTMLElement | null>;
  proposedDiffGroups: DiffGroup[];
  decisionDraft: DecisionDraft;
  setDecisionDraft: Dispatch<SetStateAction<DecisionDraft>>;
  proposalHasRateLimit: boolean;
  proposalHasRedisFallback: boolean;
  proposalNotes: ImportedNotes | null;
  unresolvedProposalAssumptions: string[];
  proposalCaveats: string[];
  followUp: string;
  setFollowUp: (text: string) => void;
  onFollowUp: (event?: FormEvent) => void;
  isInterpreting: boolean;
  revisionCount: number;
  onClose: () => void;
  onApply: () => void;
}

/** The review step: what would change, open decisions, and a spoken follow-up. Nothing applies until "apply". */
export default function ReviewDialog({
  proposal, project, modalRef, proposedDiffGroups, decisionDraft, setDecisionDraft, proposalHasRateLimit,
  proposalHasRedisFallback, proposalNotes, unresolvedProposalAssumptions, proposalCaveats, followUp, setFollowUp,
  onFollowUp, isInterpreting, revisionCount, onClose, onApply,
}: ReviewDialogProps) {
  return (
    <div
      className="va-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="va-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="va-modal-head">
          <div>
            <h2 id="review-title">Review this change</h2>
            <p className="va-modal-sub">Nothing is applied until you confirm.</p>
          </div>
          <button
            type="button"
            className="va-btn va-btn-ghost va-btn-icon"
            onClick={() => { sound.click(); onClose(); }}
            aria-label="Close review"
          >
            <X size={18} />
          </button>
        </div>

        <div className="va-changes">
          {proposal.items.map((item) => (
            <article className="va-change" key={item.key}>
              <span className="va-change-mark"><Check size={13} /></span>
              <div>
                <b>{item.title}</b>
                <p>
                  {item.key === 'rate-limit' && decisionDraft.rateLimitThreshold.trim()
                    ? `Your chosen limit will be recorded: ${decisionDraft.rateLimitThreshold.trim()}.`
                    : item.key === 'redis-fallback' && decisionDraft.redisFallback.trim()
                      ? `Your chosen outage behavior will be recorded: ${decisionDraft.redisFallback.trim()}.`
                      : item.detail}
                </p>
              </div>
            </article>
          ))}
        </div>

        <section className="va-proposal-diff" aria-labelledby="proposal-diff-title">
          <div className="va-proposal-diff-head">
            <div>
              <h3 id="proposal-diff-title">What would change</h3>
              <p>Compared with the current v{project?.version} model. Nothing here is applied yet.</p>
            </div>
            <span className="va-proposal-diff-legend" aria-label="Change colors: green added, amber modified, red removed">
              <i className="is-added" /> Added
              <i className="is-modified" /> Modified
              <i className="is-removed" /> Removed
            </span>
          </div>
          {proposedDiffGroups.length ? (
            <div className="va-proposal-diff-groups" tabIndex={0} role="region" aria-label="Proposed changes by artifact">
              {proposedDiffGroups.map((group) => (
                <section className="va-proposal-diff-group" key={group.id} aria-label={group.label}>
                  <h4>{group.label}</h4>
                  {group.entries.map((entry) => (
                    <article className={`va-proposal-diff-entry is-${entry.status}`} key={entry.id}>
                      <div className="va-proposal-diff-entry-head">
                        <span className={`va-proposal-diff-status is-${entry.status}`}>{entry.status}</span>
                        <b>{entry.label}</b>
                      </div>
                      {entry.status !== 'added' && (
                        <p><span>Before</span>{describeProposalValue(entry.before)}</p>
                      )}
                      {entry.status !== 'removed' && (
                        <p><span>Proposed</span>{describeProposalValue(entry.after)}</p>
                      )}
                    </article>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <p className="va-proposal-diff-empty">No component, relationship, contract, risk, or task deltas were detected for this instruction.</p>
          )}
        </section>

        {(proposalHasRateLimit || proposalHasRedisFallback) && (
          <section className="va-decision-review" aria-labelledby="decision-review-title">
            <div className="va-decision-review-head">
              <div>
                <h3 id="decision-review-title">Your decisions</h3>
                <p>Enter only choices your team has made. Leave a field blank to keep that decision unresolved.</p>
              </div>
              <span className="va-decision-review-badge">OPTIONAL</span>
            </div>

            {proposalHasRateLimit && (
              <div className="va-decision-field">
                <label htmlFor="review-rate-limit">Authentication rate limit</label>
                <div className="va-decision-input-row">
                  <input
                    id="review-rate-limit"
                    type="text"
                    value={decisionDraft.rateLimitThreshold}
                    onChange={(event) => { const value = event.target.value; setDecisionDraft((current) => ({ ...current, rateLimitThreshold: value })); }}
                    placeholder="Your chosen attempts and time window"
                    aria-describedby="review-rate-limit-help review-rate-limit-impact"
                  />
                  <span data-entered={Boolean(decisionDraft.rateLimitThreshold.trim())}>
                    {decisionDraft.rateLimitThreshold.trim() ? 'Choice entered' : 'Unresolved'}
                  </span>
                </div>
                <small id="review-rate-limit-help">For example, enter the limit and time window your team selected. No value is prefilled.</small>
                <p className="va-decision-impact" id="review-rate-limit-impact">
                  <b>Preview impact:</b> {decisionDraft.rateLimitThreshold.trim()
                    ? 'The API contract and proposed task will show this choice; the audit will still say runtime enforcement is unverified.'
                    : 'The threshold stays unresolved in the contract, risk/task views, and exported files.'}
                </p>
              </div>
            )}

            {proposalHasRedisFallback && (
              <div className="va-decision-field">
                <label htmlFor="review-redis-fallback">Login behavior if Redis is unavailable</label>
                <div className="va-decision-input-row">
                  <input
                    id="review-redis-fallback"
                    type="text"
                    value={decisionDraft.redisFallback}
                    onChange={(event) => { const value = event.target.value; setDecisionDraft((current) => ({ ...current, redisFallback: value })); }}
                    placeholder="Describe the behavior your team selected"
                    aria-describedby="review-redis-fallback-help review-redis-fallback-impact"
                  />
                  <span data-entered={Boolean(decisionDraft.redisFallback.trim())}>
                    {decisionDraft.redisFallback.trim() ? 'Choice entered' : 'Unresolved'}
                  </span>
                </div>
                <small id="review-redis-fallback-help">Describe what login should do during a Redis outage. No behavior is selected for you.</small>
                <p className="va-decision-impact" id="review-redis-fallback-impact">
                  <b>Preview impact:</b> {decisionDraft.redisFallback.trim()
                    ? 'The recorded choice will appear in the API contract, risk audit, and proposed task; implementation remains proposed.'
                    : 'The fallback stays unresolved in the risk audit, proposed task, and exported files.'}
                </p>
              </div>
            )}
          </section>
        )}

        {proposalNotes && (() => {
          const removals = (proposal.operations || []).filter((op) => op.op === 'remove_component').length;
          return (
            <p className="va-review-caveat va-notes-caveat" data-warn={removals > 0}>
              <b>From {proposalNotes.source === 'wispr' ? `Wispr Flow${proposalNotes.title ? `: "${proposalNotes.title}"` : ''}` : 'pasted notes'}.</b>{' '}
              The notes were read as data, not commands.
              {removals > 0 && ` This proposal removes ${removals} component${removals === 1 ? '' : 's'}; apply only if your team decided that.`}
            </p>
          );
        })()}
        {unresolvedProposalAssumptions.length > 0 && (
          <div className="va-open-questions">
            <h3>Still undecided</h3>
            <p>These remain open if you apply without recording a choice.</p>
            <ul>
              {unresolvedProposalAssumptions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
        {proposalCaveats.length > 0 && (
          <p className="va-review-caveat">
            <b>Important:</b> Recording a decision documents your team's intent; it does not implement or verify the behavior.
          </p>
        )}

        <form className="va-followup" onSubmit={onFollowUp}>
          <label htmlFor="va-followup-input">Follow up by voice or text</label>
          <div className="va-followup-row">
            <input
              id="va-followup-input"
              type="text"
              value={followUp}
              onChange={(event) => setFollowUp(event.target.value)}
              placeholder={'"apply", "cancel", "undo", or "make it PostgreSQL instead"'}
              disabled={isInterpreting}
              autoComplete="off"
            />
            <button type="submit" className="va-btn va-btn-sm" disabled={!followUp.trim() || isInterpreting}>
              {isInterpreting ? 'Revising…' : 'Send'}
            </button>
          </div>
          <small>
            A follow-up revises this change{revisionCount ? ` (version ${revisionCount + 1})` : ''}. Nothing applies until you say or click apply.
          </small>
        </form>

        <div className="va-modal-actions">
          <button type="button" className="va-btn" onClick={() => { sound.click(); onClose(); }}>
            Keep editing
          </button>
          <button type="button" className="va-btn va-btn-primary" onClick={onApply}>
            Apply change <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}
