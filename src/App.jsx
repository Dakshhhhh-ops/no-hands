import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import {
  Activity, ArrowRight, AudioLines, Check, ChevronDown, ClipboardCheck, ClipboardList, FileArchive,
  FileCode2, GitBranch, Layers, Mic, Network, Play, Redo2, RotateCcw, Server, ShieldAlert, Undo2, X,
  Sun, Moon, Keyboard, HelpCircle,
} from 'lucide-react';
import CommandPresets from './components/CommandPresets.jsx';
import ScenarioBranchingBar from './components/ScenarioBranchingBar.jsx';
import ScenarioComparisonModal from './components/ScenarioComparisonModal.jsx';
import MergeConflictModal from './components/MergeConflictModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import ShortcutsModal from './components/ShortcutsModal.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import ConnectionStatus from './components/ConnectionStatus.jsx';
import ParticleBackground from './components/ParticleBackground.jsx';
import { DiagramSkeleton, TableSkeleton, ListSkeleton } from './components/Skeleton.jsx';
import { countOpenDecisions, getProjectSyncStatus } from './data/analysis.js';
import { sound } from './utils/sound.js';
import { useProjectState } from './hooks/useProjectState.ts';
import { useDictation } from './hooks/useDictation.ts';
import { useJourney } from './hooks/useJourney.ts';
import { useExport } from './hooks/useExport.ts';
import { useProposalReview } from './hooks/useProposalReview.ts';
import { providerLabel } from './data/aiClient.ts';
import { useToast } from './hooks/useToast.ts';
import useLocalStorage from './hooks/useLocalStorage.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useRevealOnScroll, useScrollProgress } from './hooks/useMotion.ts';
import HeroStack3D from './components/HeroStack3D.jsx';
import TiltCard from './components/TiltCard.jsx';
import VoiceField from './components/landing/VoiceField.jsx';
import StoryScroll from './components/landing/StoryScroll.jsx';
import { CustomCursor, Magnetic, SplitWords } from './components/landing/Interactions.jsx';
import { HeroFragments, SelectionFrame, CodeLine } from './components/landing/HeroCanvas.jsx';
import { SectionLabel, RedlineStatement } from './components/landing/Editorial.jsx';
import { useScrollSpy } from './hooks/useScrollSpy.ts';
import { isDialogOpen } from './hooks/useDialog.ts';
import { isAutomated, useSmoothScroll } from './hooks/useSmoothScroll.ts';
import { parseFollowUp } from './data/reviewCommands.ts';
import { dictionaryWords } from './data/dictation.ts';

const NAV_SECTIONS = ['top', 'how', 'workspace', 'capabilities'];
import './app-shell.css';

const ArchitectureDiagram = lazy(() => import('./components/ArchitectureDiagram.jsx'));
const OpenApiPanel = lazy(() => import('./components/OpenApiPanel.jsx'));
const RiskPanel = lazy(() => import('./components/RiskPanel.jsx'));
const TaskPanel = lazy(() => import('./components/TaskPanel.jsx'));
const ChangeImpactPanel = lazy(() => import('./components/ChangeImpactPanel.jsx'));
const TopologyPanel = lazy(() => import('./components/TopologyPanel.jsx'));

const tabs = [
  { id: 'diagram', label: 'Diagram', icon: Network },
  { id: 'openapi', label: 'API contract', icon: FileCode2 },
  { id: 'risk', label: 'Risks', icon: ShieldAlert },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'impact', label: 'What changed', icon: Activity },
];
// Opened from the Advanced menu; it appears in the tab row only while it is open.
const TOPOLOGY_TAB = { id: 'topology', label: 'Topology', icon: Layers };

// The guided demo on the example ride-share stack. Each step works without a model key.
const GUIDED_STEPS = [
  { language: 'English', say: 'Add a Redis cache in front of the trips API', changes: 'trips-api gets a connection to Redis. You see the exact diff before anything applies.' },
  { language: 'Hinglish', say: 'payment service ko alag container mein daalo', changes: 'A new Payment Service appears behind the gateway, drawn dashed because it is planned and not in code yet.' },
  { drift: true, say: 'Check the diagram against the next docker-compose file', changes: 'The newer file adds two services, retires one, and upgrades PostgreSQL. Your planned Payment Service is kept, not deleted.' },
];

function describeProposalValue(value) {
  if (!value) return 'No existing value';
  if (value.name && value.type) return `${value.type}: ${value.name}${value.sub ? ` — ${value.sub}` : ''}`;
  if (value.from && value.to) return `${value.from} → ${value.to}${value.label ? ` · ${value.label}` : ''}`;
  if (value.method && value.path) return `${value.method.toUpperCase()} ${value.path} · responses ${Object.keys(value.responses || {}).join(', ') || 'none'}`;
  if (value.kind && value.title) return `${value.kind}: ${value.description || value.title}`;
  if (value.acceptance) return `${value.title} · ${value.priority} priority`;
  if (value.id && value.text) return `${value.id}: ${value.text}`;
  return value.title || JSON.stringify(value);
}

function isTypingTarget(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName));
}

function PanelWrapper({ children, fallback }) {
  return (
    <ErrorBoundary fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}

export default function App() {
  const [tab, setTab] = useState('diagram');
  const [showHistory, setShowHistory] = useState(false);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const sourceMenuRef = useRef(null);
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const advancedMenuRef = useRef(null);
  const [advancedTools, setAdvancedTools] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);
  const guidedBaseline = useRef(0);
  useEffect(() => {
    if (!showAdvancedMenu) return undefined;
    const onPointer = (event) => {
      if (!advancedMenuRef.current?.contains(event.target)) setShowAdvancedMenu(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setShowAdvancedMenu(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showAdvancedMenu]);
  useEffect(() => {
    if (!showSourceMenu) return undefined;
    const onPointer = (event) => {
      if (!sourceMenuRef.current?.contains(event.target)) setShowSourceMenu(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setShowSourceMenu(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showSourceMenu]);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const composeInputRef = useRef(null);
  const driftInputRef = useRef(null);

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
    _syncHistory: _unusedSyncHistory,
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
    _setMergeConflicts,
    mergingBranchId,
    _setMergingBranchId,
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
  const heroInputRef = useRef(null);
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
  useScrollProgress();
  useSmoothScroll();
  const activeSection = useScrollSpy(NAV_SECTIONS);

  const proposalHooks = useProposalReview(project, sampleChoice, notify, { command, setCommand });
  const {
    proposal,
    setProposal,
    preview,
    proposedProject,
    _proposedDiff,
    proposedDiffGroups,
    modalRef,
    showProposal,
    _confirmChange: _proposalConfirmChange,
    playDemoDictation,
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
  } = proposalHooks;

  const handleTabChange = (id) => {
    sound.tab();
    setTab(id);
    journeyHandleTabChange(id);
  };

  const visibleTabs = tab === TOPOLOGY_TAB.id ? [...tabs, TOPOLOGY_TAB] : tabs;
  const activeTab = visibleTabs.find((item) => item.id === tab) || tabs[0];

  // Tier counts for the 3D model section, computed from the loaded model.
  const layerSummary = useMemo(() => {
    const comps = project?.components || [];
    const count = (types) => comps.filter((c) => types.includes(c.type)).length;
    return [
      { label: 'Clients', count: count(['CLIENT']), tone: 'tone-violet' },
      { label: 'Edge', count: count(['GATEWAY']), tone: 'tone-amber' },
      { label: 'Services', count: count(['SERVICE']), tone: 'tone-indigo' },
      { label: 'Data & events', count: count(['DATABASE', 'CACHE', 'QUEUE', 'EXTERNAL']), tone: 'tone-teal' },
    ];
  }, [project]);

  // Counted from the model's own risk findings, so imported stacks get their own decisions.
  const openDecisionCount = countOpenDecisions(project);

  const syncStatus = getProjectSyncStatus(project);
  const isLive = isListening || isDictatingSim;
  const _instructionReady = Boolean(command.trim()) && !isDictatingSim && !isListening;

  const _inspectedCount = journeyOutputs.filter((item) => inspectedArtifacts.has(item.id)).length;

  // Ctrl/Cmd+Z and Ctrl/Cmd+Y undo the model, but never while typing
  useEffect(() => {
    function onKeyDown(e) {
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

  const resetWorkspace = (message, kind = sampleChoice) => {
    sound.click();
    projectLoadSample(kind);
    clearWorkspaceUi();
    notify(message);
  };

  const loadSample = () => resetWorkspace(`${sampleChoice === 'food' ? 'Food Delivery' : 'Commerce Platform'} sample loaded.`, sampleChoice);
  const importComposeText = async (text, fileName) => {
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

  const onComposeFile = (event) => {
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

  useEffect(() => {
    if (isAutomated() || typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: fine)').matches) return;
    heroInputRef.current?.focus({ preventScroll: true });
  }, []);

  // Fixes chosen in the Risks tab open the same review dialog as any other change.
  const reviewResolution = (resolution) => {
    if (!resolution) return;
    sound.click();
    setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
    setProposal(resolution);
  };

  // Code drift: compare the diagram with a docker-compose file and review the differences.
  const checkDriftText = async (text, fileName) => {
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

  const onDriftFile = (event) => {
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
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' });
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

  const typeGuidedStep = (text) => {
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

  function handleFollowUp(event) {
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

  function content() {
    if (!project) {
      return (
        <div className="va-empty">
          <Network size={28} />
          <b>No model loaded</b>
          <p>Load the Commerce Platform sample to see its diagram, API contract, risks, and tasks.</p>
          <button type="button" className="va-btn va-btn-primary" onClick={loadSample}>
            Load sample <ArrowRight size={15} />
          </button>
        </div>
      );
    }
    if (tab === 'diagram') return <Suspense fallback={<DiagramSkeleton />}><PanelWrapper fallback={<div>Diagram unavailable</div>}><ArchitectureDiagram project={project} toolsOpen={advancedTools} onToolsOpenChange={setAdvancedTools} /></PanelWrapper></Suspense>;
    if (tab === 'openapi') return <Suspense fallback={<TableSkeleton rows={6} columns={4} />}><PanelWrapper fallback={<div>API contract unavailable</div>}><OpenApiPanel project={project} onNotify={notify} /></PanelWrapper></Suspense>;
    if (tab === 'risk') return <Suspense fallback={<TableSkeleton rows={5} columns={5} />}><PanelWrapper fallback={<div>Risks unavailable</div>}><RiskPanel project={project} onResolve={reviewResolution} /></PanelWrapper></Suspense>;
    if (tab === 'tasks') return <Suspense fallback={<TableSkeleton rows={5} columns={6} />}><PanelWrapper fallback={<div>Tasks unavailable</div>}><TaskPanel project={project} /></PanelWrapper></Suspense>;
    if (tab === 'impact') return <Suspense fallback={<ListSkeleton items={4} />}><PanelWrapper fallback={<div>Change impact unavailable</div>}><ChangeImpactPanel project={project} /></PanelWrapper></Suspense>;
    return <Suspense fallback={<DiagramSkeleton />}><PanelWrapper fallback={<div>Topology unavailable</div>}><TopologyPanel project={project} /></PanelWrapper></Suspense>;
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
      <header className="va-topbar">
        <a className="va-brand" href="#top" aria-label="VoiceArchitect home">
          <span className="va-brand-mark"><AudioLines size={18} /></span>
          <b>VoiceArchitect</b>
        </a>
        <nav className="va-nav" aria-label="Page sections">
          <a href="#top" aria-current={activeSection === 'top' ? 'true' : undefined}>Overview</a>
          <a href="#how" aria-current={activeSection === 'how' ? 'true' : undefined}>How it works</a>
          <a href="#workspace" aria-current={activeSection === 'workspace' ? 'true' : undefined}>Workspace</a>
          <a href="#capabilities" aria-current={activeSection === 'capabilities' ? 'true' : undefined}>Capabilities</a>
        </nav>
        <div className="va-topbar-actions">
          <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={() => { setIsShortcutsOpen(true); sound.click(); }} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard size={18} />
          </button>
          <button type="button" className="va-btn va-btn-ghost va-btn-collapse" onClick={reset}>
            <RotateCcw size={15} /> <span className="va-btn-label">Reset sample</span>
          </button>
          <button
            type="button"
            className="va-btn va-btn-ghost va-btn-icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="va-menu" ref={exportMenuRef}>
            <button
              type="button"
              className="va-btn va-btn-primary"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((open) => !open)}
            >
              <FileArchive size={15} /> Export <ChevronDown size={14} />
            </button>
            {exportOpen && (
              <div className="va-menu-list" role="menu">
                <button type="button" role="menuitem" className="va-menu-item" onClick={exportAll}>
                  <FileArchive size={16} />
                  <span><b>Engineering artifacts</b><small>Model, diagram, API contract, risks, tasks</small></span>
                </button>
                <button type="button" role="menuitem" className="va-menu-item" onClick={() => exportDiagram('svg')}>
                  <FileCode2 size={16} />
                  <span><b>Architecture SVG</b><small>Current model as a scalable vector diagram</small></span>
                </button>
                <button type="button" role="menuitem" className="va-menu-item" onClick={() => exportDiagram('png')}>
                  <FileCode2 size={16} />
                  <span><b>Architecture PNG</b><small>Current model as a rendered image</small></span>
                </button>
                <button type="button" role="menuitem" className="va-menu-item" onClick={() => exportDiagram('mermaid')}>
                  <FileCode2 size={16} />
                  <span><b>Mermaid source</b><small>Editable architecture flowchart text</small></span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="va-hero va-hero-canvas" id="top" aria-labelledby="va-hero-title" data-cursor-zone>
        <span className="va-canvas-grid" aria-hidden="true" />
        <VoiceField />
        <HeroFragments project={project} />

        <div className="va-canvas-center">
          <SelectionFrame label="h1 · say the change">
            <h1 id="va-hero-title" className="va-display">
              <SplitWords text="Say the change." />
              <SplitWords text="See what it touches." offset={3} className="va-display-serif" />
            </h1>
          </SelectionFrame>
          <p className="va-hero-description" data-reveal style={{ '--d': 4 }}>
            Voice keeps your architecture diagram in sync with your code. Say a change, review the exact diff, then check it
            against your docker-compose file.
          </p>
          <form
            className="va-voicebar"
            data-reveal
            style={{ '--d': 5 }}
            onSubmit={(event) => { event.preventDefault(); runInstruction(); }}
          >
            <label htmlFor="va-hero-command" className="va-sr-only">Describe an architecture change</label>
            <textarea
              id="va-hero-command"
              ref={heroInputRef}
              rows={2}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  runInstruction();
                }
              }}
              placeholder={'Add a Redis cache in front of the catalog service\norder service ko Kafka se connect karo'}
            />
            <div className="va-voicebar-foot">
              <p className="va-voicebar-hint">
                <Mic size={14} aria-hidden="true" /> Hold your Wispr Flow hotkey and speak, in English or Hinglish.
              </p>
              <button type="submit" className="va-btn va-btn-primary" disabled={!command.trim() || isInterpreting}>
                {isInterpreting ? 'Interpreting…' : 'Preview change'} <ArrowRight size={15} />
              </button>
            </div>
          </form>
          <div className="va-hero-secondary" data-reveal style={{ '--d': 6 }}>
            <Magnetic strength={0.2}>
              <button type="button" className="va-link-btn" onClick={startDemo} data-cursor="Play">
                <Play size={13} /> Start guided demo
              </button>
            </Magnetic>
            {micSupported && (
              <button type="button" className="va-link-btn" onClick={toggleDictation} aria-pressed={isListening}>
                <Mic size={13} /> {isListening ? 'Stop browser mic' : 'Browser mic (fallback)'}
              </button>
            )}
            <a className="va-link-btn" href="#workspace">
              Open the workspace <ArrowRight size={13} />
            </a>
          </div>
          <div data-reveal style={{ '--d': 6 }}>
            <CodeLine name="interpreter">
              {aiStatus.ai ? `${providerLabel(aiStatus.provider)} · ${aiStatus.model}` : 'offline rules · add a key for full understanding'}
            </CodeLine>
          </div>
        </div>

        <a className="va-scroll-cue" href="#statement" aria-label="Scroll to the next section">
          <span>Scroll</span><i />
        </a>
      </section>

      <div id="statement">
        <RedlineStatement id="va-statement-title" />
      </div>

      <section className="va-section va-layers" id="layers" aria-labelledby="va-layers-title" data-cursor-zone>
        <div className="va-section-inner">
          <SectionLabel index={1}>Your model</SectionLabel>
          <h2 id="va-layers-title" className="va-section-title" data-reveal style={{ '--d': 1 }}>
            Every layer, <em>in one</em> view
          </h2>
          <div className="va-layers-body">
            <div className="va-layers-stage" data-reveal style={{ '--d': 2 }}>
              <HeroStack3D project={project} />
            </div>
            <ul className="va-layers-legend" data-reveal style={{ '--d': 3 }}>
              {layerSummary.map((row) => (
                <li key={row.label} className={row.tone}>
                  <span className="va-layers-count">{String(row.count).padStart(2, '0')}</span>
                  <span>{row.label}</span>
                </li>
              ))}
              <li className="va-layers-note">Counted live from {project?.name || 'the loaded model'}. Move your pointer to tilt it.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="va-section va-how va-how-v3" id="how" aria-labelledby="va-how-title" data-cursor-zone>
        <div className="va-section-inner">
          <SectionLabel index={2}>How it works</SectionLabel>
          <h2 id="va-how-title" className="va-section-title" data-reveal style={{ '--d': 1 }}>
            From a sentence to a <em>reviewed</em> change
          </h2>
          <StoryScroll />
        </div>
      </section>

      <section className="va-section va-section-work" id="workspace" aria-labelledby="va-work-title">
        <div className="va-section-inner">
          <SectionLabel index={3}>Try it</SectionLabel>
          <h2 id="va-work-title" data-reveal style={{ '--d': 1 }}>Workspace</h2>
          <p className="va-section-lead" data-reveal style={{ '--d': 2 }}>Load a system, describe a change in everyday language, and review exactly what it would affect before anything is applied.</p>
        </div>
      <div className="va-studio">
        <header className="va-studio-head">
          <div className="va-model-title">
            <h2>{project ? project.name : 'System architecture'}</h2>
            {project && (
              <span className="va-version" data-changed={Boolean(project.changed)}>
                v{project.version}{project.changed ? ' · updated' : ' · baseline'}
              </span>
            )}
            {currentBranchId !== 'main' && (
              <span className="va-branch-chip"><GitBranch size={13} /> {currentBranch?.name}</span>
            )}
            {project && (
              <span className="va-stats">
                <span>{project.components.length} components</span>
                {openDecisionCount > 0 && (
                  <button type="button" className="va-stat-warn" onClick={() => handleTabChange('risk')}>
                    {openDecisionCount} open decision{openDecisionCount === 1 ? '' : 's'}
                  </button>
                )}
              </span>
            )}
          </div>

          <div className="va-studio-tools">
            <div className="va-sample-picker">
              <select id="va-sample-choice" aria-label="Sample architecture" value={sampleChoice} onChange={(event) => setSampleChoice(event.target.value)}>
                <option value="commerce">Commerce Platform</option>
                <option value="food">Food Delivery</option>
              </select>
              <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={loadSample}>
                <RotateCcw size={14} /> Load sample
              </button>
            </div>

            <div className="va-pop" ref={sourceMenuRef}>
              <button
                type="button"
                className="va-btn va-btn-ghost va-btn-sm"
                aria-expanded={showSourceMenu}
                aria-controls="va-source-menu"
                onClick={() => setShowSourceMenu((open) => !open)}
              >
                <FileCode2 size={14} /> From code <ChevronDown size={14} />
              </button>
              {showSourceMenu && (
                <div className="va-pop-panel" id="va-source-menu">
                  <button type="button" onClick={() => { setShowSourceMenu(false); composeInputRef.current?.click(); }}>
                    Import docker-compose
                    <small aria-hidden="true">Draw the model from your compose file</small>
                  </button>
                  <button type="button" onClick={() => { setShowSourceMenu(false); importExampleCompose(); }}>
                    Try example stack
                    <small aria-hidden="true">A ride-share stack, imported from compose</small>
                  </button>
                  <hr />
                  <button type="button" disabled={!project} onClick={() => { setShowSourceMenu(false); driftInputRef.current?.click(); }}>
                    Check against code
                    <small aria-hidden="true">Compare the diagram with a newer compose file</small>
                  </button>
                  {project?.name === 'ride-share-platform' && (
                    <button type="button" onClick={() => { setShowSourceMenu(false); checkExampleDrift(); }}>
                      Try example update
                      <small aria-hidden="true">Check this diagram against the next compose version</small>
                    </button>
                  )}
                </div>
              )}
              <input
                ref={driftInputRef}
                type="file"
                accept=".yml,.yaml"
                hidden
                aria-label="docker-compose file to check against"
                onChange={onDriftFile}
              />
              <input
                ref={composeInputRef}
                type="file"
                accept=".yml,.yaml"
                hidden
                aria-label="docker-compose file"
                onChange={onComposeFile}
              />
            </div>

            <span className="va-toolbar-sep" aria-hidden="true" />

            <div className="va-history">
              <div className="va-pop" ref={advancedMenuRef}>
                <button
                  type="button"
                  className="va-btn va-btn-ghost va-btn-sm"
                  aria-expanded={showAdvancedMenu}
                  aria-controls="va-advanced-menu"
                  onClick={() => setShowAdvancedMenu((open) => !open)}
                >
                  <Layers size={14} /> Advanced <ChevronDown size={14} />
                </button>
                {showAdvancedMenu && (
                  <div className="va-pop-panel" id="va-advanced-menu">
                    <button type="button" aria-expanded={showHistory} onClick={() => { setShowAdvancedMenu(false); setShowHistory((open) => !open); }}>
                      Branches and history
                      <small aria-hidden="true">On {currentBranch?.name || 'Main Branch'}. Fork, compare, merge, and go back in time.</small>
                    </button>
                    <button type="button" aria-pressed={advancedTools} onClick={() => { setShowAdvancedMenu(false); setAdvancedTools((open) => !open); if (!advancedTools) handleTabChange('diagram'); }}>
                      {advancedTools ? 'Hide outage simulator and decision records' : 'Outage simulator and decision records'}
                      <small aria-hidden="true">Simulated outages, deployment order, and ADR sign-off on the diagram.</small>
                    </button>
                    <button type="button" onClick={() => { setShowAdvancedMenu(false); handleTabChange(TOPOLOGY_TAB.id); }}>
                      Topology
                      <small aria-hidden="true">Components by type, protocols, and model checks.</small>
                    </button>
                    <hr />
                    <button type="button" disabled={!project} onClick={() => { setShowAdvancedMenu(false); exportDevOps(); }}>
                      DevOps bundle
                      <small aria-hidden="true">Terraform, Kubernetes manifests, TypeScript SDK, OpenAPI 3.1 (ZIP).</small>
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className="va-btn va-btn-ghost va-btn-icon va-btn-sm" onClick={handleUndo} disabled={!canUndo} aria-label="Undo last change" title="Undo (Ctrl+Z)">
                <Undo2 size={15} />
              </button>
              <button type="button" className="va-btn va-btn-ghost va-btn-icon va-btn-sm" onClick={handleRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
                <Redo2 size={15} />
              </button>
            </div>
          </div>
        </header>

        <div className="va-studio-progress">
          <ol className="va-journey-steps" aria-label="Demo walkthrough progress">
            {journeySteps.map((step, index) => {
              const done = step.complete;
              const current = !done && index === currentJourneyStep;
              return (
                <li key={step.title} data-state={done ? 'done' : current ? 'current' : 'upcoming'} title={step.title}>
                  <span className="va-journey-marker" aria-hidden="true">{done ? <Check size={11} /> : index + 1}</span>
                  <span className={current ? 'va-journey-title' : 'va-sr-only'}>{step.title}</span>
                </li>
              );
            })}
          </ol>
          <p className="va-sr-only" aria-live="polite">{journeyGuidance}</p>
          {project?.changed && (
            <div className="va-journey-outputs" aria-label="Updated output review progress">
              <span className="va-journey-outputs-label">Review</span>
              {journeyOutputs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-viewed={inspectedArtifacts.has(item.id)}
                  aria-pressed={tab === item.id}
                  aria-label={`View updated ${item.label}`}
                  onClick={() => handleTabChange(item.id)}
                >
                  {inspectedArtifacts.has(item.id) && <Check size={12} />} {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {guidedStep > 0 && (
          <section className="va-guide" aria-label="Guided demo" aria-live="polite">
            {guidedStep <= GUIDED_STEPS.length ? (() => {
              const step = GUIDED_STEPS[guidedStep - 1];
              return (
                <>
                  <div className="va-guide-head">
                    <span className="va-guide-step">Guided demo · step {guidedStep} of {GUIDED_STEPS.length}</span>
                    <button type="button" className="va-link-btn" onClick={() => setGuidedStep(0)}>Exit demo</button>
                  </div>
                  {step.drift ? (
                    <p className="va-guide-say">The code moved on. {step.say}.</p>
                  ) : (
                    <p className="va-guide-say">
                      <span>Hold your Wispr Flow hotkey and say, in {step.language}:</span>
                      <q>{step.say}</q>
                    </p>
                  )}
                  <p className="va-guide-changes">{step.changes}</p>
                  <div className="va-guide-actions">
                    {step.drift ? (
                      <button type="button" className="va-btn va-btn-primary va-btn-sm" onClick={checkExampleDrift}>Run the code check</button>
                    ) : (
                      <button type="button" className="va-btn va-btn-sm" onClick={() => typeGuidedStep(step.say)}>Type it for me</button>
                    )}
                    <span className="va-guide-note">{step.drift ? 'Review the sync, then apply it.' : 'Then preview, review the diff, and apply.'}</span>
                  </div>
                </>
              );
            })() : (
              <>
                <div className="va-guide-head">
                  <span className="va-guide-step">Guided demo · done</span>
                  <button type="button" className="va-link-btn" onClick={() => setGuidedStep(0)}>Close</button>
                </div>
                <p className="va-guide-say">The diagram changed by voice in English and Hinglish, then caught up with the code.</p>
                <p className="va-guide-changes">Every tab followed: API contract, Risks, Tasks, and What changed. Try your own stack with From code → Import docker-compose.</p>
              </>
            )}
          </section>
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
        <section className="va-composer" aria-labelledby="va-composer-title">
          <div className="va-composer-head">
            <h2 id="va-composer-title">What should change?</h2>
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
                  runInstruction();
                }
              }}
              placeholder="Say it or type it. For example: move session storage to Redis and keep login working if Redis is down."
            />
            <div className="va-field-hint">
              <span
                className="va-engine"
                data-ai={aiStatus.ai}
                title={aiStatus.ai ? 'Every proposal is checked against the schema before you see it.' : 'Add GROQ_API_KEY or ANTHROPIC_API_KEY to .env.local for full understanding.'}
              >
                {aiStatus.ai ? `Interpreted by ${providerLabel(aiStatus.provider)}` : 'Offline rules only'}
              </span>
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
              className="va-btn va-btn-primary"
              disabled={!project || !command.trim() || isInterpreting}
              aria-busy={isInterpreting}
              onClick={runInstruction}
            >
              <ClipboardCheck size={16} /> {isInterpreting ? 'Interpreting…' : 'Preview my change'}
            </button>
            <div className="va-composer-links">
              <button type="button" className="va-link-btn" onClick={playDemoDictation} disabled={isDictatingSim}>
                <Play size={12} /> Play sample instruction
              </button>
              {micSupported && (
                <button type="button" className="va-link-btn" onClick={toggleDictation} aria-pressed={isListening}>
                  <Mic size={12} /> {isListening ? 'Stop browser mic' : 'Browser mic (fallback)'}
                </button>
              )}
              {command && (
                <button
                  type="button"
                  className="va-link-btn"
                  onClick={() => {
                    sound.click();
                    setCommand('');
                    setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
                    setProposal(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
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

          <p className="va-composer-note">Nothing applies until you review it.</p>
          <button type="button" className="va-link-btn va-composer-dict" onClick={copyDictionaryWords} disabled={!project}>
            <ClipboardList size={12} /> Copy this model's names for your Wispr Flow dictionary
          </button>
        </section>

        {/* ---------------- Output ---------------- */}
        <section className="va-output" aria-label="Generated architecture">
          <div className="va-card">
            <div
              className="va-tabs"
              role="tablist"
              aria-label="Architecture outputs"
              onKeyDown={(event) => {
                const current = visibleTabs.findIndex((item) => item.id === tab);
                let _next;
                if (event.key === 'ArrowRight') _next = (current + 1) % visibleTabs.length;
                else if (event.key === 'ArrowLeft') _next = (current - 1 + visibleTabs.length) % visibleTabs.length;
                else if (event.key === 'Home') _next = 0;
                else if (event.key === 'End') _next = visibleTabs.length - 1;
                else return;
                event.preventDefault();
                handleTabChange(visibleTabs[_next].id);
                document.getElementById(`tab-${visibleTabs[_next].id}`)?.focus();
              }}
            >
              {visibleTabs.map(({ id, label, icon: Icon }) => (
                <button
                  id={`tab-${id}`}
                  key={id}
                  type="button"
                  role="tab"
                  className="va-tab"
                  aria-controls="artifact-panel"
                  aria-selected={tab === id}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={(event) => { handleTabChange(id); event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
              <span
                className="va-sync va-sr-only"
                data-unresolved={Boolean(project && syncStatus.includes('unresolved'))}
                role="status"
                aria-live="polite"
              >
                {syncStatus}
              </span>
            </div>

            <div
              className="va-panel-body"
              id="artifact-panel"
              role="tabpanel"
              aria-labelledby={`tab-${activeTab.id}`}
              tabIndex={0}
            >
              {content()}
            </div>
          </div>
        </section>
      </div>
      </div>
      </section>

      <section className="va-section va-caps-section" id="capabilities" aria-labelledby="va-cap-title" data-cursor-zone>
        <div className="va-section-inner">
          <SectionLabel index={4}>Capabilities</SectionLabel>
          <h2 id="va-cap-title" className="va-section-title" data-reveal style={{ '--d': 1 }}>
            Go beyond <em>one</em> change
          </h2>
          <div className="va-bento">
            <TiltCard className="tone-indigo va-bento-tall" data-reveal style={{ '--d': 1 }}>
              <span className="va-cap-icon"><GitBranch size={20} /></span>
              <h3>Try an alternative safely</h3>
              <p>Fork your model into a branch, try changes there, compare the branch with main, then merge what works.</p>
              <div className="va-bento-art va-art-branch" aria-hidden="true"><i /><i /><i /><b /><b /><b /></div>
              <button
                type="button"
                className="va-btn"
                data-cursor="Fork"
                onClick={() => {
                  handleForkBranch();
                  notify('Forked the current model into a new branch. Changes here stay off main until you merge.');
                  document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Fork this version
              </button>
            </TiltCard>
            <TiltCard className="tone-teal" data-reveal style={{ '--d': 2 }}>
              <span className="va-cap-icon"><Undo2 size={20} /></span>
              <h3>Go back in time</h3>
              <p>Undo, redo, or jump to any earlier version of the model without losing your place.</p>
              <div className="va-bento-art va-art-timeline" aria-hidden="true"><i /><i /><i /><i /><i /></div>
              <button type="button" className="va-btn" data-cursor="Open" onClick={() => { setShowHistory(true); document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' }); }}>
                Open history
              </button>
            </TiltCard>
            <TiltCard className="tone-amber" data-reveal style={{ '--d': 3 }}>
              <span className="va-cap-icon"><FileArchive size={20} /></span>
              <h3>Take it with you</h3>
              <p>Export the model, contract, risks, and tasks, or a DevOps bundle with Terraform and Kubernetes scaffolding.</p>
              <div className="va-cap-actions">
                <button type="button" className="va-btn" onClick={exportAll}>Artifacts ZIP</button>
                <button type="button" className="va-btn" onClick={exportDevOps}>DevOps ZIP</button>
              </div>
            </TiltCard>
            <TiltCard className="tone-violet va-bento-wide" data-reveal style={{ '--d': 4 }}>
              <span className="va-cap-icon"><ShieldAlert size={20} /></span>
              <h3>Checked, never guessed</h3>
              <p>
                Every proposal is validated against your model before you see it. Unknown components are skipped and
                explained, open questions stay open, and without an API key the app still runs on built-in rules.
              </p>
            </TiltCard>
          </div>
        </div>
      </section>

      <footer className="va-footer va-footer-v3" data-cursor-zone>
        <div className="va-footer-cta">
          <p className="va-eyebrow">Ready when you are</p>
          <a className="va-footer-link" href="#workspace" data-cursor="Try">
            Try it on your own stack <ArrowRight size={22} />
          </a>
        </div>
        <div className="va-footer-wordmark" aria-hidden="true">
          <span>Voice</span><span className="is-serif">Architect</span>
        </div>
        <div className="va-footer-meta">
          <span className="va-footer-brand"><AudioLines size={14} /> VoiceArchitect</span>
          <span>Architecture docs that stay true to the code. Nothing changes without your review.</span>
        </div>
      </footer>
      <div className="va-scroll-progress" aria-hidden="true" />
      <div className="va-grain" aria-hidden="true" />
      <CustomCursor />

      {/* Review dialog */}
      {proposal && (
        <div
          className="va-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProposal(null);
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
                onClick={() => { sound.click(); setProposal(null); }}
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
                <div className="va-proposal-diff-groups">
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
                        onChange={(event) => setDecisionDraft((current) => ({ ...current, rateLimitThreshold: event.target.value }))}
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
                        onChange={(event) => setDecisionDraft((current) => ({ ...current, redisFallback: event.target.value }))}
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

            <form className="va-followup" onSubmit={handleFollowUp}>
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
              <button type="button" className="va-btn" onClick={() => { sound.click(); setProposal(null); }}>
                Keep editing
              </button>
              <button type="button" className="va-btn va-btn-primary" onClick={confirmChange}>
                Apply change <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </div>
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
          sourceBranchName={branches[mergingBranchId]?.name || mergingBranchId}
          targetBranchName={branches.main.name}
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
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} commands={paletteCommands} />
      <ConnectionStatus />
      <ParticleBackground count={20} opacity={0.08} />
    </main>
  );
}