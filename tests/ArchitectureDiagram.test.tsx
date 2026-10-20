import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArchitectureDiagram from '../src/components/ArchitectureDiagram.jsx';

const mockProject = {
  name: 'Test Architecture',
  version: 1,
  components: [
    { id: 'web', name: 'Web Frontend', type: 'SERVICE', sub: 'React SPA', x: 100, y: 100 },
    { id: 'api', name: 'API Gateway', type: 'SERVICE', sub: 'Kong', x: 300, y: 100 },
    { id: 'auth', name: 'Auth Service', type: 'SERVICE', sub: 'JWT + Redis', x: 500, y: 100 },
  ],
  relationships: [
    { from: 'web', to: 'api', label: 'HTTPS' },
    { from: 'api', to: 'auth', label: 'gRPC' },
  ],
  requirements: [],
  apiOperations: [],
  risks: [],
  tasks: [],
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

  it('shows deployment button', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    expect(screen.getByRole('button', { name: /deployment/i })).toBeInTheDocument();
  });

  it('shows chaos injection buttons', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    expect(screen.getByRole('button', { name: /kill redis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kill postgres/i })).toBeInTheDocument();
  });

  it('has zoom controls', () => {
    render(<ArchitectureDiagram project={mockProject} />);
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /100%/i })).toBeInTheDocument();
  });
});