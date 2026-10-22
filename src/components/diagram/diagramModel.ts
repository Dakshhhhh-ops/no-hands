import type { ArchitectureDecisionRecord } from '../../data/adrWorkflow.ts';
import type { DiagramNeighborhood } from '../../data/diagram.ts';
import type { Component } from '../../types/schema.ts';
import type { ChaosTarget, SignoffRole } from './diagramTypes.ts';

/** Outage simulator targets come from the loaded model, not from the sample's ids. */
export function getChaosTargets(components: Component[]): ChaosTarget[] {
  return ([
    { type: 'CACHE', kind: 'NODE_OUTAGE', verb: 'Kill' },
    { type: 'DATABASE', kind: 'NODE_OUTAGE', verb: 'Kill' },
    { type: 'GATEWAY', kind: 'LATENCY_SPIKE', verb: 'Slow' },
  ] as const)
    .map(({ type, kind, verb }): ChaosTarget | null => {
      const component = components.find((c) => c.type === type);
      return component ? { component, kind, label: `${verb} ${component.name}` } : null;
    })
    .filter((target): target is ChaosTarget => target !== null);
}

/** The generated ADR with the reviewer's sign-off toggles applied; accepted once every role approves. */
export function applySignoffOverrides(
  baseAdr: ArchitectureDecisionRecord,
  adrSignoffOverrides: Partial<Record<SignoffRole, boolean>>,
): ArchitectureDecisionRecord {
  const updatedSignoffs = baseAdr.complianceSignoffs.map((s) => {
    const override = adrSignoffOverrides[s.role];
    const approved = override !== undefined ? override : s.approved;
    return {
      ...s,
      approved,
      signee: approved ? 'Marked approved in VoiceArchitect review' : s.signee,
      timestamp: approved ? s.timestamp || new Date().toISOString() : undefined,
    };
  });
  return {
    ...baseAdr,
    status: updatedSignoffs.every((s) => s.approved) ? 'ACCEPTED' : 'PROPOSED',
    complianceSignoffs: updatedSignoffs,
  };
}

/**
 * Where an arrow key or Escape moves the selection from nodeId: arrows follow the selection's
 * downstream or upstream neighbors first, then draw order; Escape clears it (null).
 * Undefined means the key does not navigate (or nodeId is not drawn), so the caller ignores it.
 */
export function getKeyboardTarget(
  key: string,
  nodeId: string,
  activeComponents: Component[],
  neighborhood: DiagramNeighborhood,
): string | null | undefined {
  const current = activeComponents.find((c) => c.id === nodeId);
  if (!current) return undefined;

  let nextId: string | null = null;
  const currentIndex = activeComponents.findIndex((c) => c.id === nodeId);

  switch (key) {
    case 'ArrowRight':
      // Navigate to downstream
      if (neighborhood.downstreamIds.size > 0) {
        const downstream = Array.from(neighborhood.downstreamIds);
        nextId = downstream[0] ?? null;
      } else if (currentIndex < activeComponents.length - 1) {
        nextId = activeComponents[currentIndex + 1]?.id ?? null;
      }
      break;
    case 'ArrowLeft':
      // Navigate to upstream
      if (neighborhood.upstreamIds?.size > 0) {
        const upstream = Array.from(neighborhood.upstreamIds);
        nextId = upstream[0] ?? null;
      } else if (currentIndex > 0) {
        nextId = activeComponents[currentIndex - 1]?.id ?? null;
      }
      break;
    case 'ArrowDown':
      // Navigate to next component in list
      if (currentIndex < activeComponents.length - 1) {
        nextId = activeComponents[currentIndex + 1]?.id ?? null;
      }
      break;
    case 'ArrowUp':
      // Navigate to previous component in list
      if (currentIndex > 0) {
        nextId = activeComponents[currentIndex - 1]?.id ?? null;
      }
      break;
    case 'Escape':
      // Clear selection
      nextId = null;
      break;
    default:
      return undefined;
  }

  return nextId;
}
