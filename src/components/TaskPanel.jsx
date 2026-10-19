import { ClipboardList } from 'lucide-react';
import { deriveTasks } from '../data/analysis.js';

export default function TaskPanel({ project }) {
  const tasks = deriveTasks(project);
  return <section className="task-panel">
    <div className="panel-intro"><div><h3>Proposed engineering work</h3><p>Generated from confirmed requirements. These are suggestions, not completed issues.</p></div><span className="small-pill">{tasks.length} proposed</span></div>
    {tasks.length ? <div className="task-list">{tasks.map((task) => <article className="task-card" key={task.id}>
      <div className="task-title"><div><span className="eyebrow">{task.epic} · {task.id}</span><h4>{task.title}</h4></div><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></div>
      <p className="task-rationale"><b>Rationale:</b> {task.requirement.text}</p>
      <div className="task-sections"><div><b>Acceptance criteria</b><ul>{task.acceptance.map((line) => <li key={line}>{line}</li>)}</ul></div><div className="decision"><b>Unresolved decision</b><p>{task.unresolved}</p></div></div>
      <div className="task-state"><ClipboardList size={14} /> Proposed · not completed</div>
    </article>)}</div> : <div className="task-empty"><ClipboardList size={22} /><b>No requirement-based tasks yet</b><span>Apply the demo architecture change to generate traceable engineering work.</span></div>}
  </section>;
}
