import { useState, useMemo } from 'react';
import { Copy, Download } from 'lucide-react';
import { makeOpenApi, toYaml } from '../data/openapi.ts';
import { generateMultiServiceOpenApi, detectContractDrift } from '../data/openapiSynth.ts';
import { generateTerraform, generateKubernetes } from '../data/iacGenerator.ts';
import { auditProtocolsAndResilience } from '../data/protocolAuditor.ts';
import { generateTypeScriptSdk } from '../data/sdkGenerator.ts';
import { sound } from '../utils/sound.ts';
import type { SchemaDriftItem } from '../data/openapiSynth.ts';
import type { ProtocolAuditFinding } from '../data/protocolAuditor.ts';
import type { Project } from '../types/schema.ts';
import './panels.css';

export interface OpenApiPanelProps {
  project: Project;
  onNotify?: (message: string) => void;
}

type ContractView = 'endpoints' | 'drift' | 'iac' | 'audit' | 'sdk' | 'yaml';
/** Drift items and audit findings share a severity scale; drift adds INFO, which falls back to a default tone. */
type Severity = SchemaDriftItem['severity'] | ProtocolAuditFinding['severity'];

const METHOD_TONE: Partial<Record<string, string>> = { get: 'teal', post: 'accent', put: 'amber', patch: 'amber', delete: 'rose' };
const SEVERITY_TONE: Partial<Record<Severity, string>> = { CRITICAL: 'rose', WARNING: 'amber', RECOMMENDATION: 'violet' };
const SEVERITY_LABEL: Partial<Record<Severity, string>> = { CRITICAL: 'Critical', WARNING: 'Warning', RECOMMENDATION: 'Suggestion' };
const codeTone = (code: string) => (code[0] === '2' ? 'teal' : code[0] === '4' ? 'amber' : code[0] === '5' ? 'rose' : 'muted');
const lines = (text: string) => text.split('\n').length;

interface CodeBlockProps {
  name: string;
  code: string;
  numbered?: boolean;
}

function CodeBlock({ name, code, numbered = false }: CodeBlockProps) {
  return (
    <div className="vp-code">
      <div className="vp-code-head">
        <span>{name}</span>
        <span>{lines(code)} lines</span>
      </div>
      <pre>
        <code>
          {numbered
            ? code.split('\n').map((line, i) => (
              <span key={i}><span className="ln">{i + 1}</span>{line}{'\n'}</span>
            ))
            : code}
        </code>
      </pre>
    </div>
  );
}

export default function OpenApiPanel({ project, onNotify = () => {} }: OpenApiPanelProps) {
  const [view, setView] = useState<ContractView>('endpoints');
  const [iacFlavor, setIacFlavor] = useState<'terraform' | 'k8s'>('terraform');

  const yaml = useMemo(() => toYaml(makeOpenApi(project)), [project]);
  const multiSpec = useMemo(() => generateMultiServiceOpenApi(project), [project]);
  const multiJson = useMemo(() => JSON.stringify(multiSpec, null, 2), [multiSpec]);
  const drift = useMemo(() => detectContractDrift(project), [project]);
  const terraform = useMemo(() => generateTerraform(project), [project]);
  const k8s = useMemo(() => generateKubernetes(project), [project]);
  const audit = useMemo(() => auditProtocolsAndResilience(project), [project]);
  const sdk = useMemo(() => generateTypeScriptSdk(project), [project]);
  const paths = Object.entries(multiSpec.paths || {});
  const operationCount = paths.reduce((sum, [, ops]) => sum + Object.keys(ops).length, 0);

  async function copyText(text: string, label: string) {
    sound.click();
    try {
      await navigator.clipboard.writeText(text);
      onNotify(`${label} copied to clipboard.`);
    } catch {
      onNotify('Clipboard copy failed.');
    }
  }

  function downloadText(content: string, filename: string, type = 'text/plain') {
    sound.export();
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotify(`${filename} downloaded.`);
  }

  const views: { id: ContractView; label: string; count?: number }[] = [
    { id: 'endpoints', label: 'Endpoints', count: operationCount },
    { id: 'drift', label: 'Contract drift', count: drift.totalDrifts },
    { id: 'iac', label: 'Terraform & K8s' },
    { id: 'audit', label: 'Protocol audit', count: audit.findings.length },
    { id: 'sdk', label: 'TypeScript SDK' },
    { id: 'yaml', label: 'OpenAPI YAML' },
  ];
  const severityCounts = (['CRITICAL', 'WARNING', 'RECOMMENDATION'] satisfies ProtocolAuditFinding['severity'][])
    .map((severity) => ({ severity, count: audit.findings.filter((f) => f.severity === severity).length }))
    .filter((row) => row.count > 0);
  const iac = iacFlavor === 'terraform'
    ? { code: terraform, name: 'infrastructure/main.tf', file: 'main.tf', label: 'Terraform' }
    : { code: k8s, name: 'k8s/deployments.yaml', file: 'k8s-manifests.yaml', label: 'Kubernetes manifests' };

  return (
    <section className="vp" aria-label="API contract and generated code">
      <header className="vp-head">
        <div>
          <h3 className="vp-title">API contract</h3>
          <p className="vp-lead">
            OpenAPI 3.1, generated from the API operations in the model. Responses and headers follow the recorded
            requirements. Request and response fields stay open until someone models them.
          </p>
        </div>
        <p className="vp-meta">
          <span className="vp-tag" data-tone={drift.isFullyCompliant ? 'teal' : 'amber'}>
            {drift.isFullyCompliant ? 'In line with requirements' : `${drift.totalDrifts} gap${drift.totalDrifts === 1 ? '' : 's'} to requirements`}
          </span>
          · model v{project.version}
        </p>
      </header>

      <div className="vp-seg" role="group" aria-label="Contract view">
        {views.map(({ id, label, count }) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => { sound.tab(); setView(id); }}>
            {label} {count !== undefined && <b>{count}</b>}
          </button>
        ))}
      </div>

      {view === 'endpoints' && (
        <>
          <div className="vp-head">
            <p className="vp-meta">{operationCount} operation{operationCount === 1 ? '' : 's'} · openapi-3.1.json</p>
            <div className="vp-actions">
              <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={() => copyText(multiJson, 'OpenAPI 3.1 JSON')}>
                <Copy size={14} /> Copy JSON
              </button>
              <button type="button" className="va-btn va-btn-primary va-btn-sm" onClick={() => downloadText(multiJson, 'openapi-3.1.json', 'application/json')}>
                <Download size={14} /> Download
              </button>
            </div>
          </div>

          {paths.length === 0 ? (
            <div className="vp-empty">
              <b>No API operations yet</b>
              <p>Describe one in plain language, for example: “add a GET /trips endpoint on the trips service”.</p>
            </div>
          ) : (
            <div className="vp-list">
              {paths.flatMap(([routePath, operations]) =>
                Object.entries(operations).map(([method, op]) => (
                  <article className="vp-item" data-tone={METHOD_TONE[method] || 'muted'} key={`${method}-${routePath}`}>
                    <div className="vp-endpoint-head">
                      <span className="vp-pill" data-tone={METHOD_TONE[method] || 'muted'}>{method.toUpperCase()}</span>
                      <code>{routePath}</code>
                      {op.tags?.[0] && <span className="vp-ref vp-owner">{op.tags[0]}</span>}
                    </div>
                    {op.summary && <p>{op.summary}</p>}
                    <div className="vp-split">
                      <div className="vp-box">
                        <p className="vp-box-title">Request</p>
                        {op.requestBody ? (
                          <ul className="vp-kv"><li><code>Content-Type</code>: application/json</li></ul>
                        ) : (
                          <p className="vp-hint">No request body.</p>
                        )}
                      </div>
                      <div className="vp-box">
                        <p className="vp-box-title">Responses <small>{Object.keys(op.responses || {}).length}</small></p>
                        <div className="vp-responses">
                          {Object.entries(op.responses || {}).map(([code, resp]) => (
                            <div className="vp-response" key={code}>
                              <div className="vp-response-top">
                                <span className="vp-pill" data-tone={codeTone(code)}>{code}</span>
                                <span>{resp.description}</span>
                              </div>
                              {resp.headers && (
                                <ul className="vp-kv">
                                  {Object.entries(resp.headers).map(([name, header]) => (
                                    <li key={name}><code>{name}</code>: {header.description}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                )),
              )}
            </div>
          )}
        </>
      )}

      {view === 'drift' && (
        drift.drifts.length ? (
          <div className="vp-list">
            {drift.drifts.map((item) => (
              <article className="vp-item" data-tone={SEVERITY_TONE[item.severity] || 'amber'} key={item.id}>
                <div className="vp-item-top">
                  <span className="vp-tag" data-tone={SEVERITY_TONE[item.severity] || 'amber'}>{SEVERITY_LABEL[item.severity] || item.severity}</span>
                  <span className="vp-ref">{item.requirementId} · {item.actualStatus}</span>
                </div>
                <h4>“{item.requirementText}”</h4>
                <div className="vp-split">
                  <div className="vp-box">
                    <p className="vp-box-title">The contract should show</p>
                    <p className="vp-mono">{item.expectedInContract}</p>
                  </div>
                  <div className="vp-box">
                    <p className="vp-box-title">How to close the gap</p>
                    <p>{item.remediationAdvice}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="vp-empty">
            <b>No contract drift</b>
            <p>Every recorded requirement that affects the API is represented in the contract.</p>
          </div>
        )
      )}

      {view === 'iac' && (
        <>
          <div className="vp-head">
            <div className="vp-seg" role="group" aria-label="Infrastructure format">
              <button type="button" aria-pressed={iacFlavor === 'terraform'} onClick={() => { sound.click(); setIacFlavor('terraform'); }}>Terraform (AWS)</button>
              <button type="button" aria-pressed={iacFlavor === 'k8s'} onClick={() => { sound.click(); setIacFlavor('k8s'); }}>Kubernetes</button>
            </div>
            <div className="vp-actions">
              <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={() => copyText(iac.code, iac.label)}>
                <Copy size={14} /> Copy
              </button>
              <button type="button" className="va-btn va-btn-primary va-btn-sm" onClick={() => downloadText(iac.code, iac.file)}>
                <Download size={14} /> Download
              </button>
            </div>
          </div>
          <p className="vp-note">A starting scaffold generated from the components in the model. Review it before you deploy anything.</p>
          <CodeBlock name={iac.name} code={iac.code} />
        </>
      )}

      {view === 'audit' && (
        <>
          <div className="vp-chips" aria-label="Findings by severity">
            {severityCounts.length
              ? severityCounts.map(({ severity, count }) => (
                <span className="vp-chip is-on" key={severity}>
                  <span className="vp-tag" data-tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</span> <b>{count}</b>
                </span>
              ))
              : <span className="vp-chip">No findings</span>}
          </div>
          <p className="vp-note">Checks blocking call chains, missing fallbacks around caches, and isolation of external dependencies, using only the connections in the model.</p>
          <div className="vp-list">
            {audit.findings.map((finding) => (
              <article className="vp-item" data-tone={SEVERITY_TONE[finding.severity] || 'muted'} key={finding.id}>
                <div className="vp-item-top">
                  <span className="vp-tag" data-tone={SEVERITY_TONE[finding.severity] || 'muted'}>{SEVERITY_LABEL[finding.severity] || finding.severity}</span>
                  {finding.protocol && <span className="vp-ref">{finding.protocol}</span>}
                </div>
                <h4>{finding.title}</h4>
                <p>{finding.description}</p>
                {finding.mitigation && (
                  <div className="vp-facts">
                    <span className="vp-facts-label">Suggested fix</span>
                    <p>{finding.mitigation}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {view === 'sdk' && (
        <>
          <div className="vp-head">
            <p className="vp-note">A typed client with one method per operation in the contract, bearer-token support, and request timeouts.</p>
            <div className="vp-actions">
              <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={() => copyText(sdk, 'TypeScript SDK')}>
                <Copy size={14} /> Copy
              </button>
              <button type="button" className="va-btn va-btn-primary va-btn-sm" onClick={() => downloadText(sdk, 'client.ts', 'text/typescript')}>
                <Download size={14} /> Download client.ts
              </button>
            </div>
          </div>
          <CodeBlock name="sdk/client.ts" code={sdk} />
        </>
      )}

      {view === 'yaml' && (
        <>
          <div className="vp-head">
            <p className="vp-note">The OpenAPI 3.0.3 document for the current model.</p>
            <div className="vp-actions">
              <button type="button" className="va-btn va-btn-ghost va-btn-sm" onClick={() => copyText(yaml, 'OpenAPI YAML')}>
                <Copy size={14} /> Copy
              </button>
              <button type="button" className="va-btn va-btn-primary va-btn-sm" onClick={() => downloadText(yaml, 'openapi.yaml', 'application/yaml')}>
                <Download size={14} /> Download
              </button>
            </div>
          </div>
          <CodeBlock name="openapi.yaml" code={yaml} numbered />
        </>
      )}
    </section>
  );
}
