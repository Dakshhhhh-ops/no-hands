import { useState } from 'react';
import { AlertCircle, Check, Code, Copy, Download, ExternalLink, FileCode, Layers, ShieldAlert } from 'lucide-react';
import { checkOpenApiStructure, makeOpenApi, toYaml } from '../data/openapi.js';
import { sound } from '../utils/sound.js';

export default function OpenApiPanel({ project, onNotify }) {
  const [viewTab, setViewTab] = useState('endpoints'); // 'endpoints' | 'yaml'
  const spec = makeOpenApi(project);
  const yaml = toYaml(spec);
  const issues = checkOpenApiStructure(spec);
  const hasRateLimit = project.requirements.some((item) => /rate.?limit/i.test(item.text));

  const paths = Object.entries(spec.paths || {});

  async function copy() {
    sound.click();
    try {
      await navigator.clipboard.writeText(yaml);
      onNotify('OpenAPI 3.0.3 YAML copied to clipboard.');
    } catch {
      try {
        const input = document.createElement('textarea');
        input.value = yaml;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        const copied = document.execCommand?.('copy') || false;
        input.remove();
        onNotify(copied ? 'OpenAPI 3.0.3 YAML copied to clipboard.' : 'Clipboard access unavailable in this browser.');
      } catch {
        onNotify('Clipboard access unavailable.');
      }
    }
  }

  function download() {
    sound.export();
    const url = URL.createObjectURL(new Blob([`${yaml}\n`], { type: 'application/yaml' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'openapi.yaml';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotify('openapi.yaml downloaded successfully.');
  }

  return (
    <section className="api-panel" aria-label="OpenAPI contract specification">
      <div className="api-toolbar">
        <div className="api-meta-cluster">
          <span className="badge-architectural">[CONTRACT // OPENAPI_3.0.3]</span>
          <span className="api-val-status">
            {issues.length ? (
              <span className="text-amber">
                <AlertCircle size={12} /> {issues.length} Structural Issue{issues.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="text-cyan">
                <Check size={12} /> Structural validation passed
              </span>
            )}
          </span>
          <span className="api-version-tag">Model v{project.version}</span>
        </div>

        <div className="api-actions-cluster">
          <div className="api-view-switch" role="group" aria-label="OpenAPI view mode">
            <button
              type="button"
              className={viewTab === 'endpoints' ? 'active' : ''}
              onClick={() => { sound.tab(); setViewTab('endpoints'); }}
            >
              <Layers size={12} />
              <span>Interactive Operations</span>
            </button>
            <button
              type="button"
              className={viewTab === 'yaml' ? 'active' : ''}
              onClick={() => { sound.tab(); setViewTab('yaml'); }}
            >
              <Code size={12} />
              <span>Raw YAML Code</span>
            </button>
          </div>

          <button className="button compact" onClick={copy} title="Copy contract YAML">
            <Copy size={13} />
            <span>Copy YAML</span>
          </button>
          <button className="button compact primary" onClick={download} title="Download openapi.yaml">
            <Download size={13} />
            <span>Download</span>
          </button>
        </div>
      </div>

      {viewTab === 'endpoints' ? (
        <div className="api-endpoints-view">
          <div className="endpoints-lead-card">
            <div>
              <h4>Modeled Contract Operations</h4>
              <p>
                Derived automatically from project components and confirmed voice requirements.
                {hasRateLimit ? ' Rate limiting headers and 429 response are declared.' : ' Standard authentication endpoint loaded.'}
              </p>
            </div>
            <span className="endpoint-count-badge">{paths.length} Route{paths.length === 1 ? '' : 's'} Modeled</span>
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
                      <span className="endpoint-operation-id">id: {op.operationId || 'api-op'}</span>
                    </div>

                    <p className="endpoint-summary">{op.summary || 'Operation description not specified.'}</p>

                    {/* Parameters & Request Body */}
                    <div className="endpoint-subsections">
                      <div className="endpoint-section-box">
                        <b>Request Payload Schema</b>
                        <div className="schema-badge">Content-Type: application/json</div>
                        <p className="schema-note">
                          Schema accepts standard credential fields; exact properties left open for implementation.
                        </p>
                      </div>

                      <div className="endpoint-section-box">
                        <b>Declared Response Codes</b>
                        <div className="response-codes-grid">
                          {Object.entries(op.responses || {}).map(([code, resp]) => {
                            const isRateLimit = code === '429';
                            return (
                              <div key={code} className={`response-code-card ${isRateLimit ? 'is-ratelimit' : ''}`}>
                                <div className="resp-code-head">
                                  <span className={`resp-pill code-${code[0]}xx`}>{code}</span>
                                  <b>{resp.description || 'Response'}</b>
                                </div>
                                {resp.headers && (
                                  <div className="resp-headers-list">
                                    <small>Headers declared:</small>
                                    {Object.entries(resp.headers).map(([hName, hData]) => (
                                      <div key={hName} className="header-item">
                                        <code>{hName}</code>: <span>{hData.description}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="api-code-wrapper">
          <div className="api-code-header">
            <span className="code-filename">openapi.yaml · 3.0.3</span>
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

      <div className="api-note">
        <Check size={14} className="text-cyan flex-none" />
        <div className="api-note-text">
          {issues.length > 0 && <p className="text-amber"><b>Structural issues detected:</b> {issues.join(' ')}</p>}
          <p>
            <strong>Model constraints:</strong> Specific payload schema fields remain open.
            {hasRateLimit
              ? ' Rate limiting is active; HTTP 429 response and standard rate-limiting headers (X-RateLimit-Limit, Retry-After) are included in the contract, while the exact threshold remains an open decision.'
              : ' No rate-limiting requirement has been applied; the contract adheres to baseline 200/400 definitions.'}
          </p>
        </div>
      </div>
    </section>
  );
}
