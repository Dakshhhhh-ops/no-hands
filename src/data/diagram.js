export const relationshipKey = (relationship) => `${relationship.from}->${relationship.to}:${relationship.label}`;

export function getDiagramNeighborhood(components, relationships, selectedId) {
  const componentIds = new Set(components.map((component) => component.id));
  const directIds = new Set();
  const directRelationships = new Set();
  const downstreamIds = new Set();

  if (!componentIds.has(selectedId)) return { directIds, directRelationships, downstreamIds };

  for (const relationship of relationships) {
    if (relationship.from === selectedId || relationship.to === selectedId) {
      directRelationships.add(relationshipKey(relationship));
      if (componentIds.has(relationship.from)) directIds.add(relationship.from);
      if (componentIds.has(relationship.to)) directIds.add(relationship.to);
    }
  }
  directIds.delete(selectedId);

  const visited = new Set([selectedId]);
  const queue = [selectedId];
  while (queue.length) {
    const sourceId = queue.shift();
    for (const relationship of relationships) {
      if (relationship.from !== sourceId || !componentIds.has(relationship.to) || visited.has(relationship.to)) continue;
      visited.add(relationship.to);
      downstreamIds.add(relationship.to);
      queue.push(relationship.to);
    }
  }
  for (const directId of directIds) downstreamIds.delete(directId);
  return { directIds, directRelationships, downstreamIds };
}
