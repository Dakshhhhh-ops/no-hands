import { lazy, Suspense, useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Activity, ClipboardList, FileCode2, Layers, MousePointerClick, Pin, PinOff, ShieldAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ErrorBoundary from '../ErrorBoundary.tsx';
import { ListSkeleton, TableSkeleton } from '../Skeleton.tsx';
import type { Project, Proposal } from '../../types/schema.ts';

const OpenApiPanel = lazy(() => import('../OpenApiPanel.tsx'));
const RiskPanel = lazy(() => import('../RiskPanel.tsx'));
const TaskPanel = lazy(() => import('../TaskPanel.tsx'));
const ChangeImpactPanel = lazy(() => import('../ChangeImpactPanel.tsx'));
const TopologyPanel = lazy(() => import('../TopologyPanel.tsx'));

export type DrawerTab = 'component' | 'impact' | 'openapi' | 'risk' | 'tasks' | 'topology';

interface TabDef { id: DrawerTab; label: string; icon: LucideIcon }

const TABS: TabDef[] = [
  { id: 'component', label: 'Component', icon: MousePointerClick },
  { id: 'impact', label: 'What changed', icon: Activity },
  { id: 'openapi', label: 'API contract', icon: FileCode2 },
  { id: 'risk', label: 'Risks', icon: ShieldAlert },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
];
const TOPOLOGY: TabDef = { id: 'topology', label: 'Topology', icon: Layers };

export interface DrawerProps {
  open: boolean;
  pinned: boolean;
  canPin: boolean;
  /** Below 1024px the drawer is an overlay: focus stays inside and Escape closes it. */
  overlay: boolean;
  tab: DrawerTab;
  onTab: (tab: DrawerTab) => void;
  onClose: () => void;
  onTogglePin: () => void;
  project: Project | null;
  openDecisionCount: number;
  notify: (message: string) => void;
  onResolve: (proposal: Proposal | null) => void;
  /** Where the diagram renders the selected component's inspector. */
  inspectorSlot: RefObject<HTMLDivElement | null>;
  hasSelection: boolean;
}

function Panel({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  return <ErrorBoundary fallback={<p>This view is unavailable.</p>}><Suspense fallback={fallback}>{children}</Suspense></ErrorBoundary>;
}

/** The right drawer: the selected component, what changed, and the generated docs, beside the diagram. */
export default function Drawer({
  open, pinned, canPin, overlay, tab, onTab, onClose, onTogglePin, project, openDecisionCount, notify, onResolve,
  inspectorSlot, hasSelection,
}: DrawerProps) {
  const ref = useRef<HTMLElement | null>(null);
  const tabs = [...TABS, ...(tab === 'topology' ? [TOPOLOGY] : [])];

  // As an overlay the drawer traps focus and closes on Escape, like a dialog.
  useEffect(() => {
    if (!open || !overlay) return undefined;
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus?.(); };
  }, [open, overlay, onClose]);

  function content() {
    if (!project) return null;
    if (tab === 'impact') return <Panel fallback={<ListSkeleton items={4} />}><ChangeImpactPanel project={project} /></Panel>;
    if (tab === 'openapi') return <Panel fallback={<TableSkeleton rows={6} columns={3} />}><OpenApiPanel project={project} onNotify={notify} /></Panel>;
    if (tab === 'risk') return <Panel fallback={<TableSkeleton rows={5} columns={3} />}><RiskPanel project={project} onResolve={onResolve} /></Panel>;
    if (tab === 'tasks') return <Panel fallback={<TableSkeleton rows={5} columns={3} />}><TaskPanel project={project} /></Panel>;
    if (tab === 'topology') return <Panel fallback={<ListSkeleton items={4} />}><TopologyPanel project={project} /></Panel>;
    return null;
  }

  return (
    <aside
      id="va-drawer"
      ref={ref}
      className="va-drawer"
      data-open={open}
      data-pinned={pinned}
      data-overlay={overlay}
      aria-label="Details"
      aria-modal={overlay && open ? true : undefined}
      role={overlay && open ? 'dialog' : undefined}
      hidden={!open}
    >
      <div className="va-drawer-head">
        <div
          className="va-drawer-tabs"
          role="tablist"
          aria-label="Details"
          onKeyDown={(event) => {
            const current = tabs.findIndex((item) => item.id === tab);
            let next: number;
            if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            const nextTab = tabs[next];
            if (!nextTab) return;
            event.preventDefault();
            onTab(nextTab.id);
            document.getElementById(`drawer-tab-${nextTab.id}`)?.focus();
          }}
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`drawer-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls="drawer-panel"
              tabIndex={tab === id ? 0 : -1}
              onClick={() => onTab(id)}
            >
              <Icon size={16} aria-hidden="true" /> {label}
              {id === 'risk' && openDecisionCount > 0 && <span className="va-tab-count">{openDecisionCount} open</span>}
            </button>
          ))}
        </div>
        <div className="va-drawer-tools">
          {canPin && (
            <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onTogglePin} aria-pressed={pinned} aria-label={pinned ? 'Unpin the details panel' : 'Pin the details panel open'}>
              {pinned ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
          )}
          <button type="button" className="va-btn va-btn-ghost va-btn-icon" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="va-drawer-body" id="drawer-panel" role="tabpanel" aria-labelledby={`drawer-tab-${tab}`} tabIndex={0}>
        {/* The diagram renders the selected component's inspector here. */}
        <div ref={inspectorSlot} hidden={tab !== 'component'} className="va-drawer-inspector" />
        {tab === 'component' && !hasSelection && (
          <p className="va-drawer-hint">Select a component on the diagram to see what it does, what depends on it, and what it depends on.</p>
        )}
        {content()}
      </div>
    </aside>
  );
}
