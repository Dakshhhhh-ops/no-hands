import React from 'react';
import { Search, ExternalLink, Zap, GitBranch, FileArchive, HelpCircle } from 'lucide-react';
import { sound } from '../utils/sound.ts';
import { useDialog } from '../hooks/useDialog.ts';
import './commandPalette.css';

/** One entry in the palette, as App builds them in `paletteCommands`. */
export interface PaletteCommand {
  id: string;
  label: string;
  description: string;
  keys?: string[];
  icon?: React.ReactNode;
  /** One of the CATEGORIES ids; anything else is listed after them. Defaults to 'actions'. */
  category?: string;
  action: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

const CATEGORIES = [
  { id: 'actions', label: 'Actions', icon: Zap, color: 'var(--va-accent)' },
  { id: 'navigation', label: 'Navigation', icon: GitBranch, color: 'var(--va-downstream)' },
  { id: 'export', label: 'Export', icon: FileArchive, color: 'var(--va-warn)' },
  { id: 'view', label: 'View', icon: ExternalLink, color: 'var(--va-ok)' },
  { id: 'help', label: 'Help', icon: HelpCircle, color: 'var(--va-faint)' },
];

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return <span>{text}</span>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ?
          <mark key={i} className="va-highlight">{part}</mark> :
          <span key={i}>{part}</span>
      )}
    </span>
  );
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const dialogRef = useDialog<HTMLElement>(Boolean(isOpen), onClose);

  const filteredCommands = React.useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      (cmd.keys && cmd.keys.some(k => k.toLowerCase().includes(q)))
    );
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = React.useMemo(() => {
    const groups: Record<string, PaletteCommand[]> = {};
    filteredCommands.forEach(cmd => {
      const cat = cmd.category || 'actions';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  React.useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const item = listRef.current?.querySelector('[data-index="' + selectedIndex + '"]');
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, getFlattenedCommands().length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = getFlattenedCommands()[selectedIndex];
      if (cmd) {
        sound.click();
        cmd.action();
        onClose();
      }
    }
  };

  function getFlattenedCommands() {
    const flat: PaletteCommand[] = [];
    CATEGORIES.forEach(cat => {
      const cmds = groupedCommands[cat.id] || [];
      cmds.forEach(cmd => flat.push(cmd));
    });
    // Add uncategorized
    Object.keys(groupedCommands).forEach(catId => {
      if (!CATEGORIES.find(c => c.id === catId)) {
        (groupedCommands[catId] || []).forEach(cmd => flat.push(cmd));
      }
    });
    return flat;
  }

  if (!isOpen) return null;

  return React.createElement('div', { className: 'va-backdrop', onMouseDown: (e) => { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('section', { ref: dialogRef, className: 'va-command-palette', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'palette-title' },
      React.createElement('div', { className: 'va-palette-header' },
        React.createElement('div', { className: 'va-palette-search' },
          React.createElement(Search, { size: 18 }),
          React.createElement('input', {
            ref: inputRef,
            type: 'text',
            value: query,
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: handleKeyDown,
            placeholder: 'Type a command or search...',
            'aria-label': 'Command palette search',
            id: 'palette-title'
          }),
          React.createElement('kbd', { className: 'va-kbd-hint' }, '⎋')
        )
      ),
      React.createElement('ul', { className: 'va-palette-list', ref: listRef, role: 'listbox', 'aria-label': 'Available commands' },
        filteredCommands.length === 0 ?
          React.createElement('li', { className: 'va-palette-empty' }, 'No commands match "' + query + '"') :
          CATEGORIES.map((cat) => {
            const cmds = groupedCommands[cat.id] || [];
            if (!cmds.length) return null;
            return React.createElement(React.Fragment, { key: cat.id },
              React.createElement('li', { className: 'va-palette-category' },
                React.createElement('span', { className: 'va-category-icon', style: { color: cat.color } }, React.createElement(cat.icon, { size: 14, 'aria-hidden': true })),
                React.createElement('span', { className: 'va-category-label' }, cat.label),
                React.createElement('span', { className: 'va-category-count' }, cmds.length)
              ),
              cmds.map((cmd) => {
                const globalIndex = getFlattenedCommands().indexOf(cmd);
                return React.createElement('li', {
                  key: cmd.id,
                  'data-index': globalIndex,
                  className: 'va-palette-item' + (globalIndex === selectedIndex ? ' selected' : ''),
                  role: 'option',
                  'aria-selected': globalIndex === selectedIndex,
                  onMouseEnter: () => setSelectedIndex(globalIndex),
                  onClick: () => { sound.click(); cmd.action(); onClose(); }
                },
                  React.createElement('span', { className: 'va-palette-item-icon' }, cmd.icon),
                  React.createElement('div', { className: 'va-palette-item-content' },
                    React.createElement('span', { className: 'va-palette-item-label' }, highlightMatch(cmd.label, query)),
                    React.createElement('span', { className: 'va-palette-item-desc' }, highlightMatch(cmd.description, query))
                  ),
                  React.createElement('div', { className: 'va-palette-item-keys' },
                    cmd.keys?.map((k, i) => React.createElement('kbd', { key: i, className: 'va-kbd' }, k))
                  )
                );
              })
            );
          })
      ),
      React.createElement('div', { className: 'va-palette-footer' },
        React.createElement('kbd', { className: 'va-kbd' }, '↑'),
        React.createElement('kbd', { className: 'va-kbd' }, '↓'), ' Navigate ',
        React.createElement('kbd', { className: 'va-kbd' }, '⏎'), ' Execute ',
        React.createElement('kbd', { className: 'va-kbd' }, '⎋'), ' Close '
      )
    )
  );
}

export default CommandPalette;