import { validateProject } from '../types/schema.ts';
import type { ArchitectureOperation, Project, Proposal } from '../types/schema.ts';

/**
 * Deterministic executor for model-proposed operations.
 *
 * Claude never edits the project directly. It proposes operations; this module
 * checks each one against the current model (unknown ids, duplicates, dangling
 * edges), applies the valid ones, explains the skipped ones, and re-validates the
 * whole project with the Zod schema. A bad proposal can be rejected, never applied.
 */

export interface OperationOutcome {
  op: ArchitectureOperation;
  applied: boolean;
  message: string;
}

export interface OperationsResult {
  project: Project;
  outcomes: OperationOutcome[];
}

type Artifact = 'components' | 'relationships' | 'apiOperations' | 'requirements' | 'risks' | 'tasks';

export function toComponentId(raw: string): string {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toRequirementId(raw: string): string {
  const slug = String(raw)
    .trim()
    .toUpperCase()
    .replace(/^REQ[-_\s]*/, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `REQ-${slug || 'GENERAL'}`;
}

function edgeName(project: Project, from: string, to: string): string {
  const name = (id: string) => project.components.find((c) => c.id === id)?.name || id;
  return `${name(from)} → ${name(to)}`;
}

export function applyOperations(project: Project, proposal: Proposal): OperationsResult {
  const next = structuredClone(project) as Project;
  const changeId = `CHG-${String(next.version + 1).padStart(4, '0')}`;
  const provenance = { sourceChangeId: changeId, originalInstruction: proposal.text };
  const affected = new Set<Artifact>();
  const outcomes: OperationOutcome[] = [];
  const hasComponent = (id: string) => next.components.some((c) => c.id === id);
  const findEdge = (from: string, to: string) => next.relationships.find((r) => r.from === from && r.to === to);
  const ok = (op: ArchitectureOperation, message: string) => outcomes.push({ op, applied: true, message });
  // Connections removed along with a component; a later explicit removal of one is already done.
  const cascaded = new Set<string>();
  const skip = (op: ArchitectureOperation, message: string) => outcomes.push({ op, applied: false, message });

  for (const op of proposal.operations || []) {
    switch (op.op) {
      case 'add_component': {
        const id = toComponentId(op.id || op.name);
        if (!id) { skip(op, 'Skipped a component with no usable id.'); break; }
        if (hasComponent(id)) { skip(op, `Skipped adding "${op.name}": a component with id "${id}" already exists.`); break; }
        next.components.push({
          id,
          name: op.name.trim() || id,
          type: op.type,
          sub: op.sub || '',
          responsibilities: op.responsibilities || [],
          x: 0,
          y: 0,
          ...provenance,
        });
        affected.add('components');
        ok(op, `${op.name} added`);
        break;
      }
      case 'update_component': {
        const id = toComponentId(op.id);
        const component = next.components.find((c) => c.id === id);
        if (!component) { skip(op, `Skipped updating "${op.id}": no such component.`); break; }
        if (op.name) component.name = op.name;
        if (op.type) component.type = op.type;
        if (op.sub !== null && op.sub !== undefined) component.sub = op.sub;
        if (op.responsibilities) component.responsibilities = op.responsibilities;
        Object.assign(component, provenance);
        affected.add('components');
        ok(op, `${component.name} updated`);
        break;
      }
      case 'remove_component': {
        const id = toComponentId(op.id);
        const component = next.components.find((c) => c.id === id);
        if (!component) { skip(op, `Skipped removing "${op.id}": no such component.`); break; }
        const edgesBefore = next.relationships.length;
        const opsBefore = next.apiOperations.length;
        next.components = next.components.filter((c) => c.id !== id);
        next.relationships.filter((r) => r.from === id || r.to === id).forEach((r) => cascaded.add(`${r.from}>${r.to}`));
        next.relationships = next.relationships.filter((r) => r.from !== id && r.to !== id);
        next.apiOperations = next.apiOperations.filter((a) => a.componentId !== id);
        const droppedEdges = edgesBefore - next.relationships.length;
        const droppedOps = opsBefore - next.apiOperations.length;
        affected.add('components');
        if (droppedEdges) affected.add('relationships');
        if (droppedOps) affected.add('apiOperations');
        const extras = [
          droppedEdges ? `${droppedEdges} connection${droppedEdges === 1 ? '' : 's'}` : '',
          droppedOps ? `${droppedOps} API operation${droppedOps === 1 ? '' : 's'}` : '',
        ].filter(Boolean).join(' and ');
        ok(op, `${component.name} removed${extras ? ` with ${extras}` : ''}`);
        break;
      }
      case 'add_relationship': {
        const from = toComponentId(op.from);
        const to = toComponentId(op.to);
        if (!hasComponent(from) || !hasComponent(to)) {
          skip(op, `Skipped connecting "${op.from}" to "${op.to}": ${!hasComponent(from) ? op.from : op.to} does not exist.`);
          break;
        }
        if (from === to) { skip(op, `Skipped a self-connection on "${op.from}".`); break; }
        const existing = findEdge(from, to);
        if (existing) {
          existing.label = op.label || existing.label;
          if (op.protocol) existing.protocol = op.protocol;
          Object.assign(existing, provenance);
          affected.add('relationships');
          ok(op, `${edgeName(next, from, to)} relabeled "${existing.label}"`);
          break;
        }
        next.relationships.push({
          from,
          to,
          label: op.label.trim() || 'calls',
          ...(op.protocol ? { protocol: op.protocol } : {}),
          ...provenance,
        });
        affected.add('relationships');
        ok(op, `${edgeName(next, from, to)} connected`);
        break;
      }
      case 'update_relationship': {
        const from = toComponentId(op.from);
        const to = toComponentId(op.to);
        const edge = findEdge(from, to);
        if (!edge) { skip(op, `Skipped updating "${op.from} → ${op.to}": no such connection.`); break; }
        if (op.label) edge.label = op.label;
        if (op.protocol) edge.protocol = op.protocol;
        Object.assign(edge, provenance);
        affected.add('relationships');
        ok(op, `${edgeName(next, from, to)} updated`);
        break;
      }
      case 'remove_relationship': {
        const from = toComponentId(op.from);
        const to = toComponentId(op.to);
        if (!findEdge(from, to) && cascaded.has(`${from}>${to}`)) { ok(op, ''); break; }
        if (!findEdge(from, to)) { skip(op, `Skipped removing "${op.from} → ${op.to}": no such connection.`); break; }
        const label = edgeName(next, from, to);
        next.relationships = next.relationships.filter((r) => !(r.from === from && r.to === to));
        affected.add('relationships');
        ok(op, `${label} disconnected`);
        break;
      }
      case 'add_api_operation': {
        const componentId = toComponentId(op.componentId);
        if (!hasComponent(componentId)) { skip(op, `Skipped API ${op.method.toUpperCase()} ${op.path}: component "${op.componentId}" does not exist.`); break; }
        const path = op.path.startsWith('/') ? op.path : `/${op.path}`;
        if (next.apiOperations.some((a) => a.method === op.method && a.path === path)) {
          skip(op, `Skipped API ${op.method.toUpperCase()} ${path}: it already exists.`);
          break;
        }
        let id = toComponentId(op.id) || `api-${componentId}-${op.method}`;
        while (next.apiOperations.some((a) => a.id === id)) id = `${id}-2`;
        next.apiOperations.push({ id, componentId, method: op.method, path, summary: op.summary || '', ...provenance });
        affected.add('apiOperations');
        ok(op, `API ${op.method.toUpperCase()} ${path} added`);
        break;
      }
      case 'remove_api_operation': {
        const id = toComponentId(op.id);
        const existing = next.apiOperations.find((a) => a.id === id);
        if (!existing) { skip(op, `Skipped removing API operation "${op.id}": not found.`); break; }
        next.apiOperations = next.apiOperations.filter((a) => a.id !== id);
        affected.add('apiOperations');
        ok(op, `API ${existing.method.toUpperCase()} ${existing.path} removed`);
        break;
      }
      case 'add_requirement': {
        const id = toRequirementId(op.id);
        const requirement = { id, text: op.text.trim(), status: op.status, ...provenance };
        if (!requirement.text) { skip(op, 'Skipped an empty requirement.'); break; }
        const index = next.requirements.findIndex((r) => r.id === id);
        if (index >= 0) next.requirements[index] = { ...next.requirements[index], ...requirement };
        else next.requirements.push(requirement);
        affected.add('requirements');
        affected.add('risks');
        affected.add('tasks');
        ok(op, `Requirement recorded: ${requirement.text}`);
        break;
      }
      default:
        break;
    }
  }

  const applied = outcomes.filter((o) => o.applied && o.message).map((o) => o.message);
  const summary = applied.join(' · ') || 'Architecture request recorded; no structural change applied';
  const timestamp = Date.now();
  next.version += 1;
  next.changed = true;
  next.changes.unshift({ id: changeId, version: next.version, originalInstruction: proposal.text, summary, affectedArtifacts: [...affected], timestamp });
  next.activity.unshift({ version: next.version, summary, sourceChangeId: changeId, originalInstruction: proposal.text, timestamp });

  return { project: validateProject(next), outcomes };
}
