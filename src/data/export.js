import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { deriveRiskFindings, deriveTasks } from './analysis.js';
import { checkOpenApiStructure, makeOpenApi, toYaml } from './openapi.js';

function mermaidQuote(value) {
  return JSON.stringify(String(value).replaceAll('"', "'")).replaceAll('\\n', '<br/>');
}

function architectureDiagram(project) {
  const lines = ['flowchart LR'];
  for (const component of project.components) lines.push(`  ${component.id}[${mermaidQuote(`${component.name}<br/>${component.type}`)}]`);
  for (const edge of project.relationships) lines.push(`  ${edge.from} -->|${mermaidQuote(edge.label)}| ${edge.to}`);
  return `${lines.join('\n')}\n`;
}

function riskMarkdown(project, findings, generatedAt) {
  return `# Risk findings — ${project.name}\n\nModel version: ${project.version}  \nGenerated: ${generatedAt}\n\n${findings.length ? findings.map((finding) => `## ${finding.kind}: ${finding.title}\n\n${finding.description}\n\nEvidence:\n${finding.evidence.map((item) => `- ${item}`).join('\n')}`).join('\n\n') : 'No findings were derived from the current model.'}\n`;
}

function taskMarkdown(project, tasks, generatedAt) {
  return `# Proposed engineering tasks — ${project.name}\n\nModel version: ${project.version}  \nGenerated: ${generatedAt}\n\n${tasks.length ? tasks.map((task) => `## ${task.title}\n\n- Status: Proposed — not completed\n- Epic: ${task.epic}\n- ID: ${task.id}\n- Priority: ${task.priority}\n- Requirement: ${task.requirement.id} — ${task.requirement.text}\n\n### Acceptance criteria\n${task.acceptance.map((item) => `- ${item}`).join('\n')}\n\n### Unresolved decision\n${task.unresolved}`).join('\n\n') : 'No requirement-based tasks are proposed yet.'}\n`;
}

function exportReadme(project, generatedAt, unresolved, validationStatus) {
  return `# ${project.name} — VoiceArchitect export\n\n- Model version: ${project.version}\n- Generated at: ${generatedAt}\n- Status: ${project.changed ? 'Updated from reviewed changes' : 'Baseline sample'}\n- Validation status: ${validationStatus}\n\n## Files\n\n- \`architecture.json\`: current canonical demo model\n- \`architecture.mmd\`: current component and relationship diagram\n- \`openapi.yaml\`: generated OpenAPI 3.0.3 contract\n- \`risk-audit.json\` and \`risk-audit.md\`: deterministic findings with model evidence\n- \`engineering-tasks.json\` and \`engineering-tasks.md\`: proposed work derived from requirements\n- \`change-log.json\`: accepted changes in this project session\n\n## Known unresolved decisions\n\n${unresolved.map((item) => `- ${item}`).join('\n')}\n\n## Limitations\n\nThis is a synthetic, deterministic demo. Requirements and generated tasks do not imply implementation. Risk findings are not calibrated probabilities. OpenAPI request and successful-response payload details are not specified where absent from the model.\n`;
}

export function makeExportFiles(project, generatedAt = new Date().toISOString()) {
  const findings = deriveRiskFindings(project);
  const tasks = deriveTasks(project);
  const validationIssues = checkOpenApiStructure(makeOpenApi(project));
  const validationStatus = validationIssues.length
    ? `Basic OpenAPI structural checks failed (${validationIssues.length} issue${validationIssues.length === 1 ? '' : 's'}).`
    : 'Basic OpenAPI structural checks passed; this is not a full OpenAPI validator.';
  const unresolved = [];
  if (!project.requirements.some((item) => /rate.?limit/i.test(item.text))) unresolved.push('Authentication rate-limit threshold and time window have not been decided.');
  else unresolved.push('Authentication rate-limit threshold and time window remain unspecified.');
  if (!project.requirements.some((item) => /redis/i.test(item.text) && /(unavailable|resilien|fallback)/i.test(item.text))) unresolved.push('Login behavior when Redis is unavailable has not been decided.');
  else unresolved.push('Redis outage fallback and session persistence behavior remain unspecified.');
  unresolved.push('Authentication request fields and successful response fields are not defined in the current model.');

  const metadata = { generatedAt, modelVersion: project.version };
  const exportedModel = { ...project, exportMetadata: metadata };
  const changeLog = { project: project.name, ...metadata, entries: project.changes || project.activity || [] };
  return {
    'architecture.json': `${JSON.stringify(exportedModel, null, 2)}\n`,
    'architecture.mmd': architectureDiagram(project),
    'openapi.yaml': `${toYaml(makeOpenApi(project))}\n`,
    'risk-audit.json': `${JSON.stringify({ ...metadata, findings }, null, 2)}\n`,
    'risk-audit.md': riskMarkdown(project, findings, generatedAt),
    'engineering-tasks.json': `${JSON.stringify({ ...metadata, tasks }, null, 2)}\n`,
    'engineering-tasks.md': taskMarkdown(project, tasks, generatedAt),
    'change-log.json': `${JSON.stringify(changeLog, null, 2)}\n`,
    'README.md': exportReadme(project, generatedAt, unresolved, validationStatus),
  };
}

export function createVerifiedExportZip(project, generatedAt = new Date().toISOString()) {
  const files = makeExportFiles(project, generatedAt);
  const packed = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6 });
  const unpacked = unzipSync(packed);
  for (const [name, expected] of Object.entries(files)) {
    const actual = unpacked[name] && strFromU8(unpacked[name]);
    if (actual !== expected) throw new Error(`ZIP verification failed for ${name}.`);
  }
  if (Object.keys(unpacked).length !== Object.keys(files).length) throw new Error('ZIP contains unexpected or missing entries.');
  return { data: packed, files: Object.keys(files) };
}
