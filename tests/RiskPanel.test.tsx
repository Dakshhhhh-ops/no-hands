import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RiskPanel from '../src/components/RiskPanel.tsx';
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

describe('RiskPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the risks header', () => {
    render(<RiskPanel project={mockProject} />);
    expect(screen.getByText('Risks and open questions')).toBeInTheDocument();
  });

  it('shows zero findings when no risks', () => {
    render(<RiskPanel project={mockProject} />);
    expect(screen.getByText('0 findings · model v1')).toBeInTheDocument();
    expect(screen.getByText('No findings for this model')).toBeInTheDocument();
  });

  it('has accessible structure', () => {
    render(<RiskPanel project={mockProject} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Risks and open questions');
  });

  it('offers a filter for every finding kind', () => {
    render(<RiskPanel project={mockProject} />);
    expect(screen.getByRole('button', { name: /all findings/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /open decisions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /potential risks/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coverage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /consistency/i })).toBeInTheDocument();
  });
});