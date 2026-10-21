import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChangeImpactPanel from '../src/components/ChangeImpactPanel.jsx';

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
  baseline: null,
};

describe('ChangeImpactPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders change impact header', () => {
    render(<ChangeImpactPanel project={mockProject} />);
    expect(screen.getByRole('heading', { level: 3, name: 'What changed' })).toBeInTheDocument();
  });

  it('shows an empty state when there is no baseline to compare', () => {
    render(<ChangeImpactPanel project={mockProject} />);
    expect(screen.getByText('No changes since the baseline')).toBeInTheDocument();
  });

  it('hides the open decisions section when the model calls for none', () => {
    render(<ChangeImpactPanel project={mockProject} />);
    expect(screen.queryByText('Decisions still open')).not.toBeInTheDocument();
  });
});