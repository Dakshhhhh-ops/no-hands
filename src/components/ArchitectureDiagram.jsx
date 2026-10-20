import { useMemo, useState } from 'react';
import {
  getDiagramNeighborhood,
  relationshipKey,
  computeGraphLayout,
  getDeploymentPlan,
} from '../data/diagram.js';
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  ListOrdered,
  X,
  Flame,
  Users,
  FileCheck2,
  Clock,
  Download,
  Copy,
  Zap,
} from 'lucide-react';
import { sound } from '../utils/sound.js';
import { simulateChaosAndTelemetry } from '../data/chaosSimulator.ts';
import { useChaosWorker } from '../hooks/useChaosWorker.ts';
import { CollaborativeStudioRoom } from '../data/crdtStudio.ts';
import { generateAdrFromChange, formatAdrMarkdown } from '../data/adrWorkflow.ts';

export default function ArchitectureDiagram({ project }) {
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('current');
  const [zoom, setZoom] = useState(1);
  const [gridStyle, setGridStyle] = useState('blueprint'); // blueprint, dots, clean
  const [layoutEngine, setLayoutEngine] = useState('auto'); // auto (Dagre) vs manual (fixed coordinates)
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);
  const [chaosInjections, setChaosInjections] = useState([]);
  const [collaborativeMode, setCollaborativeMode] = useState(false);
  const [showAdrModal, setShowAdrModal] = useState(false);
  const [adrSignoffOverrides, setAdrSignoffOverrides] = useState({});
  const [copiedAdr, setCopiedAdr] = useState(false);

  // Phase 5 CRDT Collaborative Studio Room
  const studioRoom = useMemo(() => {
    const room = new CollaborativeStudioRoom('studio-collab-1');
    room.simulateRemotePeers();
    return room;
  }, []);

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

  // Phase 5: Chaos Simulation & Telemetry Stream (Web Worker)
  const telemetry = useChaosWorker(project, chaosInjections);

  // Phase 5: Architecture Decision Record (ADR)
  const baseAdr = useMemo(() => generateAdrFromChange(project), [project]);
  const currentAdr = useMemo(() => {
    const updatedSignoffs = baseAdr.complianceSignoffs.map((s) => ({
      ...s,
      approved:
        adrSignoffOverrides[s.role] !== undefined ? adrSignoffOverrides[s.role] : s.approved,
      timestamp:
        (adrSignoffOverrides[s.role] !== undefined ? adrSignoffOverrides[s.role] : s.approved)
          ? s.timestamp || new Date().toISOString()
          : undefined,
    }));
    return {
      ...baseAdr,
      complianceSignoffs: updatedSignoffs,
    };
  }, [baseAdr, adrSignoffOverrides]);

  const allSignedOff = currentAdr.complianceSignoffs.every((s) => s.approved);

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

  function handleNodeKeyDown(event, nodeId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectNode(event, nodeId);
      return;
    }
    
    const current = activeComponents.find((c) => c.id === nodeId);
    if (!current) return;
    
    let nextId = null;
    const currentIndex = activeComponents.findIndex((c) => c.id === nodeId);
    
    switch (event.key) {
      case 'ArrowRight':
        // Navigate to downstream
        if (neighborhood.downstreamIds.size > 0) {
          const downstream = Array.from(neighborhood.downstreamIds);
          nextId = downstream[0];
        } else if (currentIndex < activeComponents.length - 1) {
          nextId = activeComponents[currentIndex + 1].id;
        }
        break;
      case 'ArrowLeft':
        // Navigate to upstream
        if (neighborhood.upstreamIds?.size > 0) {
          const upstream = Array.from(neighborhood.upstreamIds);
          nextId = upstream[0];
        } else if (currentIndex > 0) {
          nextId = activeComponents[currentIndex - 1].id;
        }
        break;
      case 'ArrowDown':
        // Navigate to next component in list
        if (currentIndex < activeComponents.length - 1) {
          nextId = activeComponents[currentIndex + 1].id;
        }
        break;
      case 'ArrowUp':
        // Navigate to previous component in list
        if (currentIndex > 0) {
          nextId = activeComponents[currentIndex - 1].id;
        }
        break;
      case 'Escape':
        // Clear selection
        nextId = null;
        break;
      default:
        return;
    }
    
    event.preventDefault();
    sound.click();
    setSelectedId(nextId);
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

  function toggleChaos(targetComponentId, type, label, extra = {}) {
    sound.click();
    setChaosInjections((current) => {
      const exists = current.some((c) => c.targetComponentId === targetComponentId);
      if (exists) {
        return current.filter((c) => c.targetComponentId !== targetComponentId);
      }
      return [...current, { targetComponentId, type, label, ...extra }];
    });
  }

  function restoreAllChaos() {
    sound.apply();
    setChaosInjections([]);
  }

  function toggleSignoff(role) {
    sound.click();
    setAdrSignoffOverrides((prev) => {
      const currentVal =
        prev[role] !== undefined
          ? prev[role]
          : currentAdr.complianceSignoffs.find((s) => s.role === role)?.approved;
      return { ...prev, [role]: !currentVal };
    });
  }

  function copyAdrMarkdown() {
    sound.apply();
    const md = formatAdrMarkdown(currentAdr);
    navigator.clipboard?.writeText(md);
    setCopiedAdr(true);
    setTimeout(() => setCopiedAdr(false), 2000);
  }

  function downloadAdrMarkdown() {
    sound.export();
    const md = formatAdrMarkdown(currentAdr);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentAdr.id.toLowerCase()}-decision-record.md`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
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
            <ListOrdered size={13} style={{ marginRight: 4 }} /> Deployment
          </button>

          {/* CRDT Collaborative Pairing Toggle */}
          <button
            type="button"
            className={`button compact outline ${collaborativeMode ? 'active' : ''}`}
            onClick={() => {
              sound.click();
              setCollaborativeMode((v) => !v);
            }}
            title="Toggle Real-Time Multi-User Collaborative Pairing"
          >
            <Users size={13} style={{ marginRight: 4 }} />
            {collaborativeMode ? 'Pairing (3)' : 'Pairing'}
          </button>

          {/* ADR Governance Sign-Off Trigger */}
          <button
            type="button"
            className="button compact outline"
            onClick={() => {
              sound.click();
              setShowAdrModal(true);
            }}
            title="View Architecture Decision Record & Governance Sign-Off"
          >
            <FileCheck2 size={13} style={{ marginRight: 4 }} /> ADR Sign-Off
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

      {/* Phase 5: Chaos Engineering & Live Telemetry Stream Bar */}
      <div className="diagram-chaos-bar">
        <div className="chaos-actions">
          <span className="chaos-label">
            <Flame size={13} style={{ color: '#ef4444' }} /> Chaos Simulator:
          </span>
          <button
            type="button"
            className={`chaos-btn ${chaosInjections.some((c) => c.targetComponentId === 'redis') ? 'active-kill' : ''}`}
            onClick={() => toggleChaos('redis', 'NODE_OUTAGE', 'Kill Redis')}
            title="Simulate Redis session cache crash"
          >
            <Zap size={11} /> Kill Redis
          </button>
          <button
            type="button"
            className={`chaos-btn ${chaosInjections.some((c) => c.targetComponentId === 'postgres') ? 'active-kill' : ''}`}
            onClick={() => toggleChaos('postgres', 'NODE_OUTAGE', 'Kill Postgres')}
            title="Simulate PostgreSQL primary database crash"
          >
            <Zap size={11} /> Kill Postgres
          </button>
          <button
            type="button"
            className={`chaos-btn ${chaosInjections.some((c) => c.targetComponentId === 'gateway') ? 'active-warn' : ''}`}
            onClick={() => toggleChaos('gateway', 'LATENCY_SPIKE', '+1500ms Spike', { latencyMs: 1500 })}
            title="Inject 1500ms network latency spike on API Gateway"
          >
            <Clock size={11} /> +1500ms Spike
          </button>
          {chaosInjections.length > 0 && (
            <button
              type="button"
              className="chaos-btn restore-btn"
              onClick={restoreAllChaos}
              title="Restore all killed nodes and clear latency spikes"
            >
              <RotateCcw size={11} /> Restore All
            </button>
          )}
        </div>

        <div className="chaos-telemetry-stats">
          <div className={`telemetry-health-badge ${telemetry.overallSystemHealth.toLowerCase()}`}>
            {telemetry.overallSystemHealth}
          </div>
          <div className="telemetry-pill">
            <span>Flow:</span> <b>{telemetry.totalRpsThroughput} RPS</b>
          </div>
          {telemetry.droppedRps > 0 && (
            <div className="telemetry-pill" style={{ color: '#fca5a5' }}>
              <span>Drop:</span> <b>{telemetry.droppedRps} RPS</b>
            </div>
          )}
          <div className="telemetry-pill">
            <span>Latency:</span> <b>{telemetry.averageLatencyMs}ms</b>
          </div>
          <div className="telemetry-pill">
            <span>P99:</span> <b>{telemetry.p99LatencyMs}ms</b>
          </div>
          {collaborativeMode && (
            <div className="peer-presence-bar">
              {studioRoom.getActivePeers().map((peer) => (
                <span key={peer.peerId} className="peer-chip">
                  <span className="peer-dot" style={{ backgroundColor: peer.color }} />
                  <b>{peer.name}</b>
                </span>
              ))}
            </div>
          )}
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

              const edgeKey = `${edge.from}->${edge.to}`;
              const edgeMetric = telemetry.edgeMetrics.get(edgeKey);
              const isSevered = edgeMetric?.status === 'SEVERED';
              const isCongested = edgeMetric?.status === 'CONGESTED';
              const particleColor =
                edgeMetric?.particleColor ||
                (isChanged || isDirect ? '#4ef2d2' : isDownstream ? '#b5a2ff' : isUpstream ? '#f59e0b' : '#38bdf8');
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

              return (
                <g
                  key={relationshipKey(edge)}
                  className={`diagram-relationship ${isDirect ? 'direct' : ''} ${isDownstream ? 'downstream' : ''} ${isUpstream ? 'upstream' : ''} ${dimmed ? 'dimmed' : ''}`}
                >
                  <path
                    className={`edge ${isChanged ? 'changed' : ''} ${isSevered ? 'severed' : ''} ${isCongested ? 'congested' : ''}`}
                    d={pathD}
                    style={{ markerEnd: marker }}
                  />
                  {/* Dynamic Animated Edge Traffic Particles */}
                  {!isSevered && (
                    <>
                      <circle r="2.8" fill={particleColor} className="pulse-photon">
                        <animateMotion
                          path={pathD}
                          dur={`${particleSpeed}s`}
                          repeatCount="indefinite"
                        />
                      </circle>
                      {particleDensity >= 2 && (
                        <circle r="2.2" fill={particleColor} opacity="0.8" className="pulse-photon">
                          <animateMotion
                            path={pathD}
                            dur={`${particleSpeed}s`}
                            begin={`${(particleSpeed / 2).toFixed(2)}s`}
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                      {particleDensity >= 3 && (
                        <circle r="1.8" fill={particleColor} opacity="0.6" className="pulse-photon">
                          <animateMotion
                            path={pathD}
                            dur={`${particleSpeed}s`}
                            begin={`${(particleSpeed / 3).toFixed(2)}s`}
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                    </>
                  )}
                  <text className="edge-label" x={mid} y={(y1 + y2) / 2 - 5} textAnchor="middle">
                    {isSevered ? `⚠️ SEVERED: ${edge.label}` : edge.label}
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

              const nodeMetric = telemetry.nodeMetrics.get(node.id);
              const isDown = nodeMetric?.status === 'DOWN';
              const isDegraded = nodeMetric?.status === 'DEGRADED';

              return (
                <g
                  className={`node ${isChanged ? 'changed' : ''} ${isSelected ? 'selected' : ''} ${isDirect ? 'direct' : ''} ${isDownstream ? 'downstream' : ''} ${isUpstream ? 'upstream' : ''} ${isDown ? 'node-down' : isDegraded ? 'node-degraded' : ''} ${dimmed ? 'dimmed' : ''}`}
                  transform={`translate(${node.x},${node.y})`}
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.name}, ${node.type}. ${description}`}
                  aria-pressed={isSelected}
                  onClick={(event) => selectNode(event, node.id)}
                  onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
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
                    stroke={
                      isDown
                        ? '#ef4444'
                        : isDegraded
                          ? '#f59e0b'
                          : isSelected || isChanged
                            ? '#4ef2d2'
                            : isUpstream
                              ? '#f59e0b'
                              : '#334155'
                    }
                    strokeWidth="1.2"
                  />

                  {/* Telemetry Status Badge on Node */}
                  {nodeMetric && nodeMetric.status !== 'HEALTHY' && (
                    <g transform={`translate(${nodeW - 58}, 5)`}>
                      <rect
                        width="54"
                        height="13"
                        rx="3"
                        fill={isDown ? '#ef4444' : '#f59e0b'}
                        opacity="0.9"
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
                </g>
              );
            })}

            {/* Phase 5: CRDT Multi-User Collaborative Cursors */}
            {collaborativeMode &&
              studioRoom
                .getActivePeers()
                .filter((p) => p.peerId !== studioRoom.localPeerId)
                .map((peer) => (
                  <g
                    key={peer.peerId}
                    transform={`translate(${peer.cursorX}, ${peer.cursorY})`}
                    style={{ pointerEvents: 'none', transition: 'transform 0.4s ease-out' }}
                  >
                    <path
                      d="M 0 0 L 0 14 L 4 11 L 8 18 L 11 16 L 7 10 L 13 10 Z"
                      fill={peer.color}
                      stroke="#0f172a"
                      strokeWidth="1"
                      className="peer-cursor-pointer"
                    />
                    <g transform="translate(14, 12)">
                      <rect
                        x="0"
                        y="-10"
                        width={peer.name.length * 6.5 + 14}
                        height="18"
                        rx="4"
                        fill={peer.color}
                        opacity="0.95"
                      />
                      <text
                        x="7"
                        y="3"
                        fill="#0f172a"
                        fontSize="10"
                        fontWeight="bold"
                        fontFamily="var(--font-mono)"
                      >
                        {peer.name}
                      </text>
                    </g>
                  </g>
                ))}
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

      {/* Phase 5: Architecture Decision Record (ADR) & Sign-Off Modal */}
      {showAdrModal && (
        <div className="modal-backdrop" onClick={() => setShowAdrModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 740 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span className="eyebrow">[CHANGE_GOVERNANCE // NYGARD_ADR_FORMAT]</span>
                <h3 style={{ margin: '4px 0 0' }}>Architecture Decision Record & Sign-Off</h3>
              </div>
              <button
                type="button"
                className="button compact"
                onClick={() => setShowAdrModal(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <b style={{ color: 'var(--cyan)', fontSize: 13 }}>{currentAdr.id}: {currentAdr.title}</b>
                <span className={`telemetry-health-badge ${allSignedOff ? 'optimal' : 'degraded'}`}>
                  {allSignedOff ? '✅ APPROVED FOR PRODUCTION' : '⏳ PENDING SIGN-OFFS'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="button compact" onClick={copyAdrMarkdown}>
                  <Copy size={12} style={{ marginRight: 4 }} /> {copiedAdr ? 'Copied!' : 'Copy Markdown'}
                </button>
                <button type="button" className="button compact primary" onClick={downloadAdrMarkdown}>
                  <Download size={12} style={{ marginRight: 4 }} /> Download ADR
                </button>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 16 }}>
              Formal compliance sign-off matrix across cross-functional roles before deploying architecture mutations.
            </p>

            {/* Sign-off checklist */}
            <div className="adr-checklist">
              {currentAdr.complianceSignoffs.map((item) => (
                <div key={item.role} className="adr-signoff-card">
                  <div>
                    <div className="signoff-role">{item.role}</div>
                    <div className="signoff-signee">Signee: {item.signee}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={`signoff-status-badge ${item.approved ? 'approved' : 'pending'}`}>
                      {item.approved ? 'APPROVED' : 'ACTION REQUIRED'}
                    </span>
                    <button
                      type="button"
                      className="button compact"
                      onClick={() => toggleSignoff(item.role)}
                    >
                      {item.approved ? 'Revoke' : 'Sign Off'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* ADR Markdown Preview */}
            <div style={{ marginTop: 14 }}>
              <span className="eyebrow" style={{ marginBottom: 6, display: 'block' }}>[PREVIEW // GENERATED_MARKDOWN]</span>
              <pre className="adr-markdown-preview">
                {formatAdrMarkdown(currentAdr)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
