import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, ClipboardCheck, ClipboardList, FileArchive, FileCode2, GitBranch, HelpCircle, Layers,
  Network, Play, RotateCcw, Server, ShieldAlert, Sun,
} from 'lucide-react';
import { SiteHeader, Hero, LoopSection, SiteFooter } from './components/landing/LandingSections.tsx';
import { StudioHeader, StudioBar } from './components/StudioToolbar.tsx';
import GuidedDemo from './components/GuidedDemo.tsx';
import { GUIDED_STEPS } from './data/guidedDemo.ts';
import Composer from './components/Composer.tsx';
import OutputPanel from './components/OutputPanel.tsx';
import ReviewDialog from './components/ReviewDialog.tsx';
import ScenarioBranchingBar from './components/ScenarioBranchingBar.tsx';
import ScenarioComparisonModal from './components/ScenarioComparisonModal.tsx';
import MergeConflictModal from './components/MergeConflictModal.tsx';
import ShortcutsModal from './components/ShortcutsModal.tsx';
import CommandPalette from './components/CommandPalette.tsx';
import WisprImportDialog from './components/WisprImportDialog.tsx';
import ConnectionStatus from './components/ConnectionStatus.tsx';
import { countOpenDecisions, getProjectSyncStatus } from './data/analysis.ts';
import { sound } from './utils/sound.ts';
import { useProjectState } from './hooks/useProjectState.ts';
import { useDictation } from './hooks/useDictation.ts';
import { useJourney } from './hooks/useJourney.ts';
import { useExport } from './hooks/useExport.ts';
import { useProposalReview } from './hooks/useProposalReview.ts';
import { useToast } from './hooks/useToast.ts';
import useLocalStorage from './hooks/useLocalStorage.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useRevealOnScroll } from './hooks/useMotion.ts';
import { useScrollSpy } from './hooks/useScrollSpy.ts';
import { isDialogOpen } from './hooks/useDialog.ts';
import { cssVars } from './utils/cssVars.ts';
import type { Proposal } from './types/schema.ts';
import type { WisprReturn } from './components/WisprImportDialog.tsx';
import { parseFollowUp } from './data/reviewCommands.ts';
import { dictionaryWords } from './data/dictation.ts';

const NAV_SECTIONS = ['how', 'workspace'];

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName));
}

export default function App() {
  const [tab, setTab] = useState('diagram');
  const [showHistory, setShowHistory] = useState(false);
  const [advancedTools, setAdvancedTools] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);
  const guidedBaseline = useRef(0);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  // Import notes dialog: null when closed, otherwise { returned } describing a return from Wispr Flow's sign-in.
  const [notesImport, setNotesImport] = useState<{ returned: WisprReturn | null } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('wispr');
    if (!result) return;
    setNotesImport({ returned: result === 'connected' ? { connected: true } : { errorCode: params.get('code') || 'unavailable' } });
    // Drop the query so a reload does not reopen the dialog.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
  }, []);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const { toast, notify } = useToast();

  const projectState = useProjectState();
  const {
    project,
    sampleChoice,
    setSampleChoice,
    branches,
    currentBranchId,
    setCurrentBranchId,
    currentBranch,
    branchList,
    canUndo,
    canRedo,
    timelineEntries,
    scenarioComparison,
    loadSample: projectLoadSample,
    loadProject: projectLoadProject,
    isImported,
    reset: projectReset,
    setBranchProject,
    syncHistory,
    handleUndo,
    handleRedo,
    handleJumpToVersion,
    handleSwitchBranch,
    handleForkBranch,
    handleOpenComparison,
    handleInitiateMerge,
    handleConfirmMerge,
    showComparisonModal,
    setShowComparisonModal,
    showMergeModal,
    setShowMergeModal,
    mergeConflicts,
    mergingBranchId,
  } = projectState;

  const [command, setCommand] = useLocalStorage('va-command', '');
  const [decisionDraft, setDecisionDraft] = useLocalStorage('va-decisions', { rateLimitThreshold: '', redisFallback: '' });

  const dictation = useDictation({
    onResult: (transcript) => setCommand(transcript),
    onError: notify,
  });

  // Wispr Flow types into the focused text box, so it needs no code here. The browser
  // microphone (Web Speech API) is only a fallback for people without Wispr Flow.
  const { isListening, isSupported: micSupported, toggle: toggleDictation } = dictation;
  const [followUp, setFollowUp] = useState('');

  const journey = useJourney(project, command, null, tab, false, isListening);
  const {
    journeySteps,
    currentJourneyStep,
    journeyGuidance,
    journeyOutputs,
    inspectedArtifacts,
    setInspectedArtifacts,
    handleTabChange: journeyHandleTabChange,
  } = journey;

  const exportHooks = useExport(project, notify);
  const {
    exportOpen,
    setExportOpen,
    exportMenuRef,
    exportAll,
    exportDevOps,
    exportDiagram,
  } = exportHooks;

  const { theme, toggleTheme } = useTheme();
  useRevealOnScroll();
  const activeSection = useScrollSpy(NAV_SECTIONS);

  const proposalHooks = useProposalReview(project, sampleChoice, notify, { command, setCommand });
  const {
    proposal,
    setProposal,
    preview,
    proposedProject,
    proposedDiffGroups,
    modalRef,
    showProposal,
    proposalHasRateLimit,
    proposalHasRedisFallback,
    proposalCaveats,
    unresolvedProposalAssumptions,
    isDictatingSim,
    setIsDictatingSim,
    aiStatus,
    isInterpreting,
    reviseProposal,
    undoRevision,
    revisionCount,
    fallbackReason,
    answerSource,
    proposeFromNotes,
    proposalNotes,
  } = proposalHooks;

  const handleTabChange = (id: string) => {
    sound.tab();
    setTab(id);
    journeyHandleTabChange(id);
  };

  // Counted from the model's own risk findings, so imported stacks get their own decisions.
  const openDecisionCount = countOpenDecisions(project);

  const syncStatus = getProjectSyncStatus(project);
  const isLive = isListening || isDictatingSim;
  // Ctrl/Cmd+Z and Ctrl/Cmd+Y undo the model, but never while typing
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (proposal || isDialogOpen() || isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (mod && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
        sound.click();
      } else if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen(true);
        sound.click();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [proposal, handleUndo, handleRedo]);

  // Sync dictation state with proposal hook
  useEffect(() => {
    setIsDictatingSim(isDictatingSim);
  }, [isDictatingSim, setIsDictatingSim]);

  const clearWorkspaceUi = () => {
    setCommand('');
    setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
    setProposal(null);
    setTab('diagram');
    setCurrentBranchId('main');
    setInspectedArtifacts(new Set());
    setShowHistory(false);
  };

  const resetWorkspace = (message: string, kind: 'commerce' | 'food' = sampleChoice) => {
    sound.click();
    projectLoadSample(kind);
    clearWorkspaceUi();
    notify(message);
  };

  const loadSample = () => resetWorkspace(`${sampleChoice === 'food' ? 'Food Delivery' : 'Commerce Platform'} sample loaded.`, sampleChoice);
  const importComposeText = async (text: string, fileName: string) => {
    try {
      // Loaded on demand so the YAML parser stays out of the main bundle.
      const { projectFromCompose } = await import('./data/composeImport.ts');
      const imported = projectFromCompose(text, fileName);
      sound.click();
      projectLoadProject(imported);
      clearWorkspaceUi();
      notify(`Imported ${imported.components.length} services and ${imported.relationships.length} connections from ${fileName}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Import failed.');
    }
  };

  const onComposeFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) file.text().then((text) => importComposeText(text, file.name));
  };

  const importExampleCompose = async () => {
    try {
      const response = await fetch('/samples/ride-share-compose.yml');
      if (!response.ok) throw new Error('The example stack could not be loaded.');
      await importComposeText(await response.text(), 'ride-share-compose.yml');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Import failed.');
    }
  };


  // Fixes chosen in the Risks tab open the same review dialog as any other change.
  const reviewResolution = (resolution: Proposal | null) => {
    if (!resolution) return;
    sound.click();
    setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
    setProposal(resolution);
  };

  // Code drift: compare the diagram with a docker-compose file and review the differences.
  const checkDriftText = async (text: string, fileName: string) => {
    if (!project) return;
    try {
      const { detectCodeDrift, driftProposal } = await import('./data/driftCheck.ts');
      const report = detectCodeDrift(project, text, fileName);
      const drift = driftProposal(report, project);
      if (!drift) {
        const planned = report.plannedNotInCode.length;
        notify(`The diagram matches ${fileName}.${planned ? ` ${planned} planned component${planned === 1 ? ' is' : 's are'} not in code yet.` : ''}`);
        return;
      }
      sound.click();
      setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
      setProposal(drift);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Drift check failed.');
    }
  };

  const onDriftFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) file.text().then((text) => checkDriftText(text, file.name));
  };

  const checkExampleDrift = async () => {
    try {
      const response = await fetch('/samples/ride-share-compose.v2.yml');
      if (!response.ok) throw new Error('The example update could not be loaded.');
      await checkDriftText(await response.text(), 'ride-share-compose.v2.yml');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Drift check failed.');
    }
  };

  const reset = () => {
    if (isImported) {
      sound.click();
      projectReset();
      clearWorkspaceUi();
      notify(`Workspace reset to the imported ${project?.name || 'project'} baseline.`);
      return;
    }
    const kind = project?.name === 'Food Delivery Platform' ? 'food' : sampleChoice;
    resetWorkspace(`Workspace reset to the ${kind === 'food' ? 'Food Delivery' : 'Commerce Platform'} baseline.`, kind);
  };

  const startDemo = async () => {
    await importExampleCompose();
    setCommand('');
    guidedBaseline.current = 0;
    setGuidedStep(1);
    document.querySelector('.va-studio')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Each applied change moves the guided demo one step forward; leaving the example stack ends it.
  useEffect(() => {
    if (!guidedStep || guidedStep > GUIDED_STEPS.length) return;
    if (project?.name !== 'ride-share-platform') {
      setGuidedStep(0);
      return;
    }
    const count = project.changes?.length || 0;
    if (count < guidedBaseline.current) guidedBaseline.current = count;
    if (count > guidedBaseline.current) {
      guidedBaseline.current = count;
      setGuidedStep((step) => step + 1);
    }
  }, [project, guidedStep]);

  const typeGuidedStep = (text: string) => {
    sound.click();
    setCommand(text);
    const box = document.getElementById('architecture-command');
    box?.focus({ preventScroll: true });
    box?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  // A spoken "undo" outside a review undoes the last applied change; "apply" or "cancel"
  // with nothing under review is answered instead of being sent to the interpreter.
  function runInstruction() {
    const intent = parseFollowUp(command);
    if (intent.type === 'undo') {
      if (canUndo) {
        handleUndo();
        setCommand('');
        notify('Undid the last applied change.');
      } else {
        notify('There is nothing to undo yet.');
      }
      return;
    }
    if (intent.type === 'apply' || intent.type === 'cancel') {
      notify('No change is under review. Describe one first.');
      return;
    }
    showProposal();
  }

  function handleFollowUp(event?: React.FormEvent) {
    event?.preventDefault?.();
    const intent = parseFollowUp(followUp);
    if (intent.type === 'empty') return;
    setFollowUp('');
    if (intent.type === 'apply') confirmChange();
    else if (intent.type === 'cancel') { sound.click(); setProposal(null); }
    else if (intent.type === 'undo') {
      if (!undoRevision()) notify('This is the first version of the change. Say "cancel" to discard it.');
    } else reviseProposal(intent.text);
  }

  async function copyDictionaryWords() {
    const words = dictionaryWords(project);
    try {
      await navigator.clipboard.writeText(words.join('\n'));
      notify(`Copied ${words.length} words. Add them in Wispr Flow under Dictionary so it spells them right.`);
    } catch {
      notify('Clipboard copy failed.');
    }
  }

  function confirmChange() {
    if (!project || !proposal) return;
    sound.apply();
    const appliedProject = proposedProject;
    if (!appliedProject) return;
    const history = branches[currentBranchId]?.history;
    if (history) {
      history.push(appliedProject, proposal.text, appliedProject.changes[0]?.id);
      setBranchProject(currentBranchId, appliedProject);
      syncHistory(history);
    }
    setProposal(null);
    setTab('impact');
    setInspectedArtifacts(new Set());
    const recordedDecisionCount = Number(Boolean(decisionDraft.rateLimitThreshold.trim()))
      + Number(Boolean(decisionDraft.redisFallback.trim()));
    notify(recordedDecisionCount
      ? `Change applied with ${recordedDecisionCount} recorded decision${recordedDecisionCount === 1 ? '' : 's'}. Implementation is still proposed.`
      : 'Change applied. Any unanswered decisions remain open in every view.');
  }

  const paletteCommands = [
    { id: 'load-sample', label: 'Load Sample', description: 'Load Commerce Platform or Food Delivery sample', keys: [], icon: <RotateCcw size={14} />, category: 'actions', action: loadSample },
    { id: 'reset', label: 'Reset Workspace', description: 'Reset to baseline sample', keys: [], icon: <RotateCcw size={14} />, category: 'actions', action: reset },
    { id: 'start-demo', label: 'Start Guided Demo', description: 'Run the full demo flow', keys: [], icon: <Play size={14} />, category: 'actions', action: startDemo },
    { id: 'preview', label: 'Preview Change', description: 'Preview the current instruction', keys: ['Ctrl', 'Enter'], icon: <ClipboardCheck size={14} />, category: 'actions', action: () => { if (project && command.trim()) showProposal(); } },
    { id: 'apply', label: 'Apply Change', description: 'Apply the previewed change', keys: [], icon: <ArrowRight size={14} />, category: 'actions', action: () => { if (proposal) confirmChange(); } },
    { id: 'export-all', label: 'Export All (ZIP)', description: 'Download engineering artifacts ZIP', keys: [], icon: <FileArchive size={14} />, category: 'export', action: exportAll },
    { id: 'export-devops', label: 'Export DevOps (ZIP)', description: 'Download Terraform, K8s, SDK bundle', keys: [], icon: <Server size={14} />, category: 'export', action: exportDevOps },
    { id: 'export-svg', label: 'Export Diagram (SVG)', description: 'Download architecture as SVG', keys: [], icon: <FileCode2 size={14} />, category: 'export', action: () => exportDiagram('svg') },
    { id: 'export-png', label: 'Export Diagram (PNG)', description: 'Download architecture as PNG', keys: [], icon: <FileCode2 size={14} />, category: 'export', action: () => exportDiagram('png') },
    { id: 'export-mermaid', label: 'Export Mermaid', description: 'Download Mermaid source', keys: [], icon: <FileCode2 size={14} />, category: 'export', action: () => exportDiagram('mermaid') },
    { id: 'tab-diagram', label: 'Diagram Tab', description: 'Switch to architecture diagram', keys: ['→'], icon: <Network size={14} />, category: 'navigation', action: () => handleTabChange('diagram') },
    { id: 'tab-openapi', label: 'API Contract Tab', description: 'Switch to OpenAPI contract', keys: ['→'], icon: <FileCode2 size={14} />, category: 'navigation', action: () => handleTabChange('openapi') },
    { id: 'tab-risk', label: 'Risks Tab', description: 'Switch to risk audit', keys: ['→'], icon: <ShieldAlert size={14} />, category: 'navigation', action: () => handleTabChange('risk') },
    { id: 'tab-tasks', label: 'Tasks Tab', description: 'Switch to engineering tasks', keys: ['→'], icon: <ClipboardList size={14} />, category: 'navigation', action: () => handleTabChange('tasks') },
    { id: 'tab-impact', label: 'Change Impact Tab', description: 'Switch to change impact', keys: ['→'], icon: <Activity size={14} />, category: 'navigation', action: () => handleTabChange('impact') },
    { id: 'tab-topology', label: 'Topology Tab', description: 'Switch to the topology and model checks', keys: ['→'], icon: <Layers size={14} />, category: 'navigation', action: () => handleTabChange('topology') },
    { id: 'history', label: 'Show History', description: 'Open branches and history panel', keys: [], icon: <GitBranch size={14} />, category: 'view', action: () => setShowHistory(true) },
    { id: 'fork', label: 'Fork Branch', description: 'Fork the current model into a new branch', keys: [], icon: <GitBranch size={14} />, category: 'actions', action: () => { handleForkBranch(); notify('Forked the current model into a new branch.'); } },
    { id: 'compare', label: 'Compare With Main', description: 'Compare the current branch with main', keys: [], icon: <GitBranch size={14} />, category: 'view', action: () => { if (scenarioComparison) setShowComparisonModal(true); } },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', description: 'Show all keyboard shortcuts', keys: ['?'], icon: <HelpCircle size={14} />, category: 'help', action: () => setIsShortcutsOpen(true) },
    { id: 'theme', label: 'Toggle Theme', description: 'Switch between dark and light mode', keys: [], icon: <Sun size={14} />, category: 'view', action: toggleTheme },
  ];

  return (
    <main className="va-app">
      <SiteHeader activeSection={activeSection} theme={theme} onToggleTheme={toggleTheme} onStartDemo={startDemo} />

      <Hero project={project} onStartDemo={startDemo} />

      <LoopSection />

      <section className="va-section va-section-work" id="workspace" aria-labelledby="va-work-title">
        <div className="va-section-inner va-work-intro">
          <h2 id="va-work-title" data-reveal style={cssVars({ '--d': 1 })}>Workspace</h2>
          <p className="va-section-lead" data-reveal style={cssVars({ '--d': 2 })}>Start from a sample or your own docker-compose file, say a change, and review exactly what it affects before anything applies.</p>
        </div>
      <div className="va-studio">
        <StudioHeader
          project={project}
          currentBranchId={currentBranchId}
          currentBranch={currentBranch}
          openDecisionCount={openDecisionCount}
          onTabChange={handleTabChange}
          exportOpen={exportOpen}
          setExportOpen={setExportOpen}
          exportMenuRef={exportMenuRef}
          exportAll={exportAll}
          exportDiagram={exportDiagram}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />

        <StudioBar
          project={project}
          guideActive={guidedStep > 0}
          journeySteps={journeySteps}
          currentJourneyStep={currentJourneyStep}
          journeyGuidance={journeyGuidance}
          journeyOutputs={journeyOutputs}
          inspectedArtifacts={inspectedArtifacts}
          tab={tab}
          onTabChange={handleTabChange}
          isImported={isImported}
          sampleChoice={sampleChoice}
          onSampleChoice={setSampleChoice}
          onResetWorkspace={resetWorkspace}
          onLoadSample={loadSample}
          onImportExample={importExampleCompose}
          onCheckExampleDrift={checkExampleDrift}
          onComposeFile={onComposeFile}
          onDriftFile={onDriftFile}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
          currentBranch={currentBranch}
          advancedTools={advancedTools}
          setAdvancedTools={setAdvancedTools}
          onReset={reset}
          onExportDevOps={exportDevOps}
        />

        {guidedStep > 0 && (
          <GuidedDemo
            step={guidedStep}
            onExit={() => setGuidedStep(0)}
            onTypeIt={typeGuidedStep}
            onRunCodeCheck={checkExampleDrift}
          />
        )}

        {showHistory && (
          <div className="va-history-panel">
            <ScenarioBranchingBar
              currentBranchId={currentBranchId}
              branches={branchList}
              onSwitchBranch={handleSwitchBranch}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              timeline={timelineEntries}
              changes={project?.changes || []}
              onJumpToVersion={handleJumpToVersion}
              comparison={scenarioComparison}
              onOpenComparison={handleOpenComparison}
              onForkBranch={() => { handleForkBranch(); notify('Forked the current model into a new branch. Changes here stay off main until you merge.'); }}
              onMergeBranch={currentBranchId !== 'main' ? handleInitiateMerge : undefined}
            />
          </div>
        )}

      <div className="va-layout">
        {/* ---------------- Composer ---------------- */}
        <Composer
          project={project}
          command={command}
          setCommand={setCommand}
          setDecisionDraft={setDecisionDraft}
          onClear={() => {
            sound.click();
            setCommand('');
            setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
            setProposal(null);
          }}
          onPreview={runInstruction}
          isLive={isLive}
          isInterpreting={isInterpreting}
          aiStatus={aiStatus}
          answerSource={answerSource}
          fallbackReason={fallbackReason}
          preview={preview}
          onImportNotes={() => setNotesImport({ returned: null })}
          onCopyDictionary={copyDictionaryWords}
          micSupported={micSupported}
          isListening={isListening}
          onToggleMic={toggleDictation}
          sampleChoice={sampleChoice}
          isImported={isImported}
        />

        {/* ---------------- Output ---------------- */}
        <OutputPanel
          project={project}
          tab={tab}
          onTabChange={handleTabChange}
          openDecisionCount={openDecisionCount}
          syncStatus={syncStatus}
          advancedTools={advancedTools}
          setAdvancedTools={setAdvancedTools}
          notify={notify}
          onResolve={reviewResolution}
          onLoadSample={loadSample}
        />
      </div>
      </div>
      </section>

      <SiteFooter />

      {/* Review dialog */}
      {proposal && (
        <ReviewDialog
          proposal={proposal}
          project={project}
          modalRef={modalRef}
          proposedDiffGroups={proposedDiffGroups}
          decisionDraft={decisionDraft}
          setDecisionDraft={setDecisionDraft}
          proposalHasRateLimit={proposalHasRateLimit}
          proposalHasRedisFallback={proposalHasRedisFallback}
          proposalNotes={proposalNotes}
          unresolvedProposalAssumptions={unresolvedProposalAssumptions}
          proposalCaveats={proposalCaveats}
          followUp={followUp}
          setFollowUp={setFollowUp}
          onFollowUp={handleFollowUp}
          isInterpreting={isInterpreting}
          revisionCount={revisionCount}
          onClose={() => { sound.click(); setProposal(null); }}
          onApply={confirmChange}
        />
      )}

      {showComparisonModal && scenarioComparison && (
        <ScenarioComparisonModal
          comparison={scenarioComparison}
          onClose={() => setShowComparisonModal(false)}
          onSelectBranch={handleSwitchBranch}
        />
      )}

      {showMergeModal && (
        <MergeConflictModal
          sourceBranchName={(mergingBranchId && branches[mergingBranchId]?.name) || mergingBranchId || ''}
          targetBranchName={branches.main?.name ?? 'Main Branch'}
          conflicts={mergeConflicts}
          onClose={() => setShowMergeModal(false)}
          onConfirmMerge={handleConfirmMerge}
        />
      )}

      {toast && (
        <div className="va-toast" key={toast.key} role="status" aria-live="polite">
          <Activity size={15} />
          <span>{toast.message}</span>
        </div>
      )}
      <WisprImportDialog
        isOpen={Boolean(notesImport)}
        returned={notesImport?.returned}
        isImported={isImported}
        onClose={() => setNotesImport(null)}
        onPropose={proposeFromNotes}
      />
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} commands={paletteCommands} />
      <ConnectionStatus />
    </main>
  );
}