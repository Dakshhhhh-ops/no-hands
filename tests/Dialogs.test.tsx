import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandPalette from '../src/components/CommandPalette.jsx';
import ShortcutsModal from '../src/components/ShortcutsModal.jsx';

// Render the real icons: the palette crashed when it rendered an icon component as a child.
vi.mock('lucide-react', async (importOriginal) => importOriginal());

const commands = [
  { id: 'export-all', label: 'Export All (ZIP)', description: 'Download engineering artifacts ZIP', keys: [], icon: null, category: 'export', action: vi.fn() },
  { id: 'tab-risk', label: 'Risks Tab', description: 'Switch to risk audit', keys: ['→'], icon: null, category: 'navigation', action: vi.fn() },
];

describe('Command palette', () => {
  it('opens with category icons without crashing', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} commands={commands} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('treats typed regex characters as plain text', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} commands={commands} />);
    const search = screen.getByLabelText('Command palette search');
    fireEvent.change(search, { target: { value: '(ZIP' } });
    expect(screen.getByRole('option')).toHaveTextContent('Export All (ZIP)');
    fireEvent.change(search, { target: { value: '[?' } });
    expect(screen.getByText('No commands match "[?"')).toBeInTheDocument();
  });

  it('closes on Escape exactly once', () => {
    const onClose = vi.fn();
    render(<CommandPalette isOpen onClose={onClose} commands={commands} />);
    fireEvent.keyDown(screen.getByLabelText('Command palette search'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Shortcuts dialog', () => {
  it('lists both redo shortcuts and closes on Escape', () => {
    const onClose = vi.fn();
    render(<ShortcutsModal isOpen onClose={onClose} />);
    expect(screen.getAllByText('Redo')).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
