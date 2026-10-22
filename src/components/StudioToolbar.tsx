import { useRef, useState } from 'react';
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { Check, ChevronDown, FileArchive, FileCode2, GitBranch, Layers, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useDismiss } from '../hooks/useDismiss.ts';
import type { useJourney } from '../hooks/useJourney.ts';
import type { Project } from '../types/schema.ts';
import { TOPOLOGY_TAB } from './outputTabs.ts';

type Journey = ReturnType<typeof useJourney>;
type SampleKind = 'commerce' | 'food';

/* The workspace toolbar: the model's identity and output actions, then progress and sources. */

export interface StudioHeaderProps {
  project: Project | null;
  currentBranchId: string;
  currentBranch: { name: string } | undefined;
  openDecisionCount: number;
  onTabChange: (tab: string) => void;
  exportOpen: boolean;
  setExportOpen: Dispatch<SetStateAction<boolean>>;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  exportAll: () => void;
  exportDiagram: (format: 'svg' | 'png' | 'mermaid') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function StudioHeader({
  project, currentBranchId, currentBranch, openDecisionCount, onTabChange,
  exportOpen, setExportOpen, exportMenuRef, exportAll, exportDiagram, canUndo, canRedo, onUndo, onRedo,
}: StudioHeaderProps) {
  return (
    <header className="va-studio-head">
      <div className="va-model-title">
        <h2>{project ? project.name : 'System architecture'}</h2>
        {project && (
          <span className="va-version" data-changed={Boolean(project.changed)}>
            v{project.version}{project.changed ? ' · updated' : ' · baseline'}
          </span>
        )}
        {currentBranchId !== 'main' && (
          <span className="va-branch-chip"><GitBranch size={13} /> {currentBranch?.name}</span>
        )}
        {project && (
          <span className="va-stats">
            <span>{project.components.length} components</span>
            {openDecisionCount > 0 && (
              <button type="button" className="va-stat-warn" onClick={() => onTabChange('risk')}>
                {openDecisionCount} open decision{openDecisionCount === 1 ? '' : 's'}
              </button>
            )}
          </span>
        )}
      </div>

      <div className="va-studio-tools va-studio-actions">
          <div className="va-menu" ref={exportMenuRef}>
            <button
              type="button"
              className="va-btn va-btn-ghost va-btn-sm"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((open) => !open)}
            >
              <FileArchive size={14} /> Export <ChevronDown size={14} />
            </button>
            {exportOpen && (
              <div className="va-menu-list" role="menu">
                <button type="button" role="menuitem" className="va-menu-item" onClick={exportAll}>
                  <FileArchive size={16} />
                  <span><b>Engineering artifacts</b><small>Model, diagram, API contract, risks, tasks</small></span>
                </button>
                <button type="button" role="menuitem" className="va-menu-item" onClick={() => exportDiagram('svg')}>
                  <FileCode2 size={16} />
                  <span><b>Architecture SVG</b><small>Current model as a scalable vector diagram</small></span>
                </button>
                <button type="button" role="menuitem" className="va-menu-item" onClick={() => exportDiagram('png')}>
                  <FileCode2 size={16} />
                  <span><b>Architecture PNG</b><small>Current model as a rendered image</small></span>
                </button>
                <button type="button" role="menuitem" className="va-menu-item" onClick={() => exportDiagram('mermaid')}>
                  <FileCode2 size={16} />
                  <span><b>Mermaid source</b><small>Editable architecture flowchart text</small></span>
                </button>
              </div>
            )}
          </div>
          <span className="va-toolbar-sep" aria-hidden="true" />
          <button type="button" className="va-btn va-btn-ghost va-btn-icon va-btn-sm" onClick={onUndo} disabled={!canUndo} aria-label="Undo last change" title="Undo (Ctrl+Z)">
            <Undo2 size={15} />
          </button>
          <button type="button" className="va-btn va-btn-ghost va-btn-icon va-btn-sm" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
            <Redo2 size={15} />
          </button>
      </div>
    </header>
  );
}

export interface StudioBarProps {
  project: Project | null;
  /** The guided demo has its own step counter, so the walkthrough steps aside while it runs. */
  guideActive: boolean;
  journeySteps: Journey['journeySteps'];
  currentJourneyStep: number;
  journeyGuidance: string;
  journeyOutputs: Journey['journeyOutputs'];
  inspectedArtifacts: Set<string>;
  tab: string;
  onTabChange: (tab: string) => void;
  isImported: boolean;
  sampleChoice: SampleKind;
  onSampleChoice: (kind: SampleKind) => void;
  onResetWorkspace: (message: string, kind: SampleKind) => void;
  onLoadSample: () => void;
  onImportExample: () => void;
  onCheckExampleDrift: () => void;
  onComposeFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onDriftFile: (event: ChangeEvent<HTMLInputElement>) => void;
  showHistory: boolean;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  currentBranch: { name: string } | undefined;
  advancedTools: boolean;
  setAdvancedTools: Dispatch<SetStateAction<boolean>>;
  onReset: () => void;
  onExportDevOps: () => void;
}

export function StudioBar({
  project, guideActive, journeySteps, currentJourneyStep, journeyGuidance, journeyOutputs, inspectedArtifacts,
  tab, onTabChange, isImported, sampleChoice, onSampleChoice, onResetWorkspace, onLoadSample, onImportExample,
  onCheckExampleDrift, onComposeFile, onDriftFile, showHistory, setShowHistory, currentBranch, advancedTools,
  setAdvancedTools, onReset, onExportDevOps,
}: StudioBarProps) {
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const sourceMenuRef = useDismiss(showSourceMenu, () => setShowSourceMenu(false));
  const advancedMenuRef = useDismiss(showAdvancedMenu, () => setShowAdvancedMenu(false));
  const composeInputRef = useRef<HTMLInputElement | null>(null);
  const driftInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="va-studio-progress va-studio-bar">
      <div className="va-studio-journey" data-hidden={guideActive}>
      <ol className="va-journey-steps" aria-label="Demo walkthrough progress">
        {journeySteps.map((step, index) => {
          const done = step.complete;
          const current = !done && index === currentJourneyStep;
          return (
            <li key={step.title} data-state={done ? 'done' : current ? 'current' : 'upcoming'} title={step.title}>
              <span className="va-journey-marker" aria-hidden="true">{done ? <Check size={11} /> : index + 1}</span>
              <span className={current ? 'va-journey-title' : 'va-sr-only'}>{step.title}</span>
            </li>
          );
        })}
      </ol>
      <p className="va-sr-only" aria-live="polite">{journeyGuidance}</p>
      {project?.changed && (
        <div className="va-journey-outputs" aria-label="Updated output review progress">
          <span className="va-journey-outputs-label">Review</span>
          {journeyOutputs.map((item) => (
            <button
              key={item.id}
              type="button"
              data-viewed={inspectedArtifacts.has(item.id)}
              aria-pressed={tab === item.id}
              aria-label={`View updated ${item.label}`}
              onClick={() => onTabChange(item.id)}
            >
              {inspectedArtifacts.has(item.id) && <Check size={12} />} {item.label}
            </button>
          ))}
        </div>
      )}
      </div>
      <div className="va-studio-tools va-studio-source">
        <div className="va-sample-picker">
          <select
            id="va-sample-choice"
            aria-label="Sample architecture"
            value={isImported ? 'imported' : sampleChoice}
            onChange={(event) => {
              const kind = event.target.value === 'food' ? 'food' : 'commerce';
              onSampleChoice(kind);
              // On an imported stack, picking a sample loads it, so the picker never shows a model that is not on screen.
              if (isImported) onResetWorkspace(`${kind === 'food' ? 'Food Delivery' : 'Commerce Platform'} sample loaded.`, kind);
            }}
          >
            {isImported && <option value="imported" disabled>{project?.name || 'Imported stack'} (imported)</option>}
            <option value="commerce">Commerce Platform</option>
            <option value="food">Food Delivery</option>
          </select>
          <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={onLoadSample}>
            <RotateCcw size={14} /> Load sample
          </button>
        </div>

        <div className="va-pop" ref={sourceMenuRef}>
          <button
            type="button"
            className="va-btn va-btn-ghost va-btn-sm"
            aria-expanded={showSourceMenu}
            aria-controls="va-source-menu"
            onClick={() => setShowSourceMenu((open) => !open)}
          >
            <FileCode2 size={14} /> From code <ChevronDown size={14} />
          </button>
          {showSourceMenu && (
            <div className="va-pop-panel" id="va-source-menu">
              <button type="button" onClick={() => { setShowSourceMenu(false); composeInputRef.current?.click(); }}>
                Import docker-compose
                <small aria-hidden="true">Draw the model from your compose file</small>
              </button>
              <button type="button" onClick={() => { setShowSourceMenu(false); onImportExample(); }}>
                Try example stack
                <small aria-hidden="true">A ride-share stack, imported from compose</small>
              </button>
              <hr />
              <button type="button" disabled={!project} onClick={() => { setShowSourceMenu(false); driftInputRef.current?.click(); }}>
                Check against code
                <small aria-hidden="true">Compare the diagram with a newer compose file</small>
              </button>
              {project?.name === 'ride-share-platform' && (
                <button type="button" onClick={() => { setShowSourceMenu(false); onCheckExampleDrift(); }}>
                  Try example update
                  <small aria-hidden="true">Check this diagram against the next compose version</small>
                </button>
              )}
            </div>
          )}
          <input
            ref={driftInputRef}
            type="file"
            accept=".yml,.yaml"
            hidden
            aria-label="docker-compose file to check against"
            onChange={onDriftFile}
          />
          <input
            ref={composeInputRef}
            type="file"
            accept=".yml,.yaml"
            hidden
            aria-label="docker-compose file"
            onChange={onComposeFile}
          />
        </div>

        <span className="va-toolbar-sep" aria-hidden="true" />
          <div className="va-pop" ref={advancedMenuRef}>
            <button
              type="button"
              className="va-btn va-btn-ghost va-btn-sm"
              aria-expanded={showAdvancedMenu}
              aria-controls="va-advanced-menu"
              onClick={() => setShowAdvancedMenu((open) => !open)}
            >
              <Layers size={14} /> More <ChevronDown size={14} />
            </button>
            {showAdvancedMenu && (
              <div className="va-pop-panel" id="va-advanced-menu">
                <button type="button" aria-expanded={showHistory} onClick={() => { setShowAdvancedMenu(false); setShowHistory((open) => !open); }}>
                  Branches and history
                  <small aria-hidden="true">On {currentBranch?.name || 'Main Branch'}. Fork, compare, merge, and go back in time.</small>
                </button>
                <button type="button" aria-pressed={advancedTools} onClick={() => { setShowAdvancedMenu(false); setAdvancedTools((open) => !open); if (!advancedTools) onTabChange('diagram'); }}>
                  {advancedTools ? 'Hide outage simulator and decision records' : 'Outage simulator and decision records'}
                  <small aria-hidden="true">Simulated outages, deployment order, and ADR sign-off on the diagram.</small>
                </button>
                <button type="button" onClick={() => { setShowAdvancedMenu(false); onTabChange(TOPOLOGY_TAB.id); }}>
                  Topology
                  <small aria-hidden="true">Components by type, protocols, and model checks.</small>
                </button>
                <button type="button" disabled={!project} onClick={() => { setShowAdvancedMenu(false); onReset(); }}>
                  Reset to baseline
                  <small aria-hidden="true">Discard changes and return to the loaded sample or imported stack.</small>
                </button>
                <hr />
                <button type="button" disabled={!project} onClick={() => { setShowAdvancedMenu(false); onExportDevOps(); }}>
                  DevOps bundle
                  <small aria-hidden="true">Terraform, Kubernetes manifests, TypeScript SDK, OpenAPI 3.1 (ZIP).</small>
                </button>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
