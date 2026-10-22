import type { LucideIcon } from 'lucide-react';
import { Activity, ClipboardList, FileCode2, Layers, Network, ShieldAlert } from 'lucide-react';

/** The output views of the model, shared by the output panel and the toolbar's More menu. */
export interface OutputTab { id: string; label: string; icon: LucideIcon }

// Diagram and What changed are always tabs. The generated documents live in one menu
// and join the tab row only while one of them is open, so the row stays short.
export const DIAGRAM_TAB: OutputTab = { id: 'diagram', label: 'Diagram', icon: Network };
export const PRIMARY_TABS: OutputTab[] = [DIAGRAM_TAB, { id: 'impact', label: 'What changed', icon: Activity }];
export const DOC_TABS: Array<OutputTab & { hint: string }> = [
  { id: 'openapi', label: 'API contract', icon: FileCode2, hint: 'OpenAPI 3.1, derived from the model' },
  { id: 'risk', label: 'Risks', icon: ShieldAlert, hint: 'Findings with the facts behind them' },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList, hint: 'Engineering work with acceptance criteria' },
];
// Opened from the More menu; it appears in the tab row only while it is open.
export const TOPOLOGY_TAB: OutputTab = { id: 'topology', label: 'Topology', icon: Layers };
