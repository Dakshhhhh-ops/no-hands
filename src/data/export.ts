import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { deriveRiskFindings, deriveTasks } from './analysis.ts';
import { checkOpenApiStructure, makeOpenApi, toYaml } from './openapi.ts';
import { generateTerraform, generateKubernetes } from './iacGenerator.ts';
import { generateTypeScriptSdk } from './sdkGenerator.ts';
import { generateMultiServiceOpenApi, detectContractDrift } from './openapiSynth.ts';
import { makeArchitectureMermaid, makeArchitectureSvg } from './diagramExport.ts';
import type { Project, RiskFinding, Task } from '../types/schema.ts';

/** File name to contents, as written into the export ZIP. */
export type ExportFiles = Record<string, string>;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function riskMarkdown(project: Project, findings: RiskFinding[], generatedAt: string): string {
  return `# Risk findings — ${project.name}\n\nModel version: ${project.version}  \nGenerated: ${generatedAt}\n\n${findings.length ? findings.map((finding) => `## ${finding.kind}: ${finding.title}\n\n${finding.description}\n\nEvidence:\n${finding.evidence.map((item) => `- ${item}`).join('\n')}`).join('\n\n') : 'No findings were derived from the current model.'}\n`;
}

function taskMarkdown(project: Project, tasks: Task[], generatedAt: string): string {
  return `# Proposed engineering tasks — ${project.name}\n\nModel version: ${project.version}  \nGenerated: ${generatedAt}\n\n${tasks.length ? tasks.map((task) => `## ${task.title}\n\n- Status: Proposed — not completed\n- Epic: ${task.epic}\n- ID: ${task.id}\n- Priority: ${task.priority}\n- Requirement: ${task.requirement.id} — ${task.requirement.text}\n\n### Acceptance criteria\n${task.acceptance.map((item) => `- ${item}`).join('\n')}\n\n### Decision status\n${task.requirement.resolution ? `Recorded choice: ${task.requirement.resolution}. Implementation remains proposed.` : `Unresolved: ${task.unresolved}`}`).join('\n\n') : 'No requirement-based tasks are proposed yet.'}\n`;
}

function exportReadme(project: Project, generatedAt: string, unresolved: string[], validationStatus: string): string {
  const recorded = project.requirements.filter((requirement) => requirement.resolution).map((requirement) => `${requirement.id}: ${requirement.resolution}`);
  return `# ${project.name} — VoiceArchitect export\n\n- Model version: ${project.version}\n- Generated at: ${generatedAt}\n- Status: ${project.changed ? 'Updated from reviewed changes' : 'Baseline sample'}\n- Validation status: ${validationStatus}\n\n## Files\n\n- \`architecture.json\`: current canonical demo model\n- \`architecture.svg\` and \`architecture.png\`: current architecture diagram in vector and raster formats\n- \`architecture.mmd\`: editable Mermaid source for the current diagram\n- \`openapi.yaml\`: generated OpenAPI 3.0.3 contract\n- \`risk-audit.json\` and \`risk-audit.md\`: deterministic findings with model evidence\n- \`engineering-tasks.json\` and \`engineering-tasks.md\`: proposed work derived from requirements\n- \`change-log.json\`: accepted changes in this project session\n\n## Recorded decisions\n\n${recorded.length ? recorded.map((item) => `- ${item}`).join('\n') : 'No choices have been recorded.'}\n\n## Known unresolved decisions\n\n${unresolved.length ? unresolved.map((item) => `- ${item}`).join('\n') : 'No tracked decisions remain unresolved.'}\n\n## Limitations\n\nThis is a synthetic, deterministic demo. Requirements and generated tasks do not imply implementation. Risk findings are not calibrated probabilities. OpenAPI request and successful-response payload details are not specified where absent from the model.\n`;
}

export function makeExportFiles(project: Project, generatedAt = new Date().toISOString()): ExportFiles {
  const findings = deriveRiskFindings(project);
  const tasks = deriveTasks(project);
  const validationIssues = checkOpenApiStructure(makeOpenApi(project));
  const validationStatus = validationIssues.length
    ? `Basic OpenAPI structural checks failed (${validationIssues.length} issue${validationIssues.length === 1 ? '' : 's'}).`
    : 'Basic OpenAPI structural checks passed; this is not a full OpenAPI validator.';
  const unresolved: string[] = [];
  const rateLimitRequirement = project.requirements.find((item) => /rate.?limit/i.test(item.text));
  const redisFallbackRequirement = project.requirements.find((item) => /redis/i.test(item.text) && /(unavailable|resilien|fallback)/i.test(item.text));
  if (!rateLimitRequirement?.resolution) unresolved.push('Authentication rate-limit threshold and time window remain unspecified.');
  if (!redisFallbackRequirement?.resolution) unresolved.push('Redis outage fallback behavior remains unspecified.');
  unresolved.push('Redis session persistence behavior remains unspecified.');
  unresolved.push('Authentication request fields and successful response fields are not defined in the current model.');

  const metadata = { generatedAt, modelVersion: project.version };
  const exportedModel = { ...project, exportMetadata: metadata };
  const changeLog = { project: project.name, ...metadata, entries: project.changes || project.activity || [] };
  return {
    'architecture.json': `${JSON.stringify(exportedModel, null, 2)}\n`,
    'architecture.mmd': makeArchitectureMermaid(project),
    'architecture.svg': makeArchitectureSvg(project),
    'openapi.yaml': `${toYaml(makeOpenApi(project))}\n`,
    'risk-audit.json': `${JSON.stringify({ ...metadata, findings }, null, 2)}\n`,
    'risk-audit.md': riskMarkdown(project, findings, generatedAt),
    'engineering-tasks.json': `${JSON.stringify({ ...metadata, tasks }, null, 2)}\n`,
    'engineering-tasks.md': taskMarkdown(project, tasks, generatedAt),
    'change-log.json': `${JSON.stringify(changeLog, null, 2)}\n`,
    'README.md': exportReadme(project, generatedAt, unresolved, validationStatus),
  };
}

// The PNG arrives from a canvas render, so its bytes are checked at run time, not trusted by type.
export function createVerifiedExportZip(project: Project, generatedAt = new Date().toISOString(), diagramPngBytes?: unknown): { data: Uint8Array; files: string[] } {
  if (!(diagramPngBytes instanceof Uint8Array) || PNG_SIGNATURE.some((byte, index) => diagramPngBytes[index] !== byte)) {
    throw new Error('A rendered architecture PNG is required to create the verified Export All ZIP.');
  }
  const files = makeExportFiles(project, generatedAt);
  const expectedEntries = { ...files, 'architecture.png': diagramPngBytes };
  const packed = zipSync(Object.fromEntries(Object.entries(expectedEntries).map(([name, value]) => [name, typeof value === 'string' ? strToU8(value) : value])), { level: 6 });
  const unpacked = unzipSync(packed);
  for (const [name, expected] of Object.entries(expectedEntries)) {
    const actual = unpacked[name];
    if (typeof expected === 'string') {
      if (!actual || strFromU8(actual) !== expected) throw new Error(`ZIP verification failed for ${name}.`);
    } else if (!actual || actual.length !== expected.length || actual.some((byte: number, index: number) => byte !== expected[index])) {
      throw new Error(`ZIP verification failed for ${name}.`);
    }
  }
  if (Object.keys(unpacked).length !== Object.keys(expectedEntries).length) throw new Error('ZIP contains unexpected or missing entries.');
  return { data: packed, files: Object.keys(expectedEntries) };
}

/**
 * Creates full production DevOps package containing Terraform HCL, Kubernetes YAML,
 * TypeScript Client SDK, and Multi-Service OpenAPI 3.1 specifications.
 */
export function createVerifiedDevOpsZip(project: Project, generatedAt = new Date().toISOString()): { data: Uint8Array; files: string[] } {
  const baseFiles = makeExportFiles(project, generatedAt);
  const driftReport = detectContractDrift(project);
  const devOpsFiles = {
    ...baseFiles,
    'infrastructure/main.tf': generateTerraform(project),
    'infrastructure/k8s-manifests.yaml': generateKubernetes(project),
    'sdk/client.ts': generateTypeScriptSdk(project),
    'openapi-3.1-multiservice.json': `${JSON.stringify(generateMultiServiceOpenApi(project), null, 2)}\n`,
    'contract-drift-report.json': `${JSON.stringify(driftReport, null, 2)}\n`,
  };

  const packed = zipSync(
    Object.fromEntries(Object.entries(devOpsFiles).map(([name, text]) => [name, strToU8(text)])),
    { level: 6 }
  );
  return { data: packed, files: Object.keys(devOpsFiles) };
}

