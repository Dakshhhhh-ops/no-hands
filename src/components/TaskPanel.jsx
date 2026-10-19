import { useState } from 'react';
import { Check, CheckCircle2, CheckSquare, ClipboardCheck, ClipboardList, Copy, Download, Filter, Square } from 'lucide-react';
import { deriveTasks } from '../data/analysis.js';
import { sound } from '../utils/sound.js';

export default function TaskPanel({ project }) {
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [checkedItems, setCheckedItems] = useState({});
  const [copied, setCopied] = useState(false);

  const tasks = deriveTasks(project);

  const filteredTasks = priorityFilter === 'ALL'
    ? tasks
    : tasks.filter((t) => t.priority.toUpperCase() === priorityFilter);

  function toggleCheck(taskId, index) {
    sound.click();
    const key = `${taskId}-${index}`;
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function copyAsMarkdown() {
    sound.click();
    const md = tasks.map((t) => {
      const criteria = t.acceptance.map((a) => `  - [ ] ${a}`).join('\n');
      return `### [${t.priority}] ${t.id}: ${t.title}\n**Epic:** ${t.epic}\n**Rationale:** ${t.requirement.text}\n**Acceptance Criteria:**\n${criteria}\n**Unresolved Decision:** ${t.unresolved}\n`;
    }).join('\n---\n\n');

    navigator.clipboard?.writeText?.(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="task-panel" aria-label="Proposed engineering work">
      <div className="panel-intro">
        <div>
          <div className="panel-lead-tag">[EXECUTION // ENGINEERING_BACKLOG]</div>
          <h3>Traceable Engineering Tasks</h3>
          <p>
            Automatically proposed from confirmed architecture requirements. Each task includes clear acceptance
            criteria, priority, and highlighted open decisions.
          </p>
        </div>
        <div className="task-header-actions">
          <button type="button" className="button compact subtle" onClick={copyAsMarkdown}>
            {copied ? <Check size={13} className="text-cyan" /> : <Copy size={13} />}
            <span>{copied ? 'Copied Backlog' : 'Copy as Markdown / Jira'}</span>
          </button>
          <span className="small-pill text-cyan">
            <ClipboardList size={12} /> {tasks.length} Proposed Ticket{tasks.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Priority Filter Bar */}
      {tasks.length > 0 && (
        <div className="task-filter-bar">
          <span className="filter-label"><Filter size={11} /> Filter Priority:</span>
          {['ALL', 'HIGH', 'MEDIUM'].map((p) => (
            <button
              key={p}
              type="button"
              className={`filter-btn ${priorityFilter === p ? 'active' : ''}`}
              onClick={() => { sound.tab(); setPriorityFilter(p); }}
            >
              {p === 'ALL' ? `All (${tasks.length})` : `${p} (${tasks.filter((t) => t.priority.toUpperCase() === p).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Task Cards */}
      {filteredTasks.length ? (
        <div className="task-list">
          {filteredTasks.map((task) => (
            <article className="task-card" key={task.id}>
              <div className="task-title">
                <div className="task-title-left">
                  <span className="eyebrow">[EPIC // {task.epic} · TICKET: {task.id}]</span>
                  <h4>{task.title}</h4>
                </div>
                <span className={`priority-tag priority-${task.priority.toLowerCase()}`}>
                  {task.priority} Priority
                </span>
              </div>

              <div className="task-rationale-box">
                <span className="rationale-tag">RATIONALE:</span>
                <span className="rationale-text">{task.requirement.text}</span>
              </div>

              <div className="task-sections">
                <div className="acceptance-block">
                  <div className="acceptance-header">
                    <b>Acceptance Criteria ({task.acceptance.length})</b>
                    <small>Click to check off during sprint</small>
                  </div>
                  <ul className="interactive-checklist">
                    {task.acceptance.map((criterion, cIdx) => {
                      const isDone = !!checkedItems[`${task.id}-${cIdx}`];
                      return (
                        <li
                          key={cIdx}
                          className={`checklist-item ${isDone ? 'checked' : ''}`}
                          onClick={() => toggleCheck(task.id, cIdx)}
                        >
                          <span className="check-box-icon">
                            {isDone ? <CheckSquare size={14} className="text-cyan" /> : <Square size={14} />}
                          </span>
                          <span className="checklist-text">{criterion}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="decision-box">
                  <div className="decision-header">
                    <span className="decision-tag">[UNRESOLVED_DECISION]</span>
                  </div>
                  <p className="decision-desc">{task.unresolved}</p>
                  <small className="decision-hint">Team consensus required before PR merge</small>
                </div>
              </div>

              <div className="task-card-footer">
                <div className="task-state-tag">
                  <span className="dot-pulse" />
                  <span>Proposed &amp; Traceable · Model v{project.version}</span>
                </div>
                <span className="task-req-link">Source: {task.requirement.id}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="task-empty">
          <div className="empty-icon-wrap">
            <ClipboardList size={26} className="text-muted" />
          </div>
          <b>No requirement-based tasks match filter</b>
          <span>Apply an architecture change or switch filter to view proposed engineering work.</span>
        </div>
      )}
    </section>
  );
}
