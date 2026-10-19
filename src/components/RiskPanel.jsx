import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Filter, Info, ShieldAlert, ShieldCheck } from 'lucide-react';
import { deriveRiskFindings } from '../data/analysis.js';
import { sound } from '../utils/sound.js';

export default function RiskPanel({ project }) {
  const [filter, setFilter] = useState('ALL');
  const findings = deriveRiskFindings(project);

  const filteredFindings = filter === 'ALL'
    ? findings
    : findings.filter((f) => f.kind.toUpperCase().includes(filter));

  const countPotential = findings.filter((f) => f.kind.toLowerCase().includes('potential')).length;
  const countCoverage = findings.filter((f) => f.kind.toLowerCase().includes('coverage')).length;
  const countConsistency = findings.filter((f) => f.kind.toLowerCase().includes('consistency')).length;

  return (
    <section className="risk-panel" aria-label="Evidence-based risk and consistency findings">
      <div className="panel-intro">
        <div>
          <div className="panel-lead-tag">[AUDIT // EVIDENCE_BASED_ANALYSIS]</div>
          <h3>System Risk & Consistency Verification</h3>
          <p>
            Deterministic checks evaluated against modeled components, relationships, and confirmed requirements.
            Zero subjective probability guesses—pure evidence-based static analysis.
          </p>
        </div>
        <div className="panel-pills-bar">
          <span className="small-pill text-amber">
            <AlertTriangle size={12} /> {findings.length} Audit Findings
          </span>
          <span className="small-pill">Model v{project.version}</span>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="risk-kpi-row">
        <button
          type="button"
          className={`risk-kpi-chip ${filter === 'ALL' ? 'active' : ''}`}
          onClick={() => { sound.tab(); setFilter('ALL'); }}
        >
          <span className="kpi-num">{findings.length}</span>
          <span className="kpi-title">Total Findings</span>
        </button>

        <button
          type="button"
          className={`risk-kpi-chip chip-potential ${filter === 'POTENTIAL' ? 'active' : ''}`}
          onClick={() => { sound.tab(); setFilter('POTENTIAL'); }}
        >
          <span className="kpi-num">{countPotential}</span>
          <span className="kpi-title">Potential Risks</span>
        </button>

        <button
          type="button"
          className={`risk-kpi-chip chip-coverage ${filter === 'COVERAGE' ? 'active' : ''}`}
          onClick={() => { sound.tab(); setFilter('COVERAGE'); }}
        >
          <span className="kpi-num">{countCoverage}</span>
          <span className="kpi-title">Requirement Coverage</span>
        </button>

        <button
          type="button"
          className={`risk-kpi-chip chip-consistency ${filter === 'CONSISTENCY' ? 'active' : ''}`}
          onClick={() => { sound.tab(); setFilter('CONSISTENCY'); }}
        >
          <span className="kpi-num">{countConsistency}</span>
          <span className="kpi-title">Consistency Checks</span>
        </button>
      </div>

      {/* Findings List */}
      <div className="risk-list">
        {filteredFindings.map((finding, index) => {
          const isPotential = finding.kind.toLowerCase().includes('potential');
          const isCoverage = finding.kind.toLowerCase().includes('coverage');
          const isConsistency = finding.kind.toLowerCase().includes('consistency');

          return (
            <article className={`risk-card ${isPotential ? 'border-amber' : ''}`} key={`${finding.kind}-${index}`}>
              <div className="risk-card-heading">
                <div className="risk-kind-cluster">
                  <span
                    className={`risk-kind ${
                      isPotential ? 'potential' : isCoverage || isConsistency ? 'coverage' : ''
                    }`}
                  >
                    {isPotential && <AlertTriangle size={11} />}
                    {isCoverage && <CheckCircle2 size={11} />}
                    {isConsistency && <Info size={11} />}
                    <span>{finding.kind}</span>
                  </span>
                  <span className="risk-index-badge">AUDIT-0{index + 1}</span>
                </div>
                <h4>{finding.title}</h4>
              </div>

              <p className="risk-desc">{finding.description}</p>

              <div className="evidence">
                <div className="evidence-header">
                  <b>EVIDENCE BASE (DETERMINISTIC FACTS)</b>
                </div>
                <div className="evidence-lines">
                  {finding.evidence.map((line) => (
                    <div key={line} className="evidence-item">
                      <span className="evidence-marker">▸</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className="fine-print">
        <span className="text-cyan">[GOVERNANCE NOTE]</span> “Unresolved decision” indicates behavior intentionally left
        open for team consensus. “Potential risk” reflects the current model constraints, not an arbitrary probability
        or speculative production incident.
      </p>
    </section>
  );
}
