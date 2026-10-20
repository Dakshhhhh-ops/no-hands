import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RiskPanel from '../src/components/RiskPanel.jsx';

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

describe('RiskPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders risk audit header', () => {
    render(<RiskPanel project={mockProject} />);
    expect(screen.getByText('System Risk & Consistency Verification')).toBeInTheDocument();
  });

  it('shows zero findings when no risks', () => {
    render(<RiskPanel project={mockProject} />);
    expect(screen.getByText('0 Audit Findings')).toBeInTheDocument();
  });

  it('has accessible structure', () => {
    render(<RiskPanel project={mockProject} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('System Risk & Consistency Verification');
  });

  it('shows KPI chips', () => {
    render(<RiskPanel project={mockProject} />);
    expect(screen.getByRole('button', { name: /total findings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /potential risks/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /requirement coverage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /consistency checks/i })).toBeInTheDocument();
  });
});