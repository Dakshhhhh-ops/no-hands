import type { ApiOperation, Component, Relationship, Requirement } from '../types/schema.ts';

/**
 * Only the fields the checks read, each list optional: any Project fits, and so
 * does a partial model that is still being loaded or edited.
 */
export interface ReferenceModel {
  components?: Pick<Component, 'id'>[];
  relationships?: Pick<Relationship, 'from' | 'to'>[];
  apiOperations?: (Pick<ApiOperation, 'componentId' | 'path'> & { method?: string })[];
  requirements?: Pick<Requirement, 'id'>[];
}

export interface ReferentialCheckResult {
  total: number;
  passed: number;
  percent: number;
  problems: string[];
}

/** Every reference in the model that must point at something real, and whether it does. */
export function referentialChecks(project: ReferenceModel | null | undefined): ReferentialCheckResult {
  const components = project?.components || [];
  const relationships = project?.relationships || [];
  const apiOperations = project?.apiOperations || [];
  const requirements = project?.requirements || [];
  const ids = new Set(components.map((c) => c.id));
  const seen = <T>(list: T[], key: (item: T) => string): boolean[] => {
    const counts = new Map<string, number>();
    list.forEach((item) => counts.set(key(item), (counts.get(key(item)) || 0) + 1));
    return list.map((item) => counts.get(key(item)) === 1);
  };
  const results = [
    ...relationships.map((r) => ({ ok: ids.has(r.from), problem: `Connection from unknown component "${r.from}"` })),
    ...relationships.map((r) => ({ ok: ids.has(r.to), problem: `Connection to unknown component "${r.to}"` })),
    ...apiOperations.map((a) => ({ ok: ids.has(a.componentId), problem: `API ${a.method?.toUpperCase()} ${a.path} owned by unknown component "${a.componentId}"` })),
    ...seen(components, (c) => c.id).map((ok, i) => ({ ok, problem: `Duplicate component id "${components[i].id}"` })),
    ...seen(relationships, (r) => `${r.from}>${r.to}`).map((ok, i) => ({ ok, problem: `Duplicate connection ${relationships[i].from} → ${relationships[i].to}` })),
    ...seen(requirements, (q) => q.id).map((ok, i) => ({ ok, problem: `Duplicate requirement id "${requirements[i].id}"` })),
  ];
  const passed = results.filter((r) => r.ok).length;
  return {
    total: results.length,
    passed,
    percent: results.length ? Math.round((passed / results.length) * 100) : 100,
    problems: [...new Set(results.filter((r) => !r.ok).map((r) => r.problem))],
  };
}
