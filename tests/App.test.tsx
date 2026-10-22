import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('lucide-react', () => {
  const icons = {
    HelpCircle: 'HelpCircle',
    FileText: 'FileText',
    BookA: 'BookA',
    Languages: 'Languages',
    WandSparkles: 'WandSparkles',
    Link2: 'Link2',
    RefreshCw: 'RefreshCw',
    Unlink: 'Unlink',
    Network: 'Network',
    FileCode2: 'FileCode2',
    ShieldAlert: 'ShieldAlert',
    ClipboardList: 'ClipboardList',
    Activity: 'Activity',
    Layers: 'Layers',
    ClipboardCheck: 'ClipboardCheck',
    FileArchive: 'FileArchive',
    Server: 'Server',
    GitBranch: 'GitBranch',
    RotateCcw: 'RotateCcw',
    Sun: 'Sun',
    Moon: 'Moon',
    Keyboard: 'Keyboard',
    CircleHelp: 'CircleHelp',
    AudioLines: 'AudioLines',
    ArrowRight: 'ArrowRight',
    Check: 'Check',
    ChevronDown: 'ChevronDown',
    X: 'X',
    Play: 'Play',
    Redo2: 'Redo2',
    Undo2: 'Undo2',
    Mic: 'Mic',
    Terminal: 'Terminal',
    SlidersHorizontal: 'SlidersHorizontal',
    RotateCw: 'RotateCw',
    History: 'History',
    Zap: 'Zap',
    ExternalLink: 'ExternalLink',
    Target: 'Target',
    Search: 'Search',
    ChevronsLeft: 'ChevronsLeft',
    WifiOff: 'WifiOff',
    Cloud: 'Cloud',
    Loader2: 'Loader2',
    Download: 'Download',
    Copy: 'Copy',
    Flame: 'Flame',
    Clock: 'Clock',
    AlertTriangle: 'AlertTriangle',
    ZoomIn: 'ZoomIn',
    ZoomOut: 'ZoomOut',
    ListOrdered: 'ListOrdered',
    FileCheck2: 'FileCheck2',
    Bug: 'Bug',
    GitMerge: 'GitMerge',
    CheckCircle2: 'CheckCircle2',
    MousePointerClick: 'MousePointerClick',
    Pin: 'Pin',
    PinOff: 'PinOff',
  };
  const mockComponents: Record<string, (props: { size?: number; className?: string }) => ReactElement> = {};
  for (const [key] of Object.entries(icons)) {
    mockComponents[key] = ({ size = 16, className = '' }) => (
      <svg data-testid={key.toLowerCase()} width={size} height={size} className={className} />
    );
  }
  return mockComponents;
});

import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../src/App.tsx';
import Landing from '../src/Landing.tsx';

const renderApp = () => render(<App />);

/** The samples are in the workspace's project switcher. */
function loadSample() {
  fireEvent.click(screen.getByRole('button', { name: /Switch project/ }));
  fireEvent.click(screen.getByText('Load sample'));
}


describe('App component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders hero section with start demo link', () => {
    render(<Landing />);
    expect(screen.getByRole('link', { name: /Start guided demo/ })).toHaveAttribute('href', '/app?demo=guided');
    expect(screen.getByRole('link', { name: /Use my own stack/ })).toHaveAttribute('href', '/app?import=compose');
  });

  it('loads Commerce Platform sample when button clicked', () => {
    renderApp();
    loadSample();
    expect(screen.getByRole('heading', { level: 1, name: 'Commerce Platform' })).toBeInTheDocument();
  });

  it('shows workspace section after loading sample', () => {
    renderApp();
    loadSample();
    expect(screen.getByRole('heading', { name: 'Say the change' })).toBeInTheDocument();
  });

  it('puts focus in the instruction box on arrival, where Wispr Flow types', () => {
    renderApp();
    expect(document.activeElement).toBe(screen.getByLabelText('Your instruction'));
  });

  it('opens the docs in the details drawer, with Topology only once opened from More', () => {
    renderApp();
    expect(screen.queryByRole('tablist', { name: 'Details' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Topology/ }));
    const tabs = within(screen.getByRole('tablist', { name: 'Details' })).getAllByRole('tab').map((tab) => tab.textContent?.trim());
    expect(tabs).toEqual(['Component', 'What changed', 'API contract', 'Risks', 'Tasks', 'Topology']);
    expect(screen.getByRole('tab', { name: 'Topology', selected: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Risks' }));
    expect(screen.getByRole('tab', { name: 'Risks', selected: true })).toBeInTheDocument();
  });

  it('opens export menu', () => {
    renderApp();
    loadSample();
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByText('Engineering artifacts')).toBeInTheDocument();
    expect(screen.queryByText('DevOps bundle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    expect(screen.getByRole('button', { name: /^DevOps bundle/ })).toBeInTheDocument();
  });

  it('toggles history panel', async () => {
    renderApp();
    loadSample();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('button', { name: /branches and history/i }));
    // The branches panel loads on first open.
    const branchChips = await screen.findAllByText('Main Branch');
    expect(branchChips.length).toBeGreaterThan(0);
  });

  it('switches drawer tabs with keyboard navigation', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Topology/ }));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Topology', selected: true }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Tasks', selected: true })).toHaveAttribute('aria-selected', 'true');
  });

  it('resizes the instruction panel from the keyboard', () => {
    renderApp();
    const splitter = screen.getByRole('separator', { name: 'Resize the instruction panel' });
    const before = Number(splitter.getAttribute('aria-valuenow'));
    fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    expect(Number(splitter.getAttribute('aria-valuenow'))).toBe(before + 16);
    fireEvent.keyDown(splitter, { key: 'End' });
    expect(splitter).toHaveAttribute('aria-valuenow', '520');
  });
});

describe('Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('has proper heading hierarchy', () => {
    render(<Landing />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Say the change.');
  });

  it('has landmark regions', () => {
    renderApp();
    loadSample();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('export menu is keyboard accessible', () => {
    renderApp();
    loadSample();
    const exportBtn = screen.getByRole('button', { name: /export/i });
    expect(exportBtn).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(exportBtn);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('instruction textarea has proper labeling', () => {
    renderApp();
    loadSample();
    const textarea = screen.getByLabelText('Your instruction');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('placeholder');
  });

  it('sample selector is accessible', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Switch project/ }));
    const select = screen.getByLabelText('Sample architecture');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Commerce Platform' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Food Delivery' })).toBeInTheDocument();
  });

  it('tabs have proper ARIA attributes', () => {
    renderApp();
    loadSample();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Topology/ }));
    expect(screen.getByRole('tablist', { name: 'Details' })).toBeInTheDocument();
    const topologyTab = screen.getByRole('tab', { name: 'Topology' });
    expect(topologyTab).toHaveAttribute('aria-selected', 'true');
    expect(topologyTab).toHaveAttribute('aria-controls', 'drawer-panel');
  });

  it('sync status is announced to screen readers', () => {
    renderApp();
    loadSample();
    const syncStatuses = screen.getAllByRole('status');
    expect(syncStatuses.length).toBeGreaterThan(0);
    expect(syncStatuses[0]).toBeInTheDocument();
  });
});