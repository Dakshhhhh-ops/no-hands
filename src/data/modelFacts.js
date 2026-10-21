/**
 * Lookups that risk findings, open decisions, and status lines share. They find
 * components by type and name in whatever model is loaded, so the analysis never
 * assumes the bundled sample's ids.
 */

const RESILIENCE_WORDS = /(unavailable|resilien|fallback|outage)/i;
const AUTH_WORDS = /\b(auth|authentication|login|identity|account|accounts|user|users|session)\b/i;

const words = (text) => String(text || '').toLowerCase().replace(/[-_]/g, ' ');

export const callersOf = (project, id) =>
  project.relationships
    .filter((edge) => edge.to === id)
    .map((edge) => project.components.find((node) => node.id === edge.from))
    .filter(Boolean);

export const findCaches = (project) => project.components.filter((c) => c.type === 'CACHE');

export const findDatabases = (project) => project.components.filter((c) => c.type === 'DATABASE');

/** The service (or gateway) that handles sign-in, recognized by its id or name. */
export function findAuthComponent(project) {
  return project.components.find((c) => (c.type === 'SERVICE' || c.type === 'GATEWAY') && AUTH_WORDS.test(`${words(c.id)} ${words(c.name)}`))
    || null;
}

/** Where public traffic enters: the gateway if there is one, otherwise the auth component. */
export function findPublicEntry(project) {
  return project.components.find((c) => c.type === 'GATEWAY') || findAuthComponent(project);
}

/** A requirement that says what happens when this cache is unavailable. */
export function cacheRequirement(project, cache) {
  const name = words(cache.name);
  const id = words(cache.id);
  return project.requirements.find((r) => {
    const text = words(r.text);
    return (text.includes(name) || text.includes(id)) && RESILIENCE_WORDS.test(r.text);
  }) || null;
}

export const rateLimitRequirement = (project) => project.requirements.find((r) => /rate.?limit/i.test(r.text)) || null;

export const baselineLabel = (project) => `${project?.name || 'Project'} baseline`;

/** "PostgreSQL (postgres)", or just "payment-service" when the name is the id. */
export const componentLabel = (component) => (component.name === component.id ? component.name : `${component.name} (${component.id})`);

/** An API operation that signs users in, judged by its path, id, or owning component. */
export function isAuthOperation(operation, component) {
  return AUTH_WORDS.test(`${words(operation.path).replace(/\//g, ' ')} ${words(operation.id)}`)
    || (component ? AUTH_WORDS.test(`${words(component.id)} ${words(component.name)}`) : false);
}

/**
 * Whether a rate-limit requirement covers this operation: a requirement about
 * login or authentication covers sign-in operations; any other covers them all.
 */
export function rateLimitApplies(requirement, operation, component) {
  if (!requirement) return false;
  return /(auth|login|sign.?in|authentication|credential)/i.test(requirement.text) ? isAuthOperation(operation, component) : true;
}

/** Recorded outage choices for the caches this component uses. */
export function cacheChoicesFor(project, componentId) {
  const choices = {};
  for (const edge of project.relationships.filter((r) => r.from === componentId)) {
    const cache = project.components.find((c) => c.id === edge.to && c.type === 'CACHE');
    const requirement = cache && cacheRequirement(project, cache);
    if (requirement?.resolution) choices[cache.name] = requirement.resolution;
  }
  return choices;
}
