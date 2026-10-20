import React from 'react';
import { Search, X, Keyboard, ArrowUp, ArrowDown, ExternalLink, Zap, GitBranch, FileArchive, RotateCcw, HelpCircle } from 'lucide-react';
import { sound } from '../utils/sound.js';

export function CommandPalette({ isOpen, onClose, commands }) {
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);

  const filteredCommands = React.useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      (cmd.keys && cmd.keys.some(k => k.toLowerCase().includes(q)))
    );
  }, [commands, query]);

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
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, isOpen]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        sound.click();
        cmd.action();
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return React.createElement('div', { className: 'va-backdrop', onMouseDown: (e) => { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('section', { className: 'va-command-palette', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'palette-title' },
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
          filteredCommands.map((cmd, index) =>
            React.createElement('li', {
              key: cmd.id,
              'data-index': index,
              className: 'va-palette-item' + (index === selectedIndex ? ' selected' : ''),
              role: 'option',
              'aria-selected': index === selectedIndex,
              onMouseEnter: () => setSelectedIndex(index),
              onClick: () => { sound.click(); cmd.action(); onClose(); }
            },
              React.createElement('span', { className: 'va-palette-item-icon' }, cmd.icon),
              React.createElement('div', { className: 'va-palette-item-content' },
                React.createElement('span', { className: 'va-palette-item-label' }, cmd.label),
                React.createElement('span', { className: 'va-palette-item-desc' }, cmd.description)
              ),
              React.createElement('div', { className: 'va-palette-item-keys' },
                cmd.keys?.map((k, i) => React.createElement('kbd', { key: i, className: 'va-kbd' }, k))
              )
            )
          )
      ),
      React.createElement('div', { className: 'va-palette-footer' },
        React.createElement('kbd', { className: 'va-kbd' }, '↑'),
        React.createElement('kbd', { className: 'va-kbd' }, '↓'), ' Navigate ',
        React.createElement('kbd', { className: 'va-kbd' }, '⏎'), ' Execute ',
        React.createElement('kbd', { className: 'va-kbd' }, '⎋'), ' Close'
      )
    )
  );
}

export default CommandPalette;