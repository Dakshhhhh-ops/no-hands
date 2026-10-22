import { relationshipKey } from '../../data/diagram.ts';
import type { DiagramNeighborhood } from '../../data/diagram.ts';
import type { ChaosSimulationResult } from '../../data/chaosSimulator.ts';
import type { Component, Relationship } from '../../types/schema.ts';
import { connectorPoints } from './diagramTypes.ts';
import type { FlowDirection, ViewMode } from './diagramTypes.ts';

export interface DiagramEdgesProps {
  relationships: Relationship[];
  /** Laid-out components by id; a connector is drawn only when both ends are present. */
  byId: Map<string, Component>;
  neighborhood: DiagramNeighborhood;
  selectedId: string | null;
  selected: Component | undefined;
  viewMode: ViewMode;
  telemetry: ChaosSimulationResult;
  direction: FlowDirection;
  /** Traffic dots run along the connectors only while the outage simulator is open. */
  animate: boolean;
}

export default function DiagramEdges({
  relationships,
  byId,
  neighborhood,
  selectedId,
  selected,
  viewMode,
  telemetry,
  direction,
  animate,
}: DiagramEdgesProps) {
  return (
    <>
      {relationships.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const { path } = connectorPoints(from, to, direction);

        const isDirect = neighborhood.directRelationships.has(relationshipKey(edge));
        const isDownstream =
          neighborhood.downstreamIds.has(edge.to) &&
          (neighborhood.downstreamIds.has(edge.from) || neighborhood.directIds.has(edge.from));
        const isUpstream =
          neighborhood.upstreamIds?.has(edge.from) &&
          (neighborhood.upstreamIds?.has(edge.to) || edge.to === selectedId);
        const isChanged = viewMode === 'current' && Boolean(edge.sourceChangeId);
        const dimmed = selected && !isDirect && !isDownstream && !isUpstream;

        const edgeMetric = telemetry.edgeMetrics.get(`${edge.from}->${edge.to}`);
        const isSevered = edgeMetric?.status === 'SEVERED';
        // A connection touching a degraded component carries congested traffic.
        const isCongested = edgeMetric?.status === 'DEGRADED';
        const speed = edgeMetric?.particleSpeedSeconds || 2.4;

        const marker = isSevered
          ? undefined
          : isChanged
            ? 'url(#arrow-changed)'
            : isDirect
              ? 'url(#arrow-direct)'
              : isDownstream
                ? 'url(#arrow-downstream)'
                : isUpstream
                  ? 'url(#arrow-upstream)'
                  : 'url(#arrow)';

        return (
          <g
            key={relationshipKey(edge)}
            className={`diagram-relationship ${isDirect ? 'direct' : ''} ${isDownstream ? 'downstream' : ''} ${isUpstream ? 'upstream' : ''} ${dimmed ? 'dimmed' : ''}`}
          >
            <path
              className={`edge ${isChanged ? 'changed' : ''} ${isSevered ? 'severed' : ''} ${isCongested ? 'congested' : ''}`}
              d={path}
              style={{ markerEnd: marker }}
            />
            {animate && !isSevered && (
              <circle r="3.5" fill="url(#particle-glow)" className="pulse-photon">
                <animateMotion path={path} dur={`${speed}s`} repeatCount="indefinite" />
              </circle>
            )}
          </g>
        );
      })}
    </>
  );
}
