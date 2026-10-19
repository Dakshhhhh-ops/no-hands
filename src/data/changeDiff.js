import { deriveRiskFindings, deriveTasks } from './analysis.js';
import { makeOpenApi } from './openapi.js';

const same = (left, right) => JSON.stringify(left, (key, value) => (
  key === 'sourceChangeId' || key === 'originalInstruction' ? undefined : value
)) === JSON.stringify(right, (key, value) => (
  key === 'sourceChangeId' || key === 'originalInstruction' ? undefined : value
));

function mapBy(items, key) {
  return new Map(items.map((item) => [key(item), item]));
}

function apiOperations(project) {
  const spec = makeOpenApi(project);
  const operations = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (/^(get|post|put|patch|delete|options|head|trace)$/.test(method)) {
        operations.push({ id: `${method.toUpperCase()} ${path}`, method, path, ...operation });
      }
    }
  }
  return operations;
}

function resolveProvenance(project, category, before, after, latestChange) {
  const entity = after || before;
  let requirement = entity?.requirement;
  if (!requirement && entity?.sourceChangeId) return { changeId: entity.sourceChangeId, instruction: entity.originalInstruction };

  if (!requirement && category === 'risks') {
    const evidence = (entity?.evidence || []).join(' ');
    const requirementId = evidence.match(/REQ-[A-Z-]+/)?.[0];
    requirement = project.requirements.find((item) => item.id === requirementId);
  }
  if (!requirement && category === 'apiOperations') {
    requirement = project.requirements.find((item) => item.id === 'REQ-AUTH-RATE')
      || project.requirements.find((item) => item.id === 'REQ-DATA-OWNER');
  }
  if (requirement?.sourceChangeId) return { changeId: requirement.sourceChangeId, instruction: requirement.originalInstruction };

  const categoryChange = project.changes?.find((change) => change.affectedArtifacts?.includes(category));
  const source = categoryChange || latestChange;
  return source
    ? { changeId: source.id, instruction: source.originalInstruction }
    : { changeId: 'BASELINE', instruction: 'Commerce Platform baseline fixture' };
}

function diffRecords({ category, beforeItems, afterItems, key, label, project, latestChange }) {
  const before = mapBy(beforeItems, key);
  const after = mapBy(afterItems, key);
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  return ids.flatMap((id) => {
    const oldValue = before.get(id) || null;
    const newValue = after.get(id) || null;
    if (oldValue && newValue && same(oldValue, newValue)) return [];
    const status = !oldValue ? 'added' : !newValue ? 'removed' : 'modified';
    return [{
      id,
      label: label(newValue || oldValue),
      status,
      before: oldValue,
      after: newValue,
      ...resolveProvenance(project, category, oldValue, newValue, latestChange),
    }];
  });
}

export function deriveChangeDiff(project) {
  const baseline = project.baseline;
  if (!baseline) return [];
  const latestChange = project.changes?.[0];
  const categories = [
    {
      id: 'components', label: 'Components', before: baseline.components, after: project.components,
      key: (item) => item.id, itemLabel: (item) => `${item.name} (${item.id})`,
    },
    {
      id: 'relationships', label: 'Relationships', before: baseline.relationships, after: project.relationships,
      key: (item) => `${item.from}->${item.to}`, itemLabel: (item) => `${item.from} → ${item.to}`,
    },
    {
      id: 'requirements', label: 'Requirements', before: baseline.requirements, after: project.requirements,
      key: (item) => item.id, itemLabel: (item) => `${item.id}: ${item.text}`,
    },
    {
      id: 'apiOperations', label: 'API operations and contract', before: apiOperations(baseline), after: apiOperations(project),
      key: (item) => item.id, itemLabel: (item) => item.id,
    },
    {
      id: 'risks', label: 'Risk findings', before: deriveRiskFindings(baseline), after: deriveRiskFindings(project),
      key: (item) => item.title, itemLabel: (item) => item.title,
    },
    {
      id: 'tasks', label: 'Engineering tasks', before: deriveTasks(baseline), after: deriveTasks(project),
      key: (item) => item.id, itemLabel: (item) => `${item.id}: ${item.title}`,
    },
  ];
  return categories.map((category) => ({
    id: category.id,
    label: category.label,
    entries: diffRecords({
      category: category.id,
      beforeItems: category.before,
      afterItems: category.after,
      key: category.key,
      label: category.itemLabel,
      project,
      latestChange,
    }),
  }));
}

export function deriveManualDecisions(project) {
  const decisions = [];
  const rateLimit = project.requirements.find((item) => /rate.?limit/i.test(item.text));
  const redisFallback = project.requirements.find((item) => /redis/i.test(item.text) && /(unavailable|resilien|fallback)/i.test(item.text));
  const sourceFor = (requirement) => requirement
    ? { changeId: requirement.sourceChangeId || 'BASELINE', instruction: requirement.originalInstruction || 'Commerce Platform baseline fixture' }
    : { changeId: 'BASELINE', instruction: 'Commerce Platform baseline fixture' };

  if (!rateLimit || /threshold unresolved/i.test(rateLimit.text)) decisions.push({
    id: 'rate-limit-threshold', title: 'Choose the authentication rate limit', detail: 'The request threshold and time window are not specified.', ...sourceFor(rateLimit),
  });
  if (!redisFallback || /fallback unresolved/i.test(redisFallback.text)) decisions.push({
    id: 'redis-fallback', title: 'Choose Redis outage behavior', detail: 'Fail-open/fail-closed behavior and session fallback or persistence remain unspecified.', ...sourceFor(redisFallback),
  });
  decisions.push({
    id: 'auth-payload', title: 'Define authentication request and success response fields', detail: 'The current model does not define credential fields or successful response fields.', ...sourceFor(rateLimit || redisFallback),
  });
  return decisions;
}
