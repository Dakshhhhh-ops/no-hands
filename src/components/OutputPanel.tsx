import { lazy, Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown, FileCode2, Network } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary.tsx';
import { DiagramSkeleton, TableSkeleton, ListSkeleton } from './Skeleton.tsx';
import { useDismiss } from '../hooks/useDismiss.ts';
import type { Project, Proposal } from '../types/schema.ts';

const ArchitectureDiagram = lazy(() => import('./ArchitectureDiagram.tsx'));
const OpenApiPanel = lazy(() => import('./OpenApiPanel.tsx'));
const RiskPanel = lazy(() => import('./RiskPanel.tsx'));
const TaskPanel = lazy(() => import('./TaskPanel.tsx'));
const ChangeImpactPanel = lazy(() => import('./ChangeImpactPanel.tsx'));
const TopologyPanel = lazy(() => import('./TopologyPanel.tsx'));

import { DIAGRAM_TAB, DOC_TABS, PRIMARY_TABS, TOPOLOGY_TAB } from './outputTabs.ts';

function PanelWrapper({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ErrorBoundary fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}

export interface OutputPanelProps {
  project: Project | null;
  tab: string;
  onTabChange: (tab: string) => void;
  openDecisionCount: number;
  syncStatus: string;
  advancedTools: boolean;
  setAdvancedTools: (open: boolean) => void;
  notify: (message: string) => void;
  onResolve: (proposal: Proposal | null) => void;
  onLoadSample: () => void;
}

/** The generated views of the model: Diagram and What changed as tabs, the docs in one menu. */
export default function OutputPanel({
  project, tab, onTabChange, openDecisionCount, syncStatus, advancedTools, setAdvancedTools, notify, onResolve, onLoadSample,
}: OutputPanelProps) {
  const [showDocsMenu, setShowDocsMenu] = useState(false);
  const docsMenuRef = useDismiss(showDocsMenu, () => setShowDocsMenu(false));
  const activeDoc = DOC_TABS.find((item) => item.id === tab);
  const visibleTabs = [...PRIMARY_TABS, ...(activeDoc ? [activeDoc] : []), ...(tab === TOPOLOGY_TAB.id ? [TOPOLOGY_TAB] : [])];
  const activeTab = visibleTabs.find((item) => item.id === tab) ?? DIAGRAM_TAB;

  function content() {
    if (!project) {
      return (
        <div className="va-empty">
          <Network size={28} />
          <b>No model loaded</b>
          <p>Load the Commerce Platform sample to see its diagram, API contract, risks, and tasks.</p>
          <button type="button" className="va-btn va-btn-primary" onClick={onLoadSample}>
            Load sample <ArrowRight size={15} />
          </button>
        </div>
      );
    }
    if (tab === 'diagram') return <Suspense fallback={<DiagramSkeleton />}><PanelWrapper fallback={<div>Diagram unavailable</div>}><ArchitectureDiagram project={project} toolsOpen={advancedTools} onToolsOpenChange={setAdvancedTools} /></PanelWrapper></Suspense>;
    if (tab === 'openapi') return <Suspense fallback={<TableSkeleton rows={6} columns={4} />}><PanelWrapper fallback={<div>API contract unavailable</div>}><OpenApiPanel project={project} onNotify={notify} /></PanelWrapper></Suspense>;
    if (tab === 'risk') return <Suspense fallback={<TableSkeleton rows={5} columns={5} />}><PanelWrapper fallback={<div>Risks unavailable</div>}><RiskPanel project={project} onResolve={onResolve} /></PanelWrapper></Suspense>;
    if (tab === 'tasks') return <Suspense fallback={<TableSkeleton rows={5} columns={6} />}><PanelWrapper fallback={<div>Tasks unavailable</div>}><TaskPanel project={project} /></PanelWrapper></Suspense>;
    if (tab === 'impact') return <Suspense fallback={<ListSkeleton items={4} />}><PanelWrapper fallback={<div>Change impact unavailable</div>}><ChangeImpactPanel project={project} /></PanelWrapper></Suspense>;
    return <Suspense fallback={<DiagramSkeleton />}><PanelWrapper fallback={<div>Topology unavailable</div>}><TopologyPanel project={project} /></PanelWrapper></Suspense>;
  }

  return (
    <section className="va-output" aria-label="Generated architecture">
      <div className="va-card">
        <div className="va-tabs-row">
        <div
          className="va-tabs"
          role="tablist"
          aria-label="Architecture outputs"
          onKeyDown={(event) => {
            const current = visibleTabs.findIndex((item) => item.id === tab);
            let _next;
            if (event.key === 'ArrowRight') _next = (current + 1) % visibleTabs.length;
            else if (event.key === 'ArrowLeft') _next = (current - 1 + visibleTabs.length) % visibleTabs.length;
            else if (event.key === 'Home') _next = 0;
            else if (event.key === 'End') _next = visibleTabs.length - 1;
            else return;
            const nextTab = visibleTabs[_next];
            if (!nextTab) return;
            event.preventDefault();
            onTabChange(nextTab.id);
            document.getElementById(`tab-${nextTab.id}`)?.focus();
          }}
        >
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              id={`tab-${id}`}
              key={id}
              type="button"
              role="tab"
              className="va-tab"
              aria-controls="artifact-panel"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              onClick={(event) => { onTabChange(id); event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="va-pop va-docs-menu" ref={docsMenuRef}>
          <button
            type="button"
            className="va-docs-trigger"
            aria-label="Generated docs"
            aria-expanded={showDocsMenu}
            aria-controls="va-docs-menu"
            onClick={() => setShowDocsMenu((open) => !open)}
          >
            <FileCode2 size={15} /> <span className="va-docs-long">Generated docs</span><span className="va-docs-short">Docs</span> <ChevronDown size={14} />
          </button>
          {showDocsMenu && (
            <div className="va-pop-panel" id="va-docs-menu">
              {DOC_TABS.map(({ id, label, hint }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={tab === id ? 'true' : undefined}
                  onClick={() => { setShowDocsMenu(false); onTabChange(id); }}
                >
                  <span>{label}{id === 'risk' && openDecisionCount > 0 ? ` · ${openDecisionCount} open` : ''}</span>
                  <small aria-hidden="true">{hint}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
        <span
          className="va-sync va-sr-only"
          data-unresolved={Boolean(project && syncStatus.includes('unresolved'))}
          role="status"
          aria-live="polite"
        >
          {syncStatus}
        </span>

        <div
          className="va-panel-body"
          id="artifact-panel"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab.id}`}
          tabIndex={0}
        >
          {content()}
        </div>
      </div>
    </section>
  );
}
