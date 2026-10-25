import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, ClipboardCheck, ClipboardList, Download, FileArchive, FileCode2, GitBranch, HelpCircle, Layers,
  Network, Play, RotateCcw, Server, ShieldAlert, Sun, X,
} from 'lucide-react';
import TopBar from './components/workspace/TopBar.tsx';
import Drawer from './components/workspace/Drawer.tsx';
import type { DrawerTab } from './components/workspace/Drawer.tsx';
import EmptyState from './components/workspace/EmptyState.tsx';
import GuidedDemo from './components/GuidedDemo.tsx';
import { GUIDED_STEPS } from './data/guidedDemo.ts';
import Composer from './components/Composer.tsx';
import { DiagramView } from './components/OutputPanel.tsx';
import ReviewDialog from './components/ReviewDialog.tsx';
import ConnectionStatus from './components/ConnectionStatus.tsx';
import { countOpenDecisions, getProjectSyncStatus } from './data/analysis.ts';
import { sound } from './utils/sound.ts';
import { useProjectState } from './hooks/useProjectState.ts';
import { useDictation } from './hooks/useDictation.ts';
import { useExport } from './hooks/useExport.ts';
import { useProposalReview } from './hooks/useProposalReview.ts';
import { useToast } from './hooks/useToast.ts';
import useLocalStorage from './hooks/useLocalStorage.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useMediaQuery } from './hooks/useMediaQuery.ts';
import { navigate, useLocation } from './router.ts';
import { isDialogOpen } from './hooks/useDialog.ts';
import { cssVars } from './utils/cssVars.ts';
import './workspace.css';
import type { ComposeSource, Project, Proposal } from './types/schema.ts';
import type { ComposePatch } from './data/composePatch.ts';
import type { WisprReturn } from './components/WisprImportDialog.tsx';
import { parseFollowUp } from './data/reviewCommands.ts';
import { dictionaryWords } from './data/dictation.ts';

// Shown on demand, so they (and their CSS) load the first time they open, not with the page.
const ScenarioBranchingBar = lazy(() => import('./components/ScenarioBranchingBar.tsx'));
const ScenarioComparisonModal = lazy(() => import('./components/ScenarioComparisonModal.tsx'));
const MergeConflictModal = lazy(() => import('./components/MergeConflictModal.tsx'));
const ShortcutsModal = lazy(() => import('./components/ShortcutsModal.tsx'));
const CommandPalette = lazy(() => import('./components/CommandPalette.tsx'));
const WisprImportDialog = lazy(() => import('./components/WisprImportDialog.tsx'));
const ComposeExportDialog = lazy(() => import('./components/ComposeExportDialog.tsx'));

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName));
}

export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('component');
  const [hasSelection, setHasSelection] = useState(false);
  const inspectorSlot = useRef<HTMLDivElement | null>(null);
  const composeInputRef = useRef<HTMLInputElement | null>(null);
  const driftInputRef = useRef<HTMLInputElement | null>(null);
  // Below 1024px the docs slide-over covers the diagram, so it is modal there.
  const compact = useMediaQuery('(max-width: 1023px)');
  const { params } = useLocation();
  // The guided demo's card sits above the command bar; the diagram leaves room for its height.
  const [coachHeight, setCoachHeight] = useState(0);
  const coachObserver = useRef<ResizeObserver | null>(null);
  const coachRef = useCallback((node: HTMLDivElement | null) => {
    coachObserver.current?.disconnect();
    if (!node) { setCoachHeight(0); return; }
    if (typeof ResizeObserver === 'undefined') return;
    coachObserver.current = new ResizeObserver(([entry]) => { if (entry) setCoachHeight(Math.ceil(entry.contentRect.height)); });
    coachObserver.current.observe(node);
  }, []);
  const [showHistory, setShowHistory] = useState(false);
  const [advancedTools, setAdvancedTools] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);
  const guidedBaseline = useRef(0);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  // Import notes dialog: null when closed, otherwise { returned } describing a return from Wispr Flow's sign-in.
  const [notesImport, setNotesImport] = useState<{ returned: WisprReturn | null } | null>(null);
  const [notesLoaded, setNotesLoaded] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('wispr');
    if (!result) return;
    setNotesLoaded(true);
    setNotesImport({ returned: result === 'connected' ? { connected: true } : { errorCode: params.get('code') || 'unavailable' } });
    // Drop the query so a reload does not reopen the dialog.
    navigate('/app', { replace: true });
  }, []);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // After an applied change, the version whose changes can be written into the imported compose file.
  const [composeOfferFor, setComposeOfferFor] = useState<number | null>(null);
  const [composePatch, setComposePatch] = useState<ComposePatch | null>(null);
  // The newer compose file a drift review came from; it becomes the workspace's file once applied.
  const driftSource = useRef<ComposeSource | null>(null);

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
    composeSource,
    setComposeSource,
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

  const proposalHooks = useProposalReview(project, sampleChoice, notify, { command, setCommand }, { decisionDraft, setDecisionDraft });
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

  // Docs and the component inspector open in the drawer beside the diagram.
  const openDrawer = (tab: DrawerTab) => {
    sound.tab();
    setDrawerTab(tab);
    setDrawerOpen(true);
  };
  const handleTabChange = (id: string) => {
    if (id === 'diagram') { setDrawerOpen(false); return; }
    openDrawer(id as DrawerTab);
  };
  const onSelectComponent = (id: string | null) => {
    setHasSelection(Boolean(id));
    if (id) { setDrawerTab('component'); setDrawerOpen(true); }
  };

  // Counted from the model's own risk findings, so imported stacks get their own decisions.
  const openDecisionCount = countOpenDecisions(project);

  const syncStatus = getProjectSyncStatus(project);
  const isLive = isListening || isDictatingSim;
  // Ctrl/Cmd+Z and Ctrl/Cmd+Y undo the model, but never while typing
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (proposal || isDialogOpen()) return;
      const mod = e.ctrlKey || e.metaKey;
      // The palette opens from anywhere, the instruction box included (it has focus on arrival).
      if (mod && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
        sound.click();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === '/' && !mod) {
        // Slash goes to the command bar, as in most command-driven tools.
        e.preventDefault();
        document.getElementById('architecture-command')?.focus();
      } else if (mod && e.key === 'z' && !e.shiftKey) {
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
    setDrawerTab('component');
    setCurrentBranchId('main');
    setShowHistory(false);
    setComposeOfferFor(null);
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
      projectLoadProject(imported, { fileName, text });
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
      driftSource.current = isImported ? { fileName, text } : null;
      if (!drift) {
        // The file matches the diagram, so it is the code to write later changes into.
        if (isImported) setComposeSource({ fileName, text });
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
    document.getElementById('architecture-command')?.focus({ preventScroll: true });
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
    if (proposal.source === 'drift' && driftSource.current) {
      // Synced with a newer file: that file is the one later changes are written into.
      setComposeSource(driftSource.current);
      driftSource.current = null;
    } else if (composeSource) {
      void offerCompose(composeSource, appliedProject);
    }
    const recordedDecisionCount = Number(Boolean(decisionDraft.rateLimitThreshold.trim()))
      + Number(Boolean(decisionDraft.redisFallback.trim()));
    notify(recordedDecisionCount
      ? `Change applied with ${recordedDecisionCount} recorded decision${recordedDecisionCount === 1 ? '' : 's'}. Implementation is still proposed.`
      : 'Change applied. Any unanswered decisions remain open in every view.');
    // The box is ready for the next change; the applied instruction stays under + → Recent.
    setCommand('');
  }

  /** Offers the updated compose file when the applied change gives the file something to write. */
  async function offerCompose(source: ComposeSource, applied: Project) {
    try {
      const { patchCompose } = await import('./data/composePatch.ts');
      setComposeOfferFor(patchCompose(source.text, applied, source.fileName).changed ? applied.version : null);
    } catch {
      setComposeOfferFor(null);
    }
  }

  /** The imported compose file with the diagram's changes written in, for review before download. */
  async function openComposeExport() {
    setExportOpen(false);
    if (!project || !composeSource) {
      notify('Import a docker-compose file first: the updated file is written from it.');
      return;
    }
    try {
      const { patchCompose } = await import('./data/composePatch.ts');
      setComposePatch(patchCompose(composeSource.text, project, composeSource.fileName));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The compose file could not be updated.');
    }
  }

  function downloadCompose() {
    if (!composePatch) return;
    sound.export();
    const url = URL.createObjectURL(new Blob([composePatch.text], { type: 'text/yaml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = composePatch.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    // What was downloaded is the code from now on; the next update starts from it.
    setComposeSource({ fileName: composePatch.fileName, text: composePatch.text });
    setComposePatch(null);
    setComposeOfferFor(null);
    notify(`${composePatch.fileName} downloaded. Replace the file in your project with it.`);
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
    { id: 'export-compose', label: 'Updated Compose File', description: 'Write the applied changes into the imported compose file', keys: [], icon: <FileCode2 size={14} />, category: 'export', action: () => { void openComposeExport(); } },
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

  // Shown for the version it was computed for: an undo hides it, a redo brings it back.
  const offerShown = Boolean(composeSource && project && composeOfferFor === project.version && !proposal);

  // Deep links: /app?demo=guided, /app?sample=commerce|food|ride-share, /app?import=compose.
  const linkHandled = useRef(false);
  useEffect(() => {
    if (linkHandled.current) return;
    linkHandled.current = true;
    const demo = params.get('demo');
    const sample = params.get('sample');
    const importParam = params.get('import');
    if (demo === 'guided') void startDemo();
    else if (sample === 'ride-share') void importExampleCompose();
    else if (sample === 'commerce' || sample === 'food') { setSampleChoice(sample); resetWorkspace(`${sample === 'food' ? 'Food Delivery' : 'Commerce Platform'} sample loaded.`, sample); }
    else if (importParam === 'compose') setShowImport(true);
    // Wispr Flow types into the focused field, so the instruction box has focus on arrival.
    if (demo !== 'guided' && importParam !== 'compose') document.getElementById('architecture-command')?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="va-app va-shell" data-drawer={drawerOpen ? 'open' : undefined} style={cssVars({ '--va-coach-h': `${coachHeight}px` })}>
      <TopBar
        project={project}
        currentBranchId={currentBranchId}
        currentBranch={currentBranch}
        openDecisionCount={openDecisionCount}
        onOpenDoc={(id) => openDrawer(id as DrawerTab)}
        isImported={isImported}
        sampleChoice={sampleChoice}
        onSampleChoice={setSampleChoice}
        onResetWorkspace={resetWorkspace}
        onLoadSample={loadSample}
        onImportExample={importExampleCompose}
        onChooseCompose={() => composeInputRef.current?.click()}
        onChooseDrift={() => driftInputRef.current?.click()}
        onCheckExampleDrift={checkExampleDrift}
        exportOpen={exportOpen}
        setExportOpen={setExportOpen}
        exportMenuRef={exportMenuRef}
        exportAll={exportAll}
        exportDiagram={exportDiagram}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        advancedTools={advancedTools}
        setAdvancedTools={setAdvancedTools}
        onReset={reset}
        onExportDevOps={exportDevOps}
        composeFileName={composeSource?.fileName}
        onExportCompose={composeSource ? () => { void openComposeExport(); } : undefined}
        theme={theme}
        onToggleTheme={toggleTheme}
        onShowShortcuts={() => setIsShortcutsOpen(true)}
      />
      <input ref={composeInputRef} type="file" accept=".yml,.yaml" hidden aria-label="docker-compose file" onChange={onComposeFile} />
      <input ref={driftInputRef} type="file" accept=".yml,.yaml" hidden aria-label="docker-compose file to check against" onChange={onDriftFile} />

      <main className="va-shell-body" id="main">
        {/* The command bar floats at the bottom of the screen, with the guided demo's card above it. */}
        <div className="va-dock">
          {(guidedStep > 0 || offerShown) && (
            <div className="va-dock-cards" ref={coachRef}>
              {guidedStep > 0 && (
                <div className="va-coach">
                  <GuidedDemo
                    step={guidedStep}
                    onExit={() => setGuidedStep(0)}
                    onTypeIt={typeGuidedStep}
                    onRunCodeCheck={checkExampleDrift}
                  />
                </div>
              )}
              {offerShown && composeSource && (
                <div className="va-compose-offer">
                  <span role="status">This change can go into your {composeSource.fileName}.</span>
                  <button type="button" className="va-btn va-btn-primary va-btn-sm" onClick={() => { void openComposeExport(); }}>
                    <Download size={14} aria-hidden="true" /> Download updated compose file
                  </button>
                  <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={() => setComposeOfferFor(null)} aria-label="Dismiss the compose file offer">
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
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
              document.getElementById('architecture-command')?.focus();
            }}
            onPreview={runInstruction}
            isLive={isLive}
            isInterpreting={isInterpreting}
            aiStatus={aiStatus}
            answerSource={answerSource}
            fallbackReason={fallbackReason}
            preview={preview}
            onImportNotes={() => { setNotesLoaded(true); setNotesImport({ returned: null }); }}
            onCopyDictionary={copyDictionaryWords}
            micSupported={micSupported}
            isListening={isListening}
            onToggleMic={toggleDictation}
            sampleChoice={sampleChoice}
            isImported={isImported}
          />
        </div>

        <section className="va-canvas-area" aria-label="Architecture diagram">
          <span
            className="va-sync va-sr-only"
            data-unresolved={Boolean(project && syncStatus.includes('unresolved'))}
            role="status"
            aria-live="polite"
          >
            {syncStatus}
          </span>
          {showHistory && (
            <div className="va-history-panel">
              <Suspense fallback={null}>
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
              </Suspense>
            </div>
          )}
          {project ? (
            <DiagramView
              project={project}
              advancedTools={advancedTools}
              setAdvancedTools={setAdvancedTools}
              onLoadSample={loadSample}
              inspectorSlot={inspectorSlot}
              onSelect={onSelectComponent}
              onOpenDocs={() => openDrawer('impact')}
            />
          ) : (
            <EmptyState
              onStartDemo={startDemo}
              onLoadSample={loadSample}
              onChooseCompose={() => composeInputRef.current?.click()}
              onComposeText={importComposeText}
            />
          )}
          {showImport && (
            <EmptyState
              asDialog
              onClose={() => setShowImport(false)}
              onStartDemo={() => { setShowImport(false); void startDemo(); }}
              onLoadSample={() => { setShowImport(false); loadSample(); }}
              onChooseCompose={() => { setShowImport(false); composeInputRef.current?.click(); }}
              onComposeText={(text, name) => { setShowImport(false); return importComposeText(text, name); }}
            />
          )}
        </section>

        <Drawer
          open={drawerOpen}
          overlay={compact}
          tab={drawerTab}
          onTab={(tab) => { sound.tab(); setDrawerTab(tab); }}
          onClose={() => setDrawerOpen(false)}
          project={project}
          openDecisionCount={openDecisionCount}
          notify={notify}
          onResolve={reviewResolution}
          inspectorSlot={inspectorSlot}
          hasSelection={hasSelection}
        />
      </main>

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
        <Suspense fallback={null}>
          <ScenarioComparisonModal
            comparison={scenarioComparison}
            onClose={() => setShowComparisonModal(false)}
            onSelectBranch={handleSwitchBranch}
          />
        </Suspense>
      )}

      {showMergeModal && (
        <Suspense fallback={null}>
          <MergeConflictModal
            sourceBranchName={(mergingBranchId && branches[mergingBranchId]?.name) || mergingBranchId || ''}
            targetBranchName={branches.main?.name ?? 'Main Branch'}
            conflicts={mergeConflicts}
            onClose={() => setShowMergeModal(false)}
            onConfirmMerge={handleConfirmMerge}
          />
        </Suspense>
      )}

      {toast && (
        <div className="va-toast" key={toast.key} role="status" aria-live="polite">
          <Activity size={15} />
          <span>{toast.message}</span>
        </div>
      )}
      {notesLoaded && (
        <Suspense fallback={null}>
          <WisprImportDialog
            isOpen={Boolean(notesImport)}
            returned={notesImport?.returned}
            isImported={isImported}
            onClose={() => setNotesImport(null)}
            onPropose={proposeFromNotes}
          />
        </Suspense>
      )}
      {composePatch && (
        <Suspense fallback={null}>
          <ComposeExportDialog patch={composePatch} onClose={() => setComposePatch(null)} onDownload={downloadCompose} />
        </Suspense>
      )}
      {isShortcutsOpen && (
        <Suspense fallback={null}>
          <ShortcutsModal isOpen onClose={() => setIsShortcutsOpen(false)} />
        </Suspense>
      )}
      {isCommandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette isOpen onClose={() => setIsCommandPaletteOpen(false)} commands={paletteCommands} />
        </Suspense>
      )}
      <ConnectionStatus />
    </div>
  );
}