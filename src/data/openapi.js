const scalar = (value) => typeof value === 'string' ? JSON.stringify(value) : value === null ? 'null' : String(value);
const yamlKey = (key) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) && !/^(yes|no|true|false|null|on|off)$/i.test(key) ? key : JSON.stringify(key);

export function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) return value.length ? value.map((item) => item && typeof item === 'object' ? `${pad}-\n${toYaml(item, indent + 2)}` : `${pad}- ${scalar(item)}`).join('\n') : `${pad}[]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? entries.map(([key, item]) => item && typeof item === 'object' && Object.keys(item).length ? `${pad}${yamlKey(key)}:\n${toYaml(item, indent + 2)}` : `${pad}${yamlKey(key)}: ${toYaml(item, 0).trim()}`).join('\n') : `${pad}{}`;
  }
  return pad + scalar(value);
}

export function makeOpenApi(project) {
  const rateLimit = project.requirements.find((item) => /rate.?limit/i.test(item.text));
  const redisFallback = project.requirements.find((item) => /redis/i.test(item.text) && /(fallback|unavailable|resilien)/i.test(item.text));
  const paths = {};
  for (const operation of project.apiOperations) {
    const component = project.components.find((item) => item.id === operation.componentId);
    if (!component) continue;
    const responses = {
      '200': { description: 'Authentication succeeded. Response fields are not specified in the architecture model.' },
      '500': { description: 'Unexpected server error.' },
    };
    if (rateLimit) responses['429'] = {
      description: rateLimit.resolution
        ? `Request rejected by the configured authentication rate limit. Recorded threshold and window: ${rateLimit.resolution}.`
        : 'Request rejected by the configured authentication rate limit; the exact threshold and window remain unresolved.',
      headers: {
        'X-RateLimit-Limit': {
          description: rateLimit.resolution ? `Configured request limit. Recorded choice: ${rateLimit.resolution}.` : 'Configured request limit; exact value remains unresolved.',
          schema: { type: 'integer' },
        },
        'X-RateLimit-Remaining': { description: 'Requests remaining in the current window.', schema: { type: 'integer' } },
        'Retry-After': {
          description: rateLimit.resolution ? `Seconds until another request may be attempted; recorded threshold/window choice: ${rateLimit.resolution}.` : 'Seconds until another request may be attempted; the window remains unresolved.',
          schema: { type: 'integer' },
        },
      },
      content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } },
    };
    const decisionNotes = [
      rateLimit?.resolution ? `Recorded rate-limit threshold and window: ${rateLimit.resolution}.` : '',
      redisFallback?.resolution ? `Recorded Redis outage behavior: ${redisFallback.resolution}.` : '',
    ].filter(Boolean);
    paths[operation.path] = { [operation.method]: {
      operationId: operation.id,
      summary: operation.summary,
      description: [`Derived from ${component.name}. Request credential fields and successful response fields are not defined in the current model.`, ...decisionNotes].join(' '),
      tags: [component.name],
      requestBody: { required: true, description: 'Request properties are intentionally unspecified until the architecture defines them.', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses,
      'x-voicearchitect-source-component': component.id,
      ...(rateLimit?.resolution ? { 'x-voicearchitect-rate-limit-choice': rateLimit.resolution } : {}),
      ...(redisFallback?.resolution ? { 'x-voicearchitect-redis-outage-choice': redisFallback.resolution } : {}),
    } };
  }
  return { openapi: '3.0.3', info: { title: `${project.name} API`, version: `${project.version}.0.0`, description: 'Generated from the current VoiceArchitect demo model. Unspecified details are called out rather than inferred.' }, paths };
}

export function checkOpenApiStructure(spec) {
  const issues = [];
  if (!/^3\.0\.\d+$/.test(spec.openapi || '')) issues.push('The OpenAPI version must be 3.0.x.');
  if (!spec.info?.title || !spec.info?.version) issues.push('The info object needs a title and version.');
  if (!spec.paths || typeof spec.paths !== 'object' || !Object.keys(spec.paths).length) issues.push('At least one API path is required.');
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    if (!path.startsWith('/')) issues.push(`Path “${path}” must start with /.`);
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'].includes(method)) continue;
      if (!operation.responses || !Object.keys(operation.responses).length) issues.push(`${method.toUpperCase()} ${path} needs at least one response.`);
      for (const [code, response] of Object.entries(operation.responses || {})) if (!response.description) issues.push(`${method.toUpperCase()} ${path} response ${code} needs a description.`);
    }
  }
  return issues;
}
