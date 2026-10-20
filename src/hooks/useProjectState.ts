import { useState, useMemo } from 'react';
import { HistoryTimeline } from '../data/historyManager.ts';
import { makeCommerceProject } from '../data/commerce.js';
import { makeFoodDeliveryProject } from '../data/foodDelivery.js';
import type { Project } from '../types/schema.ts';
import { createServerlessBranch, createKubernetesBranch, compareBranches } from '../data/branching.ts';
import { detectMergeConflicts, executeMerge, type MergeConflict } from '../data/semanticMerge.ts';

export interface BranchState {
  id: string;
  name: string;
  description: string;
  project: Project;
  history: HistoryTimeline;
}

interface UseProjectStateReturn {
  project: Project;
  sampleChoice: 'commerce' | 'food';
  setSampleChoice: (_choice: 'commerce' | 'food') => void;
  branches: Record<string, BranchState>;
  currentBranchId: string;
  setCurrentBranchId: (_id: string) => void;
  currentBranch: BranchState;
  branchList: Array<{ id: string; name: string; description: string; version: number }>;
  canUndo: boolean;
  canRedo: boolean;
  setCanUndo: (_v: boolean) => void;
  setCanRedo: (_v: boolean) => void;
  timelineEntries: Array<{ version: number; label: string; patchCount: number; timestamp: number; changeId: string }>;
  scenarioComparison: ReturnType<typeof compareBranches> | null;
  loadSample: () => void;
  reset: () => void;
  setBranchProject: (_branchId: string, _next: Project) => void;
  syncHistory: (_history: HistoryTimeline) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleJumpToVersion: (_index: number) => void;
  handleSwitchBranch: (_branchId: string) => void;
  createScenarioBranches: () => void;
  handleOpenComparison: () => void;
  handleInitiateMerge: () => void;
  handleConfirmMerge: (_resolutions: Record<string, 'target' | 'source' | 'custom'>) => void;
  showComparisonModal: boolean;
  setShowComparisonModal: (_v: boolean) => void;
  showMergeModal: boolean;
  setShowMergeModal: (_v: boolean) => void;
  mergeConflicts: MergeConflict[];
  setMergeConflicts: (_conflicts: MergeConflict[]) => void;
  mergingBranchId: string | null;
  setMergingBranchId: (_id: string | null) => void;
}

function makeMainBranch(project: Project): BranchState {
  return {
    id: 'main',
    name: 'Main Branch',
    description: `${project.name} primary architecture`,
    project,
    history: new HistoryTimeline(project),
  };
}

export function useProjectState(): UseProjectStateReturn {
  const [sampleChoice, setSampleChoice] = useState<'commerce' | 'food'>('commerce');
  const [project, setProject] = useState<Project>(() => makeCommerceProject());
  const [currentBranchId, setCurrentBranchId] = useState('main');
  const [branches, setBranches] = useState<Record<string, BranchState>>(() => ({
    main: makeMainBranch(makeCommerceProject()),
  }));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([]);
  const [mergingBranchId, setMergingBranchId] = useState<string | null>(null);

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
    const history = branches[currentBranchId]?.history || new HistoryTimeline(project);
    return history.getFullTimeline().map((e) => ({
      version: e.version,
      label: e.label,
      patchCount: e.patchCount,
      timestamp: e.timestamp,
      changeId: e.changeId,
    }));
  }, [branches, currentBranchId, project]);

  function getHistory(branchId = currentBranchId): HistoryTimeline {
    return branches[branchId]?.history || new HistoryTimeline(project);
  }

  function syncHistory(history: HistoryTimeline) {
    setCanUndo(history.canUndo);
    setCanRedo(history.canRedo);
  }

  function setBranchProject(branchId: string, next: Project) {
    setProject(next);
    setBranches((b) => ({ ...b, [branchId]: { ...b[branchId], project: next } }));
  }

  function loadSample() {
    const fresh = sampleChoice === 'food' ? makeFoodDeliveryProject() : makeCommerceProject();
    setProject(fresh);
    setCurrentBranchId('main');
    setBranches({ main: makeMainBranch(fresh) });
    setCanUndo(false);
    setCanRedo(false);
  }

  function reset() {
    const kind = project?.name === 'Food Delivery Platform' ? 'food' : sampleChoice;
    const fresh = kind === 'food' ? makeFoodDeliveryProject() : makeCommerceProject();
    setSampleChoice(kind);
    setProject(fresh);
    setCurrentBranchId('main');
    setBranches({ main: makeMainBranch(fresh) });
    setCanUndo(false);
    setCanRedo(false);
  }

  function handleUndo() {
    const history = getHistory();
    const prev = history.undo();
    if (!prev) return;
    setBranchProject(currentBranchId, prev);
    syncHistory(history);
  }

  function handleRedo() {
    const history = getHistory();
    const next = history.redo();
    if (!next) return;
    setBranchProject(currentBranchId, next);
    syncHistory(history);
  }

  function handleJumpToVersion(index: number) {
    const history = getHistory();
    const target = history.jumpTo(index);
    setBranchProject(currentBranchId, target);
    syncHistory(history);
  }

  function handleSwitchBranch(branchId: string) {
    if (!branches[branchId]) return;
    setCurrentBranchId(branchId);
    setProject(branches[branchId].project);
    syncHistory(branches[branchId].history);
  }

  function createScenarioBranches() {
    const base = branches.main.project;
    const serverless = createServerlessBranch(base);
    const k8s = createKubernetesBranch(base);
    setBranches((b) => ({ ...b, [serverless.id]: serverless, [k8s.id]: k8s }));
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
      }
    } else {
      setMergeConflicts(analysis.conflicts);
      setMergingBranchId(currentBranchId);
      setShowMergeModal(true);
    }
  }

  function handleConfirmMerge(resolutions: Record<string, 'target' | 'source' | 'custom'>) {
    const source = branches[mergingBranchId!];
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
    }
  }

  return {
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
    setCanUndo,
    setCanRedo,
    timelineEntries,
    scenarioComparison,
    loadSample,
    reset,
    setBranchProject,
    syncHistory,
    handleUndo,
    handleRedo,
    handleJumpToVersion,
    handleSwitchBranch,
    createScenarioBranches,
    handleOpenComparison,
    handleInitiateMerge,
    handleConfirmMerge,
    showComparisonModal,
    setShowComparisonModal,
    showMergeModal,
    setShowMergeModal,
    mergeConflicts,
    setMergeConflicts,
    mergingBranchId,
    setMergingBranchId,
  };
}