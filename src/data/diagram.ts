import { getBlastRadius, getUpstreamDependencies, getDownstreamDependencies } from './graphTraversal.ts';
import { detectCycles } from './graphCycle.ts';
import { computeGraphLayout } from './graphLayout.ts';
import { getDeploymentPlan } from './graphTopology.ts';
import type { BlastRadiusResult } from './graphTraversal.ts';
import type { CycleReport } from './graphCycle.ts';
import type { Component, Relationship } from '../types/schema.ts';

export interface DiagramNeighborhood {
  directIds: Set<string>;
  directRelationships: Set<string>;
  downstreamIds: Set<string>;
  upstreamIds: Set<string>;
  blastRadius: BlastRadiusResult;
  cycleReport: CycleReport;
}

export const relationshipKey = (relationship: Pick<Relationship, 'from' | 'to' | 'label'>): string => `${relationship.from}->${relationship.to}:${relationship.label}`;

/**
 * Enhanced diagram neighborhood analysis with bidirectional traversal,
 * blast radius depth metrics, and circular dependency detection.
 * Maintains 100% backward compatibility with existing tests and UI.
 */
export function getDiagramNeighborhood(
  components: Component[],
  relationships: Relationship[],
  selectedId: string,
): DiagramNeighborhood {
  const componentIds = new Set(components.map((component) => component.id));
  const directIds = new Set<string>();
  const directRelationships = new Set<string>();
  const downstreamIds = new Set<string>();
  const upstreamIds = new Set<string>();

  if (!componentIds.has(selectedId)) {
    return {
      directIds,
      directRelationships,
      downstreamIds,
      upstreamIds,
      blastRadius: getBlastRadius(components, relationships, selectedId),
      cycleReport: detectCycles(components, relationships),
    };
  }

  // 1. Direct relationships (both in and out)
  for (const relationship of relationships) {
    if (relationship.from === selectedId || relationship.to === selectedId) {
      directRelationships.add(relationshipKey(relationship));
      if (componentIds.has(relationship.from)) directIds.add(relationship.from);
      if (componentIds.has(relationship.to)) directIds.add(relationship.to);
    }
  }
  directIds.delete(selectedId);

  // 2. Downstream traversal (transitive dependencies)
  const visitedDown = new Set([selectedId]);
  const queueDown = [selectedId];
  while (queueDown.length) {
    const sourceId = queueDown.shift();
    for (const relationship of relationships) {
      if (relationship.from !== sourceId || !componentIds.has(relationship.to) || visitedDown.has(relationship.to)) continue;
      visitedDown.add(relationship.to);
      downstreamIds.add(relationship.to);
      queueDown.push(relationship.to);
    }
  }
  for (const directId of directIds) downstreamIds.delete(directId);

  // 3. Upstream traversal (transitive callers that depend on this node)
  const visitedUp = new Set([selectedId]);
  const queueUp = [selectedId];
  while (queueUp.length) {
    const targetId = queueUp.shift();
    for (const relationship of relationships) {
      if (relationship.to !== targetId || !componentIds.has(relationship.from) || visitedUp.has(relationship.from)) continue;
      visitedUp.add(relationship.from);
      upstreamIds.add(relationship.from);
      queueUp.push(relationship.from);
    }
  }
  for (const directId of directIds) upstreamIds.delete(directId);

  // 4. Compute comprehensive blast radius and cycle analysis
  const blastRadius = getBlastRadius(components, relationships, selectedId);
  const cycleReport = detectCycles(components, relationships);

  return {
    directIds,
    directRelationships,
    downstreamIds,
    upstreamIds,
    blastRadius,
    cycleReport,
  };
}

export {
  computeGraphLayout,
  getBlastRadius,
  getUpstreamDependencies,
  getDownstreamDependencies,
  detectCycles,
  getDeploymentPlan,
};
