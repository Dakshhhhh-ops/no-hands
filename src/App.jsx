import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Activity, ArrowRight, AudioLines, Check, CircleHelp, ClipboardCheck, ClipboardList, Code2, Cpu, FileArchive, FileCode2, Layers, LayoutDashboard, Mic, Mic2, Network, Radio, RotateCcw, Server, ShieldAlert, Sparkles, Terminal, X, Zap } from 'lucide-react';
import ArchitectureDiagram from './components/ArchitectureDiagram.jsx';
import OpenApiPanel from './components/OpenApiPanel.jsx';
import RiskPanel from './components/RiskPanel.jsx';
import TaskPanel from './components/TaskPanel.jsx';
import ChangeImpactPanel from './components/ChangeImpactPanel.jsx';
import ArchitectureScene from './components/ArchitectureScene.jsx';
import StudioTelemetryBar from './components/StudioTelemetryBar.jsx';
import WisprFlowModal from './components/WisprFlowModal.jsx';
import CommandPresets from './components/CommandPresets.jsx';
import SystemTelemetryPanel from './components/SystemTelemetryPanel.jsx';
import ScenarioBranchingBar from './components/ScenarioBranchingBar.jsx';
import ScenarioComparisonModal from './components/ScenarioComparisonModal.jsx';
import MergeConflictModal from './components/MergeConflictModal.jsx';
import { applyChange, DEMO_COMMAND, makeCommerceProject, proposeChange } from './data/commerce.js';
import { createVerifiedExportZip, createVerifiedDevOpsZip } from './data/export.js';
import { getProjectSyncStatus } from './data/analysis.js';
import { sound } from './utils/sound.js';
import { HistoryTimeline } from './data/historyManager.ts';
import { createServerlessBranch, createKubernetesBranch, compareBranches } from './data/branching.ts';
import { detectMergeConflicts, executeMerge } from './data/semanticMerge.ts';

const tabs = [
  { id: 'diagram', label: 'Architecture Diagram', icon: Network, code: '01' },
  { id: 'openapi', label: 'OpenAPI Contract', icon: FileCode2, code: '02' },
  { id: 'risk', label: 'Risk & Consistency', icon: ShieldAlert, code: '03' },
  { id: 'tasks', label: 'Engineering Tasks', icon: ClipboardList, code: '04' },
  { id: 'impact', label: 'Change Impact', icon: Activity, code: '05' },
  { id: 'telemetry', label: 'Topology & Specs', icon: Layers, code: '06' },
];

export default function App() {
  const [project, setProject] = useState(makeCommerceProject);
  const [command, setCommand] = useState('');
  const [tab, setTab] = useState('diagram');
  const [proposal, setProposal] = useState(null);
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const [isWisprGuideOpen, setIsWisprGuideOpen] = useState(false);
  const [isDictatingSim, setIsDictatingSim] = useState(false);
  const modalRef = useRef(null);

  // Phase 3: Scenario Branching & Time-Travel State
  const [historyTimeline] = useState(() => new HistoryTimeline(makeCommerceProject()));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [currentBranchId, setCurrentBranchId] = useState('main');
  const [branches, setBranches] = useState(() => {
    const baseProject = makeCommerceProject();
    return {
      main: { id: 'main', name: 'Main Branch', description: 'Commerce Platform primary architecture', project: baseProject, history: new HistoryTimeline(baseProject) },
    };
  });
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState([]);
  const [mergingBranchId, setMergingBranchId] = useState(null);

  // Derive branch list for UI
  const branchList = useMemo(() => Object.values(branches).map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    version: b.project.version,
  })), [branches]);

  // Derive comparison between scenario branches if they exist
  const scenarioComparison = useMemo(() => {
    if (branches['branch-serverless'] && branches['branch-k8s-postgres']) {
      return compareBranches(branches['branch-serverless'], branches['branch-k8s-postgres']);
    }
    return null;
  }, [branches]);

  // Time-travel timeline entries
  const timelineEntries = useMemo(() => {
    const currentHistory = branches[currentBranchId]?.history || historyTimeline;
    return currentHistory.getFullTimeline().map((e) => ({
      version: e.version,
      label: e.label,
      patchCount: e.patchCount,
    }));
  }, [branches, currentBranchId, historyTimeline, canUndo, canRedo]);

  // Sync undo/redo state
  function syncHistoryState() {
    const history = branches[currentBranchId]?.history || historyTimeline;
    setCanUndo(history.canUndo);
    setCanRedo(history.canRedo);
  }

  // Undo handler
  function handleUndo() {
    const history = branches[currentBranchId]?.history || historyTimeline;
    const prev = history.undo();
    if (prev) {
      setProject(prev);
      setBranches((b) => ({ ...b, [currentBranchId]: { ...b[currentBranchId], project: prev } }));
      syncHistoryState();
      notify('Undone. Architecture rolled back to previous version.');
    }
  }

  // Redo handler
  function handleRedo() {
    const history = branches[currentBranchId]?.history || historyTimeline;
    const next = history.redo();
    if (next) {
      setProject(next);
      setBranches((b) => ({ ...b, [currentBranchId]: { ...b[currentBranchId], project: next } }));
      syncHistoryState();
      notify('Redone. Architecture fast-forwarded.');
    }
  }

  // Jump to a specific timeline version
  function handleJumpToVersion(index) {
    const history = branches[currentBranchId]?.history || historyTimeline;
    const target = history.jumpTo(index);
    setProject(target);
    setBranches((b) => ({ ...b, [currentBranchId]: { ...b[currentBranchId], project: target } }));
    syncHistoryState();
    notify(`Time-traveled to v${target.version}.`);
  }

  // Switch between scenario branches
  function handleSwitchBranch(branchId) {
    if (!branches[branchId]) return;
    setCurrentBranchId(branchId);
    setProject(branches[branchId].project);
    syncHistoryState();
    notify(`Switched to branch: ${branches[branchId].name}`);
  }

  // Create scenario branches (Serverless & K8s)
  function createScenarioBranches() {
    const base = branches.main.project;
    const serverless = createServerlessBranch(base);
    const k8s = createKubernetesBranch(base);
    setBranches((b) => ({
      ...b,
      [serverless.id]: serverless,
      [k8s.id]: k8s,
    }));
    notify('Created Scenario A (Serverless) and Scenario B (Kubernetes) branches.');
  }

  // Open comparison modal (create branches if needed)
  function handleOpenComparison() {
    if (!branches['branch-serverless'] || !branches['branch-k8s-postgres']) {
      createScenarioBranches();
    }
    setShowComparisonModal(true);
  }

  // Initiate merge from current branch into main
  function handleInitiateMerge() {
    if (currentBranchId === 'main') return;
    const source = branches[currentBranchId];
    const target = branches.main;
    const base = branches.main; // Common ancestor is main baseline
    const analysis = detectMergeConflicts(base.project, target.project, source.project);
    if (analysis.canAutoMerge) {
      // No conflicts, merge directly
      const result = executeMerge(base.project, target.project, source.project, {});
      if (result.success && result.mergedProject) {
        const newHistory = branches.main.history;
        newHistory.push(result.mergedProject, `Merged ${source.name}`, result.mergedProject.changes[0]?.id);
        setBranches((b) => ({ ...b, main: { ...b.main, project: result.mergedProject, history: newHistory } }));
        setCurrentBranchId('main');
        setProject(result.mergedProject);
        syncHistoryState();
        notify(`Successfully merged "${source.name}" into Main with no conflicts.`);
      }
    } else {
      // Has conflicts — show resolution modal
      setMergeConflicts(analysis.conflicts);
      setMergingBranchId(currentBranchId);
      setShowMergeModal(true);
    }
  }

  // Execute merge with user-chosen conflict resolutions
  function handleConfirmMerge(resolutions) {
    const source = branches[mergingBranchId];
    const target = branches.main;
    const result = executeMerge(target.project, target.project, source.project, resolutions);
    if (result.success && result.mergedProject) {
      const newHistory = branches.main.history;
      newHistory.push(result.mergedProject, `Merged ${source.name} (resolved conflicts)`, result.mergedProject.changes[0]?.id);
      setBranches((b) => ({ ...b, main: { ...b.main, project: result.mergedProject, history: newHistory } }));
      setCurrentBranchId('main');
      setProject(result.mergedProject);
      setShowMergeModal(false);
      setMergeConflicts([]);
      setMergingBranchId(null);
      syncHistoryState();
      notify('3-way merge completed with resolved conflicts.');
    } else {
      notify(`Merge failed: ${result.error || 'Unknown error'}`);
    }
  }

  // Ctrl+Z / Ctrl+Y keyboard shortcut for undo/redo
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const preview = useMemo(() => (command.trim() ? proposeChange(command.trim()) : null), [command]);
  const activeTab = tabs.find((item) => item.id === tab) || tabs[0];

  useEffect(() => {
    if (!proposal) return undefined;
    const previousFocus = document.activeElement;
    modalRef.current?.querySelector('button')?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setProposal(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = [...(modalRef.current?.querySelectorAll('button:not(:disabled)') || [])];
      if (!buttons.length) return;
      const first = buttons[0], last = buttons.at(-1);
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

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (SpeechRec) {
      try {
        const recog = new SpeechRec();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = 'en-US';
        recog.onresult = (event) => {
          let transcript = '';
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript.trim()) setCommand(transcript);
        };
        recog.onerror = () => setIsListening(false);
        recog.onend = () => setIsListening(false);
        recognitionRef.current = recog;
      } catch {}
    }
  }, []);

  function notify(message) {
    setToast(message);
    setToastKey((current) => current + 1);
  }

  function handleTabChange(id) {
    sound.tab();
    setTab(id);
  }

  function loadSample() {
    sound.click();
    const fresh = makeCommerceProject();
    setProject(fresh);
    setCommand('');
    setProposal(null);
    setTab('diagram');
    setCurrentBranchId('main');
    setBranches({ main: { id: 'main', name: 'Main Branch', description: 'Commerce Platform primary architecture', project: fresh, history: new HistoryTimeline(fresh) } });
    setCanUndo(false);
    setCanRedo(false);
    notify('Commerce Platform demo baseline loaded.');
  }

  function reset() {
    sound.click();
    const fresh = makeCommerceProject();
    setProject(fresh);
    setCommand('');
    setProposal(null);
    setTab('diagram');
    setCurrentBranchId('main');
    setBranches({ main: { id: 'main', name: 'Main Branch', description: 'Commerce Platform primary architecture', project: fresh, history: new HistoryTimeline(fresh) } });
    setCanUndo(false);
    setCanRedo(false);
    notify('Workspace reset to Commerce Platform v1 baseline.');
  }

  function showProposal() {
    sound.click();
    if (!project) {
      notify('Load the Commerce Platform sample first.');
      return;
    }
    if (!command.trim()) {
      notify('Enter or dictate an architecture instruction first.');
      return;
    }
    setProposal(proposeChange(command.trim()));
  }

  function confirmChange() {
    if (!project || !proposal) return;
    sound.apply();
    const nextProject = applyChange(project, proposal);
    // Push into history timeline for undo/redo
    const history = branches[currentBranchId]?.history || historyTimeline;
    history.push(nextProject, proposal.text, nextProject.changes[0]?.id);
    setProject(nextProject);
    setBranches((b) => ({ ...b, [currentBranchId]: { ...b[currentBranchId], project: nextProject } }));
    setProposal(null);
    setTab('impact');
    syncHistoryState();
    notify('Reviewed change applied. Synthesizing cross-artifact impact.');
  }

  function exportAll() {
    if (!project) {
      notify('Load a project before exporting its artifacts.');
      return;
    }
    sound.export();
    try {
      const { data, files } = createVerifiedExportZip(project);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v${project.version}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      notify(`Verified ZIP downloaded with ${files.length} current-model engineering files.`);
    } catch (error) {
      notify(`Export failed: ${error instanceof Error ? error.message : 'Could not create the ZIP.'}`);
    }
  }

  function exportDevOps() {
    if (!project) {
      notify('Load a project before exporting DevOps IaC.');
      return;
    }
    sound.export();
    try {
      const { data, files } = createVerifiedDevOpsZip(project);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-devops-v${project.version}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      notify(`DevOps bundle exported with ${files.length} files (Terraform HCL, K8s manifests, SDK, OpenAPI 3.1).`);
    } catch (error) {
      notify(`DevOps export failed: ${error instanceof Error ? error.message : 'Could not create ZIP.'}`);
    }
  }

  function toggleLiveVoice() {
    if (recognitionRef.current) {
      if (isListening) {
        recognitionRef.current.stop();
        setIsListening(false);
        sound.click();
        notify('Voice listening stopped.');
      } else {
        try {
          recognitionRef.current.start();
          setIsListening(true);
          sound.apply();
          notify('Live microphone active: Speak your architecture instruction...');
        } catch {
          setIsListening(false);
          handleSimulateVoice();
        }
      }
    } else {
      handleSimulateVoice();
    }
  }

  function handleSimulateVoice() {
    setIsDictatingSim(true);
    sound.apply();
    if (!project) setProject(makeCommerceProject());
    setCommand('');
    let i = 0;
    const text = DEMO_COMMAND;
    const timer = setInterval(() => {
      i += 3;
      if (i >= text.length) {
        setCommand(text);
        clearInterval(timer);
        setIsDictatingSim(false);
        notify('Wispr Flow dictation simulated. Ready for preview.');
      } else {
        setCommand(text.slice(0, i));
      }
    }, 18);
  }

  function content() {
    if (!project) {
      return (
        <div className="empty-state">
          <div className="empty-mark">
            <Network size={24} />
          </div>
          <b>Architecture workspace initialized</b>
          <p>Load the Commerce Platform sample to inspect the system graph and generate connected engineering artifacts.</p>
          <button className="button primary" onClick={loadSample}>
            Load Sample Platform <ArrowRight size={15} />
          </button>
        </div>
      );
    }
    if (tab === 'diagram') return <ArchitectureDiagram project={project} />;
    if (tab === 'openapi') return <OpenApiPanel project={project} onNotify={notify} />;
    if (tab === 'risk') return <RiskPanel project={project} />;
    if (tab === 'tasks') return <TaskPanel project={project} />;
    if (tab === 'impact') return <ChangeImpactPanel project={project} />;
    return <SystemTelemetryPanel project={project} />;
  }

  const charCount = command.length;
  const tokenEst = Math.ceil(charCount / 4);

  return (
    <main className="shell">
      {/* Studio Global Telemetry Header (Signal-A & Crox inspired) */}
      <StudioTelemetryBar project={project} onOpenWisprGuide={() => setIsWisprGuideOpen(true)} />

      {/* Primary Navigation Bar */}
      <header className="topbar">
        <a className="brand" href="#top" aria-label="VoiceArchitect home">
          <span className="brand-mark">
            <AudioLines size={22} />
          </span>
          <div className="brand-copy">
            <div className="brand-header-line">
              <b>VoiceArchitect</b>
              <span className="brand-version-pill">[STUDIO v2.4]</span>
            </div>
            <small>Voice-First Architecture Synthesis Workspace</small>
          </div>
        </a>

        <div className="top-actions">
          <button
            type="button"
            className="voice-badge-btn"
            onClick={() => {
              sound.click();
              setIsWisprGuideOpen(true);
            }}
          >
            <span className="voice-pulse-dot" />
            <Radio size={13} className="text-cyan animate-pulse" />
            <span>Use with Wispr Flow</span>
          </button>

          <button className="button" onClick={loadSample}>
            <LayoutDashboard size={14} />
            <span className="btn-label">Load Baseline</span>
          </button>

          <button className="button subtle" onClick={reset}>
            <RotateCcw size={13} />
            <span className="btn-label">Reset Demo</span>
          </button>

          <button className="button" onClick={exportDevOps} title="Export Terraform, Kubernetes, SDK, and Multi-Service specs">
            <Server size={14} />
            <span className="btn-label">Export DevOps IaC</span>
          </button>

          <button className="button primary export-button" onClick={exportAll}>
            <FileArchive size={14} />
            <span>Export Verified ZIP</span>
          </button>
        </div>
      </header>

      {/* Hero Section: Architectural Command Deck (Beintech & Signal-A inspired) */}
      <section className="intro" id="top">
        <div className="intro-copy">
          <div className="hero-kicker">
            <span className="eyebrow">[VOICE_SYNTHESIS // DETERMINISTIC_ENGINE]</span>
            <span className="hero-index">SYS_SPEC / CHL-001</span>
          </div>

          <h1 className="hero-heading">
            Speak the change.<br />
            <span className="gradient-text">See every consequence.</span>
          </h1>

          <p className="hero-lead">
            Dictate an architecture modification in natural language with Wispr Flow. Watch the system model,
            interactive diagram, OpenAPI contract, static risk audit, and proposed engineering tickets compile in real time.
          </p>

          <div className="hero-model-cluster">
            <div className="hero-model">
              <span className="project-icon">
                <Code2 size={16} />
              </span>
              <span className="hero-model-name">
                <small>[ACTIVE_SYSTEM]</small>
                <b>{project ? project.name : 'No project loaded'}</b>
              </span>
              <span className="hero-model-divider" />
              <span className="hero-version">
                <i className="hero-version-dot" />
                {project?.changed ? `v${project.version} · change applied` : 'v1.0 · baseline loaded'}
              </span>
            </div>

            <div className="hero-quick-stats hide-on-mobile">
              <span className="stat-pill">
                <b>{project ? project.components.length : 0}</b> nodes
              </span>
              <span className="stat-pill">
                <b>{project ? project.relationships.length : 0}</b> links
              </span>
              <span className="stat-pill">
                <b>{project ? project.requirements.length : 0}</b> reqs
              </span>
            </div>
          </div>

          <div className="hero-steps" aria-label="Workflow: describe, review, apply">
            <div className="hero-step">
              <i>01</i>
              <span>Dictate via Voice</span>
            </div>
            <b className="step-sep">—</b>
            <div className="hero-step">
              <i>02</i>
              <span>Inspect Assumptions</span>
            </div>
            <b className="step-sep">—</b>
            <div className="hero-step">
              <i>03</i>
              <span>Compile Artifacts</span>
            </div>
          </div>
        </div>

        <ArchitectureScene project={project} />
      </section>

      {/* Main Studio Workspace: Command Input & Output Panels */}
      {/* Phase 3: Scenario Branching & Time-Travel Toolbar */}
      <ScenarioBranchingBar
        currentBranchId={currentBranchId}
        branches={branchList}
        onSwitchBranch={handleSwitchBranch}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        timeline={timelineEntries}
        onJumpToVersion={handleJumpToVersion}
        comparison={scenarioComparison}
        onOpenComparison={handleOpenComparison}
        onMergeBranch={currentBranchId !== 'main' ? handleInitiateMerge : undefined}
      />
      <section className="workspace">
        {/* Left Aside: Architecture Command Console */}
        <aside className="command-card">
          <div className="section-head">
            <div>
              <div className="section-head-tag">[01 / INPUT_PORTAL]</div>
              <h2>Architecture Command Console</h2>
              <p>Dictate system revisions via Wispr Flow or choose a prompt</p>
            </div>
            <span className="section-index">READY</span>
          </div>

          <div className="command-body">
            {/* Dictation Banner & Simulation Button */}
            <div className="dictation-hint">
              <div className="mic-icon-wrap">
                <button
                  type="button"
                  className={`mic-icon ${isListening ? 'listening' : isDictatingSim ? 'recording' : ''}`}
                  onClick={toggleLiveVoice}
                  title={isListening ? 'Stop listening' : 'Start live voice recognition'}
                >
                  <Mic2 size={16} />
                </button>
                {(isListening || isDictatingSim) && <span className="mic-wave-pulse" />}
              </div>
              <div className="dictation-text">
                <b>{isListening ? '🎙️ Listening hands-free...' : 'Wispr Flow & Live Voice Ready'}</b>
                <small>
                  {isListening
                    ? 'Speak naturally; transcribing in real time.'
                    : 'Click mic to speak, use Wispr Flow shortcut, or click Simulate.'}
                </small>
              </div>
              <button
                type="button"
                className={`simulate-voice-pill ${isListening ? 'active-pulse' : ''}`}
                onClick={toggleLiveVoice}
                title="Toggle live microphone recognition"
              >
                <Radio size={11} className={isListening || isDictatingSim ? 'animate-spin text-cyan' : ''} />
                <span>{isListening ? 'Stop Mic' : isDictatingSim ? 'Dictating...' : 'Speak / Dictate'}</span>
              </button>
            </div>

            {/* Prompt Library Presets */}
            <CommandPresets onSelectPreset={(p) => setCommand(p)} currentCommand={command} />

            {/* Instruction Textarea */}
            <div className="textarea-container">
              <div className="textarea-header">
                <label htmlFor="architecture-command">
                  [COMMAND_PROMPT // NATURAL_LANGUAGE_INSTRUCTION]
                </label>
                <span className="char-counter">
                  {charCount} chars · ~{tokenEst} tokens · <kbd>Ctrl+Enter</kbd> to preview
                </span>
              </div>
              <textarea
                id="architecture-command"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    showProposal();
                  }
                }}
                placeholder="Example: Move session storage to Redis, preserve PostgreSQL as the source of truth, add login rate limiting, and make login resilient if Redis is unavailable."
              />
            </div>

            {/* Detected Intent Preview Tag */}
            {preview && (
              <div className="intent-preview-tag">
                <div className="intent-head">
                  <span className="intent-title">[STATIC_SYNTHESIS_PREVIEW]</span>
                  <span className="intent-count">{preview.items.length} matched action{preview.items.length === 1 ? '' : 's'}</span>
                </div>
                <div className="intent-chips">
                  {preview.items.map((it) => (
                    <span key={it.key} className="intent-chip">
                      ✓ {it.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="command-actions">
              <button
                className="button subtle"
                onClick={() => {
                  sound.click();
                  setCommand('');
                  setProposal(null);
                }}
              >
                Clear input
              </button>

              <button
                className="button"
                disabled={!project || !command.trim()}
                onClick={showProposal}
              >
                <ClipboardCheck size={14} />
                <span>Preview change</span>
              </button>

              <button
                className="button primary apply-button"
                disabled={!project || !preview}
                onClick={showProposal}
              >
                <span>Review &amp; Apply Change</span>
                <ArrowRight size={15} />
              </button>
            </div>

            {/* System Status Line */}
            <div className="status-line">
              <span className={project ? 'status-dot active' : 'status-dot'} />
              <span>
                {project
                  ? `Commerce Platform · v${project.version} · ${project.requirements.length} confirmed requirements`
                  : 'Awaiting model initialization. Load Commerce Platform sample to begin.'}
              </span>
            </div>
          </div>
        </aside>

        {/* Right Section: Multi-Artifact Output Deck */}
        <section className="output-card">
          {/* Segmented Tab Navigation Bar */}
          <div
            className="tabbar"
            role="tablist"
            aria-label="Architecture outputs"
            onKeyDown={(event) => {
              const current = tabs.findIndex((item) => item.id === tab);
              let next = current;
              if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
              else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault();
              handleTabChange(tabs[next].id);
              document.getElementById(`tab-${tabs[next].id}`)?.focus();
            }}
          >
            {tabs.map(({ id, label, icon: Icon, code }) => (
              <button
                id={`tab-${id}`}
                key={id}
                role="tab"
                aria-controls="artifact-panel"
                tabIndex={tab === id ? 0 : -1}
                aria-selected={tab === id}
                className={`tab ${tab === id ? 'active' : ''}`}
                onClick={() => handleTabChange(id)}
              >
                <span className="tab-code">[{code}]</span>
                <Icon size={14} />
                <span className="tab-label">{label}</span>
              </button>
            ))}

            <span
              className={`sync-state ${
                project && getProjectSyncStatus(project).includes('unresolved') ? 'unresolved' : ''
              }`}
              role="status"
              aria-live="polite"
            >
              <i />
              {getProjectSyncStatus(project)}
            </span>
          </div>

          {/* Output Header */}
          <div className="output-heading">
            <div>
              <span className="eyebrow">[ARTIFACT_OUTPUT // {activeTab.label.toUpperCase()}]</span>
              <h2>{project ? project.name : 'System Architecture'}</h2>
            </div>
            {project && <span className="version-chip">MODEL // v{project.version}</span>}
          </div>

          {/* Active Artifact Panel Content */}
          <div
            className="artifact-content"
            id="artifact-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            tabIndex={0}
          >
            {content()}
          </div>
        </section>
      </section>

      {/* Tactical App Footer */}
      <footer className="app-footer">
        <div className="footer-left">
          <span>
            <Sparkles size={13} className="text-cyan" /> Deterministic Pipeline · Verified In-Memory Commerce Platform
          </span>
          <span className="footer-sep">/</span>
          <span>
            <CircleHelp size={13} /> Wispr Flow dictates directly into input; zero cloud vendor telemetry.
          </span>
        </div>
        <div className="footer-right">
          <span className="text-mono">[VOICEARCHITECT // 2026]</span>
        </div>
      </footer>

      {/* Wispr Flow Guide Modal */}
      <WisprFlowModal
        isOpen={isWisprGuideOpen}
        onClose={() => setIsWisprGuideOpen(false)}
        onSimulateVoice={handleSimulateVoice}
      />

      {/* Review Proposal Modal */}
      {proposal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProposal(null);
          }}
        >
          <section
            className="review-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">[CHANGE_GOVERNANCE // CHG-0002]</span>
                <h2 id="review-title">Proposed Architecture Updates</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  sound.click();
                  setProposal(null);
                }}
                aria-label="Close review"
              >
                <X size={18} />
              </button>
            </div>

            <p className="modal-summary">
              Review how VoiceArchitect deterministically interpreted your instruction. The project state will only
              mutate after you confirm and apply.
            </p>

            <div className="proposal-list">
              {proposal.items.map((item) => (
                <article className="proposal-item" key={item.key}>
                  <span className="proposal-check">
                    <Check size={16} />
                  </span>
                  <div>
                    <b>{item.title}</b>
                    <p>{item.detail}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="assumption-box">
              <div className="assumption-title">
                <b>[UNRESOLVED_ASSUMPTIONS // MANUAL_DECISIONS_REQUIRED]</b>
              </div>
              {proposal.assumptions.map((item) => (
                <span key={item} className="assumption-line">
                  ▸ {item}
                </span>
              ))}
            </div>

            <div className="modal-actions">
              <button
                className="button"
                onClick={() => {
                  sound.click();
                  setProposal(null);
                }}
              >
                Keep editing
              </button>
              <button className="button primary" onClick={confirmChange}>
                <span>Apply Reviewed Change</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Toast Notification */}
      {/* Phase 3: Scenario Comparison Modal */}
      {showComparisonModal && scenarioComparison && (
        <ScenarioComparisonModal
          comparison={scenarioComparison}
          onClose={() => setShowComparisonModal(false)}
          onSelectBranch={handleSwitchBranch}
        />
      )}

      {/* Phase 3: 3-Way Merge Conflict Resolution Modal */}
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
        <div className="toast" key={toastKey}>
          <Activity size={15} className="text-cyan animate-pulse" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
