import { WorkspaceSnapshotSchema } from '../types/schema.ts';
import type { BranchSnapshot, ComposeSource, Project, WorkspaceSnapshot } from '../types/schema.ts';
import { HistoryTimeline } from './historyManager.ts';

/**
 * Keeps the workspace across reloads: every branch with its model and undo history,
 * the branch being worked on, and the imported baseline that Reset returns to.
 *
 * Stored data is checked with WorkspaceSnapshotSchema on load. Anything that fails
 * (a hand-edited value, an older format, a half-written save) is ignored and the
 * workspace starts from the default sample instead of crashing.
 */

export const WORKSPACE_KEY = 'va-workspace';
/** Undo and redo steps kept per branch; older steps are dropped from the save, not from the session. */
export const HISTORY_LIMIT = 25;

export interface WorkspaceBranch {
  id: string;
  name: string;
  description: string;
  baseProject?: Project;
  project: Project;
  history: HistoryTimeline;
}

export interface WorkspaceState {
  sampleChoice: 'commerce' | 'food';
  currentBranchId: string;
  importedProject: Project | null;
  /** The compose file the stack came from, or the newer one it was last synced or written to. */
  composeSource: ComposeSource | null;
  branches: Record<string, WorkspaceBranch>;
}

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem' | 'removeItem'>;

export function toSnapshot(state: WorkspaceState, historyLimit = HISTORY_LIMIT): WorkspaceSnapshot {
  const branches: Record<string, BranchSnapshot> = {};
  for (const [id, branch] of Object.entries(state.branches)) {
    branches[id] = {
      id: branch.id,
      name: branch.name,
      description: branch.description,
      ...(branch.baseProject ? { baseProject: branch.baseProject } : {}),
      project: branch.project,
      history: branch.history.snapshot(historyLimit),
    };
  }
  return {
    schemaVersion: 1,
    sampleChoice: state.sampleChoice,
    currentBranchId: state.currentBranchId,
    importedProject: state.importedProject,
    composeSource: state.composeSource,
    branches,
  };
}

export function serializeWorkspace(state: WorkspaceState, historyLimit = HISTORY_LIMIT): string {
  return JSON.stringify(toSnapshot(state, historyLimit));
}

/** The workspace saved in `text`, or null when there is none or it is not valid. */
export function parseWorkspace(text: string | null | undefined): WorkspaceState | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = WorkspaceSnapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  const branches: Record<string, WorkspaceBranch> = {};
  for (const [id, branch] of Object.entries(parsed.data.branches)) {
    branches[id] = {
      id: branch.id,
      name: branch.name,
      description: branch.description,
      ...(branch.baseProject ? { baseProject: branch.baseProject } : {}),
      project: branch.project,
      history: HistoryTimeline.restore(branch.history),
    };
  }
  return {
    sampleChoice: parsed.data.sampleChoice,
    currentBranchId: parsed.data.currentBranchId,
    importedProject: parsed.data.importedProject,
    composeSource: parsed.data.composeSource ?? null,
    branches,
  };
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Storage can be blocked outright (some private modes, sandboxed frames).
    return null;
  }
}

export function loadWorkspace(storage: ReadStorage | null = browserStorage()): WorkspaceState | null {
  if (!storage) return null;
  try {
    return parseWorkspace(storage.getItem(WORKSPACE_KEY));
  } catch {
    return null;
  }
}

/**
 * Saves the workspace. When the browser's quota is full it keeps fewer undo steps,
 * then none, so the current model is the last thing to be lost. Returns false only
 * when nothing could be saved.
 */
export function saveWorkspace(state: WorkspaceState, storage: WriteStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  for (const limit of [HISTORY_LIMIT, 5, 0]) {
    try {
      storage.setItem(WORKSPACE_KEY, serializeWorkspace(state, limit));
      return true;
    } catch {
      // Quota exceeded: try again with a shorter history.
    }
  }
  try {
    storage.removeItem(WORKSPACE_KEY);
  } catch {
    // Nothing more to do; the session itself keeps working.
  }
  return false;
}
