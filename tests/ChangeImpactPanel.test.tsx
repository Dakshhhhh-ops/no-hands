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
    expect(screen.getByText(/baseline.*current delta impact/i)).toBeInTheDocument();
  });

  it('shows no deltas message when baseline is null', () => {
    render(<ChangeImpactPanel project={mockProject} />);
    expect(screen.getByText(/no deltas detected on this baseline/i)).toBeInTheDocument();
  });

  it('shows governance section', () => {
    render(<ChangeImpactPanel project={mockProject} />);
    expect(screen.getByText(/governance.*unresolved_decisions/i)).toBeInTheDocument();
  });
});