import { ClipboardList } from 'lucide-react';

function tasksFrom(project) {
  const tasks = [];
  for (const requirement of project.requirements) {
    if (requirement.id === 'REQ-AUTH-RATE') tasks.push({ id: 'TASK-AUTH-RATE', epic: 'Secure authentication', title: 'Add rate limiting to login', priority: 'High', requirement, acceptance: ['Requests above the configured threshold receive HTTP 429.', 'Rate-limit headers describe the current limit and retry window.', 'The threshold and window are explicitly configured and documented.'], unresolved: 'The product owner must choose the limit and time window.' });
    if (requirement.id === 'REQ-REDIS-FAIL') tasks.push({ id: 'TASK-REDIS-FAILOVER', epic: 'Improve login resilience', title: 'Define and implement login behavior during Redis outage', priority: 'High', requirement, acceptance: ['Redis outage behavior is explicitly selected and documented.', 'Login follows the selected behavior when Redis is unavailable.', 'Automated tests cover the Redis failure path.'], unresolved: 'Choose fail-open or fail-closed behavior and define any session fallback.' });
    if (requirement.id === 'REQ-DATA-OWNER') tasks.push({ id: 'TASK-DATA-OWNER', epic: 'Protect data ownership', title: 'Preserve PostgreSQL as the source of truth', priority: 'Medium', requirement, acceptance: ['Durable user and business records remain owned by PostgreSQL.', 'Redis is used for session caching only.', 'Tests or architecture documentation show the ownership boundary.'], unresolved: 'The model does not define replication or recovery policy.' });
  }
  return tasks;
}

export default function TaskPanel({ project }) {
  const tasks = tasksFrom(project);
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
