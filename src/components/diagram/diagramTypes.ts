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

/** Connector labels: the widest a chip gets, its padding and height, and the label font's glyph width. */
const LABEL_MAX_W = 168;
const LABEL_PAD_X = 8;
export const LABEL_CHIP_H = fontUnits.edge + 10;
const LABEL_GLYPH = 0.52;

/** The text a connector label shows (shortened with an ellipsis past LABEL_MAX_W) and its chip size. */
export function edgeLabelBox(label: string): { text: string; width: number; height: number } {
  const text = fitText(label, LABEL_MAX_W - LABEL_PAD_X * 2, fontUnits.edge, LABEL_GLYPH);
  const width = Math.min(LABEL_MAX_W, Math.ceil(text.length * fontUnits.edge * LABEL_GLYPH + LABEL_PAD_X * 2));
  return { text, width, height: LABEL_CHIP_H };
}

/**
 * A connector drawn along the layout's route: it leaves the side of one component facing the flow,
 * passes through each bend (its label among them) with the curve running along the flow, and
 * ends at the arrowhead on the next component. Without a route it falls back to a direct curve.
 */
export function routedConnector(
  from: Pick<Component, 'x' | 'y'>,
  to: Pick<Component, 'x' | 'y'>,
  direction: FlowDirection,
  route: { points: { x: number; y: number }[]; label: { x: number; y: number } | null } | undefined,
): { path: string; labelX: number; labelY: number } {
  const direct = connectorPoints(from, to, direction);
  // A route that runs backward (a cycle) or has no bends is drawn as the direct curve.
  const forward = direction === 'TB' ? to.y > from.y : to.x > from.x;
  const bends = route && forward ? route.points.slice(1, -1) : [];
  if (bends.length === 0) {
    return { path: direct.path, labelX: route?.label?.x ?? direct.labelX, labelY: route?.label?.y ?? direct.labelY };
  }
  const end = direction === 'TB' ? { x: direct.x2, y: direct.y2 - 7 } : { x: direct.x2 - 7, y: direct.y2 };
  const points = [{ x: direct.x1, y: direct.y1 }, ...bends, end];
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (direction === 'TB') {
      const mid = (a.y + b.y) / 2;
      path += ` C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y}`;
    } else {
      const mid = (a.x + b.x) / 2;
      path += ` C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
    }
  }
  const label = route?.label ?? points[Math.floor(points.length / 2)]!;
  return { path, labelX: label.x, labelY: label.y };
}
