import type { Component, Relationship } from '../../types/schema.ts';
import { fitText, fontUnits, nodeH, nodeW } from './diagramTypes.ts';
import { relationshipKey } from '../../data/diagram.ts';
import type { ChaosSimulationResult } from '../../data/chaosSimulator.ts';

export interface DiagramEdgeLabelsProps {
  relationships: Relationship[];
  byId: Map<string, Component>;
  telemetry: ChaosSimulationResult;
}

const PAD_X = 6;
const CHIP_H = fontUnits.edge + 8;

/**
 * Connector labels, drawn after the nodes on a background chip at each connector's midpoint, so a
 * node never covers them. A label wider than the gap between the two components ends in an ellipsis;
 * the full text is in a title.
 */
export default function DiagramEdgeLabels({ relationships, byId, telemetry }: DiagramEdgeLabelsProps) {
  return (
    <g className="edge-labels">
      {relationships.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to || !edge.label) return null;
        const x1 = from.x + nodeW;
        const x2 = to.x;
        const mid = (x1 + x2) / 2;
        const midY = (from.y + to.y) / 2 + nodeH / 2;
        const severed = telemetry.edgeMetrics.get(`${edge.from}->${edge.to}`)?.status === 'SEVERED';
        const full = severed ? `SEVERED: ${edge.label}` : edge.label;
        const room = Math.max(56, Math.abs(x2 - x1) - 8);
        const text = fitText(full, room - PAD_X * 2, fontUnits.edge, 0.5);
        const width = Math.min(room, text.length * fontUnits.edge * 0.52 + PAD_X * 2);
        return (
          <g key={relationshipKey(edge)} className={`edge-chip${severed ? ' severed' : ''}`}>
            <title>{full}</title>
            <rect x={mid - width / 2} y={midY - CHIP_H / 2} width={width} height={CHIP_H} rx={CHIP_H / 2} />
            <text className="edge-label" x={mid} y={midY + fontUnits.edge * 0.35} textAnchor="middle">{text}</text>
          </g>
        );
      })}
    </g>
  );
}
