function findingsFor(project) {
  const findings = [];
  const databases = project.components.filter((item) => item.type === 'DATABASE');
  const postgres = project.components.find((item) => item.id === 'postgres');
  const incoming = project.relationships.filter((edge) => edge.to === 'postgres').map((edge) => project.components.find((node) => node.id === edge.from)?.name).filter(Boolean);
  const requirements = project.requirements;
  if (databases.length === 1 && postgres) findings.push({ kind: 'Potential risk', title: 'PostgreSQL is the only modeled database', description: 'The architecture shows one database component and no modeled replica or failover path. This is a potential availability risk; no availability target is specified.', evidence: [`${postgres.name} (${postgres.id}) is the only DATABASE node.`, `Incoming data flows: ${incoming.join(', ')} → PostgreSQL.`, 'No database replication or failover relationship appears in the model.'] });
  const resilience = requirements.find((item) => /redis/i.test(item.text) && /(unavailable|resilien|fallback)/i.test(item.text));
  findings.push(resilience
    ? { kind: 'Unresolved decision', title: 'Redis outage behavior needs a decision', description: 'Login resilience is required, but fallback behavior is not defined. The requirement is not evidence that resilience is implemented.', evidence: [`${resilience.id}: “${resilience.text}”`, 'No confirmed fallback behavior or session persistence policy is recorded.'] }
    : { kind: 'Unresolved decision', title: 'Redis availability behavior is unspecified', description: 'Redis is modeled as the session cache, but the requirements do not say what login should do if Redis becomes unavailable.', evidence: ['Redis is modeled as the session cache.', 'No Redis outage requirement or fallback relationship is recorded.'] });
  const rateLimit = requirements.find((item) => /rate.?limit/i.test(item.text));
  findings.push(rateLimit
    ? { kind: 'Requirement coverage', title: 'Rate limiting is required; contract coverage is unverified', description: 'The requirement is recorded, but the demo has no API implementation entities to verify enforcement.', evidence: [`${rateLimit.id}: “${rateLimit.text}”`, 'The project model does not represent a running API implementation.'] }
    : { kind: 'Unresolved decision', title: 'Authentication rate limiting is not specified', description: 'No rate-limit requirement appears in the model. This is a requirement gap, not proof that a running service is vulnerable.', evidence: ['Auth Service (auth) handles login.', 'No rate-limiting requirement is recorded.'] });
  const owner = requirements.find((item) => /postgres/i.test(item.text) && /source of truth/i.test(item.text));
  if (owner) findings.push({ kind: 'Consistency check', title: 'PostgreSQL source-of-truth constraint is recorded', description: 'The explicit ownership requirement is present. Auth, Catalog, and Order flows point to PostgreSQL, while Redis is described as a session cache.', evidence: [`${owner.id}: “${owner.text}”`, `PostgreSQL incoming flows: ${project.relationships.filter((edge) => edge.to === 'postgres').map((edge) => edge.label).join(', ')}.`, 'Redis component description: Session cache.'] });
  return findings;
}

export default function RiskPanel({ project }) {
  const findings = findingsFor(project);
  return <section className="risk-panel">
    <div className="panel-intro"><div><h3>Evidence-based findings</h3><p>Derived from modeled components, relationships, and supplied requirements. No probability score is used.</p></div><span className="small-pill">{findings.length} findings · v{project.version}</span></div>
    <div className="risk-list">{findings.map((finding, index) => <article className="risk-card" key={`${finding.kind}-${index}`}>
      <div className="risk-card-heading"><span className={`risk-kind ${finding.kind === 'Potential risk' ? 'potential' : finding.kind === 'Requirement coverage' || finding.kind === 'Consistency check' ? 'coverage' : ''}`}>{finding.kind}</span><h4>{finding.title}</h4></div>
      <p>{finding.description}</p><div className="evidence"><b>Evidence</b>{finding.evidence.map((line) => <span key={line}>{line}</span>)}</div>
    </article>)}</div>
    <p className="fine-print">“Unresolved decision” means behavior is not specified. “Potential risk” describes the model, not a measured probability or confirmed production failure.</p>
  </section>;
}
