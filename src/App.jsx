import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import {
  Activity, ArrowRight, AudioLines, Check, ChevronDown, ClipboardCheck, ClipboardList,
  FileArchive, FileCode2, GitBranch, Layers, Mic, Network, Play, Redo2, RotateCcw, Server, ShieldAlert, Undo2, X,
  Sun, Moon, Keyboard, HelpCircle, Target, Zap,
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
import { getProjectSyncStatus } from './data/analysis.js';
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
import { useScrollReveal } from './hooks/useScrollAnimations.ts';
import './app-shell.css';

const ArchitectureDiagram = lazy(() => import('./components/ArchitectureDiagram.jsx'));
const OpenApiPanel = lazy(() => import('./components/OpenApiPanel.jsx'));
const RiskPanel = lazy(() => import('./components/RiskPanel.jsx'));
const TaskPanel = lazy(() => import('./components/TaskPanel.jsx'));
const ChangeImpactPanel = lazy(() => import('./components/ChangeImpactPanel.jsx'));
const SystemTelemetryPanel = lazy(() => import('./components/SystemTelemetryPanel.jsx'));

const tabs = [
  { id: 'diagram', label: 'Diagram', icon: Network },
  { id: 'openapi', label: 'API contract', icon: FileCode2 },
  { id: 'risk', label: 'Risks', icon: ShieldAlert },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'impact', label: 'What changed', icon: Activity },
  { id: 'telemetry', label: 'Telemetry', icon: Layers },
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
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const composeInputRef = useRef(null);

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
    _createScenarioBranches,
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

  const { isListening, _isSupported, _start: _startDictation, _stop: _stopDictation, toggle: toggleDictation } = dictation;

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

  const exportHooks = useExport(project);
  const {
    exportOpen,
    setExportOpen,
    exportAll,
    exportDevOps,
    exportDiagram,
  } = exportHooks;

  const { theme, toggleTheme } = useTheme();

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
    activeDemoCommand,
    proposalHasRateLimit,
    proposalHasRedisFallback,
    proposalCaveats,
    unresolvedProposalAssumptions,
    isDictatingSim,
    setIsDictatingSim,
    aiStatus,
    isInterpreting,
  } = proposalHooks;

  const handleTabChange = (id) => {
    sound.tab();
    setTab(id);
    journeyHandleTabChange(id);
  };

  const activeTab = tabs.find((item) => item.id === tab) || tabs[0];

  const rateLimitRequirement = project?.requirements.find((item) => /rate.?limit/i.test(item.text));
  const redisResilienceRequirement = project?.requirements.find((item) => /redis/i.test(item.text) && /(unavailable|resilien|fallback)/i.test(item.text));
  const openDecisionCount = project
    ? Number(!rateLimitRequirement || /threshold unresolved/i.test(rateLimitRequirement.text))
      + Number(!redisResilienceRequirement || /fallback unresolved/i.test(redisResilienceRequirement.text))
    : 0;

  const syncStatus = getProjectSyncStatus(project);
  const isLive = isListening || isDictatingSim;
  const _instructionReady = Boolean(command.trim()) && !isDictatingSim && !isListening;

  const _inspectedCount = journeyOutputs.filter((item) => inspectedArtifacts.has(item.id)).length;

  // Ctrl/Cmd+Z and Ctrl/Cmd+Y undo the model, but never while typing
  useEffect(() => {
    function onKeyDown(e) {
      if (proposal || isTypingTarget(e.target)) return;
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

  // Close the export menu on outside click or Escape
  useEffect(() => {
    if (!exportOpen) return undefined;
    function onPointer(e) {
      if (!exportMenuRef.current?.contains(e.target)) setExportOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setExportOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportOpen, setExportOpen]);

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

  const startDemo = () => {
    resetWorkspace(`${sampleChoice === 'food' ? 'Food Delivery' : 'Commerce Platform'} demo is ready.`, sampleChoice);
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(playDemoDictation, 450);
  };

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
    if (tab === 'diagram') return <Suspense fallback={<DiagramSkeleton />}><PanelWrapper fallback={<div>Diagram unavailable</div>}><ArchitectureDiagram project={project} /></PanelWrapper></Suspense>;
    if (tab === 'openapi') return <Suspense fallback={<TableSkeleton rows={6} columns={4} />}><PanelWrapper fallback={<div>API contract unavailable</div>}><OpenApiPanel project={project} onNotify={notify} /></PanelWrapper></Suspense>;
    if (tab === 'risk') return <Suspense fallback={<TableSkeleton rows={5} columns={5} />}><PanelWrapper fallback={<div>Risks unavailable</div>}><RiskPanel project={project} /></PanelWrapper></Suspense>;
    if (tab === 'tasks') return <Suspense fallback={<TableSkeleton rows={5} columns={6} />}><PanelWrapper fallback={<div>Tasks unavailable</div>}><TaskPanel project={project} /></PanelWrapper></Suspense>;
    if (tab === 'impact') return <Suspense fallback={<ListSkeleton items={4} />}><PanelWrapper fallback={<div>Change impact unavailable</div>}><ChangeImpactPanel project={project} /></PanelWrapper></Suspense>;
    return <Suspense fallback={<DiagramSkeleton />}><PanelWrapper fallback={<div>Telemetry unavailable</div>}><SystemTelemetryPanel project={project} /></PanelWrapper></Suspense>;
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
    { id: 'tab-telemetry', label: 'Telemetry Tab', description: 'Switch to system telemetry', keys: ['→'], icon: <Layers size={14} />, category: 'navigation', action: () => handleTabChange('telemetry') },
    { id: 'history', label: 'Show History', description: 'Open branches and history panel', keys: [], icon: <GitBranch size={14} />, category: 'view', action: () => setShowHistory(true) },
    { id: 'compare', label: 'Compare Scenarios', description: 'Open scenario comparison modal', keys: [], icon: <GitBranch size={14} />, category: 'view', action: () => { if (scenarioComparison) setShowComparisonModal(true); } },
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
          <a href="#top">Overview</a>
          <a href="#how">How it works</a>
          <a href="#workspace">Workspace</a>
          <a href="#capabilities">Capabilities</a>
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
                <button type="button" role="menuitem" className="va-menu-item" onClick={exportDevOps}>
                  <Server size={16} />
                  <span><b>DevOps bundle</b><small>Terraform, Kubernetes manifests, SDK, OpenAPI 3.1</small></span>
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

      <section className="va-hero" id="top" aria-labelledby="va-hero-title">
        <div className="va-hero-background">
          <div className="va-hero-orb va-hero-orb-1" />
          <div className="va-hero-orb va-hero-orb-2" />
          <div className="va-hero-orb va-hero-orb-3" />
          <div className="va-hero-grid" />
        </div>
        <div className="va-hero-content">
          <div className="va-hero-badge va-float">
            <span className="va-badge-dot va-pulse" />
            <span>VoiceArchitect v2.0</span>
            <kbd className="va-kbd">Ctrl+K</kbd>
          </div>
          <h1 id="va-hero-title">
            Say the architecture change
            <br />
            <span className="va-gradient-text">see what it affects</span>
          </h1>
          <p className="va-hero-description">
            VoiceArchitect turns a spoken instruction into a reviewable change, then updates the diagram,
            API contract, risks, and engineering tasks together.
          </p>
          <div className="va-hero-actions">
            <button type="button" className="va-btn va-btn-primary va-btn-lg va-glow" onClick={startDemo}>
              <Play size={15} /> Start guided demo
            </button>
            <a className="va-btn va-btn-lg va-glass" href="#workspace">
              Open the workspace <ArrowRight size={15} />
            </a>
          </div>
          <div className="va-hero-stats">
            <div className="va-stat va-float">
              <span className="va-stat-value">51</span>
              <span className="va-stat-label">Tests passing</span>
            </div>
            <div className="va-stat va-float" style={{ animationDelay: '0.2s' }}>
              <span className="va-stat-value">92</span>
              <span className="va-stat-label">Total tests</span>
            </div>
            <div className="va-stat va-float" style={{ animationDelay: '0.4s' }}>
              <span className="va-stat-value">0</span>
              <span className="va-stat-label">Lint errors</span>
            </div>
            <div className="va-stat va-float" style={{ animationDelay: '0.6s' }}>
              <span className="va-stat-value">554kB</span>
              <span className="va-stat-label">Bundle size</span>
            </div>
          </div>
        </div>
        <figure className="va-hero-card va-card-3d va-glass-strong">
          <div className="va-hero-card-header">
            <span className="va-card-tag">Live Preview</span>
            <div className="va-card-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
          <figcaption>You say</figcaption>
          <blockquote className="va-hero-command">{activeDemoCommand}</blockquote>
          <div className="va-hero-results">
            <span>You get</span>
            <ul>
              <li><Network size={15} /> An updated architecture diagram</li>
              <li><FileCode2 size={15} /> A revised API contract</li>
              <li><ShieldAlert size={15} /> Risks found in the new design</li>
              <li><ClipboardList size={15} /> Tasks your team can pick up</li>
            </ul>
          </div>
          <div className="va-hero-card-footer">
            <span className="va-footer-item">
              <Target size={12} /> Deterministic
            </span>
            <span className="va-footer-item">
              <Activity size={12} /> Offline-first
            </span>
            <span className="va-footer-item">
              <Zap size={12} /> 60fps
            </span>
          </div>
        </figure>
      </section>

      <section className="va-section" id="how" aria-labelledby="va-how-title">
        <div className="va-section-inner">
          <h2 id="va-how-title">From a sentence to a reviewed change</h2>
          <ol className="va-steps">
            <li>
              <span className="va-step-n">1</span>
              <h3>Say it</h3>
              <p>Describe the change in the instruction box. Plain language is enough.</p>
            </li>
            <li>
              <span className="va-step-n">2</span>
              <h3>Review it</h3>
              <p>See how the change was interpreted and which decisions are still open. Nothing is applied until you confirm.</p>
            </li>
            <li>
              <span className="va-step-n">3</span>
              <h3>See what follows</h3>
              <p>Every view updates from the same model, so the diagram, contract, risks, and tasks never disagree.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="va-section va-section-work" id="workspace" aria-labelledby="va-work-title">
        <div className="va-section-inner">
          <h2 id="va-work-title">Workspace</h2>
          <p className="va-section-lead">Follow the steps below. Use everyday language; the prototype shows what your request would affect.</p>
        </div>
      <section className="va-journey" aria-label="Demo walkthrough progress">
        <div className="va-journey-top">
          <div>
            <span className="va-journey-eyebrow">YOUR WALKTHROUGH</span>
            <p aria-live="polite">{journeyGuidance}</p>
          </div>
          <div className="va-sample-picker">
            <select id="va-sample-choice" aria-label="Sample architecture" value={sampleChoice} onChange={(event) => setSampleChoice(event.target.value)}>
              <option value="commerce">Commerce Platform</option>
              <option value="food">Food Delivery</option>
            </select>
            <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={loadSample}>
              <RotateCcw size={14} /> Load sample
            </button>
            <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={() => composeInputRef.current?.click()}>
              <FileCode2 size={14} /> Import docker-compose
            </button>
            <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={importExampleCompose}>
              Try example stack
            </button>
            <input
              ref={composeInputRef}
              type="file"
              accept=".yml,.yaml"
              hidden
              aria-label="docker-compose file"
              onChange={onComposeFile}
            />
          </div>
        </div>
        <ol className="va-journey-steps">
          {journeySteps.map((step, index) => {
            const done = step.complete;
            const current = !done && index === currentJourneyStep;
            return (
              <li key={step.title} data-state={done ? 'done' : current ? 'current' : 'upcoming'}>
                <span className="va-journey-marker" aria-hidden="true">{done ? <Check size={13} /> : index + 1}</span>
                <span>{step.title}</span>
              </li>
            );
          })}
        </ol>
        {project?.changed && (
          <div className="va-journey-outputs" aria-label="Updated output review progress">
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
      </section>
      <div className="va-layout">
        {/* ---------------- Composer ---------------- */}
        <section className="va-composer" aria-labelledby="va-composer-title">
          <div className="va-composer-head">
            <div>
              <h2 id="va-composer-title">What should change?</h2>
              <p>Use your own words, or start with the sample instruction below. You review it before anything is applied.</p>
            </div>
            <button
              type="button"
              className="va-mic"
              data-live={isLive}
              aria-pressed={isListening}
              aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
              title={isListening ? 'Stop dictation' : 'Start browser dictation'}
              onClick={toggleDictation}
            >
              <Mic size={22} />
            </button>
          </div>

          <div className="va-wave" data-live={isLive} aria-hidden="true">
            {Array.from({ length: 32 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${(i % 8) * 0.09}s` }} />
            ))}
          </div>

          <div className="va-field">
            <label htmlFor="architecture-command">Your instruction</label>
            <textarea
              id="architecture-command"
              value={command}
              onChange={(event) => {
                setCommand(event.target.value);
                setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  showProposal();
                }
              }}
              placeholder="Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down."
            />
            <div className="va-field-hint">
              <span className="va-engine" data-ai={aiStatus.ai}>
                {aiStatus.ai
                  ? `Interpreted by ${providerLabel(aiStatus.provider)}${aiStatus.model ? ` (${aiStatus.model})` : ''}, checked against the schema`
                  : 'Offline rules only. Add GROQ_API_KEY or ANTHROPIC_API_KEY to .env.local for full understanding.'}
              </span>
              <span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to preview</span>
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

          <div>
            <p className="va-prompts-label">Or start from an example</p>
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
          </div>

          <div className="va-composer-actions">
            <button
              type="button"
              className="va-btn va-btn-primary"
              disabled={!project || !command.trim() || isInterpreting}
              aria-busy={isInterpreting}
              onClick={showProposal}
            >
              <ClipboardCheck size={16} /> {isInterpreting ? 'Interpreting…' : 'Preview my change'}
            </button>
            <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={playDemoDictation} disabled={isDictatingSim}>
              <Play size={13} /> Play sample instruction
            </button>
            <button
              type="button"
              className="va-btn va-btn-ghost va-btn-sm"
              onClick={() => {
                sound.click();
                setCommand('');
                setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
                setProposal(null);
              }}
              disabled={!command}
            >
              Clear
            </button>
          </div>
        </section>

        {/* ---------------- Output ---------------- */}
        <section className="va-output" aria-label="Generated architecture">
          <div className="va-modelbar">
            <div className="va-model-title">
              <h2>{project ? project.name : 'System architecture'}</h2>
              {project && (
                <span className="va-version" data-changed={Boolean(project.changed)}>
                  v{project.version}{project.changed ? ' · updated' : ' · baseline'}
                </span>
              )}
            </div>
            {project && (
              <div className="va-stats">
                <span>{project.components.length} components</span>
                {openDecisionCount > 0 && (
                  <button type="button" className="va-stat-warn" onClick={() => handleTabChange('risk')}>
                    {openDecisionCount} open decision{openDecisionCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="va-history">
            <span className="va-branch-chip"><GitBranch size={14} /> {currentBranch?.name || 'Main Branch'}</span>
            <button type="button" className="va-btn va-btn-ghost va-btn-icon va-btn-sm" onClick={handleUndo} disabled={!canUndo} aria-label="Undo last change" title="Undo (Ctrl+Z)">
              <Undo2 size={15} />
            </button>
            <button type="button" className="va-btn va-btn-ghost va-btn-icon va-btn-sm" onClick={handleRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
              <Redo2 size={15} />
            </button>
            <button
              type="button"
              className="va-btn va-btn-ghost va-btn-sm"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((open) => !open)}
            >
              Branches and history <ChevronDown size={14} />
            </button>
          </div>

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
                onMergeBranch={currentBranchId !== 'main' ? handleInitiateMerge : undefined}
              />
            </div>
          )}

          <div className="va-card">
            <div
              className="va-tabs"
              role="tablist"
              aria-label="Architecture outputs"
              onKeyDown={(event) => {
                const current = tabs.findIndex((item) => item.id === tab);
                let _next;
                if (event.key === 'ArrowRight') _next = (current + 1) % tabs.length;
                else if (event.key === 'ArrowLeft') _next = (current - 1 + tabs.length) % tabs.length;
                else if (event.key === 'Home') _next = 0;
                else if (event.key === 'End') _next = tabs.length - 1;
                else return;
                event.preventDefault();
                handleTabChange(tabs[_next].id);
                document.getElementById(`tab-${tabs[_next].id}`)?.focus();
              }}
            >
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  id={`tab-${id}`}
                  key={id}
                  type="button"
                  role="tab"
                  className="va-tab"
                  aria-controls="artifact-panel"
                  aria-selected={tab === id}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => handleTabChange(id)}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
              <span
                className="va-sync"
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
      </section>

      <section className="va-section" id="capabilities" aria-labelledby="va-cap-title">
        <div className="va-section-inner">
          <h2 id="va-cap-title">Go beyond one change</h2>
          <div className="va-caps">
            <article>
              <GitBranch size={20} />
              <h3>Compare two designs</h3>
              <p>Branch the model into a serverless and a Kubernetes version, then compare them side by side.</p>
              <button type="button" className="va-btn" onClick={handleOpenComparison}>Compare scenarios</button>
            </article>
            <article>
              <Undo2 size={20} />
              <h3>Go back in time</h3>
              <p>Undo, redo, or jump to any earlier version of the model without losing your place.</p>
              <button type="button" className="va-btn" onClick={() => { setShowHistory(true); document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' }); }}>
                Open history
              </button>
            </article>
            <article>
              <FileArchive size={20} />
              <h3>Take it with you</h3>
              <p>Export the model, contract, risks, and tasks, or a DevOps bundle with Terraform and Kubernetes manifests.</p>
              <div className="va-cap-actions">
                <button type="button" className="va-btn" onClick={exportAll}>Artifacts ZIP</button>
                <button type="button" className="va-btn" onClick={exportDevOps}>DevOps ZIP</button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <footer className="va-footer">
        <span>Deterministic demo on a synthetic Commerce Platform model.</span>
      </footer>

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