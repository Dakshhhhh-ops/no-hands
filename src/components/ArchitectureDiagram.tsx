import { lazy, Suspense, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent, SetStateAction } from 'react';
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
import DiagramNodes from './diagram/DiagramNodes.tsx';
import DiagramLegend from './diagram/DiagramLegend.tsx';
import ComponentInspector from './diagram/ComponentInspector.tsx';
import CycleBanner from './diagram/CycleBanner.tsx';
import { applySignoffOverrides, getChaosTargets, getKeyboardTarget } from './diagram/diagramModel.ts';
import type { GridStyle, LayoutEngine, SignoffRole, ViewMode } from './diagram/diagramTypes.ts';

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

  // In a project imported from code, anything without origin 'code' exists only as a plan.
  const hasCodeOrigin = project.components.some((c) => c.origin === 'code');
  // The schema leaves baseline untyped (z.any()); it holds an earlier snapshot of this Project.
  const model: Project = viewMode === 'baseline' && project.baseline ? project.baseline : project;

  const chaosTargets = getChaosTargets(project.components);

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

          </svg>
        </div>

        {/* Tactical Diagram Legend */}
        <DiagramLegend projectVersion={project.version} hasCodeOrigin={hasCodeOrigin} />
      </div>

      {/* Component Inspector */}
      {selected ? (
        <ComponentInspector
          selected={selected}
          upstream={upstream}
          downstream={downstream}
          depthMatrix={depthMatrix}
          connectedRelationships={connectedRelationships}
          byId={byId}
          setSelectedId={setSelectedId}
        />
      ) : (
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
