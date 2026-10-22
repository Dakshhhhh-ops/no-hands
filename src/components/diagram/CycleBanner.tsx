import { AlertTriangle } from 'lucide-react';
import type { CycleReport } from '../../data/graphCycle.ts';

export interface CycleBannerProps {
  cycleReport: CycleReport;
}

export default function CycleBanner({ cycleReport }: CycleBannerProps) {
  return (
    <div className="diagram-cycle-banner" role="alert">
      <AlertTriangle size={16} />
      <span>
        <b>Circular Dependency Warning:</b> Detected{' '}
        {cycleReport.cycleCount} circular loop(s):{' '}
        {cycleReport.cycles.map((c) => c.join(' → ')).join(' | ')}.
        Risk of synchronous deadlock under high concurrency.
      </span>
    </div>
  );
}
