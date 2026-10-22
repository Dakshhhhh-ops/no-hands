import { ZoomIn, ZoomOut, ListOrdered, FileCheck2 } from 'lucide-react';
import type { SetStateAction } from 'react';
import { sound } from '../../utils/sound.ts';
import type { GridStyle, LayoutEngine, ViewMode } from './diagramTypes.ts';

export interface DiagramToolbarProps {
  viewMode: ViewMode;
  /** Version of the model being drawn (the baseline's while viewing the baseline). */
  modelVersion: number;
  projectVersion: number;
  /** The project has applied changes, so there is a baseline to compare against. */
  projectChanged: boolean;
  /** The app's Advanced menu owns the tools toggle, so the diagram hides its own. */
  toolsControlled: boolean;
  showTools: boolean;
  setShowTools: (update: SetStateAction<boolean>) => void;
  layoutEngine: LayoutEngine;
  setLayoutEngine: (engine: LayoutEngine) => void;
  gridStyle: GridStyle;
  setGridStyle: (style: GridStyle) => void;
  setShowDeploymentModal: (open: boolean) => void;
  setShowAdrModal: (open: boolean) => void;
  zoom: number;
  handleZoom: (delta: number) => void;
  resetZoom: () => void;
  handleModeChange: (mode: ViewMode) => void;
}

export default function DiagramToolbar({
  viewMode,
  modelVersion,
  projectVersion,
  projectChanged,
  toolsControlled,
  showTools,
  setShowTools,
  layoutEngine,
  setLayoutEngine,
  gridStyle,
  setGridStyle,
  setShowDeploymentModal,
  setShowAdrModal,
  zoom,
  handleZoom,
  resetZoom,
  handleModeChange,
}: DiagramToolbarProps) {
  return (
    <div className="diagram-toolbar">
      <div className="diagram-toolbar-title-wrap">
        <span className="diagram-view-label">
          {viewMode === 'baseline' ? `Baseline snapshot · v${modelVersion}` : `Current model · v${modelVersion}`}
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
            disabled={!projectChanged}
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
            Current (v{projectVersion})
          </button>
        </div>
      </div>
    </div>
  );
}
