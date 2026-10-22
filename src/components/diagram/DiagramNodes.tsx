import type { KeyboardEvent, MouseEvent } from 'react';
import type { DiagramNeighborhood } from '../../data/diagram.ts';
import type { ChaosSimulationResult } from '../../data/chaosSimulator.ts';
import type { Component } from '../../types/schema.ts';
import { nodeW, nodeH } from './diagramTypes.ts';
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
}

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

        const nodeMetric = telemetry.nodeMetrics.get(node.id);
        const isDown = nodeMetric?.status === 'DOWN';
        const isDegraded = nodeMetric?.status === 'DEGRADED';

        // Extract template literals to avoid JSX parsing issues
        const nodeTransform = 'translate(' + node.x + ',' + node.y + ')';
        const iconTransform = 'translate(' + (nodeW - 28) + ',' + (nodeH - 28) + ')';
        const nodeFilter = isSelected || isChanged ? 'url(#glow-accent)' : isDown ? 'url(#glow-danger)' : isDegraded ? 'url(#glow-subtle)' : 'url(#depth-shadow)';
        const isDataStore = node.type === 'DATABASE' || node.type === 'CACHE' || node.type === 'QUEUE';

        return (
          <g
            className={`node ${isChanged ? 'changed' : ''} ${isSelected ? 'selected' : ''} ${isDirect ? 'direct' : ''} ${isDownstream ? 'downstream' : ''} ${isUpstream ? 'upstream' : ''} ${isDown ? 'node-down' : isDegraded ? 'node-degraded' : ''} ${dimmed ? 'dimmed' : ''} node-enter`}
            transform={nodeTransform}
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={node.name + ', ' + node.type + (isPlanned ? ', planned, not in code yet' : '') + '. ' + description}
            aria-pressed={isSelected}
            onClick={(event) => selectNode(event, node.id)}
            onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
            style={{ 
              filter: nodeFilter,
              transition: 'filter 0.3s ease-out, transform 0.2s ease-out',
            }}
          >
            <rect x="2" y="2" width={nodeW} height={nodeH} rx="8" opacity="0.15" style={{ fill: '#000' }} />
            
            {/* Selection Ring */}
            {isSelected && (
              <g className="selection-ring">
                <rect
                  x="-4"
                  y="-4"
                  width={nodeW + 8}
                  height={nodeH + 8}
                  rx="12"
                 
                  stroke="var(--va-accent)"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                  opacity="0.9" style={{ fill: 'none' }} />
                <rect
                  x="-6"
                  y="-6"
                  width={nodeW + 12}
                  height={nodeH + 12}
                  rx="14"
                 
                  stroke="var(--va-accent)"
                  strokeWidth="1"
                  opacity="0.3"
                  className="pulse-ring" style={{ fill: 'none' }} />
              </g>
            )}
            
            {/* Changed Indicator Ring */}
            {isChanged && !isSelected && (
              <rect
                x="-2"
                y="-2"
                width={nodeW + 4}
                height={nodeH + 4}
                rx="10"
               
                stroke="var(--va-accent)"
                strokeWidth="1.5"
                strokeDasharray="5 3"
                opacity="0.7"
                className="shimmer" style={{ fill: 'none' }} />
            )}
            
            {/* Node Background with 3D Gradient */}
            <rect 
              width={nodeW} 
              height={nodeH} 
              rx="8" 
             
              style={{ fill: isSelected ? 'url(#node-gradient-selected)' :
                isChanged ? 'url(#node-gradient-changed)' :
                isDown ? 'url(#node-gradient-down)' :
                isDegraded ? 'url(#node-gradient-degraded)' :
                'url(#node-gradient-base)', 
                filter: isDown ? 'url(#glow-danger)' : isDegraded ? 'url(#glow-subtle)' : 'none',
                transition: 'fill 0.3s ease-out',
              }}
            />
            
            {/* Type Pattern Overlay */}
            <rect 
              width={nodeW} 
              height={nodeH} 
              rx="8" 
             
              opacity={0.1} style={{ fill: node.type === 'SERVICE' ? 'url(#pattern-service)' :
                isDataStore ? 'url(#pattern-datastore)' :
                'url(#pattern-external)' }} />
            
            {/* Top Highlight for 3D Effect */}
            <rect 
              x="4" 
              y="4" 
              width={nodeW - 8} 
              height="8" 
              rx="4" 
              
              opacity={isSelected ? 0.2 : isChanged ? 0.15 : 0.08} style={{ fill: 'var(--va-accent)' }} />
            
            {/* Left Highlight for 3D Effect */}
            <rect 
              x="4" 
              y="4" 
              width="4" 
              height={nodeH - 8} 
              rx="2" 
              
              opacity={isSelected ? 0.15 : 0.05} style={{ fill: 'var(--va-accent)' }} />
            
            {isSelected && (
              <rect
                x="-3"
                y="-3"
                width={nodeW + 6}
                height={nodeH + 6}
                rx="11"
               
                stroke="var(--va-accent)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity="0.8" style={{ fill: 'none' }} />
            )}
            
            {isPlanned && (
              <rect
                className="node-planned-outline"
                x="0"
                y="0"
                width={nodeW}
                height={nodeH}
                rx="8"
               
                stroke="var(--va-warn)"
                strokeWidth="1.5"
                strokeDasharray="5 4" style={{ fill: 'none' }} />
            )}
            <text className="node-type" x="11" y="17">
              {node.type}{isPlanned ? ' · PLANNED' : ''}
            </text>
            <text className="node-title" x="11" y="34">
              {node.name}
            </text>
            <text className="node-sub" x="11" y="49">
              {node.sub}
            </text>
            
            {/* 3D Corner Indicator */}
            <path
              d={`M ${nodeW - 12} 4 L ${nodeW - 4} 4 L ${nodeW - 4} 12`}
              fill="none"
              stroke={
                isDown
                  ? 'var(--va-rose)'
                  : isDegraded
                    ? 'var(--va-amber)'
                    : isSelected || isChanged
                      ? 'var(--va-accent)'
                      : isUpstream
                        ? 'var(--va-amber)'
                        : '#334155'
              }
              strokeWidth="1.5"
              style={{ filter: isSelected ? 'drop-shadow(0 0 4px var(--va-accent))' : 'none' }}
            />
  
            {/* Telemetry Status Badge on Node */}
            {nodeMetric && nodeMetric.status !== 'HEALTHY' && (
              <g transform={`translate(${nodeW - 58}, 5)`}>
                <rect
                  width="54"
                  height="13"
                  rx="3"
                 
                  opacity="0.95"
                  style={{ fill: isDown ? 'var(--va-rose)' : 'var(--va-amber)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
                />
                <text
                  x="27"
                  y="9.5"
                  fill="#ffffff"
                  fontSize="8"
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                >
                  {nodeMetric.status}
                </text>
              </g>
            )}
            
            {/* Node Type Icon */}
            <g transform={iconTransform} opacity="0.6">
              {node.type === 'SERVICE' && (
                <>
                  <circle cx="10" cy="10" r="8" fill="var(--va-accent)" opacity="0.2" />
                  <path d="M6,10 L10,6 L14,10 L10,14 Z" fill="var(--va-accent)" opacity="0.8" />
                </>
              )}
              {isDataStore && (
                <>
                  <rect x="2" y="2" width="16" height="16" rx="2" opacity="0.2" style={{ fill: 'var(--va-violet)' }} />
                  <rect x="6" y="6" width="8" height="8" rx="1" opacity="0.8" style={{ fill: 'var(--va-violet)' }} />
                </>
              )}
              {node.type === 'EXTERNAL' && (
                <>
                  <circle cx="10" cy="10" r="8" fill="var(--va-amber)" opacity="0.2" />
                  <path d="M6,10 L14,10 M10,6 L10,14" stroke="var(--va-amber)" strokeWidth="1.5" />
                </>
              )}
            </g>
          </g>
        );
      })}
    </>
  );
}
