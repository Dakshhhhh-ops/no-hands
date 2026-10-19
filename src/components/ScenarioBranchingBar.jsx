import { useState } from 'react';
import {
  GitBranch,
  GitMerge,
  RotateCcw,
  RotateCw,
  History,
  SlidersHorizontal,
  ChevronDown,
  DollarSign,
  ShieldAlert,
  Zap,
  Layers,
  X,
  Check,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { sound } from '../utils/sound.js';

export default function ScenarioBranchingBar({
  currentBranchId,
  branches,
  onSwitchBranch,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  timeline,
  changes = [],
  onJumpToVersion,
  comparison,
  onOpenComparison,
  onMergeBranch,
}) {
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);

  const activeBranch = branches.find((b) => b.id === currentBranchId) || branches[0];
  const formatTimestamp = (timestamp) => Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
    : 'Timestamp unavailable';

  return (
    <div className="scenario-branching-bar" aria-label="Architecture scenario branching and time-travel controls">
      {/* Left: Active Branch & Switcher */}
      <div className="branch-selector-wrap">
        <div className="branch-chip" onClick={() => setShowBranchDropdown(!showBranchDropdown)}>
          <GitBranch size={13} className="text-cyan" />
          <span className="branch-label">{activeBranch.name}</span>
          <span className="branch-badge">v{activeBranch.version}</span>
          <ChevronDown size={12} className="branch-chevron" />
        </div>

        {showBranchDropdown && (
          <div className="branch-dropdown-menu">
            <div className="branch-dropdown-header">SWITCH SCENARIO BRANCH</div>
            {branches.map((b) => (
              <div
                key={b.id}
                className={`branch-dropdown-item ${b.id === currentBranchId ? 'active' : ''}`}
                onClick={() => {
                  sound.tab();
                  onSwitchBranch(b.id);
                  setShowBranchDropdown(false);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>{b.name}</b>
                  <span className="branch-badge">v{b.version}</span>
                </div>
                <small style={{ color: 'var(--text-dim)', fontSize: 11, display: 'block', marginTop: 2 }}>
                  {b.description}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Center: Scenario Compare & Merge */}
      <div className="scenario-actions">
        <button
          type="button"
          className="button compact outline"
          onClick={() => {
            sound.click();
            onOpenComparison();
          }}
          title="Compare Serverless vs Kubernetes Replicas"
        >
          <SlidersHorizontal size={12} style={{ marginRight: 5 }} />
          Compare Scenarios (Cost & Risk)
        </button>

        {currentBranchId !== 'main' && onMergeBranch && (
          <button
            type="button"
            className="button compact accent"
            onClick={() => {
              sound.click();
              onMergeBranch();
            }}
            title="3-Way Semantic Merge into Main"
          >
            <GitMerge size={12} style={{ marginRight: 5 }} />
            Merge to Main
          </button>
        )}
      </div>

      {/* Right: Time-Travel History & Undo/Redo */}
      <div className="time-travel-cluster">
        <button
          type="button"
          className="time-travel-btn"
          disabled={!canUndo}
          onClick={() => {
            sound.click();
            onUndo();
          }}
          title="Undo last change (Ctrl+Z)"
          aria-label="Undo architecture change"
        >
          <RotateCcw size={12} />
          <span>Undo</span>
        </button>

        <button
          type="button"
          className="time-travel-btn"
          disabled={!canRedo}
          onClick={() => {
            sound.click();
            onRedo();
          }}
          title="Redo undone change (Ctrl+Y)"
          aria-label="Redo architecture change"
        >
          <RotateCw size={12} />
          <span>Redo</span>
        </button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="time-travel-btn timeline-trigger"
            onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
            title="View History Timeline & Scrub Versions"
          >
            <History size={12} />
            <span>Timeline ({timeline.length})</span>
          </button>

          {showHistoryDropdown && (
            <div className="timeline-dropdown-menu">
              <div className="branch-dropdown-header">TIME TRAVEL SCRUBBER (RFC 6902)</div>
              {timeline.map((entry, index) => (
                <div
                  key={`${entry.version}-${index}`}
                  className="timeline-item"
                  onClick={() => {
                    sound.click();
                    onJumpToVersion(index);
                    setShowHistoryDropdown(false);
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b>v{entry.version} · {entry.label}</b>
                    {entry.patchCount > 0 && (
                      <span className="patch-count-badge">
                        {entry.patchCount} patch{entry.patchCount > 1 ? 'es' : ''}
                      </span>
                    )}
                  </div>
                  {entry.changeId && <small className="va-timeline-timestamp">{formatTimestamp(entry.timestamp)}</small>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <section className="va-change-log" aria-labelledby="va-change-log-title">
        <div className="va-change-log-head">
          <h3 id="va-change-log-title">Applied command log</h3>
          <span>{changes.length} {changes.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        {changes.length ? (
          <ol>
            {changes.map((change) => (
              <li key={change.id}>
                <div className="va-change-log-meta">
                  <b>{change.id} · v{change.version}</b>
                  <time dateTime={Number.isFinite(change.timestamp) ? new Date(change.timestamp).toISOString() : undefined}>
                    {formatTimestamp(change.timestamp)}
                  </time>
                </div>
                <p>{change.originalInstruction}</p>
                <small>{change.summary}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="va-change-log-empty">No commands applied in this model yet. Reset sample clears this log.</p>
        )}
      </section>
    </div>
  );
}

