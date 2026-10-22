import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { deriveTasks } from '../data/analysis.ts';
import { sound } from '../utils/sound.ts';
import type { Project, Task, TaskPriority } from '../types/schema.ts';
import './panels.css';

export interface TaskPanelProps {
  project: Project;
}

const PRIORITY_TONE: Record<TaskPriority, string> = { High: 'rose', Medium: 'amber', Low: 'muted' };

function toMarkdown(tasks: Task[]) {
  return tasks.map((t) => {
    const criteria = t.acceptance.map((a) => `  - [ ] ${a}`).join('\n');
    const decisionStatus = t.requirement.resolution
      ? `Recorded choice: ${t.requirement.resolution}. Implementation remains proposed.`
      : `Unresolved: ${t.unresolved}`;
    return `### [${t.priority}] ${t.id}: ${t.title}\n**Epic:** ${t.epic}\n**Rationale:** ${t.requirement.text}\n**Acceptance Criteria:**\n${criteria}\n**Decision status:** ${decisionStatus}\n`;
  }).join('\n---\n\n');
}

export default function TaskPanel({ project }: TaskPanelProps) {
  const [priority, setPriority] = useState<'all' | TaskPriority>('all');
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const tasks = deriveTasks(project);
  const RANK: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2 };
  const priorities = [...new Set(tasks.map((t) => t.priority))].sort((a, b) => (RANK[a] ?? 9) - (RANK[b] ?? 9));
  const shown = priority === 'all' ? tasks : tasks.filter((t) => t.priority === priority);

  function copyAsMarkdown() {
    sound.click();
    navigator.clipboard?.writeText?.(toMarkdown(tasks));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="vp" aria-label="Proposed engineering work">
      <header className="vp-head">
        <div>
          <h3 className="vp-title">Engineering tasks</h3>
          <p className="vp-lead">
            Proposed from the requirements in the model. Each task lists acceptance criteria and the decision it still
            needs before work starts.
          </p>
        </div>
        <div className="vp-actions">
          <span className="vp-meta">{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
          <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={copyAsMarkdown} disabled={!tasks.length}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy as Markdown'}
          </button>
        </div>
      </header>

      {tasks.length > 1 && priorities.length > 1 && (
        <div className="vp-seg" role="group" aria-label="Filter tasks by priority">
          <button type="button" aria-pressed={priority === 'all'} onClick={() => { sound.tab(); setPriority('all'); }}>
            All <b>{tasks.length}</b>
          </button>
          {priorities.map((p) => (
            <button key={p} type="button" aria-pressed={priority === p} onClick={() => { sound.tab(); setPriority(p); }}>
              {p} <b>{tasks.filter((t) => t.priority === p).length}</b>
            </button>
          ))}
        </div>
      )}

      {shown.length ? (
        <div className="vp-list">
          {shown.map((task) => {
            const resolved = Boolean(task.requirement.resolution);
            const checked = task.acceptance.filter((_, i) => done[`${task.id}-${i}`]).length;
            return (
              <article className="vp-item" data-tone={PRIORITY_TONE[task.priority] || 'muted'} key={task.id}>
                <div className="vp-item-top">
                  <span className="vp-tag" data-tone={PRIORITY_TONE[task.priority] || 'muted'}>{task.priority} priority</span>
                  <span className="vp-ref">{task.epic}</span>
                  <span className="vp-ref">{task.id}</span>
                </div>
                <h4>{task.title}</h4>
                <p>{task.requirement.text}</p>

                <div className="vp-split">
                  <div className="vp-box">
                    <p className="vp-box-title">
                      Acceptance criteria <small>{checked}/{task.acceptance.length}</small>
                    </p>
                    <ul className="vp-checks">
                      {task.acceptance.map((criterion, i) => {
                        const key = `${task.id}-${i}`;
                        return (
                          <li key={key}>
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(done[key])}
                                onChange={() => { sound.click(); setDone((prev) => ({ ...prev, [key]: !prev[key] })); }}
                              />
                              <span>{criterion}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className={`vp-box ${resolved ? 'is-done' : 'is-open'}`}>
                    <p className="vp-box-title">
                      <span className="vp-tag" data-tone={resolved ? 'teal' : 'amber'}>{resolved ? 'Decision recorded' : 'Open decision'}</span>
                    </p>
                    <p>{resolved ? task.requirement.resolution : task.unresolved}</p>
                    <p className="vp-hint">
                      {resolved ? 'The choice is recorded. Implementation is still proposed.' : 'The team needs to decide this before implementation.'}
                    </p>
                  </div>
                </div>

                <p className="vp-ref">From requirement {task.requirement.id} · model v{project.version}</p>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="vp-empty">
          <b>No tasks yet</b>
          <p>Tasks appear when the model records a requirement. Describe a change on the left, review it, and apply it.</p>
        </div>
      )}
    </section>
  );
}
