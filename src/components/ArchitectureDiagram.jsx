import { useMemo, useState } from 'react';
import { getDiagramNeighborhood, relationshipKey } from '../data/diagram.js';
import { Compass, Eye, Filter, Grid, Layers, Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { sound } from '../utils/sound.js';

export default function ArchitectureDiagram({ project }) {
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('current');
  const [zoom, setZoom] = useState(1);
  const [gridStyle, setGridStyle] = useState('blueprint'); // blueprint, dots, clean

  const model = viewMode === 'baseline' && project.baseline ? project.baseline : project;
  const byId = new Map(model.components.map((item) => [item.id, item]));
  const width = 1000, height = 390, nodeW = 144, nodeH = 58;

  const neighborhood = useMemo(
    () => getDiagramNeighborhood(model.components, model.relationships, selectedId),
    [model.components, model.relationships, selectedId],
  );
  const selected = byId.get(selectedId);
  const connectedRelationships = selected
    ? model.relationships.filter((item) => item.from === selected.id || item.to === selected.id)
    : [];
  const downstream = selected
    ? model.components.filter((item) => neighborhood.downstreamIds.has(item.id))
    : [];

  function selectNode(event, nodeId) {
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event.type === 'keydown') event.preventDefault();
    sound.click();
    setSelectedId((current) => (current === nodeId ? null : nodeId));
  }

  function handleModeChange(mode) {
    sound.tab();
    setViewMode(mode);
  }

  function handleZoom(delta) {
    sound.click();
    setZoom((z) => Math.min(1.4, Math.max(0.7, +(z + delta).toFixed(1))));
  }

  function resetZoom() {
    sound.click();
    setZoom(1);
  }

  return (
    <section className="architecture-view" aria-label="Interactive architecture diagram">
      <div className="diagram-toolbar">
        <div className="diagram-toolbar-title-wrap">
          <div className="diagram-status-badge">
            <span className="diagram-status-dot" />
            <b>{viewMode === 'baseline' ? '[BASELINE_ARCHITECTURE]' : '[CURRENT_SYNTHESIS]'}</b>
          </div>
          <span>
            {viewMode === 'baseline'
              ? `Model v${model.version} · original sample snapshot`
              : `Model v${model.version}${project.changed ? ' · reviewed changes applied to graph' : ' · baseline loaded'}`}
          </span>
        </div>

        <div className="diagram-actions-cluster">
          {/* Grid Style Toggle */}
          <div className="diagram-grid-toggle" title="Toggle Canvas Grid Style">
            <button
              type="button"
              className={gridStyle === 'blueprint' ? 'active' : ''}
              onClick={() => { sound.click(); setGridStyle('blueprint'); }}
              title="Blueprint Grid"
            >
              Grid
            </button>
            <button
              type="button"
              className={gridStyle === 'dots' ? 'active' : ''}
              onClick={() => { sound.click(); setGridStyle('dots'); }}
              title="Matrix Dots"
            >
              Dots
            </button>
            <button
              type="button"
              className={gridStyle === 'clean' ? 'active' : ''}
              onClick={() => { sound.click(); setGridStyle('clean'); }}
              title="Minimalist Clean"
            >
              Clear
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="diagram-zoom-controls">
            <button type="button" onClick={() => handleZoom(-0.1)} title="Zoom Out" aria-label="Zoom Out">
              <ZoomOut size={13} />
            </button>
            <button type="button" onClick={resetZoom} title="Reset Zoom (100%)" className="zoom-value">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => handleZoom(0.1)} title="Zoom In" aria-label="Zoom In">
              <ZoomIn size={13} />
            </button>
          </div>

          {/* Baseline vs Current Toggle */}
          <div className="diagram-view-toggle" role="group" aria-label="Diagram version">
            <button
              type="button"
              className={viewMode === 'baseline' ? 'active' : ''}
              aria-pressed={viewMode === 'baseline'}
              disabled={!project.changed}
              onClick={() => handleModeChange('baseline')}
            >
              Baseline
            </button>
            <button
              type="button"
              className={viewMode === 'current' ? 'active' : ''}
              aria-pressed={viewMode === 'current'}
              onClick={() => handleModeChange('current')}
            >
              Current (v{project.version})
            </button>
          </div>
        </div>
      </div>

      <div className={`diagram-canvas grid-style-${gridStyle}`}>
        {/* Architectural Crosshair Corner Markers (Beintech style) */}
        <div className="blueprint-crosshair top-left" aria-hidden="true">+</div>
        <div className="blueprint-crosshair top-right" aria-hidden="true">+</div>
        <div className="blueprint-crosshair bottom-left" aria-hidden="true">+</div>
        <div className="blueprint-crosshair bottom-right" aria-hidden="true">+</div>
        <div className="blueprint-coord-tag top" aria-hidden="true">[COORD // 1000 × 390 PX]</div>
        <div className="blueprint-coord-tag bottom" aria-hidden="true">[SCALE // 1:1 VECTOR GRAPH]</div>

        <div className="diagram-svg-wrapper" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s ease-out' }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-label={`${model.name} architecture diagram. Select a component to inspect it and highlight its relationships.`}
          >
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="#52647c" />
              </marker>
              <marker id="arrow-changed" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="#4ef2d2" />
              </marker>
              <marker id="arrow-direct" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="#4ef2d2" />
              </marker>
              <marker id="arrow-downstream" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="#b5a2ff" />
              </marker>
              <linearGradient id="edge-laser-glow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4ef2d2" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#7ecad2" stopOpacity="1" />
                <stop offset="100%" stopColor="#4ef2d2" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Architecture Connectors */}
            {model.relationships.map((edge) => {
              const from = byId.get(edge.from), to = byId.get(edge.to);
              if (!from || !to) return null;
              const x1 = from.x + nodeW, y1 = from.y + nodeH / 2, x2 = to.x, y2 = to.y + nodeH / 2, mid = (x1 + x2) / 2;
              const isDirect = neighborhood.directRelationships.has(relationshipKey(edge));
              const isDownstream = neighborhood.downstreamIds.has(edge.to)
                && (neighborhood.downstreamIds.has(edge.from) || neighborhood.directIds.has(edge.from));
              const isChanged = viewMode === 'current' && project.changed && edge.from === 'auth' && edge.to === 'redis';
              const dimmed = selected && !isDirect && !isDownstream;

              const marker = isChanged ? 'url(#arrow-changed)' : isDirect ? 'url(#arrow-direct)' : isDownstream ? 'url(#arrow-downstream)' : 'url(#arrow)';

              return (
                <g
                  key={relationshipKey(edge)}
                  className={`diagram-relationship ${isDirect ? 'direct' : ''} ${isDownstream ? 'downstream' : ''} ${dimmed ? 'dimmed' : ''}`}
                >
                  <path
                    className={`edge ${isChanged ? 'changed' : ''}`}
                    d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 7} ${y2}`}
                    style={{ markerEnd: marker }}
                  />
                  {/* Subtle animated traveling photon particle for active/changed/direct edges */}
                  {(isChanged || isDirect) && (
                    <circle r="2.5" fill="#4ef2d2" className="pulse-photon">
                      <animateMotion
                        path={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 7} ${y2}`}
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                  <text className="edge-label" x={mid} y={(y1 + y2) / 2 - 5} textAnchor="middle">
                    {edge.label}
                  </text>
                </g>
              );
            })}

            {/* Component Nodes */}
            {model.components.map((node) => {
              const isSelected = selectedId === node.id;
              const isDirect = neighborhood.directIds.has(node.id);
              const isDownstream = neighborhood.downstreamIds.has(node.id);
              const isChanged = viewMode === 'current' && project.changed && node.id === 'auth';
              const dimmed = selected && !isSelected && !isDirect && !isDownstream;
              const description = (node.responsibilities || [node.sub]).join(' ');

              return (
                <g
                  className={`node ${isChanged ? 'changed' : ''} ${isSelected ? 'selected' : ''} ${isDirect ? 'direct' : ''} ${isDownstream ? 'downstream' : ''} ${dimmed ? 'dimmed' : ''}`}
                  transform={`translate(${node.x},${node.y})`}
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.name}, ${node.type}. ${description}`}
                  aria-pressed={isSelected}
                  onClick={(event) => selectNode(event, node.id)}
                  onKeyDown={(event) => selectNode(event, node.id)}
                >
                  <title>{node.name}: {description}</title>
                  {/* Outer subtle halo on select */}
                  {isSelected && (
                    <rect
                      x="-3"
                      y="-3"
                      width={nodeW + 6}
                      height={nodeH + 6}
                      rx="11"
                      fill="none"
                      stroke="#4ef2d2"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                      opacity="0.8"
                    />
                  )}
                  <rect width={nodeW} height={nodeH} rx="8" />
                  {/* Type Badge & Identifier */}
                  <text className="node-type" x="11" y="17">
                    {node.type}
                  </text>
                  <text className="node-title" x="11" y="34">
                    {node.name}
                  </text>
                  <text className="node-sub" x="11" y="49">
                    {node.sub}
                  </text>
                  {/* Corner Accent Tick */}
                  <path
                    d={`M ${nodeW - 12} 4 L ${nodeW - 4} 4 L ${nodeW - 4} 12`}
                    fill="none"
                    stroke={isSelected || isChanged ? '#4ef2d2' : '#334155'}
                    strokeWidth="1.2"
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Tactical Diagram Legend */}
        <div className="legend">
          <span className="legend-item"><i className="legend-direct" /> Selected / Direct</span>
          <span className="legend-item"><i className="legend-downstream" /> Downstream impact</span>
          <span className="legend-item"><i className="legend-changed" /> Modified in v{project.version}</span>
          <span className="legend-item legend-flow">→ Data & API flow</span>
        </div>
      </div>

      {/* Component Inspector */}
      {selected ? (
        <section className="component-inspector" aria-live="polite">
          <div className="component-inspector-heading">
            <div>
              <span className="eyebrow">[INSPECTION // {selected.type} · ID: {selected.id}]</span>
              <h3>{selected.name}</h3>
            </div>
            <button
              type="button"
              className="button compact"
              onClick={() => { sound.click(); setSelectedId(null); }}
            >
              Clear selection
            </button>
          </div>

          <div className="component-inspector-grid">
            <div className="inspector-box">
              <div className="inspector-box-header">
                <b>Responsibilities & Bounds</b>
              </div>
              <ul>
                {(selected.responsibilities || [selected.sub]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="inspector-box">
              <div className="inspector-box-header">
                <b>Direct Relationships ({connectedRelationships.length})</b>
              </div>
              {connectedRelationships.length ? (
                <ul>
                  {connectedRelationships.map((relationship) => {
                    const outgoing = relationship.from === selected.id;
                    const otherId = outgoing ? relationship.to : relationship.from;
                    return (
                      <li key={relationshipKey(relationship)}>
                        <span className="arrow-chip">{outgoing ? 'OUT →' : '← IN'}</span>{' '}
                        <b>{byId.get(otherId)?.name || otherId}</b>
                        <small className="rel-label"> · {relationship.label}</small>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>No direct relationships modeled.</p>
              )}
            </div>

            <div className="inspector-box">
              <div className="inspector-box-header">
                <b>Downstream Blast Radius ({downstream.length})</b>
              </div>
              {downstream.length ? (
                <ul>
                  {downstream.map((item) => (
                    <li key={item.id}>
                      <b>{item.name}</b> <small>({item.id})</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No downstream components impacted by this node.</p>
              )}
            </div>
          </div>
        </section>
      ) : (
        <p className="diagram-help">
          <span className="text-cyan">[TIP]</span> Click any component node to inspect responsibilities, direct connections, and transitive blast radius. Use the Baseline toggle above to compare models.
        </p>
      )}
    </section>
  );
}
