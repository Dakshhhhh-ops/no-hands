import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TaskPanel from '../src/components/TaskPanel.jsx';

const mockProject = {
  name: 'Test Architecture',
  version: 1,
  components: [],
  relationships: [],
  requirements: [],
  apiOperations: [],
  risks: [],
  tasks: [],
  changes: [],
  changed: false,
};

describe('TaskPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders engineering tasks header', () => {
    render(<TaskPanel project={mockProject} />);
    expect(screen.getByText('Engineering tasks')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    render(<TaskPanel project={mockProject} />);
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
  });

  it('has accessible structure', () => {
    render(<TaskPanel project={mockProject} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Engineering tasks');
  });

  it('has copy as markdown button', () => {
    render(<TaskPanel project={mockProject} />);
    expect(screen.getByRole('button', { name: /copy as markdown/i })).toBeInTheDocument();
  });
});