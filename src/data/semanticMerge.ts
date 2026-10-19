import type { Project, Component, Relationship, Requirement } from '../types/schema.ts';
import { validateProject } from '../types/schema.ts';

export type ConflictResolutionChoice = 'target' | 'source' | 'custom';

export interface MergeConflict {
  id: string;
  entityType: 'component' | 'relationship' | 'requirement';
  entityId: string;
  field: string;
  baseValue: any;
  targetValue: any; // Branch being merged into (e.g. main)
  sourceValue: any; // Branch being merged from (e.g. branch-serverless)
  description: string;
  chosenResolution?: ConflictResolutionChoice;
}

export interface MergeAnalysis {
  canAutoMerge: boolean;
  conflicts: MergeConflict[];
  changesApplied: {
    componentsAdded: number;
    componentsModified: number;
    componentsRemoved: number;
    relationshipsAdded: number;
    relationshipsModified: number;
    requirementsAdded: number;
  };
}

export interface MergeResult {
  success: boolean;
  mergedProject?: Project;
  conflicts: MergeConflict[];
  analysis: MergeAnalysis;
  error?: string;
}

/**
 * Performs a 3-way semantic diff and detects conflicting architecture modifications
 * between target branch and source branch relative to their common ancestor base.
 */
export function detectMergeConflicts(
  base: Project,
  target: Project,
  source: Project
): MergeAnalysis {
  const conflicts: MergeConflict[] = [];

  const baseComp = new Map(base.components.map((c) => [c.id, c]));
  const targetComp = new Map(target.components.map((c) => [c.id, c]));
  const sourceComp = new Map(source.components.map((c) => [c.id, c]));

  let compAdded = 0;
  let compModified = 0;
  let compRemoved = 0;

  // 1. Analyze Components
  const allCompIds = new Set([...baseComp.keys(), ...targetComp.keys(), ...sourceComp.keys()]);

  for (const id of allCompIds) {
    const b = baseComp.get(id);
    const t = targetComp.get(id);
    const s = sourceComp.get(id);

    if (!b && t && s) {
      // Added in both branches
      if (t.type !== s.type || t.sub !== s.sub) {
        conflicts.push({
          id: `conflict-comp-${id}`,
          entityType: 'component',
          entityId: id,
          field: 'type/sub',
          baseValue: null,
          targetValue: { type: t.type, sub: t.sub },
          sourceValue: { type: s.type, sub: s.sub },
          description: `Component "${id}" was independently added in both branches with different definitions.`,
        });
      }
    } else if (b && !t && s) {
      // Removed in target, but modified in source
      if (b.sub !== s.sub || b.type !== s.type) {
        conflicts.push({
          id: `conflict-comp-del-${id}`,
          entityType: 'component',
          entityId: id,
          field: 'existence',
          baseValue: b,
          targetValue: null,
          sourceValue: s,
          description: `Component "${id}" was deleted in target branch, but modified in source branch.`,
        });
      } else {
        compRemoved++;
      }
    } else if (b && t && !s) {
      // Removed in source, but modified in target
      if (b.sub !== t.sub || b.type !== t.type) {
        conflicts.push({
          id: `conflict-comp-del-src-${id}`,
          entityType: 'component',
          entityId: id,
          field: 'existence',
          baseValue: b,
          targetValue: t,
          sourceValue: null,
          description: `Component "${id}" was modified in target branch, but deleted in source branch.`,
        });
      }
    } else if (b && t && s) {
      // Modified in both
      const targetChanged = b.type !== t.type || b.sub !== t.sub || b.name !== t.name;
      const sourceChanged = b.type !== s.type || b.sub !== s.sub || b.name !== s.name;

      if (targetChanged && sourceChanged) {
        // Conflicting changes if they diverged from each other
        if (t.type !== s.type) {
          conflicts.push({
            id: `conflict-comp-type-${id}`,
            entityType: 'component',
            entityId: id,
            field: 'type',
            baseValue: b.type,
            targetValue: t.type,
            sourceValue: s.type,
            description: `Conflicting ComponentType for "${id}": Target sets "${t.type}", Source sets "${s.type}".`,
          });
        }
        if (t.sub !== s.sub) {
          conflicts.push({
            id: `conflict-comp-sub-${id}`,
            entityType: 'component',
            entityId: id,
            field: 'sub',
            baseValue: b.sub,
            targetValue: t.sub,
            sourceValue: s.sub,
            description: `Conflicting responsibility summary for "${id}".`,
          });
        }
      } else if (sourceChanged) {
        compModified++;
      }
    } else if (!b && !t && s) {
      compAdded++;
    }
  }

  // 2. Analyze Relationships
  const relKey = (r: Relationship) => `${r.from}->${r.to}`;
  const baseRel = new Map(base.relationships.map((r) => [relKey(r), r]));
  const targetRel = new Map(target.relationships.map((r) => [relKey(r), r]));
  const sourceRel = new Map(source.relationships.map((r) => [relKey(r), r]));

  let relAdded = 0;
  let relModified = 0;

  const allRelKeys = new Set([...baseRel.keys(), ...targetRel.keys(), ...sourceRel.keys()]);
  for (const key of allRelKeys) {
    const b = baseRel.get(key);
    const t = targetRel.get(key);
    const s = sourceRel.get(key);

    if (b && t && s) {
      const targetChanged = b.label !== t.label;
      const sourceChanged = b.label !== s.label;
      if (targetChanged && sourceChanged && t.label !== s.label) {
        conflicts.push({
          id: `conflict-rel-${key}`,
          entityType: 'relationship',
          entityId: key,
          field: 'label',
          baseValue: b.label,
          targetValue: t.label,
          sourceValue: s.label,
          description: `Relationship ${key} has conflicting labels: Target: "${t.label}", Source: "${s.label}".`,
        });
      } else if (sourceChanged) {
        relModified++;
      }
    } else if (!b && !t && s) {
      relAdded++;
    }
  }

  // 3. Requirements Added in Source
  const targetReqIds = new Set(target.requirements.map((r) => r.id));
  const reqAdded = source.requirements.filter((r) => !targetReqIds.has(r.id)).length;

  return {
    canAutoMerge: conflicts.length === 0,
    conflicts,
    changesApplied: {
      componentsAdded: compAdded,
      componentsModified: compModified,
      componentsRemoved: compRemoved,
      relationshipsAdded: relAdded,
      relationshipsModified: relModified,
      requirementsAdded: reqAdded,
    },
  };
}

/**
 * Executes a 3-way merge between base, target, and source, applying resolutions for any conflicts.
 */
export function executeMerge(
  base: Project,
  target: Project,
  source: Project,
  resolutions: Record<string, ConflictResolutionChoice> = {}
): MergeResult {
  const analysis = detectMergeConflicts(base, target, source);

  // Check if any conflicts remain unresolved
  const unresolved = analysis.conflicts.filter((c) => !resolutions[c.id]);
  if (unresolved.length > 0) {
    return {
      success: false,
      conflicts: analysis.conflicts,
      analysis,
      error: `Cannot merge: ${unresolved.length} unresolved conflict(s).`,
    };
  }

  const merged = structuredClone(target);
  const baseComp = new Map(base.components.map((c) => [c.id, c]));
  const sourceComp = new Map(source.components.map((c) => [c.id, c]));

  // 1. Merge Components
  for (const [id, s] of sourceComp.entries()) {
    const b = baseComp.get(id);
    const targetIdx = merged.components.findIndex((c) => c.id === id);

    if (!b) {
      // Added in source
      if (targetIdx === -1) {
        merged.components.push(structuredClone(s));
      } else {
        // Added in both, check resolution
        const conflict = analysis.conflicts.find((c) => c.entityId === id);
        if (conflict && resolutions[conflict.id] === 'source') {
          merged.components[targetIdx] = structuredClone(s);
        }
      }
    } else {
      // Existed in base
      if (targetIdx !== -1) {
        const conflict = analysis.conflicts.find((c) => c.entityId === id);
        if (conflict) {
          if (resolutions[conflict.id] === 'source') {
            merged.components[targetIdx] = structuredClone(s);
          }
        } else if (b.sub !== s.sub || b.type !== s.type || b.name !== s.name) {
          // Clean modification from source
          merged.components[targetIdx] = structuredClone(s);
        }
      }
    }
  }

  // 2. Merge Relationships
  const relKey = (r: Relationship) => `${r.from}->${r.to}`;
  const baseRel = new Map(base.relationships.map((r) => [relKey(r), r]));
  const targetRelMap = new Map(merged.relationships.map((r) => [relKey(r), r]));

  for (const sRel of source.relationships) {
    const key = relKey(sRel);
    const bRel = baseRel.get(key);
    const tRel = targetRelMap.get(key);

    if (!bRel && !tRel) {
      merged.relationships.push(structuredClone(sRel));
    } else if (bRel && tRel) {
      const conflict = analysis.conflicts.find((c) => c.entityId === key);
      if (conflict && resolutions[conflict.id] === 'source') {
        const idx = merged.relationships.findIndex((r) => relKey(r) === key);
        if (idx !== -1) merged.relationships[idx] = structuredClone(sRel);
      } else if (!conflict && bRel.label !== sRel.label) {
        const idx = merged.relationships.findIndex((r) => relKey(r) === key);
        if (idx !== -1) merged.relationships[idx] = structuredClone(sRel);
      }
    }
  }

  // 3. Merge Requirements
  const targetReqIds = new Set(merged.requirements.map((r) => r.id));
  for (const sReq of source.requirements) {
    if (!targetReqIds.has(sReq.id)) {
      merged.requirements.push(structuredClone(sReq));
    }
  }

  // Bump version and record merge change
  merged.version += 1;
  merged.changed = true;
  merged.changes.unshift({
    id: `CHG-MERGE-${Date.now()}`,
    version: merged.version,
    originalInstruction: `Merged scenario branch "${source.name}" into "${target.name}"`,
    summary: `Merged ${analysis.changesApplied.componentsAdded} new components, ${analysis.changesApplied.relationshipsAdded} relationships from ${source.name}.`,
    affectedArtifacts: ['components', 'relationships', 'requirements'],
  });

  // Validate the resulting model
  const validated = validateProject(merged);

  return {
    success: true,
    mergedProject: validated,
    conflicts: analysis.conflicts,
    analysis,
  };
}

