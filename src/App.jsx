import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, AudioLines, Check, ChevronDown, CircleHelp, ClipboardCheck, ClipboardList,
  FileArchive, FileCode2, GitBranch, Layers, Mic, Network, Play, Redo2, RotateCcw, Server, ShieldAlert, Undo2, X,
} from 'lucide-react';
import ArchitectureDiagram from './components/ArchitectureDiagram.jsx';
import OpenApiPanel from './components/OpenApiPanel.jsx';
import RiskPanel from './components/RiskPanel.jsx';
import TaskPanel from './components/TaskPanel.jsx';
import ChangeImpactPanel from './components/ChangeImpactPanel.jsx';
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
import './app-shell.css';

const tabs = [
  { id: 'diagram', label: 'Diagram', icon: Network },
  { id: 'openapi', label: 'API contract', icon: FileCode2 },
  { id: 'risk', label: 'Risks', icon: ShieldAlert },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'impact', label: 'What changed', icon: Activity },
  { id: 'telemetry', label: 'Telemetry', icon: Layers },
];

function makeMainBranch(project) {
  return {
    id: 'main',
    name: 'Main Branch',
    description: 'Commerce Platform primary architecture',
    project,
    history: new HistoryTimeline(project),
  };
}

function isTypingTarget(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName));
}

export default function App() {
  const [project, setProject] = useState(makeCommerceProject);
  const [command, setCommand] = useState('');
  const [decisionDraft, setDecisionDraft] = useState({ rateLimitThreshold: '', redisFallback: '' });
  const [tab, setTab] = useState('diagram');
  const [proposal, setProposal] = useState(null);
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const [isWisprGuideOpen, setIsWisprGuideOpen] = useState(false);
  const [isDictatingSim, setIsDictatingSim] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [inspectedArtifacts, setInspectedArtifacts] = useState(() => new Set());
  const modalRef = useRef(null);
  const recognitionRef = useRef(null);
  const exportMenuRef = useRef(null);

  // Scenario branching and time travel
  const [historyTimeline] = useState(() => new HistoryTimeline(makeCommerceProject()));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [currentBranchId, setCurrentBranchId] = useState('main');
  const [branches, setBranches] = useState(() => ({ main: makeMainBranch(makeCommerceProject()) }));
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState([]);
  const [mergingBranchId, setMergingBranchId] = useState(null);

  const currentBranch = branches[currentBranchId];

  const branchList = useMemo(() => Object.values(branches).map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    version: b.project.version,
  })), [branches]);

  const scenarioComparison = useMemo(() => {
    if (branches['branch-serverless'] && branches['branch-k8s-postgres']) {
      return compareBranches(branches['branch-serverless'], branches['branch-k8s-postgres']);
    }
    return null;
  }, [branches]);

  const timelineEntries = useMemo(() => {
    const history = branches[currentBranchId]?.history || historyTimeline;
    return history.getFullTimeline().map((e) => ({ version: e.version, label: e.label, patchCount: e.patchCount }));
  }, [branches, currentBranchId, historyTimeline, canUndo, canRedo]);

  function getHistory(branchId = currentBranchId) {
    return branches[branchId]?.history || historyTimeline;
  }

  // Takes the history explicitly so it never reads a stale branch.
  function syncHistory(history) {
    setCanUndo(history.canUndo);
    setCanRedo(history.canRedo);
  }

  function setBranchProject(branchId, next) {
    setProject(next);
    setBranches((b) => ({ ...b, [branchId]: { ...b[branchId], project: next } }));
  }

  function notify(message) {
    setToast(message);
    setToastKey((current) => current + 1);
  }

  // Toasts dismiss themselves.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast, toastKey]);

  function handleUndo() {
    const history = getHistory();
    const prev = history.undo();
    if (!prev) return;
    setBranchProject(currentBranchId, prev);
    syncHistory(history);
    notify('Undone. The model is back at the previous version.');
  }

  function handleRedo() {
    const history = getHistory();
    const next = history.redo();
    if (!next) return;
    setBranchProject(currentBranchId, next);
    syncHistory(history);
    notify('Redone.');
  }

  function handleJumpToVersion(index) {
    const history = getHistory();
    const target = history.jumpTo(index);
    setBranchProject(currentBranchId, target);
    syncHistory(history);
    notify(`Jumped to v${target.version}.`);
  }

  function handleSwitchBranch(branchId) {
    if (!branches[branchId]) return;
    setCurrentBranchId(branchId);
    setProject(branches[branchId].project);
    syncHistory(branches[branchId].history);
    notify(`Switched to ${branches[branchId].name}.`);
  }

  function createScenarioBranches() {
    const base = branches.main.project;
    const serverless = createServerlessBranch(base);
    const k8s = createKubernetesBranch(base);
    setBranches((b) => ({ ...b, [serverless.id]: serverless, [k8s.id]: k8s }));
    notify('Created two alternatives: Serverless and Kubernetes.');
  }

  function handleOpenComparison() {
    if (!branches['branch-serverless'] || !branches['branch-k8s-postgres']) createScenarioBranches();
    setShowComparisonModal(true);
  }

  function handleInitiateMerge() {
    if (currentBranchId === 'main') return;
    const source = branches[currentBranchId];
    const target = branches.main;
    const base = branches.main;
    const analysis = detectMergeConflicts(base.project, target.project, source.project);
    if (analysis.canAutoMerge) {
      const result = executeMerge(base.project, target.project, source.project, {});
      if (result.success && result.mergedProject) {
        const history = branches.main.history;
        history.push(result.mergedProject, `Merged ${source.name}`, result.mergedProject.changes[0]?.id);
        setBranches((b) => ({ ...b, main: { ...b.main, project: result.mergedProject, history } }));
        setCurrentBranchId('main');
        setProject(result.mergedProject);
        syncHistory(history);
        notify(`Merged "${source.name}" into Main with no conflicts.`);
      }
    } else {
      setMergeConflicts(analysis.conflicts);
      setMergingBranchId(currentBranchId);
      setShowMergeModal(true);
    }
  }

  function handleConfirmMerge(resolutions) {
    const source = branches[mergingBranchId];
    const target = branches.main;
    const result = executeMerge(target.project, target.project, source.project, resolutions);
    if (result.success && result.mergedProject) {
      const history = branches.main.history;
      history.push(result.mergedProject, `Merged ${source.name} (resolved conflicts)`, result.mergedProject.changes[0]?.id);
      setBranches((b) => ({ ...b, main: { ...b.main, project: result.mergedProject, history } }));
      setCurrentBranchId('main');
      setProject(result.mergedProject);
      setShowMergeModal(false);
      setMergeConflicts([]);
      setMergingBranchId(null);
      syncHistory(history);
      notify('Merged with your conflict choices applied.');
    } else {
      notify(`Merge failed: ${result.error || 'unknown error'}.`);
    }
  }

  // Ctrl/Cmd+Z and Ctrl/Cmd+Y undo the model, but never while typing,
  // so the textarea keeps its own text undo.
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
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

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
  }, [exportOpen]);

  const preview = useMemo(() => (command.trim() ? proposeChange(command.trim()) : null), [command]);
  const activeTab = tabs.find((item) => item.id === tab) || tabs[0];

  // Focus trap and Escape for the review dialog
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
      const focusable = [...(modalRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || [])];
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

  // Browser speech recognition (optional extra; Wispr Flow works in the textarea regardless)
  useEffect(() => {
    const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRec) return;
    try {
      const recog = new SpeechRec();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'en-US';
      recog.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i += 1) transcript += event.results[i][0].transcript;
        if (transcript.trim()) setCommand(transcript);
      };
      recog.onerror = (event) => {
        setIsListening(false);
        if (event?.error === 'not-allowed') notify('Microphone access is blocked. Allow it in your browser, or dictate with Wispr Flow.');
      };
      recog.onend = () => setIsListening(false);
      recognitionRef.current = recog;
    } catch {
      recognitionRef.current = null;
    }
  }, []);

  function handleTabChange(id) {
    sound.tab();
    setTab(id);
    if (project?.changed && ['diagram', 'openapi', 'risk', 'tasks'].includes(id)) {
      setInspectedArtifacts((current) => new Set(current).add(id));
    }
  }

  function resetWorkspace(message) {
    sound.click();
    const fresh = makeCommerceProject();
    setProject(fresh);
    setCommand('');
    setDecisionDraft({ rateLimitThreshold: '', redisFallback: '' });
    setProposal(null);
    setTab('diagram');
    setCurrentBranchId('main');
    setBranches({ main: makeMainBranch(fresh) });
    setCanUndo(false);
    setCanRedo(false);
    setInspectedArtifacts(new Set());
    notify(message);
  }

  const loadSample = () => resetWorkspace('Commerce Platform sample loaded.');
  const reset = () => resetWorkspace('Workspace reset to the Commerce Platform baseline.');

  function showProposal() {
    sound.click();
    if (!project) {
      notify('Load the Commerce Platform sample first.');
      return;
    }
    if (!command.trim()) {
      notify('Describe or dictate a change first.');
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
    const nextProject = applyChange(project, proposal, decisionDraft);
    const history = getHistory();
    history.push(nextProject, proposal.text, nextProject.changes[0]?.id);
    setBranchProject(currentBranchId, nextProject);
    setProposal(null);
    setTab('impact');
    setInspectedArtifacts(new Set());
    syncHistory(history);
    const recordedDecisionCount = Number(Boolean(decisionDraft.rateLimitThreshold.trim()))
      + Number(Boolean(decisionDraft.redisFallback.trim()));
    notify(recordedDecisionCount
      ? `Change applied with ${recordedDecisionCount} recorded decision${recordedDecisionCount === 1 ? '' : 's'}. Implementation is still proposed.`
      : 'Change applied. Any unanswered decisions remain open in every view.');
  }

  function downloadBundle(factory, suffix, label) {
    if (!project) {
      notify('Load a project before exporting.');
      return;
    }
    sound.export();
    setExportOpen(false);
    try {
      const { data, files } = factory(project);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      anchor.href = url;
      anchor.download = `${slug}${suffix}-v${project.version}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      notify(`${label} downloaded (${files.length} files).`);
    } catch (error) {
      notify(`Export failed: ${error instanceof Error ? error.message : 'could not create the ZIP.'}`);
    }
  }

  const exportAll = () => downloadBundle(createVerifiedExportZip, '', 'Engineering artifacts');
  const exportDevOps = () => downloadBundle(createVerifiedDevOpsZip, '-devops', 'DevOps bundle');

  function toggleLiveVoice() {
    const recog = recognitionRef.current;
    if (!recog) {
      notify('This browser has no built-in dictation. Click the text box and use your Wispr Flow shortcut, or play the demo.');
      return;
    }
    if (isListening) {
      recog.stop();
      setIsListening(false);
      sound.click();
      return;
    }
    try {
      recog.start();
      setIsListening(true);
      sound.apply();
    } catch {
      setIsListening(false);
      notify('Could not start the microphone. Try again, or dictate with Wispr Flow.');
    }
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
      if (i >= DEMO_COMMAND.length) {
        setCommand(DEMO_COMMAND);
        clearInterval(timer);
        setIsDictatingSim(false);
        notify('Demo dictation finished. Review it, then preview the change.');
      } else {
        setCommand(DEMO_COMMAND.slice(0, i));
      }
    }, 18);
  }

  function startDemo() {
    resetWorkspace('Commerce Platform demo is ready.');
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(playDemoDictation, 450);
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
    if (tab === 'diagram') return <ArchitectureDiagram project={project} />;
    if (tab === 'openapi') return <OpenApiPanel project={project} onNotify={notify} />;
    if (tab === 'risk') return <RiskPanel project={project} />;
    if (tab === 'tasks') return <TaskPanel project={project} />;
    if (tab === 'impact') return <ChangeImpactPanel project={project} />;
    return <SystemTelemetryPanel project={project} />;
  }

  const rateLimitRequirement = project?.requirements.find((item) => /rate.?limit/i.test(item.text));
  const redisResilienceRequirement = project?.requirements.find((item) => /redis/i.test(item.text) && /(unavailable|resilien|fallback)/i.test(item.text));
  const openDecisionCount = project
    ? Number(!rateLimitRequirement || /threshold unresolved/i.test(rateLimitRequirement.text))
      + Number(!redisResilienceRequirement || /fallback unresolved/i.test(redisResilienceRequirement.text))
    : 0;

  const syncStatus = getProjectSyncStatus(project);
  const isLive = isListening || isDictatingSim;
  const instructionReady = Boolean(command.trim()) && !isDictatingSim && !isListening;
  const journeyOutputs = [
    { id: 'diagram', label: 'Diagram' },
    { id: 'openapi', label: 'API contract' },
    { id: 'risk', label: 'Risks' },
    { id: 'tasks', label: 'Tasks' },
  ];
  const inspectedCount = journeyOutputs.filter((item) => inspectedArtifacts.has(item.id)).length;
  const journeySteps = [
    { title: 'Start with the sample', complete: Boolean(project) },
    { title: 'Enter or dictate a change', complete: instructionReady },
    { title: 'Preview the proposal', complete: Boolean(proposal || project?.changed) },
    { title: 'Review open decisions', complete: Boolean(project?.changed) },
    { title: 'Apply the change', complete: Boolean(project?.changed) },
    { title: 'Explore the updated outputs', complete: Boolean(project?.changed) && inspectedCount === journeyOutputs.length },
  ];
  const currentJourneyStep = !project
    ? 0
    : !instructionReady
      ? 1
      : !proposal && !project.changed
        ? 2
        : proposal
          ? 3
          : inspectedCount < journeyOutputs.length
            ? 5
            : journeySteps.length;
  const journeyGuidance = !project
    ? 'Start by loading the Commerce Platform sample.'
    : !instructionReady
      ? isDictatingSim
        ? 'The sample instruction is being entered. It will be ready to preview in a moment.'
        : isListening
          ? 'Listening now. Finish speaking, then preview the instruction when it is ready.'
          : 'The sample is ready. Type a change below, use Wispr Flow in the text box, or play the sample dictation.'
      : !proposal && !project.changed
        ? 'Your instruction is ready. Preview it to see what the prototype understood before anything changes.'
        : proposal
          ? 'Review the proposed changes and the decisions that still need your team. Nothing changes until you apply it.'
          : inspectedCount < journeyOutputs.length
            ? `Your change is applied. Explore each output below (${inspectedCount} of ${journeyOutputs.length} viewed).`
            : 'Walkthrough complete. You have reviewed every updated output.';
  const proposalHasRateLimit = Boolean(proposal?.items.some((item) => item.key === 'rate-limit'));
  const proposalHasRedisFallback = Boolean(proposal?.items.some((item) => item.key === 'redis-fallback'));
  const proposalCaveats = proposal?.assumptions.filter((item) => /does not mean/i.test(item)) || [];
  const unresolvedProposalAssumptions = proposal?.assumptions.filter((item) => {
    if (/does not mean/i.test(item)) return false;
    if (/rate-limit threshold/i.test(item) && decisionDraft.rateLimitThreshold.trim()) return false;
    if (/redis outage fallback/i.test(item) && decisionDraft.redisFallback.trim()) return false;
    return true;
  }) || [];

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
          <button type="button" className="va-btn va-btn-ghost va-btn-collapse" onClick={() => setIsWisprGuideOpen(true)}>
            <CircleHelp size={16} /> <span className="va-btn-label">Dictation guide</span>
          </button>
          <button type="button" className="va-btn va-btn-ghost va-btn-collapse" onClick={reset}>
            <RotateCcw size={15} /> <span className="va-btn-label">Reset sample</span>
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
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="va-hero" id="top" aria-labelledby="va-hero-title">
        <div className="va-hero-copy">
          <h1 id="va-hero-title">Say the architecture change out loud. See what it affects.</h1>
          <p>
            VoiceArchitect turns a spoken instruction into a reviewable change, then updates the diagram,
            API contract, risks, and engineering tasks together.
          </p>
          <div className="va-hero-actions">
            <button type="button" className="va-btn va-btn-primary va-btn-lg" onClick={startDemo}>
              <Play size={15} /> Start guided demo
            </button>
            <a className="va-btn va-btn-lg" href="#workspace">Open the workspace <ArrowRight size={15} /></a>
          </div>
        </div>
        <figure className="va-hero-card">
          <figcaption>You say</figcaption>
          <blockquote>{DEMO_COMMAND}</blockquote>
          <div className="va-hero-results">
            <span>You get</span>
            <ul>
              <li><Network size={15} /> An updated architecture diagram</li>
              <li><FileCode2 size={15} /> A revised API contract</li>
              <li><ShieldAlert size={15} /> Risks found in the new design</li>
              <li><ClipboardList size={15} /> Tasks your team can pick up</li>
            </ul>
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
              <p>Dictate with Wispr Flow into the instruction box, or type it. Plain language is enough.</p>
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
          <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={loadSample}>
            <RotateCcw size={14} /> Reload sample
          </button>
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
              onClick={toggleLiveVoice}
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
              <span>Type here, or hold your Wispr Flow shortcut to dictate.</span>
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
              disabled={!project || !command.trim()}
              onClick={showProposal}
            >
              <ClipboardCheck size={16} /> Preview my change
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
        <span>Wispr Flow types into the instruction box; there is no direct Wispr API connection.</span>
      </footer>

      <WisprFlowModal
        isOpen={isWisprGuideOpen}
        onClose={() => setIsWisprGuideOpen(false)}
        onSimulateVoice={playDemoDictation}
      />

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
                <b>Important:</b> Recording a decision documents your team’s intent; it does not implement or verify the behavior.
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
        <div className="va-toast" key={toastKey} role="status" aria-live="polite">
          <Activity size={15} />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
