import { deriveRiskFindings, deriveTasks } from './analysis.js';
import { makeOpenApi } from './openapi.js';
import { ManualDecisionSchema } from '../types/schema.ts';
import { baselineLabel, cacheRequirement, componentLabel, callersOf, findAuthComponent, findCaches, findPublicEntry, rateLimitRequirement } from './modelFacts.js';

const PROVENANCE_KEYS = new Set(['sourceChangeId', 'originalInstruction', 'requirementId']);

/** Stable serialization: sorted keys, provenance fields dropped. Key order must not count as a change. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => !PROVENANCE_KEYS.has(key) && value[key] !== undefined)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

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

/**
 * Provenance resolution through direct foreign keys.
 * Replaces heuristic regex string matching on evidence text with explicit foreign key lookups.
 */
function resolveProvenance(project, category, before, after, latestChange) {
  // If an entity was removed, the removal was caused by the applied change
  if (!after) {
    const categoryChange = project.changes?.find((change) => change.affectedArtifacts?.includes(category));
    const source = categoryChange || latestChange;
    return source
      ? { changeId: source.id, instruction: source.originalInstruction }
      : { changeId: 'BASELINE', instruction: baselineLabel(project) };
  }

  const entity = after;

  // 1. Direct Foreign Key: check explicit requirementId foreign key
  if (entity.requirementId) {
    const matchedReq = project.requirements?.find((item) => item.id === entity.requirementId);
    if (matchedReq?.sourceChangeId) {
      return {
        changeId: matchedReq.sourceChangeId,
        instruction: matchedReq.originalInstruction,
      };
    }
  }

  // 2. Direct Requirement object reference
  const directReq = entity.requirement;
  if (directReq?.sourceChangeId) {
    return {
      changeId: directReq.sourceChangeId,
      instruction: directReq.originalInstruction,
    };
  }

  // 3. Direct Foreign Key: check entity.sourceChangeId if from a change
  if (entity.sourceChangeId && entity.sourceChangeId !== 'BASELINE') {
    return {
      changeId: entity.sourceChangeId,
      instruction: entity.originalInstruction || latestChange?.originalInstruction || 'Direct change reference',
    };
  }

  // 4. Category-level change resolution
  const categoryChange = project.changes?.find((change) => change.affectedArtifacts?.includes(category));
  const source = categoryChange || latestChange;
  return source
    ? { changeId: source.id, instruction: source.originalInstruction }
    : { changeId: 'BASELINE', instruction: baselineLabel(project) };
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
    return [
      {
        id,
        label: label(newValue || oldValue),
        status,
        before: oldValue,
        after: newValue,
        ...resolveProvenance(project, category, oldValue, newValue, latestChange),
      },
    ];
  });
}

export function deriveChangeDiff(project, comparisonBase = project.baseline) {
  const baseline = comparisonBase;
  if (!baseline) return [];
  const latestChange = project.changes?.[0];
  const categories = [
    {
      id: 'components',
      label: 'Components',
      before: baseline.components,
      after: project.components,
      key: (item) => item.id,
      itemLabel: componentLabel,
    },
    {
      id: 'relationships',
      label: 'Relationships',
      before: baseline.relationships,
      after: project.relationships,
      key: (item) => `${item.from}->${item.to}`,
      itemLabel: (item) => `${item.from} → ${item.to}`,
    },
    {
      id: 'requirements',
      label: 'Requirements',
      before: baseline.requirements,
      after: project.requirements,
      key: (item) => item.id,
      itemLabel: (item) => `${item.id}: ${item.text}`,
    },
    {
      id: 'apiOperations',
      label: 'API operations and contract',
      before: apiOperations(baseline),
      after: apiOperations(project),
      key: (item) => item.id,
      itemLabel: (item) => item.id,
    },
    {
      id: 'risks',
      label: 'Risk findings',
      before: deriveRiskFindings(baseline),
      after: deriveRiskFindings(project),
      key: (item) => item.title,
      itemLabel: (item) => item.title,
    },
    {
      id: 'tasks',
      label: 'Engineering tasks',
      before: deriveTasks(baseline),
      after: deriveTasks(project),
      key: (item) => item.id,
      itemLabel: (item) => `${item.id}: ${item.title}`,
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
  const rateLimit = rateLimitRequirement(project);
  const auth = findAuthComponent(project);
  const entry = findPublicEntry(project);

  const sourceFor = (requirement) =>
    requirement
      ? {
          changeId: requirement.sourceChangeId || 'BASELINE',
          instruction: requirement.originalInstruction || baselineLabel(project),
          requirementId: requirement.id,
        }
      : {
          changeId: 'BASELINE',
          instruction: baselineLabel(project),
          requirementId: undefined,
        };

  // Only decisions the model's own components call for.
  if (entry && !rateLimit?.resolution) {
    decisions.push({
      id: 'rate-limit-threshold',
      title: auth ? 'Choose the authentication rate limit' : `Choose the rate limit at ${entry.name}`,
      detail: 'The request threshold and time window are not specified.',
      ...sourceFor(rateLimit),
    });
  }
  const cacheRequirements = [];
  for (const cache of findCaches(project)) {
    const requirement = cacheRequirement(project, cache);
    if (requirement) cacheRequirements.push(requirement);
    if (!callersOf(project, cache.id).length || requirement?.resolution) continue;
    decisions.push({
      id: `${cache.id}-fallback`,
      title: `Choose ${cache.name} outage behavior`,
      detail: 'Fail-open/fail-closed behavior and fallback or persistence remain unspecified.',
      ...sourceFor(requirement),
    });
  }
  if (auth) {
    decisions.push({
      id: 'auth-payload',
      title: 'Define authentication request and success response fields',
      detail: 'The current model does not define credential fields or successful response fields.',
      ...sourceFor(rateLimit || cacheRequirements[0]),
    });
  }

  return decisions.map((d) => ManualDecisionSchema.parse(d));
}
