import { useMemo, useState } from 'react';
import type { Project } from '../types/schema.ts';

interface JourneyStep {
  title: string;
  complete: boolean;
}

interface JourneyOutput {
  id: string;
  label: string;
}

interface UseJourneyReturn {
  journeySteps: JourneyStep[];
  currentJourneyStep: number;
  journeyGuidance: string;
  journeyOutputs: JourneyOutput[];
  inspectedArtifacts: Set<string>;
  setInspectedArtifacts: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleTabChange: (_tabId: string) => void;
}

const JOURNEY_OUTPUTS: JourneyOutput[] = [
  { id: 'diagram', label: 'Diagram' },
  { id: 'openapi', label: 'API contract' },
  { id: 'risk', label: 'Risks' },
  { id: 'tasks', label: 'Tasks' },
];

export function useJourney(
  project: Project | null,
  command: string,
  proposal: unknown,
  tab: string,
  isDictatingSim: boolean,
  isListening: boolean
): UseJourneyReturn {
  const [inspectedArtifacts, setInspectedArtifacts] = useState<Set<string>>(new Set());

  const instructionReady = useMemo(
    () => Boolean(command.trim()) && !isDictatingSim && !isListening,
    [command, isDictatingSim, isListening]
  );

  const journeySteps = useMemo<JourneyStep[]>(() => [
    { title: 'Start with the sample', complete: Boolean(project) },
    { title: 'Enter or dictate a change', complete: instructionReady },
    { title: 'Preview the proposal', complete: Boolean(proposal || project?.changed) },
    { title: 'Review open decisions', complete: Boolean(project?.changed) },
    { title: 'Apply the change', complete: Boolean(project?.changed) },
    { title: 'Explore the updated outputs', complete: Boolean(project?.changed) && inspectedArtifacts.size === JOURNEY_OUTPUTS.length },
  ], [project, instructionReady, proposal, inspectedArtifacts.size]);

  const currentJourneyStep = useMemo(() => {
    if (!project) return 0;
    if (!instructionReady) return 1;
    if (!proposal && !project.changed) return 2;
    if (proposal) return 3;
    if (inspectedArtifacts.size < JOURNEY_OUTPUTS.length) return 5;
    return journeySteps.length;
  }, [project, instructionReady, proposal, inspectedArtifacts.size, journeySteps.length]);

  const journeyGuidance = useMemo(() => {
    if (!project) return 'Start by loading the Commerce Platform sample.';
    if (!instructionReady) {
      if (isDictatingSim) return 'The sample instruction is being entered. It will be ready to preview in a moment.';
      if (isListening) return 'Listening now. Finish speaking, then preview the instruction when it is ready.';
      return 'The sample is ready. Type a change below, use Wispr Flow in the text box, or play the sample dictation.';
    }
    if (!proposal && !project.changed) return 'Your instruction is ready. Preview it to see what the prototype understood before anything changes.';
    if (proposal) return 'Review the proposed changes and the decisions that still need your team. Nothing changes until you apply it.';
    if (inspectedArtifacts.size < JOURNEY_OUTPUTS.length) {
      return `Your change is applied. Explore each output below (${inspectedArtifacts.size} of ${JOURNEY_OUTPUTS.length} viewed).`;
    }
    return 'Walkthrough complete. You have reviewed every updated output.';
  }, [project, instructionReady, isDictatingSim, isListening, proposal, inspectedArtifacts.size]);

  const handleTabChange = (_tabId: string) => {
    if (project?.changed && JOURNEY_OUTPUTS.some((o) => o.id === _tabId)) {
      setInspectedArtifacts((current) => new Set(current).add(_tabId));
    }
  };

  return {
    journeySteps,
    currentJourneyStep,
    journeyGuidance,
    journeyOutputs: JOURNEY_OUTPUTS,
    inspectedArtifacts,
    setInspectedArtifacts,
    handleTabChange,
  };
}