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
  /**
   * The drawn size of a relationship's label, or null for none. With it, the layout leaves room
   * for every label and routes each connector through its label, so labels never sit on a node
   * or on each other.
   */
  edgeLabelSize?: (relationship: Relationship) => { width: number; height: number } | null;
}

/** A connector's route: the bends between its two ends, and where its label sits. */
export interface EdgeRoute {
  points: { x: number; y: number }[];
  label: { x: number; y: number } | null;
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
  /** Routes by `${from}->${to}:${label}`, the same key as relationshipKey in diagram.ts. */
  edges: Record<string, EdgeRoute>;
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
    edgeLabelSize,
  } = options;

  if (components.length === 0) {
    return { components: [], width: 1000, height: 390, direction, edges: {} };
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
      const size = edgeLabelSize?.(rel) ?? null;
      g.setEdge(rel.from, rel.to, size ? { ...size, labelpos: 'c' } : {}, `rel-${index}`);
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

  // Connector bends and labels can reach past the nodes, so they count toward the bounds too.
  const rawEdges: { key: string; points: { x: number; y: number }[]; label: { x: number; y: number; width: number; height: number } | null }[] = [];
  relationships.forEach((rel, index) => {
    if (!componentIdSet.has(rel.from) || !componentIdSet.has(rel.to)) return;
    const edge = g.edge({ v: rel.from, w: rel.to, name: `rel-${index}` }) as
      | { points?: { x: number; y: number }[]; x?: number; y?: number; width?: number; height?: number }
      | undefined;
    if (!edge) return;
    const points = edge.points ?? [];
    const label = typeof edge.x === 'number' && typeof edge.y === 'number' && edge.width
      ? { x: edge.x, y: edge.y, width: edge.width, height: edge.height ?? 0 }
      : null;
    for (const point of points) {
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    }
    if (label) {
      minX = Math.min(minX, label.x - label.width / 2); maxX = Math.max(maxX, label.x + label.width / 2);
      minY = Math.min(minY, label.y - label.height / 2); maxY = Math.max(maxY, label.y + label.height / 2);
    }
    rawEdges.push({ key: `${rel.from}->${rel.to}:${rel.label}`, points, label });
  });

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

  const edges: Record<string, EdgeRoute> = {};
  for (const edge of rawEdges) {
    edges[edge.key] = {
      points: edge.points.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY })),
      label: edge.label ? { x: edge.label.x + offsetX, y: edge.label.y + offsetY } : null,
    };
  }

  const totalWidth = Math.max(1000, maxX + offsetX + marginX);
  const totalHeight = Math.max(390, maxY + offsetY + marginY);

  return {
    components: positionedComponents,
    width: totalWidth,
    height: totalHeight,
    direction,
    edges,
  };
}

