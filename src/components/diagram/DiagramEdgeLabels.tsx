import type { Component, Relationship } from '../../types/schema.ts';
import { connectorPoints, fitText, fontUnits, nodeW } from './diagramTypes.ts';
import type { FlowDirection } from './diagramTypes.ts';
import { relationshipKey } from '../../data/diagram.ts';
import type { ChaosSimulationResult } from '../../data/chaosSimulator.ts';

export interface DiagramEdgeLabelsProps {
  relationships: Relationship[];
  byId: Map<string, Component>;
  telemetry: ChaosSimulationResult;
  direction: FlowDirection;
}

const PAD_X = 7;
const CHIP_H = fontUnits.edge + 9;
const GLYPH = 0.52;

/**
 * Connector labels, drawn after the nodes on a background chip at each connector's midpoint, so a
 * node never covers them. Top to bottom, labels sit between rows and have a node's width of room;
 * left to right, a label wider than the gap between columns ends in an ellipsis. The full text is
 * always in a title.
 */
export default function DiagramEdgeLabels({ relationships, byId, telemetry, direction }: DiagramEdgeLabelsProps) {
  return (
    <g className="edge-labels">
      {relationships.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to || !edge.label) return null;
        const { x1, x2, labelX, labelY } = connectorPoints(from, to, direction);
        const severed = telemetry.edgeMetrics.get(`${edge.from}->${edge.to}`)?.status === 'SEVERED';
        const full = severed ? `SEVERED: ${edge.label}` : edge.label;
        const room = direction === 'TB' ? nodeW : Math.max(56, Math.abs(x2 - x1) - 8);
        const text = fitText(full, room - PAD_X * 2, fontUnits.edge, GLYPH);
        const width = Math.min(room, text.length * fontUnits.edge * GLYPH + PAD_X * 2);
        return (
          <g key={relationshipKey(edge)} className={`edge-chip${severed ? ' severed' : ''}`}>
            <title>{full}</title>
            <rect x={labelX - width / 2} y={labelY - CHIP_H / 2} width={width} height={CHIP_H} rx={6} />
            <text className="edge-label" x={labelX} y={labelY + fontUnits.edge * 0.35} textAnchor="middle">{text}</text>
          </g>
        );
      })}
    </g>
  );
}
