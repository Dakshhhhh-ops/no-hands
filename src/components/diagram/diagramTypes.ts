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
export const nodeW = 208,
  nodeH = 80;
/** Which way the layout flows: left to right, or top to bottom when that fits the canvas better. */
export type FlowDirection = 'LR' | 'TB';
/** Gap between columns of the layout; edge labels sit in it, on a chip. */
export const rankGap = 120;
/** Font sizes in diagram units (the CSS uses the same), used to fit text with an ellipsis. */
export const fontUnits = { title: 18, sub: 15, type: 13, edge: 15 };

/** Shortens text with an ellipsis so it fits a width in diagram units; widthPerEm is the font's average glyph width. */
export function fitText(text: string, maxWidth: number, fontSize: number, widthPerEm = 0.56): string {
  const maxChars = Math.max(3, Math.floor(maxWidth / (fontSize * widthPerEm)));
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Where a connector leaves one component and enters the next, for either flow direction. */
export function connectorPoints(from: Pick<Component, 'x' | 'y'>, to: Pick<Component, 'x' | 'y'>, direction: FlowDirection) {
  if (direction === 'TB') {
    const x1 = from.x + nodeW / 2;
    const y1 = from.y + nodeH;
    const x2 = to.x + nodeW / 2;
    const y2 = to.y;
    const mid = (y1 + y2) / 2;
    return { x1, y1, x2, y2, labelX: (x1 + x2) / 2, labelY: mid, path: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2 - 7}` };
  }
  const x1 = from.x + nodeW;
  const y1 = from.y + nodeH / 2;
  const x2 = to.x;
  const y2 = to.y + nodeH / 2;
  const mid = (x1 + x2) / 2;
  return { x1, y1, x2, y2, labelX: mid, labelY: (y1 + y2) / 2, path: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 7} ${y2}` };
}
