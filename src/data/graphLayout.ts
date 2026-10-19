import dagre from 'dagre';
import type { Component, Relationship, ComponentType } from '../types/schema.ts';

export interface LayoutOptions {
  direction?: 'LR' | 'TB' | 'BT' | 'RL';
  nodeWidth?: number;
  nodeHeight?: number;
  rankSeparation?: number;
  nodeSeparation?: number;
  marginX?: number;
  marginY?: number;
}

export interface PositionedComponent extends Component {
  x: number;
  y: number;
}

export interface LayoutResult {
  components: PositionedComponent[];
  width: number;
  height: number;
  direction: 'LR' | 'TB' | 'BT' | 'RL';
}

/**
 * Priority rank tier hint based on architectural role.
 * In a Left-to-Right (LR) flow:
 * CLIENT (Rank 0) -> GATEWAY (Rank 1) -> SERVICE (Rank 2) -> STORAGE/QUEUE (Rank 3) -> EXTERNAL (Rank 4)
 */
const TIER_ORDER: Record<ComponentType, number> = {
  CLIENT: 0,
  GATEWAY: 1,
  SERVICE: 2,
  CACHE: 3,
  DATABASE: 3,
  QUEUE: 3,
  EXTERNAL: 4,
};

/**
 * Computes an automated, collision-free hierarchical layout using Dagre
 * (Sugiyama-style layered graph layout algorithm).
 *
 * Eliminates edge crossing and automatically places nodes based on
 * data flow direction and architectural tiers.
 */
export function computeGraphLayout(
  components: Component[],
  relationships: Relationship[],
  options: LayoutOptions = {}
): LayoutResult {
  const {
    direction = 'LR',
    nodeWidth = 144,
    nodeHeight = 58,
    rankSeparation = 72,
    nodeSeparation = 48,
    marginX = 40,
    marginY = 40,
  } = options;

  if (components.length === 0) {
    return { components: [], width: 1000, height: 390, direction };
  }

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSeparation,
    ranksep: rankSeparation,
    marginx: marginX,
    marginy: marginY,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Register all component nodes with dimension bounds
  for (const component of components) {
    g.setNode(component.id, {
      width: nodeWidth,
      height: nodeHeight,
      tier: TIER_ORDER[component.type] ?? 2,
    });
  }

  // Register all directed relationship edges
  const componentIdSet = new Set(components.map((c) => c.id));
  relationships.forEach((rel, index) => {
    if (componentIdSet.has(rel.from) && componentIdSet.has(rel.to)) {
      g.setEdge(rel.from, rel.to, {}, `rel-${index}`);
    }
  });

  // Execute Sugiyama layout pass
  dagre.layout(g);

  // Extract computed coordinates and map back to components
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const positions = new Map<string, { x: number; y: number }>();

  for (const component of components) {
    const node = g.node(component.id);
    if (node) {
      // Dagre calculates center coordinates (node.x, node.y).
      // We convert to top-left corner coordinates for SVG/HTML rendering:
      const left = Math.round(node.x - nodeWidth / 2);
      const top = Math.round(node.y - nodeHeight / 2);
      positions.set(component.id, { x: left, y: top });

      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, left + nodeWidth);
      maxY = Math.max(maxY, top + nodeHeight);
    } else {
      positions.set(component.id, { x: component.x ?? 0, y: component.y ?? 0 });
    }
  }

  // Normalize coordinates so the canvas starts cleanly at marginX / marginY
  const offsetX = minX < marginX ? marginX - minX : 0;
  const offsetY = minY < marginY ? marginY - minY : 0;

  const positionedComponents: PositionedComponent[] = components.map((component) => {
    const pos = positions.get(component.id) || { x: 0, y: 0 };
    return {
      ...component,
      x: pos.x + offsetX,
      y: pos.y + offsetY,
    };
  });

  const totalWidth = Math.max(1000, maxX + offsetX + marginX);
  const totalHeight = Math.max(390, maxY + offsetY + marginY);

  return {
    components: positionedComponents,
    width: totalWidth,
    height: totalHeight,
    direction,
  };
}

