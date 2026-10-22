import { useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  AudioLines, ChevronDown, FileArchive, FileCode2, FileText, GitBranch, HelpCircle, Layers, Moon, Redo2, RotateCcw, Sun, Undo2,
} from 'lucide-react';
import { Link } from '../../router.ts';
import { useDismiss } from '../../hooks/useDismiss.ts';
import type { Project } from '../../types/schema.ts';

type SampleKind = 'commerce' | 'food';

export interface TopBarProps {
  project: Project | null;
  currentBranchId: string;
  currentBranch: { name: string } | undefined;
  openDecisionCount: number;
  /** 1-based step of the running guided demo, or 0. */
  guidedStep: number;
  guidedTotal: number;
  onOpenDoc: (id: string) => void;
  isImported: boolean;
  sampleChoice: SampleKind;
  onSampleChoice: (kind: SampleKind) => void;
  onResetWorkspace: (message: string, kind: SampleKind) => void;
  onLoadSample: () => void;
  onImportExample: () => void;
  onChooseCompose: () => void;
  onChooseDrift: () => void;
  onCheckExampleDrift: () => void;
  exportOpen: boolean;
  setExportOpen: Dispatch<SetStateAction<boolean>>;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  exportAll: () => void;
  exportDiagram: (format: 'svg' | 'png' | 'mermaid') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showHistory: boolean;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  advancedTools: boolean;
  setAdvancedTools: Dispatch<SetStateAction<boolean>>;
  onReset: () => void;
  onExportDevOps: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
}

/** The workspace's one bar: where you are, what the model is, and the actions that apply to all of it. */
export default function TopBar({
  project, currentBranchId, currentBranch, openDecisionCount, guidedStep, guidedTotal, onOpenDoc, isImported,
  sampleChoice, onSampleChoice, onResetWorkspace, onLoadSample, onImportExample, onChooseCompose, onChooseDrift,
  onCheckExampleDrift, exportOpen, setExportOpen, exportMenuRef, exportAll, exportDiagram, canUndo, canRedo, onUndo,
  onRedo, showHistory, setShowHistory, advancedTools, setAdvancedTools, onReset, onExportDevOps, theme, onToggleTheme,
  onShowShortcuts,
}: TopBarProps) {
  const [showProject, setShowProject] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const projectRef = useDismiss(showProject, () => setShowProject(false));
  const moreRef = useDismiss(showMore, () => setShowMore(false));
  const closeProject = () => setShowProject(false);

  return (
    <header className="va-shell-bar">
      <Link to="/" className="va-shell-logo" aria-label="VoiceArchitect home">
        <span className="va-brand-mark"><AudioLines size={18} /></span>
      </Link>

      <div className="va-shell-project va-pop" ref={projectRef}>
        <h1 className="va-shell-title">{project ? project.name : 'Workspace'}</h1>
        {project && (
          <span className="va-version" data-changed={Boolean(project.changed)}>
            v{project.version}{project.changed ? ' · updated' : ' · baseline'}
          </span>
        )}
        <button
          type="button"
          className="va-btn va-btn-ghost va-btn-sm"
          aria-expanded={showProject}
          aria-controls="va-project-menu"
          aria-label="Switch project"
          onClick={() => setShowProject((open) => !open)}
        >
          <span className="va-shell-label">Switch project</span> <ChevronDown size={14} />
        </button>
        {showProject && (
          <div className="va-pop-panel va-project-menu" id="va-project-menu">
            <div className="va-sample-picker">
              <label htmlFor="va-sample-choice" className="va-sr-only">Sample architecture</label>
              <select
                id="va-sample-choice"
                value={isImported ? 'imported' : sampleChoice}
                onChange={(event) => {
                  const kind = event.target.value === 'food' ? 'food' : 'commerce';
                  onSampleChoice(kind);
                  // On an imported stack, picking a sample loads it, so the picker never shows a model that is not on screen.
                  if (isImported) { closeProject(); onResetWorkspace(`${kind === 'food' ? 'Food Delivery' : 'Commerce Platform'} sample loaded.`, kind); }
                }}
              >
                {isImported && <option value="imported" disabled>{project?.name || 'Imported stack'} (imported)</option>}
                <option value="commerce">Commerce Platform</option>
                <option value="food">Food Delivery</option>
              </select>
              <button type="button" className="va-btn va-btn-sm" onClick={() => { closeProject(); onLoadSample(); }}>
                <RotateCcw size={14} /> Load sample
              </button>
            </div>
            <hr />
            <button type="button" onClick={() => { closeProject(); onChooseCompose(); }}>
              Import docker-compose
              <small aria-hidden="true">Draw the model from your compose file</small>
            </button>
            <button type="button" onClick={() => { closeProject(); onImportExample(); }}>
              Try example stack
              <small aria-hidden="true">A ride-share stack, imported from compose</small>
            </button>
            <hr />
            <button type="button" disabled={!project} onClick={() => { closeProject(); onChooseDrift(); }}>
              Check against code
              <small aria-hidden="true">Compare the diagram with a newer compose file</small>
            </button>
            {project?.name === 'ride-share-platform' && (
              <button type="button" onClick={() => { closeProject(); onCheckExampleDrift(); }}>
                Try example update
                <small aria-hidden="true">Check this diagram against the next compose version</small>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="va-shell-chips">
        {currentBranchId !== 'main' && <span className="va-chip"><GitBranch size={14} /> {currentBranch?.name}</span>}
        {project && <span className="va-chip">{project.components.length} components</span>}
        {openDecisionCount > 0 && (
          <button type="button" className="va-chip va-chip-warn" onClick={() => onOpenDoc('risk')}>
            {openDecisionCount} open decision{openDecisionCount === 1 ? '' : 's'}
          </button>
        )}
        {guidedStep > 0 && guidedStep <= guidedTotal && (
          <span className="va-chip va-chip-accent">Guided demo · {guidedStep} of {guidedTotal}</span>
        )}
      </div>

      <div className="va-shell-actions">
        <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onUndo} disabled={!canUndo} aria-label="Undo last change" title="Undo (Ctrl+Z)">
          <Undo2 size={18} />
        </button>
        <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
          <Redo2 size={18} />
        </button>

        <button type="button" className="va-btn va-btn-ghost" onClick={() => onOpenDoc('impact')} aria-label="Generated docs" title="What changed, the API contract, risks, and tasks">
          <FileText size={16} /> <span className="va-shell-label">Docs</span>
        </button>

        <div className="va-menu" ref={exportMenuRef}>
          <button
            type="button"
            className="va-btn va-btn-ghost"
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            aria-label="Export"
            onClick={() => setExportOpen((open) => !open)}
          >
            <FileArchive size={16} /> <span className="va-shell-label">Export</span> <ChevronDown size={14} />
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

        <div className="va-pop" ref={moreRef}>
          <button
            type="button"
            className="va-btn va-btn-ghost"
            aria-expanded={showMore}
            aria-controls="va-advanced-menu"
            aria-label="More"
            onClick={() => setShowMore((open) => !open)}
          >
            <Layers size={16} /> <span className="va-shell-label">More</span> <ChevronDown size={14} />
          </button>
          {showMore && (
            <div className="va-pop-panel" id="va-advanced-menu">
              <button type="button" aria-expanded={showHistory} onClick={() => { setShowMore(false); setShowHistory((open) => !open); }}>
                Branches and history
                <small aria-hidden="true">On {currentBranch?.name || 'Main Branch'}. Fork, compare, merge, and go back in time.</small>
              </button>
              <button type="button" aria-pressed={advancedTools} onClick={() => { setShowMore(false); setAdvancedTools((open) => !open); }}>
                {advancedTools ? 'Hide outage simulator and decision records' : 'Outage simulator and decision records'}
                <small aria-hidden="true">Simulated outages, deployment order, and ADR sign-off on the diagram.</small>
              </button>
              <button type="button" onClick={() => { setShowMore(false); onOpenDoc('topology'); }}>
                Topology
                <small aria-hidden="true">Components by type, protocols, and model checks.</small>
              </button>
              <button type="button" disabled={!project} onClick={() => { setShowMore(false); onReset(); }}>
                Reset to baseline
                <small aria-hidden="true">Discard changes and return to the loaded sample or imported stack.</small>
              </button>
              <hr />
              <button type="button" disabled={!project} onClick={() => { setShowMore(false); onExportDevOps(); }}>
                DevOps bundle
                <small aria-hidden="true">Terraform, Kubernetes manifests, TypeScript SDK, OpenAPI 3.1 (ZIP).</small>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="va-btn va-btn-ghost va-btn-icon"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" className="va-btn va-btn-ghost va-btn-icon va-shell-shortcuts" onClick={onShowShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
          <HelpCircle size={18} />
        </button>
      </div>
    </header>
  );
}
