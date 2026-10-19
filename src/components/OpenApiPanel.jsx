import { Check, Copy, Download } from 'lucide-react';

const scalar = (value) => typeof value === 'string' ? JSON.stringify(value) : value === null ? 'null' : String(value);
function keyForYaml(key) { return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) && !/^(yes|no|true|false|null|on|off)$/i.test(key) ? key : JSON.stringify(key); }
function toYaml(value, level = 0) {
  const pad = ' '.repeat(level);
  if (Array.isArray(value)) return value.length ? value.map((item) => item && typeof item === 'object' ? `${pad}-\n${toYaml(item, level + 2)}` : `${pad}- ${scalar(item)}`).join('\n') : `${pad}[]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? entries.map(([key, item]) => item && typeof item === 'object' && Object.keys(item).length ? `${pad}${keyForYaml(key)}:\n${toYaml(item, level + 2)}` : `${pad}${keyForYaml(key)}: ${toYaml(item, 0).trim()}`).join('\n') : `${pad}{}`;
  }
  return pad + scalar(value);
}

export function makeOpenApi(project) {
  const rateLimit = project.requirements.find((item) => /rate.?limit/i.test(item.text));
  const paths = {};
  for (const operation of project.apiOperations) {
    const component = project.components.find((item) => item.id === operation.componentId);
    if (!component) continue;
    const responses = {
      '200': { description: 'Authentication succeeded. Response fields are not specified in the architecture model.' },
      '500': { description: 'Unexpected server error.' },
    };
    if (rateLimit) responses['429'] = {
      description: 'Request rejected by the configured authentication rate limit.',
      headers: {
        'X-RateLimit-Limit': { description: 'Configured request limit; exact value remains unresolved.', schema: { type: 'integer' } },
        'X-RateLimit-Remaining': { description: 'Requests remaining in the current window.', schema: { type: 'integer' } },
        'Retry-After': { description: 'Seconds until another request may be attempted.', schema: { type: 'integer' } },
      },
      content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } },
    };
    paths[operation.path] = { [operation.method]: {
      operationId: operation.id,
      summary: operation.summary,
      description: `Derived from ${component.name}. Request credential fields and successful response fields are not defined in the current model.`,
      tags: [component.name],
      requestBody: { required: true, description: 'Request properties are intentionally unspecified until the architecture defines them.', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses,
      'x-voicearchitect-source-component': component.id,
    } };
  }
  return { openapi: '3.0.3', info: { title: `${project.name} API`, version: `${project.version}.0.0`, description: 'Generated from the current VoiceArchitect demo model. Unspecified details are called out rather than inferred.' }, paths };
}

export default function OpenApiPanel({ project }) {
  const yaml = toYaml(makeOpenApi(project));
  const hasRateLimit = project.requirements.some((item) => /rate.?limit/i.test(item.text));
  async function copy() {
    try {
      await navigator.clipboard.writeText(yaml);
    } catch {
      const input = document.createElement('textarea'); input.value = yaml; document.body.append(input); input.select(); document.execCommand('copy'); input.remove();
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([`${yaml}\n`], { type: 'application/yaml' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'openapi.yaml'; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section className="api-panel">
    <div className="api-toolbar"><span>OpenAPI 3.0.3 · generated from model v{project.version}</span><div><button className="button compact" onClick={copy}><Copy size={14} /> Copy YAML</button><button className="button compact" onClick={download}><Download size={14} /> Download</button></div></div>
    <pre className="api-code"><code>{yaml}</code></pre>
    <p className="api-note"><Check size={13} /> <span><b>Model limits:</b> request and success-response fields are unspecified. {hasRateLimit ? 'Rate limiting is required, so the contract includes 429 and rate-limit headers; its threshold remains unresolved.' : 'No rate-limit requirement has been applied, so the contract does not declare a 429 rate-limit response.'}</span></p>
  </section>;
}
