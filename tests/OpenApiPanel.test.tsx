import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import OpenApiPanel from '../src/components/OpenApiPanel.tsx';
import type { Project } from '../src/types/schema.ts';

const mockProject: Project = {
  name: 'Test Architecture',
  version: 1,
  components: [],
  relationships: [],
  requirements: [],
  apiOperations: [],
  activity: [],
  changes: [],
  changed: false,
};

describe('OpenApiPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders OpenAPI panel', () => {
    render(<OpenApiPanel project={mockProject} onNotify={vi.fn()} />);
    const openApiElements = screen.getAllByText(/openapi 3\.1/i);
    expect(openApiElements.length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 3, name: 'API contract' })).toBeInTheDocument();
  });

  it('has copy and download buttons', () => {
    render(<OpenApiPanel project={mockProject} onNotify={vi.fn()} />);
    expect(screen.getByRole('button', { name: /copy json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  it('has view mode buttons', () => {
    render(<OpenApiPanel project={mockProject} onNotify={vi.fn()} />);
    expect(screen.getByRole('button', { name: /endpoints/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /contract drift/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /terraform & k8s/i })).toBeInTheDocument();
  });
});