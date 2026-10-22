import { relationshipKey } from '../../data/diagram.ts';
import type { DiagramNeighborhood } from '../../data/diagram.ts';
import type { ChaosSimulationResult } from '../../data/chaosSimulator.ts';
import type { Component, Relationship } from '../../types/schema.ts';
import { nodeW, nodeH } from './diagramTypes.ts';
import type { ViewMode } from './diagramTypes.ts';

export interface DiagramEdgesProps {
  relationships: Relationship[];
  /** Laid-out components by id; a connector is drawn only when both ends are present. */
  byId: Map<string, Component>;
  neighborhood: DiagramNeighborhood;
  selectedId: string | null;
  selected: Component | undefined;
  viewMode: ViewMode;
  telemetry: ChaosSimulationResult;
}

export default function DiagramEdges({
  relationships,
  byId,
  neighborhood,
  selectedId,
  selected,
  viewMode,
  telemetry,
}: DiagramEdgesProps) {
  return (
    <>
      {relationships.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const x1 = from.x + nodeW;
        const y1 = from.y + nodeH / 2;
        const x2 = to.x;
        const y2 = to.y + nodeH / 2;
        const mid = (x1 + x2) / 2;

        const isDirect = neighborhood.directRelationships.has(relationshipKey(edge));
        const isDownstream =
          neighborhood.downstreamIds.has(edge.to) &&
          (neighborhood.downstreamIds.has(edge.from) || neighborhood.directIds.has(edge.from));
        const isUpstream =
          neighborhood.upstreamIds?.has(edge.from) &&
          (neighborhood.upstreamIds?.has(edge.to) || edge.to === selectedId);
        const isChanged =
          viewMode === 'current' && Boolean(edge.sourceChangeId);
        const dimmed = selected && !isDirect && !isDownstream && !isUpstream;

        const edgeKey = `${edge.from}->${edge.to}`;
        const edgeMetric = telemetry.edgeMetrics.get(edgeKey);
        const isSevered = edgeMetric?.status === 'SEVERED';
        // A connection touching a degraded component carries congested traffic.
        const isCongested = edgeMetric?.status === 'DEGRADED';
        const particleSpeed = edgeMetric?.particleSpeedSeconds || 2.4;
        const particleDensity = edgeMetric?.particleDensity || 1;

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

        const pathD = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 7} ${y2}`;

        // Determine edge gradient based on state
        let edgeGradient = 'url(#edge-gradient-base)';
        let edgeFilter = 'none';
        if (isSevered) {
          edgeGradient = 'url(#edge-gradient-severed)';
          edgeFilter = 'url(#glow-danger)';
        } else if (isChanged) {
          edgeGradient = 'url(#edge-gradient-changed)';
          edgeFilter = 'url(#glow-accent)';
        } else if (isDirect) {
          edgeGradient = 'url(#edge-gradient-direct)';
          edgeFilter = 'url(#glow-accent)';
        } else if (isDownstream) {
          edgeGradient = 'url(#edge-gradient-downstream)';
        } else if (isUpstream) {
          edgeGradient = 'url(#edge-gradient-upstream)';
        }

        return (
          <g
            key={relationshipKey(edge)}
            className={`diagram-relationship ${isDirect ? 'direct' : ''} ${isDownstream ? 'downstream' : ''} ${isUpstream ? 'upstream' : ''} ${dimmed ? 'dimmed' : ''}`}
          >
            {/* Edge glow background */}
            <path
              d={pathD}
              stroke={edgeGradient}
              strokeWidth={isSevered ? 2.5 : isDirect || isChanged ? 3 : 2}
              fill="none"
              style={{ filter: edgeFilter, markerEnd: marker }}
              className={`edge-glow ${isChanged ? 'changed' : ''} ${isSevered ? 'severed' : ''} ${isCongested ? 'congested' : ''}`}
            />
            {/* Main edge path */}
            <path
              className={`edge ${isChanged ? 'changed' : ''} ${isSevered ? 'severed' : ''} ${isCongested ? 'congested' : ''}`}
              d={pathD}
              style={{ markerEnd: marker }}
            />
            {/* Dynamic Animated Edge Traffic Particles with glow */}
            {!isSevered && (
              <>
                <circle r="3.5" fill="url(#particle-glow)" className="pulse-photon">
                  <animateMotion
                    path={pathD}
                    dur={`${particleSpeed}s`}
                    repeatCount="indefinite"
                  />
                </circle>
                {particleDensity >= 2 && (
                  <circle r="2.8" fill="url(#particle-glow)" opacity="0.85" className="pulse-photon">
                    <animateMotion
                      path={pathD}
                      dur={`${particleSpeed}s`}
                      begin={`${(particleSpeed / 2).toFixed(2)}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                {particleDensity >= 3 && (
                  <circle r="2.2" fill="url(#particle-glow)" opacity="0.7" className="pulse-photon">
                    <animateMotion
                      path={pathD}
                      dur={`${particleSpeed}s`}
                      begin={`${(particleSpeed / 3).toFixed(2)}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                {/* Downstream/Upstream colored particles */}
                {isDownstream && (
                  <>
                    <circle r="3" fill="url(#particle-glow-downstream)" className="pulse-photon">
                      <animateMotion
                        path={pathD}
                        dur={`${particleSpeed}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                )}
                {isUpstream && (
                  <>
                    <circle r="3" fill="url(#particle-glow-upstream)" className="pulse-photon">
                      <animateMotion
                        path={pathD}
                        dur={`${particleSpeed}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                )}
              </>
            )}
            <text className="edge-label" x={mid} y={(y1 + y2) / 2 - 5} textAnchor="middle">
              {isSevered ? `⚠️ SEVERED: ${edge.label}` : edge.label}
            </text>
          </g>
        );
      })}
    </>
  );
}
