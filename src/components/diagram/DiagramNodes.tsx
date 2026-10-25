import type { KeyboardEvent, MouseEvent } from 'react';
import type { DiagramNeighborhood } from '../../data/diagram.ts';
import type { ChaosSimulationResult } from '../../data/chaosSimulator.ts';
import type { Component } from '../../types/schema.ts';
import { fitText, fontUnits, nodeW, nodeH } from './diagramTypes.ts';
import type { ViewMode } from './diagramTypes.ts';

export interface DiagramNodesProps {
  /** Components in draw order, positioned by the active layout engine. */
  activeComponents: Component[];
  neighborhood: DiagramNeighborhood;
  selectedId: string | null;
  selected: Component | undefined;
  viewMode: ViewMode;
  /** The project was imported from code, so a component without origin 'code' is only planned. */
  hasCodeOrigin: boolean;
  telemetry: ChaosSimulationResult;
  selectNode: (event: MouseEvent<SVGGElement> | KeyboardEvent<SVGGElement>, nodeId: string) => void;
  handleNodeKeyDown: (event: KeyboardEvent<SVGGElement>, nodeId: string) => void;
  /** Components added by the change just applied; they glow for a moment, marked "Added". */
  freshIds: ReadonlySet<string>;
}

/**
 * Each component is one card: a coloured dot and a quiet label for its type, the name, and
 * what it does. Selection, change, impact, plans, and simulated outages show in the border.
 */
export default function DiagramNodes({
  activeComponents,
  neighborhood,
  selectedId,
  selected,
  viewMode,
  hasCodeOrigin,
  telemetry,
  selectNode,
  handleNodeKeyDown,
  freshIds,
}: DiagramNodesProps) {
  return (
    <>
      {activeComponents.map((node) => {
        const isSelected = selectedId === node.id;
        const isDirect = neighborhood.directIds.has(node.id);
        const isDownstream = neighborhood.downstreamIds.has(node.id);
        const isUpstream = neighborhood.upstreamIds?.has(node.id);
        // Changed means an applied change created or edited it; that change is recorded on the node.
        const isChanged = viewMode === 'current' && Boolean(node.sourceChangeId);
        const isPlanned = hasCodeOrigin && node.origin !== 'code';
        const dimmed = selected && !isSelected && !isDirect && !isDownstream && !isUpstream;
        const description = (node.responsibilities || [node.sub]).join(' ');
        const status = telemetry.nodeMetrics.get(node.id)?.status;
        const isDown = status === 'DOWN';
        const isDegraded = status === 'DEGRADED';
        const isFresh = freshIds.has(node.id);
        const classes = [
          'node', `type-${node.type.toLowerCase()}`,
          isChanged && 'changed', isSelected && 'selected', isDirect && 'direct', isDownstream && 'downstream',
          isUpstream && 'upstream', isDown && 'node-down', isDegraded && 'node-degraded', isPlanned && 'planned',
          dimmed && 'dimmed', isFresh && 'fresh', 'node-enter',
        ].filter(Boolean).join(' ');

        return (
          <g
            className={classes}
            transform={`translate(${node.x},${node.y})`}
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={node.name + ', ' + node.type + (isPlanned ? ', planned, not in code yet' : '') + '. ' + description}
            aria-pressed={isSelected}
            onClick={(event) => selectNode(event, node.id)}
            onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
          >
            {isFresh && <rect className="node-fresh-ring" x={-6} y={-6} width={nodeW + 12} height={nodeH + 12} rx={15} />}
            {isSelected && <rect className="node-ring" x={-5} y={-5} width={nodeW + 10} height={nodeH + 10} rx={14} />}
            <rect className="node-box" width={nodeW} height={nodeH} rx={10} />
            <circle className="node-dot" cx={17} cy={19} r={4.5} />
            <text className="node-type" x={28} y={23.5}>
              {node.type}{isPlanned ? ' · PLANNED' : ''}
            </text>
            {isFresh && !isPlanned && !isDown && !isDegraded && (
              <text className="node-fresh-tag" x={nodeW - 12} y={23.5} textAnchor="end">ADDED</text>
            )}
            {(isDown || isDegraded) && (
              <text className="node-status" x={nodeW - 12} y={23.5} textAnchor="end">{isDown ? 'DOWN' : 'SLOW'}</text>
            )}
            {/* Long names and subtitles end in an ellipsis; the full text is in a title and in the inspector. */}
            <text className="node-title" x={14} y={47}>
              <title>{node.name}</title>
              {fitText(node.name, nodeW - 28, fontUnits.title, 0.5)}
            </text>
            <text className="node-sub" x={14} y={65}>
              <title>{node.sub}</title>
              {fitText(node.sub, nodeW - 28, fontUnits.sub, 0.47)}
            </text>
          </g>
        );
      })}
    </>
  );
}
