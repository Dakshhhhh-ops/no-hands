import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TopologyPanel from '../src/components/TopologyPanel.tsx';
import { referentialChecks } from '../src/data/referentialChecks.ts';
import type { Project } from '../src/types/schema.ts';

vi.mock('lucide-react', async (importOriginal) => importOriginal());

const base: Project = {
  name: 'T',
  version: 3,
  changed: false,
  changes: [],
  activity: [],
  components: [
    { id: 'web', name: 'Web', type: 'CLIENT', sub: '', responsibilities: ['UI'], x: 0, y: 0 },
    { id: 'api', name: 'API', type: 'SERVICE', sub: '', responsibilities: ['Logic'], x: 0, y: 0 },
    { id: 'db', name: 'DB', type: 'DATABASE', sub: '', responsibilities: ['Data'], x: 0, y: 0 },
  ],
  relationships: [
    { from: 'web', to: 'api', label: 'calls', protocol: 'HTTPS' },
    { from: 'api', to: 'db', label: 'reads', protocol: 'PostgreSQL wire' },
    { from: 'web', to: 'db', label: 'debug' },
  ],
  apiOperations: [{ id: 'op', componentId: 'api', method: 'get', path: '/x', summary: '' }],
  requirements: [],
};

describe('Topology panel', () => {
  it('counts protocols from the relationships and reports connections without one', () => {
    render(<TopologyPanel project={base} />);
    expect(screen.getByRole('heading', { name: 'Topology' })).toBeInTheDocument();
    expect(screen.getByText('HTTPS')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL wire')).toBeInTheDocument();
    expect(screen.getByText('2 recorded protocols')).toBeInTheDocument();
    expect(screen.getByText('1 connection without a recorded protocol.')).toBeInTheDocument();
    expect(screen.getByText('Referential integrity 100%')).toBeInTheDocument();
    expect(screen.queryByText(/runtime|SLA|telemetry/i)).not.toBeInTheDocument();
  });

  it('says so when no connection records a protocol', () => {
    const project = { ...base, relationships: base.relationships.map(({ protocol: _protocol, ...rest }) => rest) };
    render(<TopologyPanel project={project} />);
    expect(screen.getByText('No connection in this model records a protocol.')).toBeInTheDocument();
    expect(screen.getByText('0 recorded protocols')).toBeInTheDocument();
  });

  it('lowers referential integrity when references are broken', () => {
    const broken = {
      ...base,
      relationships: [...base.relationships, { from: 'api', to: 'ghost', label: 'x' }, { from: 'web', to: 'api', label: 'dup' }],
      apiOperations: [...base.apiOperations, { id: 'op2', componentId: 'nowhere', method: 'post', path: '/y', summary: '' }],
    };
    const result = referentialChecks(broken);
    expect(result.percent).toBeLessThan(100);
    expect(result.problems).toEqual(expect.arrayContaining([
      'Connection to unknown component "ghost"',
      'API POST /y owned by unknown component "nowhere"',
      'Duplicate connection web → api',
    ]));
    expect(referentialChecks(base)).toMatchObject({ percent: 100, problems: [] });
  });
});

describe('Topology panel source column', () => {
  it('marks components as in code or planned only for imported projects', () => {
    const [web, api, db] = base.components;
    if (!web || !api || !db) throw new Error('The base project has three components.');
    const imported: Project = {
      ...base,
      components: [
        { ...web, origin: 'code' },
        { ...api, origin: 'code' },
        db,
      ],
    };
    const { unmount } = render(<TopologyPanel project={imported} />);
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getAllByText('In code')).toHaveLength(2);
    expect(screen.getAllByText('Planned')).toHaveLength(1);
    unmount();

    render(<TopologyPanel project={base} />);
    expect(screen.queryByRole('columnheader', { name: 'Source' })).not.toBeInTheDocument();
  });
});
