import { lazy, Suspense } from 'react';
import type { RefObject } from 'react';
import { ArrowRight, Network } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary.tsx';
import { DiagramSkeleton } from './Skeleton.tsx';
import type { Project } from '../types/schema.ts';

const ArchitectureDiagram = lazy(() => import('./ArchitectureDiagram.tsx'));

export interface DiagramViewProps {
  project: Project | null;
  advancedTools: boolean;
  setAdvancedTools: (open: boolean) => void;
  onLoadSample: () => void;
  /** Where the selected component's inspector is rendered (the details drawer). */
  inspectorSlot?: RefObject<HTMLDivElement | null>;
  onSelect?: (id: string | null) => void;
  onOpenDocs?: () => void;
}

/** The diagram, filling the workspace canvas. */
export function DiagramView({ project, advancedTools, setAdvancedTools, onLoadSample, inspectorSlot, onSelect, onOpenDocs }: DiagramViewProps) {
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
  return (
    <Suspense fallback={<DiagramSkeleton />}>
      <ErrorBoundary fallback={<div>Diagram unavailable</div>}>
        <ArchitectureDiagram
          project={project}
          toolsOpen={advancedTools}
          onToolsOpenChange={setAdvancedTools}
          inspectorSlot={inspectorSlot}
          onSelect={onSelect}
          onOpenDocs={onOpenDocs}
        />
      </ErrorBoundary>
    </Suspense>
  );
}
