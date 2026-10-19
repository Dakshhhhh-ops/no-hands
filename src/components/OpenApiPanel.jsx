import { Check, Copy, Download } from 'lucide-react';
import { checkOpenApiStructure, makeOpenApi, toYaml } from '../data/openapi.js';

export default function OpenApiPanel({ project, onNotify }) {
  const spec = makeOpenApi(project);
  const yaml = toYaml(spec);
  const issues = checkOpenApiStructure(spec);
  const hasRateLimit = project.requirements.some((item) => /rate.?limit/i.test(item.text));
  async function copy() {
    try {
      await navigator.clipboard.writeText(yaml);
      onNotify('OpenAPI YAML copied to clipboard.');
    } catch {
      try {
        const input = document.createElement('textarea'); input.value = yaml; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select();
        const copied = document.execCommand?.('copy') || false; input.remove();
        onNotify(copied ? 'OpenAPI YAML copied to clipboard.' : 'Clipboard access is unavailable in this browser.');
      } catch { onNotify('Clipboard access is unavailable in this browser.'); }
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([`${yaml}\n`], { type: 'application/yaml' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'openapi.yaml'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); onNotify('openapi.yaml downloaded.');
  }
  return <section className="api-panel">
    <div className="api-toolbar"><span>OpenAPI 3.0.3 · {issues.length ? `${issues.length} structure issue${issues.length === 1 ? '' : 's'}` : 'basic structure checks passed'} · model v{project.version}</span><div><button className="button compact" onClick={copy}><Copy size={14} /> Copy YAML</button><button className="button compact" onClick={download}><Download size={14} /> Download</button></div></div>
    <pre className="api-code"><code>{yaml}</code></pre>
    <p className="api-note"><Check size={13} /> <span>{issues.length > 0 && <b>Structure issues: {issues.join(' ')}</b>}<b>Model limits:</b> request and success-response fields are unspecified. {hasRateLimit ? 'Rate limiting is required, so the contract includes 429 and rate-limit headers; its threshold remains unresolved.' : 'No rate-limit requirement has been applied, so the contract does not declare a 429 rate-limit response.'}</span></p>
  </section>;
}
