import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArchitectureDiagram from '../src/components/ArchitectureDiagram.tsx';
import type { Project } from '../src/types/schema.ts';

// Shaped like ProjectSchema.parse output: defaulted fields (responsibilities, activity) are present.
const mockProject: Project = {
  name: 'Test Architecture',
  version: 1,
  components: [
    { id: 'web', name: 'Web Frontend', type: 'SERVICE', sub: 'React SPA', responsibilities: [], x: 100, y: 100 },
    { id: 'api', name: 'API Gateway', type: 'SERVICE', sub: 'Kong', responsibilities: [], x: 300, y: 100 },
    { id: 'auth', name: 'Auth Service', type: 'SERVICE', sub: 'JWT + Redis', responsibilities: [], x: 500, y: 100 },
  ],
  relationships: [
    { from: 'web', to: 'api', label: 'HTTPS' },
    { from: 'api', to: 'auth', label: 'gRPC' },
  ],
  requirements: [],
  apiOperations: [],
  activity: [],
  changes: [],
  changed: false,
};

describe('ArchitectureDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders diagram with nodes and edges', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    expect(screen.getByText('Web Frontend')).toBeInTheDocument();
    expect(screen.getByText('API Gateway')).toBeInTheDocument();
    expect(screen.getByText('Auth Service')).toBeInTheDocument();
  });

  it('has proper ARIA labels on SVG', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    const svg = screen.getByRole('group', { name: /test architecture architecture diagram/i });
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox');
  });

  it('nodes are keyboard accessible', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    const webNode = screen.getByRole('button', { name: /web frontend, service/i });
    expect(webNode).toBeInTheDocument();
    expect(webNode).toHaveAttribute('tabindex', '0');
    expect(webNode).toHaveAttribute('aria-label');
  });

  it('selects node on click', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    const webNode = screen.getByRole('button', { name: /web frontend, service/i });
    fireEvent.click(webNode);
    expect(webNode).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects node on Enter key', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    const webNode = screen.getByRole('button', { name: /web frontend, service/i });
    fireEvent.keyDown(webNode, { key: 'Enter' });
    expect(webNode).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects node on Space key', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    const webNode = screen.getByRole('button', { name: /web frontend, service/i });
    fireEvent.keyDown(webNode, { key: ' ' });
    expect(webNode).toHaveAttribute('aria-pressed', 'true');
  });

  it('navigates to downstream with ArrowRight', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    const webNode = screen.getByRole('button', { name: /web frontend, service/i });
    fireEvent.keyDown(webNode, { key: 'ArrowRight' });
    const apiNode = screen.getByRole('button', { name: /api gateway, service/i });
    expect(apiNode).toHaveAttribute('aria-pressed', 'true');
  });

  it('navigates to upstream with ArrowLeft', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    const authNode = screen.getByRole('button', { name: /auth service, service/i });
    fireEvent.keyDown(authNode, { key: 'ArrowLeft' });
    const apiNode = screen.getByRole('button', { name: /api gateway, service/i });
    expect(apiNode).toHaveAttribute('aria-pressed', 'true');
  });

  it('clears selection on Escape', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    const webNode = screen.getByRole('button', { name: /web frontend, service/i });
    fireEvent.click(webNode);
    expect(webNode).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(webNode, { key: 'Escape' });
    expect(webNode).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides advanced tools until More tools is opened', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    expect(screen.queryByRole('button', { name: /deployment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /kill redis/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More tools' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows deployment button', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    expect(screen.getByRole('button', { name: /deployment/i })).toBeInTheDocument();
  });

  it('labels the outage simulator as simulated and targets components from the model', async () => {
    const withData: Project = {
      ...mockProject,
      components: [
        ...mockProject.components,
        { id: 'sessions', name: 'Session Cache', type: 'CACHE', sub: '', responsibilities: [], x: 0, y: 0 },
        { id: 'main-db', name: 'Main DB', type: 'DATABASE', sub: '', responsibilities: [], x: 0, y: 0 },
      ],
    };
    render(<ArchitectureDiagram project={withData} />);
    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    // The simulator bar loads on first use.
    expect(await screen.findByRole('button', { name: 'Kill Session Cache' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kill Main DB' })).toBeInTheDocument();
    expect(screen.getByText('Simulated')).toBeInTheDocument();
    expect(screen.getByText(/Simulated, not measured/)).toBeInTheDocument();
  });

  it('offers no outage buttons for component types the model does not have', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    expect(screen.queryByRole('button', { name: /^Kill / })).not.toBeInTheDocument();
  });

  it('has no simulated collaborators', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    expect(screen.queryByRole('button', { name: /pairing/i })).not.toBeInTheDocument();
  });

  it('has zoom controls', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /100%/i })).toBeInTheDocument();
  });

  it('gives data stores their own pattern, and services theirs', () => {
    const withStore: Project = {
      ...mockProject,
      components: [
        ...mockProject.components,
        { id: 'db', name: 'Orders DB', type: 'DATABASE', sub: 'PostgreSQL', responsibilities: [], x: 700, y: 100 },
      ],
    };
    const { container } = render(<ArchitectureDiagram project={withStore} />);
    const fills = [...container.querySelectorAll<SVGRectElement>('rect[opacity="0.1"]')].map((rect) => rect.style.fill);
    expect(fills.filter((fill) => fill.includes('pattern-datastore'))).toHaveLength(1);
    expect(fills.filter((fill) => fill.includes('pattern-service'))).toHaveLength(3);
  });
});