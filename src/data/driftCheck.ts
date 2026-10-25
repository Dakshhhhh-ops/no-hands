import { validateProposal } from '../types/schema.ts';
import type { ArchitectureOperation, Component, Project, Proposal, Relationship } from '../types/schema.ts';
import { projectFromCompose } from './composeImport.ts';

/**
 * Code drift: compares the diagram with a docker-compose file and sorts every
 * difference by what it means.
 *
 *   in code, missing from the diagram   -> the diagram is stale; propose adding it
 *   removed from code                    -> imported earlier, gone now; propose removing it
 *   changed in code                      -> the image or type moved on; propose updating it
 *   in the diagram, not in code yet      -> planned work; never touched, only reported
 *
 * "Imported earlier" means the component or connection carries origin 'code'.
 * Everything else in the diagram is treated as planned, so a sync never deletes
 * work that was designed but not built yet.
 */

export interface DriftChange {
  id: string;
  name: string;
  field: 'image' | 'type';
  before: string;
  after: string;
}

export interface DriftReport {
  fileName: string;
  addedInCode: Component[];
  removedFromCode: Component[];
  changedInCode: DriftChange[];
  plannedNotInCode: Component[];
  connectionsAddedInCode: Relationship[];
  connectionsRemovedFromCode: Relationship[];
  plannedConnections: Relationship[];
  /** True when nothing needs syncing. Planned work alone does not count as drift. */
  inSync: boolean;
}

const edgeKey = (r: { from: string; to: string }) => `${r.from}>${r.to}`;
/** Only compare descriptions that still look like an image or build path, not ones a person rewrote. */
const looksLikeImage = (text: string) => /:|^build:/.test(text);

export function detectCodeDrift(project: Project, composeSource: string, fileName = 'docker-compose.yml'): DriftReport {
  const code = projectFromCompose(composeSource, fileName);
  const modelById = new Map(project.components.map((c) => [c.id, c]));
  const codeById = new Map(code.components.map((c) => [c.id, c]));

  const addedInCode = code.components.filter((c) => !modelById.has(c.id));
  const removedFromCode = project.components.filter((c) => c.origin === 'code' && !codeById.has(c.id));
  const plannedNotInCode = project.components.filter((c) => c.origin !== 'code' && !codeById.has(c.id));

  const changedInCode: DriftChange[] = [];
  for (const codeComp of code.components) {
    const modelComp = modelById.get(codeComp.id);
    if (!modelComp) continue;
    if (modelComp.type !== codeComp.type && modelComp.origin === 'code') {
      changedInCode.push({ id: codeComp.id, name: modelComp.name, field: 'type', before: modelComp.type, after: codeComp.type });
    }
    if (modelComp.sub !== codeComp.sub && looksLikeImage(modelComp.sub)) {
      changedInCode.push({ id: codeComp.id, name: modelComp.name, field: 'image', before: modelComp.sub, after: codeComp.sub });
    }
  }

  // Code says only that two services are wired together (depends_on, a connection string),
  // not which way calls or data flow, so a connection matches in either direction: the
  // diagram's "kafka -> consumer" is the code's "consumer depends_on kafka".
  const modelEdges = new Set(project.relationships.map(edgeKey));
  const codeEdges = new Set(code.relationships.map(edgeKey));
  const linked = (edges: Set<string>, r: Relationship) => edges.has(edgeKey(r)) || edges.has(edgeKey({ from: r.to, to: r.from }));
  const removedIds = new Set(removedFromCode.map((c) => c.id));
  const touchesRemoved = (r: Relationship) => removedIds.has(r.from) || removedIds.has(r.to);

  const connectionsAddedInCode = code.relationships.filter((r) => !linked(modelEdges, r));
  const connectionsRemovedFromCode = project.relationships.filter(
    (r) => r.origin === 'code' && !linked(codeEdges, r) && !touchesRemoved(r),
  );
  const plannedConnections = project.relationships.filter(
    (r) => r.origin !== 'code' && !linked(codeEdges, r) && !touchesRemoved(r),
  );

  const inSync = !addedInCode.length && !removedFromCode.length && !changedInCode.length
    && !connectionsAddedInCode.length && !connectionsRemovedFromCode.length;

  return {
    fileName,
    addedInCode,
    removedFromCode,
    changedInCode,
    plannedNotInCode,
    connectionsAddedInCode,
    connectionsRemovedFromCode,
    plannedConnections,
    inSync,
  };
}

const names = (list: Array<{ name: string }>) => list.map((c) => c.name).join(', ');
const edges = (list: Relationship[], project: Project) => {
  const nameOf = (id: string) => project.components.find((c) => c.id === id)?.name || id;
  return list.map((r) => `${nameOf(r.from)} → ${nameOf(r.to)}`).join(', ');
};

/** Turns a drift report into a proposal for the normal review dialog, or null when in sync. */
export function driftProposal(report: DriftReport, project: Project): Proposal | null {
  if (report.inSync) return null;
  const operations: ArchitectureOperation[] = [];
  const items: Proposal['items'] = [];

  for (const c of report.addedInCode) {
    operations.push({ op: 'add_component', id: c.id, name: c.name, type: c.type, sub: c.sub, responsibilities: c.responsibilities });
  }
  if (report.addedInCode.length) {
    items.push({ key: 'drift-added', title: `Add ${report.addedInCode.length} service${report.addedInCode.length === 1 ? '' : 's'} found in ${report.fileName}`, detail: `In code but missing from the diagram: ${names(report.addedInCode)}.` });
  }

  for (const change of report.changedInCode) {
    operations.push({
      op: 'update_component',
      id: change.id,
      name: null,
      type: change.field === 'type' ? (change.after as Component['type']) : null,
      sub: change.field === 'image' ? change.after : null,
      responsibilities: null,
    });
  }
  if (report.changedInCode.length) {
    items.push({
      key: 'drift-changed',
      title: `Update ${report.changedInCode.length} component${report.changedInCode.length === 1 ? '' : 's'} that changed in code`,
      detail: report.changedInCode.map((c) => `${c.name}: ${c.before} → ${c.after}`).join('; ') + '.',
    });
  }

  for (const r of report.connectionsAddedInCode) {
    operations.push({ op: 'add_relationship', from: r.from, to: r.to, label: r.label, protocol: null });
  }
  if (report.connectionsAddedInCode.length) {
    const withNew = { ...project, components: [...project.components, ...report.addedInCode] };
    items.push({ key: 'drift-edges-added', title: `Add ${report.connectionsAddedInCode.length} connection${report.connectionsAddedInCode.length === 1 ? '' : 's'} found in code`, detail: `${edges(report.connectionsAddedInCode, withNew)}.` });
  }

  for (const r of report.connectionsRemovedFromCode) operations.push({ op: 'remove_relationship', from: r.from, to: r.to });
  if (report.connectionsRemovedFromCode.length) {
    items.push({ key: 'drift-edges-removed', title: `Remove ${report.connectionsRemovedFromCode.length} connection${report.connectionsRemovedFromCode.length === 1 ? '' : 's'} no longer in code`, detail: `${edges(report.connectionsRemovedFromCode, project)}.` });
  }

  for (const c of report.removedFromCode) operations.push({ op: 'remove_component', id: c.id });
  if (report.removedFromCode.length) {
    items.push({ key: 'drift-removed', title: `Remove ${report.removedFromCode.length} service${report.removedFromCode.length === 1 ? '' : 's'} deleted from code`, detail: `Imported earlier, no longer in ${report.fileName}: ${names(report.removedFromCode)}.` });
  }

  const assumptions: string[] = [];
  if (report.plannedNotInCode.length) {
    assumptions.push(`Planned in the diagram but not in ${report.fileName} yet, kept as is: ${names(report.plannedNotInCode)}.`);
  }
  if (report.plannedConnections.length) {
    assumptions.push(`Planned connections not in ${report.fileName} yet, kept as is: ${edges(report.plannedConnections, project)}.`);
  }

  return validateProposal({ text: `Sync the diagram with ${report.fileName}`, items, assumptions, source: 'drift', operations });
}
