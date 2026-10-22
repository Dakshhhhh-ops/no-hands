import type { Project } from '../types/schema.ts';
import { generateJsonPatch, applyJsonPatch, type JsonPatchOperation } from './jsonPatch.ts';

export interface TimelineEntry {
  version: number;
  timestamp: number;
  label: string;
  changeId?: string;
  patchCount: number;
  project: Project;
  patch: JsonPatchOperation[];
  inversePatch: JsonPatchOperation[];
}

/**
 * Immutable Architecture History Timeline & Time-Travel Manager.
 * Supports Undo (Ctrl+Z), Redo (Ctrl+Y), atomic rollbacks, and scrubbing across versions.
 */
export class HistoryTimeline {
  past: TimelineEntry[] = [];
  present: Project;
  future: TimelineEntry[] = [];

  constructor(initialProject: Project) {
    this.present = structuredClone(initialProject);
  }

  /**
   * Pushes a new architecture state, computing RFC 6902 forward and inverse patches.
   */
  push(nextProject: Project, label: string, changeId?: string): TimelineEntry {
    const patch = generateJsonPatch(this.present, nextProject);
    const { inversePatch } = applyJsonPatch(this.present, patch);

    const entry: TimelineEntry = {
      version: nextProject.version,
      timestamp: Date.now(),
      label,
      changeId,
      patchCount: patch.length,
      project: structuredClone(nextProject),
      patch,
      inversePatch,
    };

    // Push present state to past with forward patch to entry
    const pastEntry: TimelineEntry = {
      version: this.present.version,
      timestamp: Date.now(),
      label,
      changeId,
      patchCount: patch.length,
      project: structuredClone(this.present),
      patch,
      inversePatch,
    };

    this.past.push(pastEntry);
    this.present = structuredClone(nextProject);
    // Any new action clears the redo future branch
    this.future = [];

    return entry;
  }

  /**
   * Reverts to the previous architecture version (Undo).
   */
  undo(): Project | null {
    if (this.past.length === 0) return null;

    const previousEntry = this.past.pop()!;
    // Save current state into future for Redo
    const forwardPatch = generateJsonPatch(previousEntry.project, this.present);
    const { inversePatch } = applyJsonPatch(previousEntry.project, forwardPatch);

    this.future.unshift({
      version: this.present.version,
      timestamp: Date.now(),
      label: `Revert to v${previousEntry.project.version}`,
      patchCount: forwardPatch.length,
      project: structuredClone(this.present),
      patch: forwardPatch,
      inversePatch,
    });

    this.present = structuredClone(previousEntry.project);
    return this.present;
  }

  /**
   * Steps forward into an undone architecture version (Redo).
   */
  redo(): Project | null {
    if (this.future.length === 0) return null;

    const nextEntry = this.future.shift()!;
    this.past.push({
      version: this.present.version,
      timestamp: Date.now(),
      label: nextEntry.label,
      patchCount: nextEntry.patchCount,
      project: structuredClone(this.present),
      patch: nextEntry.patch,
      inversePatch: nextEntry.inversePatch,
    });

    this.present = structuredClone(nextEntry.project);
    return this.present;
  }

  /**
   * Time-travel scrubs directly to any historical version by index.
   */
  jumpTo(targetIndex: number): Project {
    const fullTimeline = this.getFullTimeline();
    const target = fullTimeline[targetIndex];
    if (targetIndex < 0 || targetIndex >= fullTimeline.length || !target) {
      throw new Error(`Invalid timeline index: ${targetIndex}`);
    }

    if (target.project.version === this.present.version) {
      return this.present;
    }

    // Fast-forward or rewind
    if (targetIndex < this.past.length) {
      // Need to rewind (undo)
      const steps = this.past.length - targetIndex;
      for (let i = 0; i < steps; i++) {
        this.undo();
      }
    } else {
      // Need to fast-forward (redo)
      const steps = targetIndex - this.past.length;
      for (let i = 0; i < steps; i++) {
        this.redo();
      }
    }

    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Returns complete chronologically sorted timeline.
   */
  getFullTimeline(): TimelineEntry[] {
    const currentEntry: TimelineEntry = {
      version: this.present.version,
      timestamp: Date.now(),
      label: `Current (v${this.present.version})`,
      patchCount: 0,
      project: this.present,
      patch: [],
      inversePatch: [],
    };
    return [...this.past, currentEntry, ...this.future];
  }
}

