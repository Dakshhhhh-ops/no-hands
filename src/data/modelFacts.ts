/**
 * Lookups that risk findings, open decisions, and status lines share. They find
 * components by type and name in whatever model is loaded, so the analysis never
 * assumes the bundled sample's ids.
 */

import type { ApiOperation, Component, Project, Requirement } from '../types/schema.ts';

const RESILIENCE_WORDS = /(unavailable|resilien|fallback|outage)/i;
const AUTH_WORDS = /\b(auth|authentication|login|identity|account|accounts|user|users|session)\b/i;

const words = (text: string | undefined): string => String(text || '').toLowerCase().replace(/[-_]/g, ' ');

export const callersOf = (project: Project, id: string): Component[] =>
  project.relationships
    .filter((edge) => edge.to === id)
    .map((edge) => project.components.find((node) => node.id === edge.from))
    .filter((node): node is Component => Boolean(node));

export const findCaches = (project: Project): Component[] => project.components.filter((c) => c.type === 'CACHE');

export const findDatabases = (project: Project): Component[] => project.components.filter((c) => c.type === 'DATABASE');

/** The service (or gateway) that handles sign-in, recognized by its id or name. */
export function findAuthComponent(project: Project): Component | null {
  return project.components.find((c) => (c.type === 'SERVICE' || c.type === 'GATEWAY') && AUTH_WORDS.test(`${words(c.id)} ${words(c.name)}`))
    || null;
}

/** Where public traffic enters: the gateway if there is one, otherwise the auth component. */
export function findPublicEntry(project: Project): Component | null {
  return project.components.find((c) => c.type === 'GATEWAY') || findAuthComponent(project);
}

/** A requirement that says what happens when this cache is unavailable. */
export function cacheRequirement(project: Project, cache: Component): Requirement | null {
  const name = words(cache.name);
  const id = words(cache.id);
  return project.requirements.find((r) => {
    const text = words(r.text);
    return (text.includes(name) || text.includes(id)) && RESILIENCE_WORDS.test(r.text);
  }) || null;
}

export const rateLimitRequirement = (project: Project): Requirement | null => project.requirements.find((r) => /rate.?limit/i.test(r.text)) || null;

export const baselineLabel = (project: Pick<Project, 'name'> | null | undefined): string => `${project?.name || 'Project'} baseline`;

/** "PostgreSQL (postgres)", or just "payment-service" when the name is the id. */
export const componentLabel = (component: Pick<Component, 'id' | 'name'>): string => (component.name === component.id ? component.name : `${component.name} (${component.id})`);

/** An API operation that signs users in, judged by its path, id, or owning component. */
export function isAuthOperation(operation: Pick<ApiOperation, 'id' | 'path'>, component?: Component | null): boolean {
  return AUTH_WORDS.test(`${words(operation.path).replace(/\//g, ' ')} ${words(operation.id)}`)
    || (component ? AUTH_WORDS.test(`${words(component.id)} ${words(component.name)}`) : false);
}

/**
 * Whether a rate-limit requirement covers this operation: a requirement about
 * login or authentication covers sign-in operations; any other covers them all.
 * A true result also tells callers the requirement exists, so they can read it.
 */
export function rateLimitApplies(
  requirement: Requirement | null | undefined,
  operation: Pick<ApiOperation, 'id' | 'path'>,
  component?: Component | null,
): requirement is Requirement {
  if (!requirement) return false;
  return /(auth|login|sign.?in|authentication|credential)/i.test(requirement.text) ? isAuthOperation(operation, component) : true;
}

/** Recorded outage choices for the caches this component uses. */
export function cacheChoicesFor(project: Project, componentId: string): Record<string, string> {
  const choices: Record<string, string> = {};
  for (const edge of project.relationships.filter((r) => r.from === componentId)) {
    const cache = project.components.find((c) => c.id === edge.to && c.type === 'CACHE');
    const requirement = cache && cacheRequirement(project, cache);
    // `cache &&` only narrows the type: a requirement is only found when there is a cache.
    if (cache && requirement?.resolution) choices[cache.name] = requirement.resolution;
  }
  return choices;
}
