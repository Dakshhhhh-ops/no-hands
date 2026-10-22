import type { ChaosTargetType } from '../../data/chaosSimulator.ts';
import type { ArchitectureDecisionRecord } from '../../data/adrWorkflow.ts';
import type { Component } from '../../types/schema.ts';

export type ViewMode = 'current' | 'baseline';
export type GridStyle = 'blueprint' | 'dots' | 'clean';
export type LayoutEngine = 'auto' | 'manual';
export type SignoffRole = ArchitectureDecisionRecord['complianceSignoffs'][number]['role'];

/** An outage simulator button: a component from the loaded model and the fault to inject. */
export interface ChaosTarget {
  component: Component;
  kind: ChaosTargetType;
  label: string;
}

/** Drawn size of a component node; connectors attach to its left and right edges. */
export const nodeW = 144,
  nodeH = 58;
