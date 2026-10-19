import { deriveRiskFindings } from '../data/analysis.js';

export default function RiskPanel({ project }) {
  const findings = deriveRiskFindings(project);
  return <section className="risk-panel">
    <div className="panel-intro"><div><h3>Evidence-based findings</h3><p>Derived from modeled components, relationships, and supplied requirements. No probability score is used.</p></div><span className="small-pill">{findings.length} findings · v{project.version}</span></div>
    <div className="risk-list">{findings.map((finding, index) => <article className="risk-card" key={`${finding.kind}-${index}`}>
      <div className="risk-card-heading"><span className={`risk-kind ${finding.kind === 'Potential risk' ? 'potential' : finding.kind === 'Requirement coverage' || finding.kind === 'Consistency check' ? 'coverage' : ''}`}>{finding.kind}</span><h4>{finding.title}</h4></div>
      <p>{finding.description}</p><div className="evidence"><b>Evidence</b>{finding.evidence.map((line) => <span key={line}>{line}</span>)}</div>
    </article>)}</div>
    <p className="fine-print">“Unresolved decision” means behavior is not specified. “Potential risk” describes the model, not a measured probability or confirmed production failure.</p>
  </section>;
}
