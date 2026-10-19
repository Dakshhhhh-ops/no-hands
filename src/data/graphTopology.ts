import type { Component, Relationship } from '../types/schema.ts';
import { detectCycles } from './graphCycle.ts';

export interface DeploymentStage {
  stage: number;
  label: string;
  components: Component[];
  componentIds: string[];
}

export interface DeploymentPlan {
  isAcyclic: boolean;
  stages: DeploymentStage[];
  orderedComponentIds: string[];
  warnings: string[];
}

/**
 * Calculates topological order and deployment stages using Kahn's algorithm
 * on the inverted dependency graph (dependencies boot before consumers).
 *
 * Example:
 * If `gateway -> auth -> postgres`:
 * Boot sequence: postgres -> auth -> gateway
 */
export function getDeploymentPlan(
  components: Component[],
  relationships: Relationship[]
): DeploymentPlan {
  const componentMap = new Map(components.map((c) => [c.id, c]));
  const componentIds = new Set(components.map((c) => c.id));
  const warnings: string[] = [];

  // Check for cycles first
  const cycleReport = detectCycles(components, relationships);
  if (cycleReport.hasCycle) {
    const cycleDesc = cycleReport.cycles.map((c) => c.join(' -> ')).join('; ');
    warnings.push(`Circular dependency detected: ${cycleDesc}. Nodes within cycles must be deployed concurrently.`);
  }

  // Build dependency graph where:
  // Edge X -> Y means "X must boot BEFORE Y can start".
  // In relationship A -> B ("A calls B"), B is a prerequisite of A.
  // So boot order edge is: B -> A.
  const bootAdj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of componentIds) {
    bootAdj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const rel of relationships) {
    if (componentIds.has(rel.from) && componentIds.has(rel.to) && rel.from !== rel.to) {
      // rel.to is required by rel.from, so rel.to must boot BEFORE rel.from
      bootAdj.get(rel.to)!.push(rel.from);
      inDegree.set(rel.from, (inDegree.get(rel.from) || 0) + 1);
    }
  }

  // Kahn's Algorithm for layered stage assignment
  let currentWave: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      currentWave.push(id);
    }
  }

  const stages: DeploymentStage[] = [];
  const orderedIds: string[] = [];
  const remainingInDegree = new Map(inDegree);
  let stageNumber = 1;

  while (currentWave.length > 0) {
    // Sort components in wave by architectural type for cleaner presentation
    currentWave.sort((a, b) => {
      const typeRank = (id: string) => {
        const t = componentMap.get(id)?.type;
        if (t === 'DATABASE' || t === 'STORAGE') return 1;
        if (t === 'CACHE') return 2;
        if (t === 'QUEUE') return 3;
        if (t === 'SERVICE') return 4;
        if (t === 'GATEWAY') return 5;
        return 6;
      };
      return typeRank(a) - typeRank(b);
    });

    const stageComponents = currentWave.map((id) => componentMap.get(id)!).filter(Boolean);
    stages.push({
      stage: stageNumber,
      label: getStageLabel(stageNumber, stageComponents),
      components: stageComponents,
      componentIds: [...currentWave],
    });
    orderedIds.push(...currentWave);

    const nextWave: string[] = [];
    for (const u of currentWave) {
      for (const v of bootAdj.get(u) || []) {
        const newDeg = (remainingInDegree.get(v) || 0) - 1;
        remainingInDegree.set(v, newDeg);
        if (newDeg === 0) {
          nextWave.push(v);
        }
      }
    }

    currentWave = nextWave;
    stageNumber++;
  }

  // If there are unvisited components due to cycles, append them in a final fallback wave
  if (orderedIds.length < components.length) {
    const unvisited = components.filter((c) => !orderedIds.includes(c.id));
    stages.push({
      stage: stageNumber,
      label: `Stage ${stageNumber}: Cyclic Dependencies (Deploy Concurrently)`,
      components: unvisited,
      componentIds: unvisited.map((c) => c.id),
    });
    orderedIds.push(...unvisited.map((c) => c.id));
  }

  return {
    isAcyclic: !cycleReport.hasCycle,
    stages,
    orderedComponentIds: orderedIds,
    warnings,
  };
}

function getStageLabel(stage: number, components: Component[]): string {
  const types = new Set(components.map((c) => c.type));
  if (types.has('DATABASE') || types.has('CACHE') || types.has('QUEUE')) {
    return `Stage ${stage}: Data Tier & Messaging Infrastructure`;
  }
  if (types.has('SERVICE')) {
    return `Stage ${stage}: Core Domain Microservices`;
  }
  if (types.has('GATEWAY')) {
    return `Stage ${stage}: Edge Gateways & Ingress Routing`;
  }
  if (types.has('CLIENT')) {
    return `Stage ${stage}: Frontend & Storefront Applications`;
  }
  return `Stage ${stage}: Secondary Services & Integrations`;
}

