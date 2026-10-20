import { useState, useEffect, useRef, useMemo } from 'react';
import type { Project, Proposal } from '../types/schema.ts';
import { proposeChange, applyChange, DEMO_COMMAND } from '../data/commerce.js';
import { FOOD_DELIVERY_DEMO_COMMAND } from '../data/foodDelivery.js';
import { deriveChangeDiff } from '../data/changeDiff.js';
import { sound } from '../utils/sound.js';

interface DecisionDraft {
  rateLimitThreshold: string;
  redisFallback: string;
}

interface UseProposalReviewReturn {
  command: string;
  setCommand: (_cmd: string) => void;
  decisionDraft: DecisionDraft;
  setDecisionDraft: React.Dispatch<React.SetStateAction<DecisionDraft>>;
  proposal: Proposal | null;
  setProposal: React.Dispatch<React.SetStateAction<Proposal | null>>;
  preview: Proposal | null;
  proposedProject: Project | null;
  proposedDiff: ReturnType<typeof deriveChangeDiff>;
  proposedDiffGroups: ReturnType<typeof deriveChangeDiff>;
  modalRef: React.RefObject<HTMLSectionElement>;
  showProposal: () => void;
  confirmChange: () => void;
  playDemoDictation: () => void;
  activeDemoCommand: string;
  proposalHasRateLimit: boolean;
  proposalHasRedisFallback: boolean;
  proposalCaveats: string[];
  unresolvedProposalAssumptions: string[];
  isDictatingSim: boolean;
  setIsDictatingSim: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useProposalReview(
  project: Project | null,
  sampleChoice: 'commerce' | 'food',
  onNotify: (_msg: string) => void
): UseProposalReviewReturn {
  const [command, setCommand] = useState('');
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>({ rateLimitThreshold: '', redisFallback: '' });
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [isDictatingSim, setIsDictatingSim] = useState(false);
  const modalRef = useRef<HTMLSectionElement>(null);

  const preview = useMemo(() => (command.trim() ? proposeChange(command.trim()) : null), [command]);
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
    const previousFocus = document.activeElement;
    modalRef.current?.querySelector('button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setProposal(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(modalRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
      ) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
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
    setProposal(proposeChange(command.trim()));
  }

  function confirmChange() {
    if (!project || !proposal) return;
    sound.apply();
    applyChange(project, proposal, decisionDraft);
    // Note: The actual history push and project update is handled by the parent component
    // This hook just provides the nextProject - the parent will handle the rest
    onNotify('Change applied. Implementation is still proposed.');
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
    decisionDraft,
    setDecisionDraft,
    proposal,
    setProposal,
    preview,
    proposedProject,
    proposedDiff,
    proposedDiffGroups,
    modalRef,
    showProposal,
    confirmChange,
    playDemoDictation,
    activeDemoCommand,
    proposalHasRateLimit,
    proposalHasRedisFallback,
    proposalCaveats,
    unresolvedProposalAssumptions,
    isDictatingSim,
    setIsDictatingSim,
  };
}