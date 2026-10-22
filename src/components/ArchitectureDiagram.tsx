import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, RefObject, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import {
  getDiagramNeighborhood,
  computeGraphLayout,
  getDeploymentPlan,
} from '../data/diagram.ts';
import { sound } from '../utils/sound.ts';
import { useChaosWorker } from '../hooks/useChaosWorker.ts';
import { generateAdrFromChange, formatAdrMarkdown } from '../data/adrWorkflow.ts';
import type { ChaosInjection, ChaosTargetType } from '../data/chaosSimulator.ts';
import type { Component, Project } from '../types/schema.ts';
import DiagramToolbar from './diagram/DiagramToolbar.tsx';
import DiagramDefs from './diagram/DiagramDefs.tsx';
import DiagramEdges from './diagram/DiagramEdges.tsx';
import DiagramEdgeLabels from './diagram/DiagramEdgeLabels.tsx';
import DiagramNodes from './diagram/DiagramNodes.tsx';
import DiagramLegend from './diagram/DiagramLegend.tsx';
import ComponentInspector from './diagram/ComponentInspector.tsx';
import CycleBanner from './diagram/CycleBanner.tsx';
import { applySignoffOverrides, getChaosTargets, getKeyboardTarget } from './diagram/diagramModel.ts';
import { nodeH, nodeW, rankGap } from './diagram/diagramTypes.ts';
import type { FlowDirection, GridStyle, LayoutEngine, SignoffRole, ViewMode } from './diagram/diagramTypes.ts';

// Fit the model to the canvas, but never below this scale, where node names are about 14px;
// a model too large for that scrolls inside the canvas instead of shrinking further.
const MIN_SCALE = 0.75;

// The dialogs load on first open, so their markup stays out of the diagram's chunk.
// The simulator bar and the two dialogs load on first use, with their CSS.
const ChaosBar = lazy(() => import('./diagram/ChaosBar.tsx'));
const DeploymentSequenceDialog = lazy(() => import('./diagram/DeploymentSequenceDialog.tsx'));
const AdrDialog = lazy(() => import('./diagram/AdrDialog.tsx'));

/**
 * Pass toolsOpen to control the advanced tools from outside (the app's Advanced menu);
 * without it the diagram shows its own More tools toggle.
 */
export interface ArchitectureDiagramProps {
  project: Project;
  toolsOpen?: boolean;
  onToolsOpenChange?: (open: boolean) => void;
  /** Render the selected component's inspector here (the workspace's details drawer) instead of under the canvas. */
  inspectorSlot?: RefObject<HTMLDivElement | null>;
  /** Called with the selected component's id, or null when nothing is selected. */
  onSelect?: (id: string | null) => void;
  onOpenDocs?: () => void;
}

export default function ArchitectureDiagram({ project, toolsOpen, onToolsOpenChange, inspectorSlot, onSelect }: ArchitectureDiagramProps) {
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

  // In a project imported from code, anything without origin 'code' exists only as a plan.
  const hasCodeOrigin = project.components.some((c) => c.origin === 'code');
  // The schema leaves baseline untyped (z.any()); it holds an earlier snapshot of this Project.
  const model: Project = viewMode === 'baseline' && project.baseline ? project.baseline : project;

  const chaosTargets = getChaosTargets(project.components);

  // Layered layout (Dagre), computed both ways: left to right and top to bottom. The canvas uses
  // whichever draws the model larger in the space it has.
  const layouts = useMemo(() => ({
    LR: computeGraphLayout(model.components, model.relationships, {
      direction: 'LR', nodeWidth: nodeW, nodeHeight: nodeH, rankSeparation: rankGap, nodeSeparation: 36, marginX: 16, marginY: 24,
    }),
    TB: computeGraphLayout(model.components, model.relationships, {
      direction: 'TB', nodeWidth: nodeW, nodeHeight: nodeH, rankSeparation: 64, nodeSeparation: 40, marginX: 24, marginY: 16,
    }),
  }), [model.components, model.relationships]);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const fitFor = (w: number, h: number) => (canvasSize.w > 0 && canvasSize.h > 0 ? Math.min((canvasSize.w - 32) / w, (canvasSize.h - 32) / h) : 1);
  const direction: FlowDirection = fitFor(layouts.TB.width, layouts.TB.height) > fitFor(layouts.LR.width, layouts.LR.height) * 1.05 ? 'TB' : 'LR';
  const autoLayout = layouts[direction];
  const activeComponents: Component[] = layoutEngine === 'auto' ? autoLayout.components : model.components;
  const flow: FlowDirection = layoutEngine === 'auto' ? direction : 'LR';
  const width = layoutEngine === 'auto' ? autoLayout.width : 1000;
  const height = layoutEngine === 'auto' ? autoLayout.height : 390;

  const [legendOpen, setLegendOpen] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCanvasSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const fit = fitFor(width, height);
  const scale = Math.max(MIN_SCALE, fit) * zoom;

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
  const currentAdr = useMemo(() => applySignoffOverrides(baseAdr, adrSignoffOverrides), [baseAdr, adrSignoffOverrides]);

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

  useEffect(() => { onSelect?.(selectedId); }, [selectedId, onSelect]);
  useEffect(() => { setZoom(1); }, [project.name, project.version]);

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

    const nextId = getKeyboardTarget(event.key, nodeId, activeComponents, neighborhood);
    if (nextId === undefined) return;

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
    setZoom((z) => Math.min(2, Math.max(0.5, +(z + delta).toFixed(1))));
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
      <DiagramToolbar
        viewMode={viewMode}
        modelVersion={model.version}
        projectVersion={project.version}
        projectChanged={project.changed}
        toolsControlled={toolsControlled}
        showTools={showTools}
        setShowTools={setShowTools}
        layoutEngine={layoutEngine}
        setLayoutEngine={setLayoutEngine}
        gridStyle={gridStyle}
        setGridStyle={setGridStyle}
        setShowDeploymentModal={setShowDeploymentModal}
        setShowAdrModal={setShowAdrModal}
        zoom={zoom}
        handleZoom={handleZoom}
        resetZoom={resetZoom}
        handleModeChange={handleModeChange}
        legendOpen={legendOpen}
        onToggleLegend={() => setLegendOpen((open) => !open)}
      />

      {/* Outage simulator: a model of the graph, not measurements from a running system */}
      {showTools && (
        <Suspense fallback={null}>
          <ChaosBar
            chaosTargets={chaosTargets}
            chaosInjections={chaosInjections}
            toggleChaos={toggleChaos}
            restoreAllChaos={restoreAllChaos}
            telemetry={telemetry}
          />
        </Suspense>
      )}

      {/* Cycle Detection Warning Banner */}
      {neighborhood.cycleReport?.hasCycle && <CycleBanner cycleReport={neighborhood.cycleReport} />}

      <div className={`diagram-canvas grid-style-${gridStyle}`} ref={canvasRef}>
        {/* Architectural Crosshair Corner Markers */}
        <div className="blueprint-crosshair top-left" aria-hidden="true">+</div>
        <div className="blueprint-crosshair top-right" aria-hidden="true">+</div>
        <div className="blueprint-crosshair bottom-left" aria-hidden="true">+</div>
        <div className="blueprint-crosshair bottom-right" aria-hidden="true">+</div>

        <div className="diagram-svg-wrapper">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width={Math.round(width * scale)}
            height={Math.round(height * scale)}
            role="group"
            aria-label={`${model.name} architecture diagram. Select a component to inspect it and highlight its relationships.`}
            style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
          >
            <DiagramDefs />

            {/* Architecture Connectors */}
            <DiagramEdges
              relationships={model.relationships}
              byId={byId}
              neighborhood={neighborhood}
              selectedId={selectedId}
              selected={selected}
              viewMode={viewMode}
              telemetry={telemetry}
              direction={flow}
              animate={showTools}
            />

            {/* Component Nodes */}
            <DiagramNodes
              activeComponents={activeComponents}
              neighborhood={neighborhood}
              selectedId={selectedId}
              selected={selected}
              viewMode={viewMode}
              hasCodeOrigin={hasCodeOrigin}
              telemetry={telemetry}
              selectNode={selectNode}
              handleNodeKeyDown={handleNodeKeyDown}
            />

            <DiagramEdgeLabels relationships={model.relationships} byId={byId} telemetry={telemetry} direction={flow} />

          </svg>
        </div>

      </div>
      {legendOpen && <DiagramLegend projectVersion={project.version} hasCodeOrigin={hasCodeOrigin} />}

      {/* Component Inspector: in the workspace's drawer when it gives one, otherwise under the canvas */}
      {selected && inspectorSlot?.current ? createPortal(
        <ComponentInspector
          selected={selected}
          upstream={upstream}
          downstream={downstream}
          depthMatrix={depthMatrix}
          connectedRelationships={connectedRelationships}
          byId={byId}
          setSelectedId={setSelectedId}
        />,
        inspectorSlot.current,
      ) : selected ? (
        <ComponentInspector
          selected={selected}
          upstream={upstream}
          downstream={downstream}
          depthMatrix={depthMatrix}
          connectedRelationships={connectedRelationships}
          byId={byId}
          setSelectedId={setSelectedId}
        />
      ) : inspectorSlot ? null : (
        <p className="diagram-help">
          Select a component to see what depends on it.
        </p>
      )}

      {/* Deployment Sequence Modal */}
      {showDeploymentModal && (
        <Suspense fallback={null}>
          <DeploymentSequenceDialog
            deploymentPlan={deploymentPlan}
            setShowDeploymentModal={setShowDeploymentModal}
          />
        </Suspense>
      )}

      {/* Architecture Decision Record (ADR) and sign-off dialog */}
      {showAdrModal && (
        <Suspense fallback={null}>
          <AdrDialog
            currentAdr={currentAdr}
            allSignedOff={allSignedOff}
            toggleSignoff={toggleSignoff}
            downloadAdrMarkdown={downloadAdrMarkdown}
            setShowAdrModal={setShowAdrModal}
          />
        </Suspense>
      )}
    </section>
  );
}
