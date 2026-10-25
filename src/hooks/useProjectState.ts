import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HistoryTimeline } from '../data/historyManager.ts';
import { makeCommerceProject } from '../data/commerce.ts';
import { makeFoodDeliveryProject } from '../data/foodDelivery.ts';
import type { ComposeSource, Project } from '../types/schema.ts';
import { forkBranch, compareBranches } from '../data/branching.ts';
import { detectMergeConflicts, executeMerge, type MergeConflict } from '../data/semanticMerge.ts';
import { loadWorkspace, saveWorkspace } from '../data/workspaceStorage.ts';

export interface BranchState {
  id: string;
  name: string;
  description: string;
  /** Where this branch forked from main (or last merged into it); main has none. */
  baseProject?: Project;
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
  currentBranch: BranchState | undefined;
  branchList: Array<{ id: string; name: string; description: string; version: number }>;
  canUndo: boolean;
  canRedo: boolean;
  setCanUndo: (_v: boolean) => void;
  setCanRedo: (_v: boolean) => void;
  timelineEntries: Array<{ version: number; label: string; patchCount: number; timestamp: number; changeId?: string }>;
  scenarioComparison: ReturnType<typeof compareBranches> | null;
  loadSample: (_kind?: 'commerce' | 'food') => void;
  loadProject: (_project: Project, _source?: ComposeSource | null) => void;
  isImported: boolean;
  composeSource: ComposeSource | null;
  setComposeSource: (_source: ComposeSource | null) => void;
  reset: () => void;
  setBranchProject: (_branchId: string, _next: Project) => void;
  syncHistory: (_history: HistoryTimeline) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleJumpToVersion: (_index: number) => void;
  handleSwitchBranch: (_branchId: string) => void;
  handleForkBranch: () => void;
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
  // The workspace saved by the last visit, already checked against its schema; null starts fresh.
  const [saved] = useState(() => loadWorkspace());
  const savedBranch = saved?.branches[saved.currentBranchId];
  const [sampleChoice, setSampleChoice] = useState<'commerce' | 'food'>(saved?.sampleChoice ?? 'commerce');
  const [project, setProject] = useState<Project>(() => savedBranch?.project ?? makeCommerceProject());
  const [currentBranchId, setCurrentBranchId] = useState(saved && savedBranch ? saved.currentBranchId : 'main');
  // An imported project replaces the sample as the baseline that Reset returns to.
  const [importedProject, setImportedProject] = useState<Project | null>(saved?.importedProject ?? null);
  // The compose file behind an imported stack: where applied changes are written back.
  const [composeSource, setComposeSource] = useState<ComposeSource | null>(saved?.composeSource ?? null);
  const [branches, setBranches] = useState<Record<string, BranchState>>(() => saved?.branches ?? {
    main: makeMainBranch(makeCommerceProject()),
  });
  const [canUndo, setCanUndo] = useState(() => Boolean(savedBranch?.history.canUndo));
  const [canRedo, setCanRedo] = useState(() => Boolean(savedBranch?.history.canRedo));
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([]);
  const [mergingBranchId, setMergingBranchId] = useState<string | null>(null);

  const currentBranch = branches[currentBranchId];

  // Every change to a model, its history, or the branch in use is saved, so a reload
  // (or a return from Wispr Flow's sign-in) lands on the same stack with undo intact.
  // Saved before the change is painted, so nothing on screen is unsaved, even if the page
  // is left at once. Opening the app saves nothing: a save that could not be read is left
  // alone until the person changes something, rather than replaced by the default sample.
  const opened = useRef(true);
  useLayoutEffect(() => {
    if (opened.current) {
      opened.current = false;
      return;
    }
    saveWorkspace({ sampleChoice, currentBranchId, importedProject, composeSource, branches });
  }, [sampleChoice, currentBranchId, importedProject, composeSource, branches]);

  const branchList = useMemo(() => Object.values(branches).map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    version: b.project.version,
  })), [branches]);

  // Compares main with the branch being worked on; both are the user's own models.
  const scenarioComparison = useMemo(() => {
    const current = branches[currentBranchId];
    if (currentBranchId === 'main' || !current || !branches.main) return null;
    return compareBranches(branches.main, current);
  }, [branches, currentBranchId]);

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
    setBranches((b) => {
      const branch = b[branchId];
      return branch ? { ...b, [branchId]: { ...branch, project: next } } : b;
    });
  }

  function startFrom(fresh: Project) {
    setProject(fresh);
    setCurrentBranchId('main');
    setBranches({ main: makeMainBranch(fresh) });
    setCanUndo(false);
    setCanRedo(false);
  }

  function loadProject(next: Project, source: ComposeSource | null = null) {
    setImportedProject(next);
    setComposeSource(source);
    startFrom(structuredClone(next));
  }

  function loadSample(kind: 'commerce' | 'food' = sampleChoice) {
    setImportedProject(null);
    setComposeSource(null);
    setSampleChoice(kind);
    const fresh = kind === 'food' ? makeFoodDeliveryProject() : makeCommerceProject();
    setProject(fresh);
    setCurrentBranchId('main');
    setBranches({ main: makeMainBranch(fresh) });
    setCanUndo(false);
    setCanRedo(false);
  }

  function reset() {
    if (importedProject) {
      startFrom(structuredClone(importedProject));
      return;
    }
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

  /** Forks the model as it is now into a new branch and switches to it. */
  function handleForkBranch() {
    let n = Object.keys(branches).length;
    while (branches[`branch-${n}`]) n += 1;
    const fork = forkBranch(project, { id: `branch-${n}`, name: `Branch ${n}`, parentBranchId: currentBranchId });
    setBranches((b) => ({ ...b, [fork.id]: fork }));
    setCurrentBranchId(fork.id);
    setProject(fork.project);
    syncHistory(fork.history);
  }

  function handleOpenComparison() {
    if (currentBranchId === 'main') return;
    setShowComparisonModal(true);
  }

  function handleInitiateMerge() {
    if (currentBranchId === 'main') return;
    const source = branches[currentBranchId];
    const target = branches.main;
    // The common base is where the branch forked, not main as it is now: against main
    // itself no conflict could ever appear, and nothing the branch deleted would be removed.
    const base = source?.baseProject;
    if (!source || !target || !base) return;
    const analysis = detectMergeConflicts(base, target.project, source.project);
    if (analysis.canAutoMerge) {
      const result = executeMerge(base, target.project, source.project, {});
      if (result.success && result.mergedProject) {
        const mergedProject = result.mergedProject;
        const history = target.history;
        history.push(mergedProject, `Merged ${source.name}`, mergedProject.changes[0]?.id);
        // The next merge of this branch starts from what was merged now.
        setBranches((b) => ({ ...b, main: { ...(b.main ?? target), project: mergedProject, history }, [source.id]: { ...source, baseProject: structuredClone(source.project) } }));
        setCurrentBranchId('main');
        setProject(mergedProject);
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
    const base = source?.baseProject;
    if (!source || !target || !base) return;
    const result = executeMerge(base, target.project, source.project, resolutions);
    if (result.success && result.mergedProject) {
      const mergedProject = result.mergedProject;
      const history = target.history;
      history.push(mergedProject, `Merged ${source.name} (resolved conflicts)`, mergedProject.changes[0]?.id);
      setBranches((b) => ({ ...b, main: { ...(b.main ?? target), project: mergedProject, history }, [source.id]: { ...source, baseProject: structuredClone(source.project) } }));
      setCurrentBranchId('main');
      setProject(mergedProject);
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
    loadProject,
    isImported: importedProject !== null,
    composeSource,
    setComposeSource,
    reset,
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
    setMergeConflicts,
    mergingBranchId,
    setMergingBranchId,
  };
}