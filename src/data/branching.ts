import type { Project, Component } from '../types/schema.ts';
import { HistoryTimeline } from './historyManager.ts';
import { deriveRiskFindings } from './analysis.ts';
import { getBlastRadius } from './graphTraversal.ts';

export interface ArchitectureBranch {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  parentBranchId?: string;
  baseVersion: number;
  /** The model as it was when the branch forked (or last merged): the common base for a merge. */
  baseProject: Project;
  project: Project;
  history: HistoryTimeline;
}

/** Every field is computed from the branch's own model. Nothing is estimated or priced. */
export interface BranchComparisonMetrics {
  id: string;
  name: string;
  version: number;
  componentCount: number;
  relationshipCount: number;
  storageCount: number;
  serviceCount: number;
  riskCount: number;
  unresolvedCount: number;
  maxBlastRadius: number;
  databaseCount: number;
}

export interface ScenarioComparison {
  branchA: BranchComparisonMetrics;
  branchB: BranchComparisonMetrics;
  riskDelta: number; // Positive means B has more risk findings than A
  componentChanges: {
    addedInB: Component[];
    removedInB: Component[];
    modifiedInB: Array<{ id: string; before: Component; after: Component }>;
  };
  connectionChanges: {
    addedInB: string[];
    removedInB: string[];
  };
}

/**
 * Forks a branch from the model as it is right now, so alternatives are explored
 * on the user's own architecture rather than on prewritten scenarios.
 */
export function forkBranch(
  base: Project,
  options: { id: string; name: string; parentBranchId?: string },
): ArchitectureBranch {
  const project = structuredClone(base) as Project;
  return {
    id: options.id,
    name: options.name,
    description: `Forked from ${base.name} v${base.version}`,
    createdAt: Date.now(),
    parentBranchId: options.parentBranchId,
    baseVersion: base.version,
    baseProject: structuredClone(base) as Project,
    project,
    history: new HistoryTimeline(project),
  };
}

export function calculateBranchMetrics(project: Project, name = project.name): BranchComparisonMetrics {
  const components = project.components;
  const risks = deriveRiskFindings(project);

  let maxBlastRadius = 0;
  for (const comp of components) {
    const blast = getBlastRadius(components, project.relationships, comp.id);
    if (blast.totalImpactCount > maxBlastRadius) maxBlastRadius = blast.totalImpactCount;
  }

  return {
    id: project.name,
    name,
    version: project.version,
    componentCount: components.length,
    relationshipCount: project.relationships.length,
    storageCount: components.filter((c) => ['DATABASE', 'CACHE', 'QUEUE'].includes(c.type)).length,
    serviceCount: components.filter((c) => c.type === 'SERVICE').length,
    riskCount: risks.length,
    unresolvedCount: risks.filter((r) => r.kind === 'Unresolved decision').length,
    maxBlastRadius,
    databaseCount: components.filter((c) => c.type === 'DATABASE').length,
  };
}

/** Side-by-side comparison of two branches, computed entirely from their models. */
export function compareBranches(
  branchA: Pick<ArchitectureBranch, 'project'> & { name?: string },
  branchB: Pick<ArchitectureBranch, 'project'> & { name?: string },
): ScenarioComparison {
  const metricsA = calculateBranchMetrics(branchA.project, branchA.name);
  const metricsB = calculateBranchMetrics(branchB.project, branchB.name);

  const compMapA = new Map(branchA.project.components.map((c) => [c.id, c]));
  const compMapB = new Map(branchB.project.components.map((c) => [c.id, c]));

  const addedInB: Component[] = [];
  const removedInB: Component[] = [];
  const modifiedInB: Array<{ id: string; before: Component; after: Component }> = [];

  for (const [id, compB] of compMapB.entries()) {
    const compA = compMapA.get(id);
    if (!compA) addedInB.push(compB);
    else if (compA.type !== compB.type || compA.sub !== compB.sub || compA.name !== compB.name) {
      modifiedInB.push({ id, before: compA, after: compB });
    }
  }
  for (const [id, compA] of compMapA.entries()) {
    if (!compMapB.has(id)) removedInB.push(compA);
  }

  const edgeKey = (r: { from: string; to: string }) => `${r.from} → ${r.to}`;
  const edgesA = new Set(branchA.project.relationships.map(edgeKey));
  const edgesB = new Set(branchB.project.relationships.map(edgeKey));

  return {
    branchA: metricsA,
    branchB: metricsB,
    riskDelta: metricsB.riskCount - metricsA.riskCount,
    componentChanges: { addedInB, removedInB, modifiedInB },
    connectionChanges: {
      addedInB: [...edgesB].filter((e) => !edgesA.has(e)),
      removedInB: [...edgesA].filter((e) => !edgesB.has(e)),
    },
  };
}
