import { deriveRiskFindings, deriveTasks } from './analysis.ts';
import { makeOpenApi } from './openapi.ts';
import { ManualDecisionSchema } from '../types/schema.ts';
import type { OpenApiOperation } from './openapi.ts';
import type { ChangeRecord, ManualDecision, Project, Requirement } from '../types/schema.ts';
import { baselineLabel, cacheRequirement, componentLabel, callersOf, findAuthComponent, findCaches, findPublicEntry, rateLimitRequirement } from './modelFacts.ts';

const PROVENANCE_KEYS = new Set(['sourceChangeId', 'originalInstruction', 'requirementId']);

/** The fields any diffed record may carry that say which change produced it. */
interface ProvenanceFields {
  requirementId?: string;
  requirement?: Pick<Requirement, 'sourceChangeId' | 'originalInstruction'>;
  sourceChangeId?: string;
  originalInstruction?: string;
}
interface Provenance { changeId: string; instruction: string | undefined }

export type DiffStatus = 'added' | 'removed' | 'modified';
export interface DiffEntry<T = unknown> extends Provenance {
  id: string;
  label: string;
  status: DiffStatus;
  before: T | null;
  after: T | null;
}
export interface DiffGroup { id: string; label: string; entries: DiffEntry[] }

/** One operation from the generated contract, keyed like "POST /auth/login". */
type ContractOperation = OpenApiOperation & ProvenanceFields & { id: string; method: string; path: string };

interface DiffCategory<T> {
  id: string;
  label: string;
  before: T[];
  after: T[];
  key: (item: T) => string;
  itemLabel: (item: T) => string;
}

/** Stable serialization: sorted keys, provenance fields dropped. Key order must not count as a change. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    // Any non-null object can be read by key; the values stay unknown.
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => !PROVENANCE_KEYS.has(key) && record[key] !== undefined)
        .sort()
        .map((key) => [key, canonical(record[key])]),
    );
  }
  return value;
}

const same = (left: unknown, right: unknown): boolean => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function mapBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [key(item), item]));
}

function apiOperations(project: Project): ContractOperation[] {
  const spec = makeOpenApi(project);
  const operations: ContractOperation[] = [];
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
function resolveProvenance(
  project: Project,
  category: string,
  before: ProvenanceFields | null,
  after: ProvenanceFields | null,
  latestChange: ChangeRecord | undefined,
): Provenance {
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

function diffRecords<T extends ProvenanceFields>({ category, beforeItems, afterItems, key, label, project, latestChange }: {
  category: string;
  beforeItems: T[];
  afterItems: T[];
  key: (item: T) => string;
  label: (item: T) => string;
  project: Project;
  latestChange: ChangeRecord | undefined;
}): DiffEntry<T>[] {
  const before = mapBy(beforeItems, key);
  const after = mapBy(afterItems, key);
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  return ids.flatMap((id) => {
    const oldValue = before.get(id) || null;
    const newValue = after.get(id) || null;
    if (oldValue && newValue && same(oldValue, newValue)) return [];
    const status: DiffStatus = !oldValue ? 'added' : !newValue ? 'removed' : 'modified';
    // At least one side exists: an id comes from one of the two maps.
    const present = (newValue || oldValue) as T;
    return [
      {
        id,
        label: label(present),
        status,
        before: oldValue,
        after: newValue,
        ...resolveProvenance(project, category, oldValue, newValue, latestChange),
      },
    ];
  });
}

/** Diffs one category; generic so each category's key and label are checked against its own record type. */
function diffCategory<T extends ProvenanceFields>(category: DiffCategory<T>, project: Project, latestChange: ChangeRecord | undefined): DiffGroup {
  return {
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
  };
}

export function deriveChangeDiff(project: Project, comparisonBase: Project | undefined = project.baseline): DiffGroup[] {
  const baseline = comparisonBase;
  if (!baseline) return [];
  const latestChange = project.changes?.[0];
  return [
    diffCategory({
      id: 'components',
      label: 'Components',
      before: baseline.components,
      after: project.components,
      key: (item) => item.id,
      itemLabel: componentLabel,
    }, project, latestChange),
    diffCategory({
      id: 'relationships',
      label: 'Relationships',
      before: baseline.relationships,
      after: project.relationships,
      key: (item) => `${item.from}->${item.to}`,
      itemLabel: (item) => `${item.from} → ${item.to}`,
    }, project, latestChange),
    diffCategory({
      id: 'requirements',
      label: 'Requirements',
      before: baseline.requirements,
      after: project.requirements,
      key: (item) => item.id,
      itemLabel: (item) => `${item.id}: ${item.text}`,
    }, project, latestChange),
    diffCategory({
      id: 'apiOperations',
      label: 'API operations and contract',
      before: apiOperations(baseline),
      after: apiOperations(project),
      key: (item) => item.id,
      itemLabel: (item) => item.id,
    }, project, latestChange),
    diffCategory({
      id: 'risks',
      label: 'Risk findings',
      before: deriveRiskFindings(baseline),
      after: deriveRiskFindings(project),
      key: (item) => item.title,
      itemLabel: (item) => item.title,
    }, project, latestChange),
    diffCategory({
      id: 'tasks',
      label: 'Engineering tasks',
      before: deriveTasks(baseline),
      after: deriveTasks(project),
      key: (item) => item.id,
      itemLabel: (item) => `${item.id}: ${item.title}`,
    }, project, latestChange),
  ];
}

export function deriveManualDecisions(project: Project): ManualDecision[] {
  const decisions: Array<Omit<ManualDecision, 'changeId' | 'instruction'> & Partial<ManualDecision>> = [];
  const rateLimit = rateLimitRequirement(project);
  const auth = findAuthComponent(project);
  const entry = findPublicEntry(project);

  const sourceFor = (requirement: Requirement | null | undefined) =>
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
  const cacheRequirements: Requirement[] = [];
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
