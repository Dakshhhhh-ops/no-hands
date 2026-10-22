import type { Component, Relationship } from '../types/schema.ts';

export interface CycleReport {
  hasCycle: boolean;
  cycles: string[][];               // List of cycles as arrays of component IDs: [A, B, A]
  stronglyConnectedComponents: string[][]; // SCCs with > 1 node
  cycleCount: number;
}

/**
 * Detects circular dependencies and cycles in the architecture graph using
 * Tarjan's Strongly Connected Components (SCC) algorithm + DFS cycle path extraction.
 *
 * Example: Service A -> Service B -> Service A
 * Identifies architectural circular dependencies and deadlock risks.
 */
export function detectCycles(
  components: Component[],
  relationships: Relationship[]
): CycleReport {
  const componentIds = new Set(components.map((c) => c.id));
  const adj = new Map<string, string[]>();

  for (const id of componentIds) {
    adj.set(id, []);
  }

  for (const rel of relationships) {
    if (componentIds.has(rel.from) && componentIds.has(rel.to)) {
      adj.get(rel.from)!.push(rel.to);
    }
  }

  // --- Tarjan's SCC Algorithm ---
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongConnect(v: string) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    // Root of SCC found
    if (lowlinks.get(v) === indices.get(v)) {
      const currentScc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        currentScc.push(w);
      } while (w !== v);

      if (currentScc.length > 1) {
        sccs.push(currentScc);
      }
    }
  }

  for (const v of componentIds) {
    if (!indices.has(v)) {
      strongConnect(v);
    }
  }

  // --- Extract Concrete Cycle Paths via DFS for Reporting ---
  const foundCycles: string[][] = [];
  const cycleSignatures = new Set<string>();

  function dfsPath(current: string, start: string, path: string[], visitedLocal: Set<string>) {
    for (const neighbor of adj.get(current) || []) {
      if (neighbor === start && path.length >= 2) {
        const fullCycle = [...path, start];
        // Create canonical representation to prevent duplicate permutations
        const nodesInCycle = fullCycle.slice(0, -1);
        const minNode = [...nodesInCycle].sort()[0];
        // path holds at least two nodes here, so there is always a smallest one.
        if (minNode === undefined) continue;
        const minIndex = nodesInCycle.indexOf(minNode);
        const normalized = [
          ...nodesInCycle.slice(minIndex),
          ...nodesInCycle.slice(0, minIndex),
        ].join('->');

        if (!cycleSignatures.has(normalized)) {
          cycleSignatures.add(normalized);
          foundCycles.push(fullCycle);
        }
      } else if (!visitedLocal.has(neighbor)) {
        visitedLocal.add(neighbor);
        path.push(neighbor);
        dfsPath(neighbor, start, path, visitedLocal);
        path.pop();
        visitedLocal.delete(neighbor);
      }
    }
  }

  for (const scc of sccs) {
    for (const node of scc) {
      dfsPath(node, node, [node], new Set([node]));
    }
  }

  return {
    hasCycle: foundCycles.length > 0 || sccs.length > 0,
    cycles: foundCycles,
    stronglyConnectedComponents: sccs,
    cycleCount: foundCycles.length,
  };
}

