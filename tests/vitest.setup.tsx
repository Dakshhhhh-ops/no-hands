import '@testing-library/jest-dom';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

global.URL.createObjectURL = vi.fn(() => 'blob:mock');
global.URL.revokeObjectURL = vi.fn();

global.matchMedia = vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: [] })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => ({ data: [] })),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

vi.mock('lucide-react', () => {
  const icons = {
    Activity: 'Activity',
    ArrowRight: 'ArrowRight',
    AudioLines: 'AudioLines',
    Check: 'Check',
    ChevronDown: 'ChevronDown',
    CircleHelp: 'CircleHelp',
    ClipboardCheck: 'ClipboardCheck',
    ClipboardList: 'ClipboardList',
    FileArchive: 'FileArchive',
    FileCode2: 'FileCode2',
    GitBranch: 'GitBranch',
    Layers: 'Layers',
    Mic: 'Mic',
    Network: 'Network',
    Play: 'Play',
    Redo2: 'Redo2',
    RotateCcw: 'RotateCcw',
    RotateCw: 'RotateCw',
    History: 'History',
    Server: 'Server',
    ShieldAlert: 'ShieldAlert',
    Undo2: 'Undo2',
    X: 'X',
    Sun: 'Sun',
    Moon: 'Moon',
    Keyboard: 'Keyboard',
    AlertTriangle: 'AlertTriangle',
    RefreshCw: 'RefreshCw',
    FileText: 'FileText',
    Terminal: 'Terminal',
    Sparkles: 'Sparkles',
    CheckCircle: 'CheckCircle',
    CheckCircle2: 'CheckCircle2',
    Download: 'Download',
    Compass: 'Compass',
    Cpu: 'Cpu',
    Database: 'Database',
    Eye: 'Eye',
    Radio: 'Radio',
    DollarSign: 'DollarSign',
    Zap: 'Zap',
    TrendingUp: 'TrendingUp',
    TrendingDown: 'TrendingDown',
    AlertOctagon: 'AlertOctagon',
    Globe: 'Globe',
    AlertCircle: 'AlertCircle',
    Filter: 'Filter',
    ShieldCheck: 'ShieldCheck',
    HelpCircle: 'HelpCircle',
    Wifi: 'Wifi',
    SlidersHorizontal: 'SlidersHorizontal',
    ListOrdered: 'ListOrdered',
    Flame: 'Flame',
    Users: 'Users',
    FileCheck2: 'FileCheck2',
    Clock: 'Clock',
    GitCompare: 'GitCompare',
    Code: 'Code',
    Copy: 'Copy',
    ZoomIn: 'ZoomIn',
    ZoomOut: 'ZoomOut',
  };

  const mockComponents: Record<string, (props: { size?: number; className?: string }) => ReactElement> = {};
  for (const [key] of Object.entries(icons)) {
    mockComponents[key] = ({ size = 16, className = '' }) => (
      <svg data-testid={key.toLowerCase()} width={size} height={size} className={className} />
    );
  }

  return mockComponents;
});

vi.mock('../src/utils/sound.js', () => ({
  sound: {
    click: vi.fn(),
    apply: vi.fn(),
    export: vi.fn(),
    tab: vi.fn(),
  },
}));

vi.mock('../src/data/commerce.js', () => ({
  makeCommerceProject: vi.fn(() => ({
    name: 'Commerce Platform',
    version: 1,
    components: [],
    relationships: [],
    requirements: [],
    apiOperations: [],
    risks: [],
    tasks: [],
    changes: [],
    changed: false,
  })),
  makeFoodDeliveryProject: vi.fn(() => ({
    name: 'Food Delivery Platform',
    version: 1,
    components: [],
    relationships: [],
    requirements: [],
    apiOperations: [],
    risks: [],
    tasks: [],
    changes: [],
    changed: false,
  })),
  proposeChange: vi.fn(() => ({ items: [], assumptions: [] })),
  applyChange: vi.fn((p) => p),
  DEMO_COMMAND: 'Demo command',
  FOOD_DELIVERY_DEMO_COMMAND: 'Food demo command',
}));

vi.mock('../src/data/foodDelivery.js', () => ({
  makeFoodDeliveryProject: vi.fn(() => ({
    name: 'Food Delivery Platform',
    version: 1,
    components: [],
    relationships: [],
    requirements: [],
    apiOperations: [],
    risks: [],
    tasks: [],
    changes: [],
    changed: false,
  })),
  FOOD_DELIVERY_DEMO_COMMAND: 'Food demo command',
}));

vi.mock('../src/data/analysis.js', () => ({
  getProjectSyncStatus: vi.fn(() => 'Synced'),
  countOpenDecisions: vi.fn(() => 0),
  deriveRiskFindings: vi.fn(() => []),
  deriveTasks: vi.fn(() => []),
}));

vi.mock('../src/data/export.js', () => ({
  createVerifiedExportZip: vi.fn(),
  createVerifiedDevOpsZip: vi.fn(),
}));

vi.mock('../src/data/diagramExport.js', () => ({
  renderArchitecturePng: vi.fn(),
  makeArchitectureSvg: vi.fn(),
  makeArchitectureMermaid: vi.fn(),
}));

vi.mock('../src/data/branching.ts', () => ({
  forkBranch: vi.fn(),
  compareBranches: vi.fn(),
}));

vi.mock('../src/data/semanticMerge.ts', () => ({
  detectMergeConflicts: vi.fn(),
  executeMerge: vi.fn(),
}));

vi.mock('../src/hooks/useChaosWorker.ts', () => ({
  useChaosWorker: () => ({
    overallSystemHealth: 'OPTIMAL',
    totalRpsThroughput: 100,
    droppedRps: 0,
    averageLatencyMs: 50,
    slowestPathMs: 100,
    nodeMetrics: new Map(),
    edgeMetrics: new Map(),
    cascadingFailures: [],
  }),
}));

vi.mock('../src/data/historyManager.ts', () => ({
  HistoryTimeline: class {
    push = vi.fn();
    undo = vi.fn();
    redo = vi.fn();
    jumpTo = vi.fn();
    getFullTimeline = vi.fn(() => []);
    canUndo = false;
    canRedo = false;
  },
}));