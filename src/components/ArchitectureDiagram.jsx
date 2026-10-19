import { useMemo, useState } from 'react';
import {
  getDiagramNeighborhood,
  relationshipKey,
  computeGraphLayout,
  getDeploymentPlan,
} from '../data/diagram.js';
import {
  Compass,
  Eye,
  Filter,
  Grid,
  Layers,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  Workflow,
  ListOrdered,
  X,
} from 'lucide-react';
import { sound } from '../utils/sound.js';

export default function ArchitectureDiagram({ project }) {
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('current');
  const [zoom, setZoom] = useState(1);
  const [gridStyle, setGridStyle] = useState('blueprint'); // blueprint, dots, clean
  const [layoutEngine, setLayoutEngine] = useState('auto'); // auto (Dagre) vs manual (fixed coordinates)
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);

  const model = viewMode === 'baseline' && project.baseline ? project.baseline : project;

  // Dynamic Hierarchical Layout (Dagre Sugiyama)
  const autoLayout = useMemo(
    () =>
      computeGraphLayout(model.components, model.relationships, {
        direction: 'LR',
        nodeWidth: 144,
        nodeHeight: 58,
        rankSeparation: 72,
        nodeSeparation: 48,
        marginX: 40,
        marginY: 40,
      }),
    [model.components, model.relationships]
  );

  const activeComponents = layoutEngine === 'auto' ? autoLayout.components : model.components;
  const width = layoutEngine === 'auto' ? autoLayout.width : 1000;
  const height = layoutEngine === 'auto' ? autoLayout.height : 390;
  const nodeW = 144,
    nodeH = 58;

  const byId = useMemo(
    () => new Map(activeComponents.map((item) => [item.id, item])),
    [activeComponents]
  );

  // Enhanced neighborhood with bidirectional traversal and blast radius
  const neighborhood = useMemo(
    () => getDiagramNeighborhood(model.components, model.relationships, selectedId),
    [model.components, model.relationships, selectedId]
  );

  // Topological deployment order sequence
  const deploymentPlan = useMemo(
    () => getDeploymentPlan(model.components, model.relationships),
    [model.components, model.relationships]
  );

  const selected = byId.get(selectedId);
  const connectedRelationships = selected
    ? model.relationships.filter((item) => item.from === selected.id || item.to === selected.id)
    : [];

  // Upstream callers (outage cascade) and downstream dependencies
  const upstream = selected
    ? model.components.filter((item) => neighborhood.upstreamIds?.has(item.id))
    : [];
  const downstream = selected
    ? model.components.filter((item) => neighborhood.downstreamIds.has(item.id))
    : [];

  const depthMatrix = neighborhood.blastRadius?.depthMatrix;

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
          {/* Layout Mode Toggle: Auto (Dagre) vs Fixed */}
          <div className="diagram-grid-toggle" title="Graph Layout Mode">
            <button
              type="button"
              className={layoutEngine === 'auto' ? 'active' : ''}
              onClick={() => {
                sound.click();
                setLayoutEngine('auto');
              }}
              title="Dynamic Dagre Hierarchical Layout"
            >
              Auto-Flow
            </button>
            <button
              type="button"
              className={layoutEngine === 'manual' ? 'active' : ''}
              onClick={() => {
                sound.click();
                setLayoutEngine('manual');
              }}
              title="Fixed Baseline Coordinates"
            >
              Manual Grid
            </button>
          </div>

          {/* Deployment Sequence Trigger */}
          <button
            type="button"
            className="button compact outline"
            onClick={() => {
              sound.click();
              setShowDeploymentModal(true);
            }}
            title="View Topological Boot and Deployment Order"
          >
            <ListOrdered size={13} style={{ marginRight: 4 }} /> Deployment Sequence
          </button>

          {/* Grid Style Toggle */}
          <div className="diagram-grid-toggle" title="Toggle Canvas Grid Style">
            <button
              type="button"
              className={gridStyle === 'blueprint' ? 'active' : ''}
              onClick={() => {
                sound.click();
                setGridStyle('blueprint');
              }}
              title="Blueprint Grid"
            >
              Grid
            </button>
            <button
              type="button"
              className={gridStyle === 'dots' ? 'active' : ''}
              onClick={() => {
                sound.click();
                setGridStyle('dots');
              }}
              title="Matrix Dots"
            >
              Dots
            </button>
            <button
              type="button"
              className={gridStyle === 'clean' ? 'active' : ''}
              onClick={() => {
                sound.click();
                setGridStyle('clean');
              }}
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

      {/* Cycle Detection Warning Banner */}
      {neighborhood.cycleReport?.hasCycle && (
        <div className="diagram-cycle-banner" role="alert">
          <AlertTriangle size={16} />
          <span>
            <b>Circular Dependency Warning:</b> Detected{' '}
            {neighborhood.cycleReport.cycleCount} circular loop(s):{' '}
            {neighborhood.cycleReport.cycles.map((c) => c.join(' → ')).join(' | ')}.
            Risk of synchronous deadlock under high concurrency.
          </span>
        </div>
      )}

      <div className={`diagram-canvas grid-style-${gridStyle}`}>
        {/* Architectural Crosshair Corner Markers */}
        <div className="blueprint-crosshair top-left" aria-hidden="true">+</div>
        <div className="blueprint-crosshair top-right" aria-hidden="true">+</div>
        <div className="blueprint-crosshair bottom-left" aria-hidden="true">+</div>
        <div className="blueprint-crosshair bottom-right" aria-hidden="true">+</div>
        <div className="blueprint-coord-tag top" aria-hidden="true">
          [COORD // {width} × {height} PX · {layoutEngine === 'auto' ? 'DAGRE_HIERARCHICAL' : 'MANUAL_COORDINATES'}]
        </div>
        <div className="blueprint-coord-tag bottom" aria-hidden="true">
          [SCALE // 1:1 VECTOR GRAPH · {model.components.length} NODES · {model.relationships.length} EDGES]
        </div>

        <div
          className="diagram-svg-wrapper"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out',
          }}
        >
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
              <marker id="arrow-upstream" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="#f59e0b" />
              </marker>
              <linearGradient id="edge-laser-glow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4ef2d2" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#7ecad2" stopOpacity="1" />
                <stop offset="100%" stopColor="#4ef2d2" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Architecture Connectors */}
            {model.relationships.map((edge) => {
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
                viewMode === 'current' && project.changed && edge.from === 'auth' && edge.to === 'redis';
              const dimmed = selected && !isDirect && !isDownstream && !isUpstream;

              const marker = isChanged
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
                    className={`edge ${isChanged ? 'changed' : ''}`}
                    d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 7} ${y2}`}
                    style={{ markerEnd: marker }}
                  />
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
            {activeComponents.map((node) => {
              const isSelected = selectedId === node.id;
              const isDirect = neighborhood.directIds.has(node.id);
              const isDownstream = neighborhood.downstreamIds.has(node.id);
              const isUpstream = neighborhood.upstreamIds?.has(node.id);
              const isChanged = viewMode === 'current' && project.changed && node.id === 'auth';
              const dimmed = selected && !isSelected && !isDirect && !isDownstream && !isUpstream;
              const description = (node.responsibilities || [node.sub]).join(' ');

              return (
                <g
                  className={`node ${isChanged ? 'changed' : ''} ${isSelected ? 'selected' : ''} ${isDirect ? 'direct' : ''} ${isDownstream ? 'downstream' : ''} ${isUpstream ? 'upstream' : ''} ${dimmed ? 'dimmed' : ''}`}
                  transform={`translate(${node.x},${node.y})`}
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.name}, ${node.type}. ${description}`}
                  aria-pressed={isSelected}
                  onClick={(event) => selectNode(event, node.id)}
                  onKeyDown={(event) => selectNode(event, node.id)}
                >
                  <title>
                    {node.name}: {description}
                  </title>
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
                  <text className="node-type" x="11" y="17">
                    {node.type}
                  </text>
                  <text className="node-title" x="11" y="34">
                    {node.name}
                  </text>
                  <text className="node-sub" x="11" y="49">
                    {node.sub}
                  </text>
                  <path
                    d={`M ${nodeW - 12} 4 L ${nodeW - 4} 4 L ${nodeW - 4} 12`}
                    fill="none"
                    stroke={isSelected || isChanged ? '#4ef2d2' : isUpstream ? '#f59e0b' : '#334155'}
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
          <span className="legend-item"><i className="legend-upstream" /> Upstream outage cascade</span>
          <span className="legend-item"><i className="legend-changed" /> Modified in v{project.version}</span>
          <span className="legend-item legend-flow">→ Data flow</span>
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
              onClick={() => {
                sound.click();
                setSelectedId(null);
              }}
            >
              Clear selection
            </button>
          </div>

          <div className="component-inspector-grid">
            {/* Responsibilities */}
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

            {/* Upstream Blast Radius (Outage cascade) */}
            <div className="inspector-box">
              <div className="inspector-box-header">
                <b>Upstream Callers Affected ({upstream.length})</b>
              </div>
              {upstream.length ? (
                <ul>
                  {upstream.map((item) => {
                    const hop = depthMatrix?.get(item.id)?.distance;
                    return (
                      <li key={item.id}>
                        <b>{item.name}</b> <small>({item.id})</small>
                        {hop && <span className="hop-tag upstream">{hop} hop{hop > 1 ? 's' : ''}</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>No upstream callers. Outage does not cascade to other internal services.</p>
              )}
            </div>

            {/* Downstream Dependencies */}
            <div className="inspector-box">
              <div className="inspector-box-header">
                <b>Downstream Dependencies ({downstream.length})</b>
              </div>
              {downstream.length ? (
                <ul>
                  {downstream.map((item) => {
                    const hop = depthMatrix?.get(item.id)?.distance;
                    return (
                      <li key={item.id}>
                        <b>{item.name}</b> <small>({item.id})</small>
                        {hop && <span className="hop-tag downstream">{hop} hop{hop > 1 ? 's' : ''}</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>No downstream dependencies modeled.</p>
              )}
            </div>

            {/* Direct Connections */}
            <div className="inspector-box">
              <div className="inspector-box-header">
                <b>Direct Connections ({connectedRelationships.length})</b>
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
          </div>
        </section>
      ) : (
        <p className="diagram-help">
          <span className="text-cyan">[TIP]</span> Click any component node to inspect upstream outage blast radius, downstream dependencies with hop distance, and direct connections. Use the Auto-Flow toggle to switch between Dagre hierarchical layout and manual positioning.
        </p>
      )}

      {/* Deployment Sequence Modal */}
      {showDeploymentModal && (
        <div className="modal-backdrop" onClick={() => setShowDeploymentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span className="eyebrow">[TOPOLOGICAL_ORDER // KAHN_ALGORITHM]</span>
                <h3 style={{ margin: '4px 0 0' }}>System Boot & Deployment Sequence</h3>
              </div>
              <button
                type="button"
                className="button compact"
                onClick={() => setShowDeploymentModal(false)}
              >
                <X size={14} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 16 }}>
              Inverted topological sort: dependencies boot first so upstream consumers find their prerequisites online.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {deploymentPlan.stages.map((stage) => (
                <div
                  key={stage.stage}
                  style={{
                    padding: '12px 14px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line-mid)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <b style={{ color: 'var(--cyan)', fontSize: 13 }}>{stage.label}</b>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                      Wave {stage.stage}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {stage.components.map((comp) => (
                      <span
                        key={comp.id}
                        style={{
                          padding: '3px 8px',
                          background: 'rgba(255,255,255,0.06)',
                          borderRadius: 4,
                          fontSize: 12,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        <b>{comp.name}</b> <small style={{ color: 'var(--text-dim)' }}>({comp.type})</small>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
