import { useState, useMemo } from 'react';
import {
  AlertCircle,
  Check,
  Code,
  Copy,
  Download,
  Layers,
  ShieldAlert,
  Server,
  FileCode2,
  Activity,
  AlertTriangle,
  RefreshCw,
  Box,
} from 'lucide-react';
import { checkOpenApiStructure, makeOpenApi, toYaml } from '../data/openapi.js';
import { generateMultiServiceOpenApi, detectContractDrift } from '../data/openapiSynth.ts';
import { generateTerraform, generateKubernetes } from '../data/iacGenerator.ts';
import { auditProtocolsAndResilience } from '../data/protocolAuditor.ts';
import { generateTypeScriptSdk } from '../data/sdkGenerator.ts';
import { sound } from '../utils/sound.js';

export default function OpenApiPanel({ project, onNotify }) {
  // Tabs: 'endpoints' | 'drift' | 'iac' | 'resilience' | 'sdk' | 'yaml'
  const [viewTab, setViewTab] = useState('endpoints');

  // Baseline OpenAPI 3.0 spec
  const spec = useMemo(() => makeOpenApi(project), [project]);
  const yaml = useMemo(() => toYaml(spec), [spec]);
  const issues = useMemo(() => checkOpenApiStructure(spec), [spec]);

  // Phase 4: Multi-service OpenAPI 3.1 & Drift
  const multiSpec = useMemo(() => generateMultiServiceOpenApi(project), [project]);
  const multiYaml = useMemo(() => JSON.stringify(multiSpec, null, 2), [multiSpec]);
  const driftReport = useMemo(() => detectContractDrift(project), [project]);

  // Phase 4: IaC (Terraform & K8s)
  const terraformCode = useMemo(() => generateTerraform(project), [project]);
  const k8sManifest = useMemo(() => generateKubernetes(project), [project]);
  const [iacFlavor, setIacFlavor] = useState('terraform'); // 'terraform' | 'k8s'

  // Phase 4: Resilience & Protocol Audit
  const resilienceReport = useMemo(() => auditProtocolsAndResilience(project), [project]);

  // Phase 4: TypeScript SDK
  const sdkCode = useMemo(() => generateTypeScriptSdk(project), [project]);

  const paths = Object.entries(multiSpec.paths || {});

  async function copyText(text, label) {
    sound.click();
    try {
      await navigator.clipboard.writeText(text);
      onNotify(`${label} copied to clipboard.`);
    } catch {
      onNotify('Clipboard copy failed.');
    }
  }

  function downloadText(content, filename, type = 'text/plain') {
    sound.export();
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotify(`${filename} downloaded.`);
  }

  return (
    <section className="api-panel" aria-label="OpenAPI contract specification and IaC synthesis">
      <div className="api-toolbar">
        <div className="api-meta-cluster">
          <span className="badge-architectural">[PHASE_4 // CONTRACTS_IAC_SYNTHESIS]</span>
          <span className="api-val-status">
            {driftReport.isFullyCompliant ? (
              <span className="text-cyan">
                <Check size={12} /> Contracts Aligned (0 Drift)
              </span>
            ) : (
              <span className="text-amber">
                <AlertTriangle size={12} /> {driftReport.totalDrifts} Contract Drift Item{driftReport.totalDrifts === 1 ? '' : 's'}
              </span>
            )}
          </span>
          <span className="api-version-tag">Model v{project.version} · OpenAPI 3.1.0</span>
        </div>

        <div className="api-actions-cluster">
          {/* Sub-tab view switch */}
          <div className="api-view-switch" role="group" aria-label="Specification view mode">
            <button
              type="button"
              className={viewTab === 'endpoints' ? 'active' : ''}
              onClick={() => { sound.tab(); setViewTab('endpoints'); }}
            >
              <Layers size={12} />
              <span>Multi-Service Spec</span>
            </button>

            <button
              type="button"
              className={viewTab === 'drift' ? 'active' : ''}
              onClick={() => { sound.tab(); setViewTab('drift'); }}
            >
              <RefreshCw size={12} />
              <span>Contract Drift ({driftReport.totalDrifts})</span>
            </button>

            <button
              type="button"
              className={viewTab === 'iac' ? 'active' : ''}
              onClick={() => { sound.tab(); setViewTab('iac'); }}
            >
              <Server size={12} />
              <span>Terraform & K8s</span>
            </button>

            <button
              type="button"
              className={viewTab === 'resilience' ? 'active' : ''}
              onClick={() => { sound.tab(); setViewTab('resilience'); }}
            >
              <Activity size={12} />
              <span>Protocol Audit</span>
            </button>

            <button
              type="button"
              className={viewTab === 'sdk' ? 'active' : ''}
              onClick={() => { sound.tab(); setViewTab('sdk'); }}
            >
              <FileCode2 size={12} />
              <span>TypeScript SDK</span>
            </button>

            <button
              type="button"
              className={viewTab === 'yaml' ? 'active' : ''}
              onClick={() => { sound.tab(); setViewTab('yaml'); }}
            >
              <Code size={12} />
              <span>Raw Code</span>
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: Multi-Service Endpoints */}
      {viewTab === 'endpoints' && (
        <div className="api-endpoints-view">
          <div className="endpoints-lead-card">
            <div>
              <h4>OpenAPI 3.1 Multi-Service Synthesis</h4>
              <p>
                Generated across all modeled services (Auth Service, Catalog Service, Order Service).
                Response schemas and headers reflect confirmed architecture requirements.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="button compact"
                onClick={() => copyText(multiYaml, 'OpenAPI 3.1 JSON')}
              >
                <Copy size={12} /> Copy JSON
              </button>
              <button
                className="button compact primary"
                onClick={() => downloadText(multiYaml, 'openapi-3.1.json', 'application/json')}
              >
                <Download size={12} /> Download
              </button>
            </div>
          </div>

          <div className="endpoints-list">
            {paths.map(([routePath, operations]) => (
              <div key={routePath} className="route-container">
                {Object.entries(operations).map(([method, op]) => (
                  <article key={method} className="endpoint-card">
                    <div className="endpoint-header">
                      <div className="endpoint-method-path">
                        <span className={`method-badge method-${method.toLowerCase()}`}>
                          {method.toUpperCase()}
                        </span>
                        <code className="endpoint-path-text">{routePath}</code>
                      </div>
                      <span className="endpoint-operation-id">{op.tags?.[0]}</span>
                    </div>

                    <p className="endpoint-summary">{op.summary}</p>

                    <div className="endpoint-subsections">
                      <div className="endpoint-section-box">
                        <b>Request Specifications</b>
                        {op.requestBody ? (
                          <div className="schema-badge">Content-Type: application/json</div>
                        ) : (
                          <p className="schema-note">No body payload required (GET/Query request).</p>
                        )}
                      </div>

                      <div className="endpoint-section-box">
                        <b>HTTP Response Matrix</b>
                        <div className="response-codes-grid">
                          {Object.entries(op.responses || {}).map(([code, resp]) => (
                            <div key={code} className={`response-code-card ${code === '429' ? 'is-ratelimit' : ''}`}>
                              <div className="resp-code-head">
                                <span className={`resp-pill code-${code[0]}xx`}>{code}</span>
                                <b>{resp.description}</b>
                              </div>
                              {resp.headers && (
                                <div className="resp-headers-list">
                                  {Object.entries(resp.headers).map(([hName, hData]) => (
                                    <div key={hName} className="header-item">
                                      <code>{hName}</code>: <span>{hData.description}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: Contract Drift Detection */}
      {viewTab === 'drift' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="endpoints-lead-card">
            <div>
              <h4>Contract Drift & Requirement Alignment Audit</h4>
              <p>
                Continuous verification ensuring confirmed architectural requirements have concrete
                representations in API status codes, request headers, and payload schemas.
              </p>
            </div>
            <span className="endpoint-count-badge">
              {driftReport.isFullyCompliant ? '100% Compliant' : `${driftReport.totalDrifts} Discrepancies`}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {driftReport.drifts.map((drift) => (
              <div
                key={drift.id}
                style={{
                  padding: 14,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line-mid)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        background: drift.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: drift.severity === 'CRITICAL' ? '#f87171' : '#fbbf24',
                      }}
                    >
                      {drift.severity}
                    </span>
                    <b style={{ fontSize: 13 }}>{drift.requirementId}: “{drift.requirementText}”</b>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    Status: {drift.actualStatus}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8, fontSize: 12 }}>
                  <div style={{ padding: 8, background: 'var(--surface-1)', borderRadius: 6 }}>
                    <small style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>Expected in Contract:</small>
                    <code>{drift.expectedInContract}</code>
                  </div>
                  <div style={{ padding: 8, background: 'var(--surface-1)', borderRadius: 6 }}>
                    <small style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>Remediation Advice:</small>
                    <span>{drift.remediationAdvice}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: Infrastructure as Code (Terraform & K8s) */}
      {viewTab === 'iac' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="endpoints-lead-card">
            <div>
              <h4>Deployable Infrastructure as Code (IaC)</h4>
              <p>
                Synthesized 1:1 directly from the architecture graph components, storage nodes, and ingress gateways.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="diagram-grid-toggle">
                <button
                  type="button"
                  className={iacFlavor === 'terraform' ? 'active' : ''}
                  onClick={() => { sound.click(); setIacFlavor('terraform'); }}
                >
                  Terraform (AWS)
                </button>
                <button
                  type="button"
                  className={iacFlavor === 'k8s' ? 'active' : ''}
                  onClick={() => { sound.click(); setIacFlavor('k8s'); }}
                >
                  Kubernetes (YAML)
                </button>
              </div>
              <button
                className="button compact"
                onClick={() =>
                  copyText(
                    iacFlavor === 'terraform' ? terraformCode : k8sManifest,
                    iacFlavor === 'terraform' ? 'Terraform HCL' : 'Kubernetes Manifest'
                  )
                }
              >
                <Copy size={12} /> Copy
              </button>
              <button
                className="button compact primary"
                onClick={() =>
                  downloadText(
                    iacFlavor === 'terraform' ? terraformCode : k8sManifest,
                    iacFlavor === 'terraform' ? 'main.tf' : 'k8s-manifests.yaml'
                  )
                }
              >
                <Download size={12} /> Download
              </button>
            </div>
          </div>

          <div className="api-code-wrapper">
            <div className="api-code-header">
              <span className="code-filename">
                {iacFlavor === 'terraform' ? 'infrastructure/main.tf' : 'k8s/deployments.yaml'}
              </span>
              <span className="code-lines">
                {(iacFlavor === 'terraform' ? terraformCode : k8sManifest).split('\n').length} lines
              </span>
            </div>
            <pre className="api-code" style={{ maxHeight: 420 }}>
              <code>{iacFlavor === 'terraform' ? terraformCode : k8sManifest}</code>
            </pre>
          </div>
        </div>
      )}

      {/* VIEW 4: Protocol & Resilience Audit */}
      {viewTab === 'resilience' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="endpoints-lead-card">
            <div>
              <h4>Protocol Health & Failure Isolation Audit</h4>
              <p>
                Analyzes synchronous blocking request chains, evaluates circuit breaker policies,
                and audits external dependency isolation.
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cyan)' }}>
                {resilienceReport.score} / 100
              </div>
              <small style={{ color: 'var(--text-dim)', fontSize: 11 }}>Resilience Score</small>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {resilienceReport.findings.map((finding) => (
              <div
                key={finding.id}
                style={{
                  padding: 14,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line-mid)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        background:
                          finding.severity === 'CRITICAL'
                            ? 'rgba(239, 68, 68, 0.2)'
                            : finding.severity === 'WARNING'
                              ? 'rgba(245, 158, 11, 0.2)'
                              : 'rgba(78, 242, 210, 0.2)',
                        color:
                          finding.severity === 'CRITICAL'
                            ? '#f87171'
                            : finding.severity === 'WARNING'
                              ? '#fbbf24'
                              : 'var(--cyan)',
                      }}
                    >
                      {finding.severity}
                    </span>
                    <b style={{ fontSize: 13 }}>{finding.title}</b>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    Protocol: {finding.protocol}
                  </span>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: '6px 0' }}>
                  {finding.description}
                </p>

                <div style={{ padding: '8px 12px', background: 'var(--surface-1)', borderRadius: 6, fontSize: 12 }}>
                  <b style={{ color: 'var(--cyan)', marginRight: 6 }}>Recommended Mitigation:</b>
                  <span>{finding.mitigation}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 5: TypeScript SDK */}
      {viewTab === 'sdk' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="endpoints-lead-card">
            <div>
              <h4>Generated TypeScript Client SDK</h4>
              <p>
                Strongly-typed client library complete with request/response interfaces, Bearer JWT
                management, and timeout cancellation derived directly from the OpenAPI contracts.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button compact" onClick={() => copyText(sdkCode, 'TypeScript SDK')}>
                <Copy size={12} /> Copy SDK
              </button>
              <button
                className="button compact primary"
                onClick={() => downloadText(sdkCode, 'client.ts', 'text/typescript')}
              >
                <Download size={12} /> Download client.ts
              </button>
            </div>
          </div>

          <div className="api-code-wrapper">
            <div className="api-code-header">
              <span className="code-filename">sdk/client.ts</span>
              <span className="code-lines">{sdkCode.split('\n').length} lines</span>
            </div>
            <pre className="api-code" style={{ maxHeight: 420 }}>
              <code>{sdkCode}</code>
            </pre>
          </div>
        </div>
      )}

      {/* VIEW 6: Current Model YAML */}
      {viewTab === 'yaml' && (
        <div className="api-code-wrapper">
          <div className="api-code-header">
            <span className="code-filename">openapi.yaml · 3.0.3 Current model</span>
            <span className="code-lines">{yaml.split('\n').length} lines</span>
          </div>
          <pre className="api-code">
            <code>
              {yaml.split('\n').map((line, idx) => (
                <div key={idx} className="code-line">
                  <span className="line-num">{idx + 1}</span>
                  <span className="line-content">{line}</span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      )}
    </section>
  );
}
