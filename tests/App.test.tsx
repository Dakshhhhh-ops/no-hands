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
  };
  const mockComponents: Record<string, (props: { size?: number; className?: string }) => ReactElement> = {};
  for (const [key] of Object.entries(icons)) {
    mockComponents[key] = ({ size = 16, className = '' }) => (
      <svg data-testid={key.toLowerCase()} width={size} height={size} className={className} />
    );
  }
  return mockComponents;
});

import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/App.tsx';

const renderApp = () => render(<App />);

describe('App component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders hero section with start demo button', () => {
    renderApp();
    expect(screen.getByText('Start guided demo')).toBeInTheDocument();
  });

  it('loads Commerce Platform sample when button clicked', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    expect(screen.getByRole('heading', { level: 2, name: 'Commerce Platform' })).toBeInTheDocument();
  });

  it('shows workspace section after loading sample', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    expect(screen.getByText('What should change?')).toBeInTheDocument();
  });

  it('shows journey steps', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    expect(screen.getByText('Start with the sample')).toBeInTheDocument();
    expect(screen.getByText('Enter or dictate a change')).toBeInTheDocument();
  });

  it('renders all tabs', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    expect(screen.getByRole('tab', { name: 'Diagram' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'What changed' })).toBeInTheDocument();
    // The generated documents live in one menu and join the tab row when opened.
    expect(screen.queryByRole('tab', { name: 'Risks' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Generated docs/ }));
    expect(screen.getByRole('button', { name: /^API contract/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tasks/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Risks/ }));
    expect(screen.getByRole('tab', { name: 'Risks', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Topology' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Topology/ }));
    expect(screen.getByRole('tab', { name: 'Topology', selected: true })).toBeInTheDocument();
  });

  it('opens export menu', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByText('Engineering artifacts')).toBeInTheDocument();
    expect(screen.queryByText('DevOps bundle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    expect(screen.getByRole('button', { name: /^DevOps bundle/ })).toBeInTheDocument();
  });

  it('toggles history panel', async () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    fireEvent.click(screen.getByRole('button', { name: /branches and history/i }));
    // The branches panel loads on first open.
    const branchChips = await screen.findAllByText('Main Branch');
    expect(branchChips.length).toBeGreaterThan(0);
  });

  it('switches tabs with keyboard navigation', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    const diagramTab = screen.getByRole('tab', { name: 'Diagram', selected: true });
    expect(diagramTab).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(diagramTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'What changed', selected: true })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('has proper heading hierarchy', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Say the change.');
  });

  it('has landmark regions', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('export menu is keyboard accessible', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    const exportBtn = screen.getByRole('button', { name: /export/i });
    expect(exportBtn).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(exportBtn);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('instruction textarea has proper labeling', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    const textarea = screen.getByLabelText('Your instruction');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('placeholder');
  });

  it('sample selector is accessible', () => {
    renderApp();
    const select = screen.getByLabelText('Sample architecture');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Commerce Platform' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Food Delivery' })).toBeInTheDocument();
  });

  it('tabs have proper ARIA attributes', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    const tablist = screen.getByRole('tablist', { name: 'Architecture outputs' });
    expect(tablist).toBeInTheDocument();
    const diagramTab = screen.getByRole('tab', { name: 'Diagram' });
    expect(diagramTab).toHaveAttribute('aria-selected', 'true');
    expect(diagramTab).toHaveAttribute('aria-controls', 'artifact-panel');
  });

  it('sync status is announced to screen readers', () => {
    renderApp();
    fireEvent.click(screen.getByText('Load sample'));
    const syncStatuses = screen.getAllByRole('status');
    expect(syncStatuses.length).toBeGreaterThan(0);
    expect(syncStatuses[0]).toBeInTheDocument();
  });
});