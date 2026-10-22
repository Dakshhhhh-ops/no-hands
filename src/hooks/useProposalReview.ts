import { useState, useEffect, useRef, useMemo } from 'react';
import type { Project, Proposal } from '../types/schema.ts';
import { proposeChange, applyChange, DEMO_COMMAND } from '../data/commerce.ts';
import { FOOD_DELIVERY_DEMO_COMMAND } from '../data/foodDelivery.ts';
import { deriveChangeDiff } from '../data/changeDiff.ts';
import { sound } from '../utils/sound.ts';
import { AiInterpretError, fetchAiStatus, interpretWithModel } from '../data/aiClient.ts';
import type { AnswerSource, FallbackReason, ImportedNotes } from '../data/aiClient.ts';
import { interpretPattern } from '../data/patternRules.ts';
import { cleanDictation } from '../data/dictation.ts';
import { combineInstruction } from '../data/reviewCommands.ts';
import type { AiStatus } from '../data/aiClient.ts';

export interface DecisionDraft {
  rateLimitThreshold: string;
  redisFallback: string;
}

export type SetDecisionDraft = (_value: DecisionDraft | ((_prev: DecisionDraft) => DecisionDraft)) => void;

interface UseProposalReviewReturn {
  command: string;
  setCommand: (_cmd: string) => void;
  proposal: Proposal | null;
  setProposal: React.Dispatch<React.SetStateAction<Proposal | null>>;
  preview: Proposal | null;
  proposedProject: Project | null;
  proposedDiff: ReturnType<typeof deriveChangeDiff>;
  proposedDiffGroups: ReturnType<typeof deriveChangeDiff>;
  modalRef: React.RefObject<HTMLElement | null>;
  showProposal: () => void;
  playDemoDictation: () => void;
  activeDemoCommand: string;
  proposalHasRateLimit: boolean;
  proposalHasRedisFallback: boolean;
  proposalCaveats: string[];
  unresolvedProposalAssumptions: string[];
  isDictatingSim: boolean;
  aiStatus: AiStatus;
  isInterpreting: boolean;
  setIsDictatingSim: React.Dispatch<React.SetStateAction<boolean>>;
  /** Re-interpret the pending change with a follow-up such as "make it Postgres instead". */
  reviseProposal: (_followUp: string) => void;
  /** Step back to the version before the last revision; false when there is none. */
  undoRevision: () => boolean;
  revisionCount: number;
  /** Why the last preview used the offline rules instead of the model, or null. */
  fallbackReason: FallbackReason | null;
  /** Where the last model answer came from, or null when the offline rules answered. */
  answerSource: AnswerSource | null;
  /** Preview a change proposed from imported notes (Wispr Flow or pasted). */
  proposeFromNotes: (_notes: ImportedNotes) => void;
  /** The imported notes the current proposal was made from, or null for a spoken or typed instruction. */
  proposalNotes: ImportedNotes | null;
}

export function useProposalReview(
  project: Project | null,
  sampleChoice: 'commerce' | 'food',
  onNotify: (_msg: string) => void,
  // The instruction text is owned by the caller (App persists it), so the preview
  // always reads exactly what is in the text box.
  commandState: { command: string; setCommand: (_cmd: string) => void },
  // The decisions are owned by the caller too: the review dialog edits that one copy, and the
  // preview, the applied model, and the "recorded decisions" count all read the same copy.
  decisionState: { decisionDraft: DecisionDraft; setDecisionDraft: SetDecisionDraft },
): UseProposalReviewReturn {
  const { command, setCommand } = commandState;
  const { decisionDraft, setDecisionDraft } = decisionState;
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [revisions, setRevisions] = useState<Proposal[]>([]);
  const [fallbackReason, setFallbackReason] = useState<FallbackReason | null>(null);
  const [answerSource, setAnswerSource] = useState<AnswerSource | null>(null);
  const [proposalNotes, setProposalNotes] = useState<ImportedNotes | null>(null);
  // A closed review (applied or cancelled) starts the next one without history.
  useEffect(() => {
    if (!proposal) setRevisions([]);
  }, [proposal]);
  const [isDictatingSim, setIsDictatingSim] = useState(false);
  const modalRef = useRef<HTMLElement | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus>({ ai: false, provider: null, model: null });
  const [isInterpreting, setIsInterpreting] = useState(false);
  const interpretAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAiStatus(controller.signal).then((status) => {
      if (!controller.signal.aborted) setAiStatus(status);
    });
    return () => {
      controller.abort();
      interpretAbort.current?.abort();
    };
  }, []);

  // The live keyword preview only describes the offline rules, so hide it when a model interprets.
  const preview = useMemo(
    () => {
      if (aiStatus.ai || !command.trim()) return null;
      const text = cleanDictation(command);
      return (project && interpretPattern(text, project)) || proposeChange(text);
    },
    [command, aiStatus.ai, project],
  );
  const proposedProject = useMemo(
    () => (project && proposal ? applyChange(project, proposal, decisionDraft) : null),
    [project, proposal, decisionDraft]
  );
  const proposedDiff = useMemo(
    () => (project && proposedProject ? deriveChangeDiff(proposedProject, project) : []),
    [project, proposedProject]
  );
  const proposedDiffGroups = proposedDiff.filter((group) => group.entries.length > 0);

  const activeDemoCommand = project?.name === 'Food Delivery Platform' ? FOOD_DELIVERY_DEMO_COMMAND : DEMO_COMMAND;

  const proposalHasRateLimit = Boolean(proposal?.items.some((item) => item.key === 'rate-limit'));
  const proposalHasRedisFallback = Boolean(proposal?.items.some((item) => item.key === 'redis-fallback'));
  const proposalCaveats = proposal?.assumptions.filter((item) => /does not mean/i.test(item)) || [];
  const unresolvedProposalAssumptions = proposal?.assumptions.filter((item) => {
    if (/does not mean/i.test(item)) return false;
    if (/rate-limit threshold/i.test(item) && decisionDraft.rateLimitThreshold.trim()) return false;
    if (/redis outage fallback/i.test(item) && decisionDraft.redisFallback.trim()) return false;
    return true;
  }) || [];

  // Focus trap and Escape for the review dialog
  useEffect(() => {
    if (!proposal) return undefined;
    const previousFocus = document.activeElement as HTMLElement | null;
    // The follow-up field takes focus, so a Wispr Flow user can hold the hotkey and say "apply".
    const followUpField = modalRef.current?.querySelector<HTMLElement>('#va-followup-input');
    (followUpField || modalRef.current?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setProposal(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
      ) || [])];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [proposal]);

  /** Interpret text with the model (live or recorded), or the offline rules when neither can answer. */
  function interpret(text: string, notes?: ImportedNotes) {
    if (!project) return;
    setProposalNotes(notes || null);
    const offline = () => {
      setAnswerSource(null);
      // Offline, notes are read line by line against the same patterns as a spoken instruction.
      if (notes) {
        for (const line of notes.text.split(/[\n.;]+/)) {
          const match = interpretPattern(line, project);
          if (match) return match;
        }
      }
      return interpretPattern(text, project) || proposeChange(text);
    };
    const canAsk = aiStatus.ai || Boolean(aiStatus.recordings);
    if (!canAsk) {
      setProposal(offline());
      return;
    }
    if (aiStatus.ai && aiStatus.fallback === 'daily_cap' && !aiStatus.recordings) {
      setFallbackReason('daily_cap');
      setProposal(offline());
      return;
    }
    interpretAbort.current?.abort();
    const controller = new AbortController();
    interpretAbort.current = controller;
    setIsInterpreting(true);
    interpretWithModel(text, project, controller.signal, (source) => { if (!controller.signal.aborted) setAnswerSource(source); }, notes)
      .then((result) => {
        if (controller.signal.aborted) return;
        setFallbackReason(null);
        setProposal(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : 'Interpretation failed.';
        setFallbackReason(error instanceof AiInterpretError ? error.fallback : 'provider_error');
        if (aiStatus.ai) onNotify(`${reason} Using offline rules instead.`);
        setProposal(offline());
      })
      .finally(() => {
        if (interpretAbort.current === controller) {
          interpretAbort.current = null;
          setIsInterpreting(false);
        }
      });
  }

  function proposeFromNotes(notes: ImportedNotes) {
    if (!project || !notes.text.trim()) return;
    sound.click();
    const text = 'Update the architecture to match the decisions in the imported notes.';
    setRevisions([]);
    interpret(text, notes);
  }

  function showProposal() {
    sound.click();
    if (!project) {
      onNotify('Load the Commerce Platform sample first.');
      return;
    }
    if (!command.trim()) {
      onNotify('Describe or dictate a change first.');
      return;
    }
    setDecisionDraft((current) => ({
      rateLimitThreshold: current.rateLimitThreshold || project.requirements.find((item) => item.id === 'REQ-AUTH-RATE')?.resolution || '',
      redisFallback: current.redisFallback || project.requirements.find((item) => item.id === 'REQ-REDIS-FAIL')?.resolution || '',
    }));
    const text = cleanDictation(command);
    if (text !== command) setCommand(text);
    setRevisions([]);
    interpret(text);
  }

  function reviseProposal(followUp: string) {
    if (!project || !proposal || !followUp.trim()) return;
    sound.click();
    const text = combineInstruction(proposal.text, cleanDictation(followUp));
    setRevisions((stack) => [...stack, proposal]);
    setCommand(text);
    interpret(text);
  }

  function undoRevision() {
    const previous = revisions[revisions.length - 1];
    if (!previous) return false;
    interpretAbort.current?.abort();
    setIsInterpreting(false);
    setRevisions((stack) => stack.slice(0, -1));
    setProposal(previous);
    setCommand(previous.text);
    return true;
  }

  function playDemoDictation() {
    if (isDictatingSim) return;
    setIsDictatingSim(true);
    sound.apply();
    setCommand('');
    setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
    let i = 0;
    const timer = setInterval(() => {
      i += 3;
      if (i >= activeDemoCommand.length) {
        setCommand(activeDemoCommand);
        clearInterval(timer);
        setIsDictatingSim(false);
        onNotify('Demo dictation finished. Review it, then preview the change.');
      } else {
        setCommand(activeDemoCommand.slice(0, i));
      }
    }, 18);
  }

  return {
    command,
    setCommand,
    proposal,
    setProposal,
    preview,
    proposedProject,
    proposedDiff,
    proposedDiffGroups,
    modalRef,
    showProposal,
    playDemoDictation,
    activeDemoCommand,
    proposalHasRateLimit,
    proposalHasRedisFallback,
    proposalCaveats,
    unresolvedProposalAssumptions,
    isDictatingSim,
    aiStatus,
    isInterpreting,
    setIsDictatingSim,
    reviseProposal,
    undoRevision,
    revisionCount: revisions.length,
    fallbackReason,
    answerSource,
    proposeFromNotes,
    proposalNotes,
  };
}