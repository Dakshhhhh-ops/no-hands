/** Every reference in the model that must point at something real, and whether it does. */
export function referentialChecks(project) {
  const components = project?.components || [];
  const relationships = project?.relationships || [];
  const apiOperations = project?.apiOperations || [];
  const requirements = project?.requirements || [];
  const ids = new Set(components.map((c) => c.id));
  const seen = (list, key) => {
    const counts = new Map();
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
