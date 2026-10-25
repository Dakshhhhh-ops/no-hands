import type { Component, Relationship } from '../../types/schema.ts';
import { edgeLabelBox, fontUnits, routedConnector } from './diagramTypes.ts';
import type { FlowDirection } from './diagramTypes.ts';
import { relationshipKey } from '../../data/diagram.ts';
import type { ChaosSimulationResult } from '../../data/chaosSimulator.ts';
import type { EdgeRoute } from '../../data/graphLayout.ts';

export interface DiagramEdgeLabelsProps {
  relationships: Relationship[];
  byId: Map<string, Component>;
  telemetry: ChaosSimulationResult;
  direction: FlowDirection;
  /** The layout's routes by relationship key; each label sits where its route left room for it. */
  routes: Record<string, EdgeRoute>;
  /** Relationship keys added by the change just applied; their chips glow for a moment. */
  freshKeys: ReadonlySet<string>;
}

/**
 * Connector labels, drawn after the nodes on a background chip at the spot the layout reserved
 * for each, so a label never covers a node or another label. A label longer than a chip ends in
 * an ellipsis; the full text is always in a title.
 */
export default function DiagramEdgeLabels({ relationships, byId, telemetry, direction, routes, freshKeys }: DiagramEdgeLabelsProps) {
  return (
    <g className="edge-labels">
      {relationships.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to || !edge.label) return null;
        const key = relationshipKey(edge);
        const { labelX, labelY } = routedConnector(from, to, direction, routes[key]);
        const severed = telemetry.edgeMetrics.get(`${edge.from}->${edge.to}`)?.status === 'SEVERED';
        const full = severed ? `SEVERED: ${edge.label}` : edge.label;
        const { text, width, height } = edgeLabelBox(full);
        return (
          <g key={key} className={`edge-chip${severed ? ' severed' : ''}${freshKeys.has(key) ? ' fresh' : ''}`}>
            <title>{full}</title>
            <rect x={labelX - width / 2} y={labelY - height / 2} width={width} height={height} rx={6} />
            <text className="edge-label" x={labelX} y={labelY + fontUnits.edge * 0.35} textAnchor="middle">{text}</text>
          </g>
        );
      })}
    </g>
  );
}
