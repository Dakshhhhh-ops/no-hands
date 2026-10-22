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
export const nodeW = 176,
  nodeH = 70;
/** Gap between columns of the layout; edge labels sit in it, on a chip. */
export const rankGap = 84;
/** Font sizes in diagram units (the CSS uses the same), used to fit text with an ellipsis. */
export const fontUnits = { title: 18, sub: 15.5, type: 15.5, edge: 15.5 };

/** Shortens text with an ellipsis so it fits a width in diagram units; widthPerEm is the font's average glyph width. */
export function fitText(text: string, maxWidth: number, fontSize: number, widthPerEm = 0.56): string {
  const maxChars = Math.max(3, Math.floor(maxWidth / (fontSize * widthPerEm)));
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}
