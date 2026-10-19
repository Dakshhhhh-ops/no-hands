export default function ArchitectureDiagram({ project }) {
  const byId = new Map(project.components.map((item) => [item.id, item]));
  const width = 1000, height = 390, nodeW = 144, nodeH = 58;
  return (
    <div className="diagram-canvas">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${project.name} architecture diagram`}>
        <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#71839b" /></marker></defs>
        {project.relationships.map((edge, index) => {
          const from = byId.get(edge.from), to = byId.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + nodeW, y1 = from.y + nodeH / 2, x2 = to.x, y2 = to.y + nodeH / 2, mid = (x1 + x2) / 2;
          const changed = project.changed && edge.from === 'auth' && edge.to === 'redis';
          return <g key={`${edge.from}-${edge.to}-${index}`}>
            <path className={`edge ${changed ? 'changed' : ''}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 7} ${y2}`} />
            <text className="edge-label" x={mid} y={(y1 + y2) / 2 - 5} textAnchor="middle">{edge.label}</text>
          </g>;
        })}
        {project.components.map((node) => <g className={`node ${project.changed && node.id === 'auth' ? 'changed' : ''}`} transform={`translate(${node.x},${node.y})`} key={node.id}>
          <rect width={nodeW} height={nodeH} rx="8" /><text className="node-type" x="11" y="17">{node.type}</text><text x="11" y="34">{node.name}</text><text className="node-sub" x="11" y="49">{node.sub}</text>
        </g>)}
      </svg>
      <div className="legend"><span><i /> Service / updated</span><span>→ Data or request flow</span></div>
    </div>
  );
}
