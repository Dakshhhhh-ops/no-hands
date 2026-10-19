import type { Component, Relationship } from '../types/schema.ts';

export interface ImpactNode {
  id: string;
  distance: number;
  direction: 'upstream' | 'downstream' | 'self';
}

export interface BlastRadiusResult {
  targetId: string;
  directCallers: string[];         // Direct upstream services calling this node
  directDependencies: string[];    // Direct downstream services called by this node
  upstreamIds: Set<string>;        // All transitive callers (break if this node fails)
  downstreamIds: Set<string>;      // All transitive dependencies (needed by this node)
  totalImpactCount: number;        // Total distinct affected nodes
  depthMatrix: Map<string, ImpactNode>; // Hop distance from target
  affectedClients: string[];       // Customer-facing client applications impacted
  affectedServices: string[];      // Backend services impacted
  affectedDatastores: string[];    // Storage/queue nodes impacted
}

/**
 * Traverses downstream dependencies (forward edge traversal: A -> B).
 * Answers: "What components does this service rely on?"
 */
export function getDownstreamDependencies(
  components: Component[],
  relationships: Relationship[],
  selectedId: string
): { downstreamIds: Set<string>; distances: Map<string, number> } {
  const componentIds = new Set(components.map((c) => c.id));
  const downstreamIds = new Set<string>();
  const distances = new Map<string, number>();

  if (!componentIds.has(selectedId)) {
    return { downstreamIds, distances };
  }

  // Build forward adjacency list
  const forwardAdj = new Map<string, string[]>();
  for (const rel of relationships) {
    if (!forwardAdj.has(rel.from)) forwardAdj.set(rel.from, []);
    forwardAdj.get(rel.from)!.push(rel.to);
  }

  const queue: Array<{ id: string; dist: number }> = [{ id: selectedId, dist: 0 }];
  const visited = new Set<string>([selectedId]);

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    const targets = forwardAdj.get(id) || [];
    for (const target of targets) {
      if (componentIds.has(target) && !visited.has(target)) {
        visited.add(target);
        downstreamIds.add(target);
        distances.set(target, dist + 1);
        queue.push({ id: target, dist: dist + 1 });
      }
    }
  }

  return { downstreamIds, distances };
}

/**
 * Traverses upstream dependencies (reverse edge traversal: B <- A).
 * Answers: "Who calls this service? If this service fails, what breaks?"
 */
export function getUpstreamDependencies(
  components: Component[],
  relationships: Relationship[],
  selectedId: string
): { upstreamIds: Set<string>; distances: Map<string, number> } {
  const componentIds = new Set(components.map((c) => c.id));
  const upstreamIds = new Set<string>();
  const distances = new Map<string, number>();

  if (!componentIds.has(selectedId)) {
    return { upstreamIds, distances };
  }

  // Build reverse adjacency list
  const reverseAdj = new Map<string, string[]>();
  for (const rel of relationships) {
    if (!reverseAdj.has(rel.to)) reverseAdj.set(rel.to, []);
    reverseAdj.get(rel.to)!.push(rel.from);
  }

  const queue: Array<{ id: string; dist: number }> = [{ id: selectedId, dist: 0 }];
  const visited = new Set<string>([selectedId]);

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    const callers = reverseAdj.get(id) || [];
    for (const caller of callers) {
      if (componentIds.has(caller) && !visited.has(caller)) {
        visited.add(caller);
        upstreamIds.add(caller);
        distances.set(caller, dist + 1);
        queue.push({ id: caller, dist: dist + 1 });
      }
    }
  }

  return { upstreamIds, distances };
}

/**
 * Calculates the comprehensive Blast Radius of a component outage or change.
 * Combines upstream callers (outage cascade) and downstream dependencies (fault sources)
 * with exact hop-distance metrics.
 */
export function getBlastRadius(
  components: Component[],
  relationships: Relationship[],
  selectedId: string
): BlastRadiusResult {
  const componentMap = new Map(components.map((c) => [c.id, c]));

  if (!componentMap.has(selectedId)) {
    return {
      targetId: selectedId,
      directCallers: [],
      directDependencies: [],
      upstreamIds: new Set(),
      downstreamIds: new Set(),
      totalImpactCount: 0,
      depthMatrix: new Map(),
      affectedClients: [],
      affectedServices: [],
      affectedDatastores: [],
    };
  }

  // Direct relations
  const directCallers = relationships
    .filter((rel) => rel.to === selectedId && componentMap.has(rel.from))
    .map((rel) => rel.from);

  const directDependencies = relationships
    .filter((rel) => rel.from === selectedId && componentMap.has(rel.to))
    .map((rel) => rel.to);

  // Transitive traversals
  const { upstreamIds, distances: upDistances } = getUpstreamDependencies(components, relationships, selectedId);
  const { downstreamIds, distances: downDistances } = getDownstreamDependencies(components, relationships, selectedId);

  // Combine into impact depth matrix
  const depthMatrix = new Map<string, ImpactNode>();
  depthMatrix.set(selectedId, { id: selectedId, distance: 0, direction: 'self' });

  for (const [id, distance] of upDistances.entries()) {
    depthMatrix.set(id, { id, distance, direction: 'upstream' });
  }

  for (const [id, distance] of downDistances.entries()) {
    // If a node is both upstream and downstream (cycle), retain the closest distance
    if (!depthMatrix.has(id) || depthMatrix.get(id)!.distance > distance) {
      depthMatrix.set(id, { id, distance, direction: 'downstream' });
    }
  }

  // Categorize affected components
  const allImpactedIds = new Set([...upstreamIds, ...downstreamIds]);
  const affectedClients: string[] = [];
  const affectedServices: string[] = [];
  const affectedDatastores: string[] = [];

  for (const id of allImpactedIds) {
    const comp = componentMap.get(id);
    if (!comp) continue;
    if (comp.type === 'CLIENT') {
      affectedClients.push(comp.id);
    } else if (comp.type === 'DATABASE' || comp.type === 'CACHE' || comp.type === 'QUEUE') {
      affectedDatastores.push(comp.id);
    } else {
      affectedServices.push(comp.id);
    }
  }

  return {
    targetId: selectedId,
    directCallers,
    directDependencies,
    upstreamIds,
    downstreamIds,
    totalImpactCount: allImpactedIds.size,
    depthMatrix,
    affectedClients,
    affectedServices,
    affectedDatastores,
  };
}

