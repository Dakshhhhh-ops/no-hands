import { useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent, SetStateAction } from 'react';
import {
  getDiagramNeighborhood,
  relationshipKey,
  computeGraphLayout,
  getDeploymentPlan,
} from '../data/diagram.ts';
import {
  RotateCcw, ZoomIn, ZoomOut, AlertTriangle, ListOrdered, X, Flame, FileCheck2, Clock, Download,
  Copy, Zap,
} from 'lucide-react';
import { sound } from '../utils/sound.ts';
import { useChaosWorker } from '../hooks/useChaosWorker.ts';
import { ASSUMED_INGRESS_RPS, ASSUMED_HOP_LATENCY_MS, ASSUMED_CACHE_FALLBACK_PENALTY_MS } from '../data/chaosSimulator.ts';
import { generateAdrFromChange, formatAdrMarkdown } from '../data/adrWorkflow.ts';
import type { ChaosInjection, ChaosTargetType } from '../data/chaosSimulator.ts';
import type { ArchitectureDecisionRecord } from '../data/adrWorkflow.ts';
import type { Component, Project } from '../types/schema.ts';

type ViewMode = 'current' | 'baseline';
type GridStyle = 'blueprint' | 'dots' | 'clean';
type LayoutEngine = 'auto' | 'manual';
type SignoffRole = ArchitectureDecisionRecord['complianceSignoffs'][number]['role'];

/** An outage simulator button: a component from the loaded model and the fault to inject. */
interface ChaosTarget {
  component: Component;
  kind: ChaosTargetType;
  label: string;
}

/**
 * Pass toolsOpen to control the advanced tools from outside (the app's Advanced menu);
 * without it the diagram shows its own More tools toggle.
 */
export interface ArchitectureDiagramProps {
  project: Project;
  toolsOpen?: boolean;
  onToolsOpenChange?: (open: boolean) => void;
}

export default function ArchitectureDiagram({ project, toolsOpen, onToolsOpenChange }: ArchitectureDiagramProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('current');
  const [zoom, setZoom] = useState(1);
  const [gridStyle, setGridStyle] = useState<GridStyle>('blueprint'); // blueprint, dots, clean
  const [layoutEngine, setLayoutEngine] = useState<LayoutEngine>('auto'); // auto (Dagre) vs manual (fixed coordinates)
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);
  const [chaosInjections, setChaosInjections] = useState<ChaosInjection[]>([]);
  // Advanced tools stay hidden until asked for, so the default view is the diagram itself.
  const [ownTools, setOwnTools] = useState(false);
  const toolsControlled = typeof toolsOpen === 'boolean';
  const showTools = toolsControlled ? toolsOpen : ownTools;
  const setShowTools = (update: SetStateAction<boolean>) => {
    const next = typeof update === 'function' ? update(showTools) : update;
    if (toolsControlled) onToolsOpenChange?.(next);
    else setOwnTools(next);
  };
  const [showAdrModal, setShowAdrModal] = useState(false);
  const [adrSignoffOverrides, setAdrSignoffOverrides] = useState<Partial<Record<SignoffRole, boolean>>>({});
  const [copiedAdr, setCopiedAdr] = useState(false);

  // In a project imported from code, anything without origin 'code' exists only as a plan.
  const hasCodeOrigin = project.components.some((c) => c.origin === 'code');
  // The schema leaves baseline untyped (z.any()); it holds an earlier snapshot of this Project.
  const model: Project = viewMode === 'baseline' && project.baseline ? project.baseline : project;

  // Outage simulator targets come from the loaded model, not from the sample's ids.
  const chaosTargets = ([
    { type: 'CACHE', kind: 'NODE_OUTAGE', verb: 'Kill' },
    { type: 'DATABASE', kind: 'NODE_OUTAGE', verb: 'Kill' },
    { type: 'GATEWAY', kind: 'LATENCY_SPIKE', verb: 'Slow' },
  ] as const)
    .map(({ type, kind, verb }): ChaosTarget | null => {
      const component = project.components.find((c) => c.type === type);
      return component ? { component, kind, label: `${verb} ${component.name}` } : null;
    })
    .filter((target): target is ChaosTarget => target !== null);

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

  const activeComponents: Component[] = layoutEngine === 'auto' ? autoLayout.components : model.components;
  const width = layoutEngine === 'auto' ? autoLayout.width : 1000;
  const height = layoutEngine === 'auto' ? autoLayout.height : 390;
  const nodeW = 144,
    nodeH = 58;

  const byId = useMemo(
    () => new Map<string, Component>(activeComponents.map((item) => [item.id, item])),
    [activeComponents]
  );

  // Enhanced neighborhood with bidirectional traversal and blast radius
  const neighborhood = useMemo(
    // With nothing selected, pass an id no component has (ids are non-empty), so every set is empty.
    () => getDiagramNeighborhood(model.components, model.relationships, selectedId ?? ''),
    [model.components, model.relationships, selectedId]
  );

  // Topological deployment order sequence
  const deploymentPlan = useMemo(
    () => getDeploymentPlan(model.components, model.relationships),
    [model.components, model.relationships]
  );

  // Outage simulation, computed in a Web Worker
  // Non-null: the hook returns null only without a project, and project is a required prop.
  const telemetry = useChaosWorker(project, chaosInjections)!;

  // Architecture Decision Record (ADR)
  const baseAdr = useMemo(() => generateAdrFromChange(project), [project]);
  const currentAdr = useMemo<ArchitectureDecisionRecord>(() => {
    const updatedSignoffs = baseAdr.complianceSignoffs.map((s) => {
      const override = adrSignoffOverrides[s.role];
      const approved = override !== undefined ? override : s.approved;
      return {
        ...s,
        approved,
        signee: approved ? 'Marked approved in VoiceArchitect review' : s.signee,
        timestamp: approved ? s.timestamp || new Date().toISOString() : undefined,
      };
    });
    return {
      ...baseAdr,
      status: updatedSignoffs.every((s) => s.approved) ? 'ACCEPTED' : 'PROPOSED',
      complianceSignoffs: updatedSignoffs,
    };
  }, [baseAdr, adrSignoffOverrides]);

  const allSignedOff = currentAdr.complianceSignoffs.every((s) => s.approved);

  const selected = selectedId === null ? undefined : byId.get(selectedId);
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

  function selectNode(event: MouseEvent<SVGGElement> | KeyboardEvent<SVGGElement>, nodeId: string) {
    if (event.type === 'keydown' && 'key' in event && !['Enter', ' '].includes(event.key)) return;
    if (event.type === 'keydown') event.preventDefault();
    sound.click();
    setSelectedId((current) => (current === nodeId ? null : nodeId));
  }

  function handleNodeKeyDown(event: KeyboardEvent<SVGGElement>, nodeId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectNode(event, nodeId);
      return;
    }
    
    const current = activeComponents.find((c) => c.id === nodeId);
    if (!current) return;
    
    let nextId: string | null = null;
    const currentIndex = activeComponents.findIndex((c) => c.id === nodeId);
    
    switch (event.key) {
      case 'ArrowRight':
        // Navigate to downstream
        if (neighborhood.downstreamIds.size > 0) {
          const downstream = Array.from(neighborhood.downstreamIds);
          nextId = downstream[0] ?? null;
        } else if (currentIndex < activeComponents.length - 1) {
          nextId = activeComponents[currentIndex + 1]?.id ?? null;
        }
        break;
      case 'ArrowLeft':
        // Navigate to upstream
        if (neighborhood.upstreamIds?.size > 0) {
          const upstream = Array.from(neighborhood.upstreamIds);
          nextId = upstream[0] ?? null;
        } else if (currentIndex > 0) {
          nextId = activeComponents[currentIndex - 1]?.id ?? null;
        }
        break;
      case 'ArrowDown':
        // Navigate to next component in list
        if (currentIndex < activeComponents.length - 1) {
          nextId = activeComponents[currentIndex + 1]?.id ?? null;
        }
        break;
      case 'ArrowUp':
        // Navigate to previous component in list
        if (currentIndex > 0) {
          nextId = activeComponents[currentIndex - 1]?.id ?? null;
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

  function handleModeChange(mode: ViewMode) {
    sound.tab();
    setViewMode(mode);
  }

  function handleZoom(delta: number) {
    sound.click();
    setZoom((z) => Math.min(1.4, Math.max(0.7, +(z + delta).toFixed(1))));
  }

  function resetZoom() {
    sound.click();
    setZoom(1);
  }

  function toggleChaos(
    targetComponentId: string,
    type: ChaosTargetType,
    label: string,
    extra: Pick<ChaosInjection, 'latencyMs'> = {},
  ) {
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

  function toggleSignoff(role: SignoffRole) {
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
          <span className="diagram-view-label">
            {viewMode === 'baseline' ? `Baseline snapshot · v${model.version}` : `Current model · v${model.version}`}
          </span>
        </div>

        <div className="diagram-actions-cluster">
          {!toolsControlled && <button
            type="button"
            className={`button compact outline ${showTools ? 'active' : ''}`}
            aria-expanded={showTools}
            onClick={() => {
              sound.click();
              setShowTools((v) => !v);
            }}
            title="Show deployment order, pairing, ADR sign-off, layout options, and the chaos simulator"
          >
            {showTools ? 'Fewer tools' : 'More tools'}
          </button>}

          {showTools && (
            <>
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
            </>
          )}

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

      {/* Outage simulator: a model of the graph, not measurements from a running system */}
      {showTools && (
        <div className="diagram-chaos-bar">
          <div className="chaos-actions">
            <span className="chaos-label">
              <Flame size={13} style={{ color: 'var(--va-rose)' }} /> Outage simulator:
            </span>
            {chaosTargets.map(({ component, kind, label }) => {
              const active = chaosInjections.some((c) => c.targetComponentId === component.id);
              return (
                <button
                  key={component.id}
                  type="button"
                  className={`chaos-btn ${active ? (kind === 'LATENCY_SPIKE' ? 'active-warn' : 'active-kill') : ''}`}
                  onClick={() => toggleChaos(component.id, kind, label, kind === 'LATENCY_SPIKE' ? { latencyMs: 1500 } : undefined)}
                  title={kind === 'LATENCY_SPIKE' ? `Simulate 1500ms of added latency at ${component.name}` : `Simulate ${component.name} going down`}
                >
                  {kind === 'LATENCY_SPIKE' ? <Clock size={11} /> : <Zap size={11} />} {label}
                </button>
              );
            })}
            {chaosInjections.length > 0 && (
              <button
                type="button"
                className="chaos-btn restore-btn"
                onClick={restoreAllChaos}
                title="Clear all simulated outages and latency"
              >
                <RotateCcw size={11} /> Restore All
              </button>
            )}
          </div>

          <div className="chaos-telemetry-stats" title="Modeled from this diagram, not measured.">
            <span className="telemetry-simulated-tag">Simulated</span>
            <div className={`telemetry-health-badge ${telemetry.overallSystemHealth.toLowerCase()}`}>
              {telemetry.overallSystemHealth}
            </div>
            <div className="telemetry-pill">
              <span>Flow:</span> <b>{telemetry.totalRpsThroughput} RPS</b>
            </div>
            {telemetry.droppedRps > 0 && (
              <div className="telemetry-pill" style={{ color: 'var(--va-rose)' }}>
                <span>Drop:</span> <b>{telemetry.droppedRps} RPS</b>
              </div>
            )}
            <div className="telemetry-pill">
              <span>Latency:</span> <b>{telemetry.averageLatencyMs}ms</b>
            </div>
            <div className="telemetry-pill">
              <span>Slowest path:</span> <b>{telemetry.slowestPathMs}ms</b>
            </div>
          </div>
          <p className="chaos-assumptions">
            Simulated, not measured. Assumes {ASSUMED_INGRESS_RPS.toLocaleString()} requests per second entering at the clients, {ASSUMED_HOP_LATENCY_MS}ms per component, and +{ASSUMED_CACHE_FALLBACK_PENALTY_MS}ms when a cache falls back to its database. A cache outage counts as survivable only if a requirement records a fallback.
          </p>
        </div>
      )}

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
            style={{ 
              filter: 'drop-shadow(0 4px 24px rgba(78, 242, 210, 0.08))',
            }}
          >
            <defs>
              {/* 3D Node Gradients */}
              <linearGradient id="node-gradient-base" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1e2430" />
                <stop offset="50%" stopColor="#1a1e26" />
                <stop offset="100%" stopColor="#13161c" />
              </linearGradient>
              <linearGradient id="node-gradient-selected" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#0e1a2a" />
                <stop offset="50%" stopColor="#0a1624" />
                <stop offset="100%" stopColor="#05101c" />
              </linearGradient>
              <linearGradient id="node-gradient-changed" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1a2a1e" />
                <stop offset="50%" stopColor="#142016" />
                <stop offset="100%" stopColor="#0e1810" />
              </linearGradient>
              <linearGradient id="node-gradient-down" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#2a1414" />
                <stop offset="50%" stopColor="#200e0e" />
                <stop offset="100%" stopColor="#180808" />
              </linearGradient>
              <linearGradient id="node-gradient-degraded" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#2a2414" />
                <stop offset="50%" stopColor="#20180e" />
                <stop offset="100%" stopColor="#181008" />
              </linearGradient>

              {/* 3D Edge Gradients */}
              <linearGradient id="edge-gradient-base" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#384456" stopOpacity="0.6" />
                <stop offset="50%" stopColor="#4a5a6e" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#384456" stopOpacity="0.6" />
              </linearGradient>
              <linearGradient id="edge-gradient-direct" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--va-accent)" stopOpacity="0.8" />
                <stop offset="50%" stopColor="var(--va-accent)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--va-accent)" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="edge-gradient-downstream" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--va-violet)" stopOpacity="0.8" />
                <stop offset="50%" stopColor="var(--va-violet)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--va-violet)" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="edge-gradient-upstream" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--va-amber)" stopOpacity="0.8" />
                <stop offset="50%" stopColor="var(--va-amber)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--va-amber)" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="edge-gradient-changed" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--va-accent)" stopOpacity="1" />
                <stop offset="50%" stopColor="var(--va-accent)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--va-accent)" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="edge-gradient-severed" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--va-rose)" stopOpacity="0.6" />
                <stop offset="50%" stopColor="var(--va-rose)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--va-rose)" stopOpacity="0.6" />
              </linearGradient>

              {/* Glow Filters */}
              <filter id="glow-subtle" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-accent" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.3 0 0 0 0 0.95 0 0 0 0 0.82 0 0 0 1 0" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-danger" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feColorMatrix in="blur" type="matrix" values="0.93 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* 3D Depth Shadow */}
              <filter id="depth-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.3" />
              </filter>
              <filter id="depth-shadow-strong" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#000" floodOpacity="0.4" />
              </filter>

              {/* Edge Markers */}
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="#52647c" />
              </marker>
              <marker id="arrow-changed" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="var(--va-accent)" />
              </marker>
              <marker id="arrow-direct" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="var(--va-accent)" />
              </marker>
              <marker id="arrow-downstream" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="var(--va-violet)" />
              </marker>
              <marker id="arrow-upstream" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="var(--va-amber)" />
              </marker>

              {/* Particle Definitions */}
              <radialGradient id="particle-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--va-accent)" stopOpacity="1" />
                <stop offset="70%" stopColor="var(--va-accent)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--va-accent)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="particle-glow-downstream" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--va-violet)" stopOpacity="1" />
                <stop offset="70%" stopColor="var(--va-violet)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--va-violet)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="particle-glow-upstream" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--va-amber)" stopOpacity="1" />
                <stop offset="70%" stopColor="var(--va-amber)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--va-amber)" stopOpacity="0" />
              </radialGradient>

              {/* Node Type Icons as Patterns */}
              <pattern id="pattern-service" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                <circle cx="4" cy="4" r="1.5" fill="var(--va-accent)" opacity="0.15" />
              </pattern>
              <pattern id="pattern-datastore" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect x="2" y="2" width="4" height="4" fill="var(--va-violet)" opacity="0.15" />
              </pattern>
              <pattern id="pattern-external" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M2,6 L6,2 M2,2 L6,6" stroke="var(--va-amber)" strokeWidth="1" opacity="0.15" />
              </pattern>

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

            {/* Component Nodes */}
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

          </svg>
        </div>

        {/* Tactical Diagram Legend */}
        <div className="legend">
          <span className="legend-item"><i className="legend-direct" /> Selected / Direct</span>
          <span className="legend-item"><i className="legend-downstream" /> Downstream impact</span>
          <span className="legend-item"><i className="legend-upstream" /> Upstream outage cascade</span>
          <span className="legend-item"><i className="legend-changed" /> Modified in v{project.version}</span>
          {hasCodeOrigin && (
            <span className="legend-item"><i className="legend-planned" /> Planned, not in code yet</span>
          )}
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
          Select a component to see what depends on it.
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

      {/* Architecture Decision Record (ADR) and sign-off dialog */}
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
