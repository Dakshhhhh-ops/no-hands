import type { Component, Project } from '../types/schema.ts';

export interface SuggestedInstruction {
  id: string;
  tag: string;
  category: string;
  title: string;
  command: string;
  highlights: string[];
}

/**
 * Example instructions written against the loaded architecture, so an imported
 * stack gets cards that name its real components instead of the sample's.
 */
export function suggestInstructions(project: Project | null | undefined, limit = 4): SuggestedInstruction[] {
  if (!project) return [];
  const { components, relationships } = project;
  const ofType = (type: Component['type']) => components.filter((c) => c.type === type);
  const callersOf = (id: string) =>
    relationships.filter((r) => r.to === id).map((r) => components.find((c) => c.id === r.from)).filter((c): c is Component => Boolean(c));
  const services = ofType('SERVICE');
  const out: SuggestedInstruction[] = [];

  const queue = ofType('QUEUE')[0];
  if (queue && !components.some((c) => /notif/i.test(c.id))) {
    out.push({
      id: 'suggest-notifications',
      tag: 'NEW SERVICE',
      category: 'EVENT DRIVEN',
      title: `Notifications from ${queue.name}`,
      command: `Add a notification service that consumes events from ${queue.name} and sends email and push updates to users.`,
      highlights: ['New component', `Consumes ${queue.name}`, 'Open question: channels'],
    });
  }

  const database = ofType('DATABASE')[0];
  const reader = database ? callersOf(database.id).find((c) => c.type === 'SERVICE') : undefined;
  if (database && reader) {
    const cache = ofType('CACHE')[0];
    out.push({
      id: 'suggest-cache',
      tag: 'PERFORMANCE',
      category: 'CACHING',
      title: `Cache ${reader.name} reads`,
      command: cache
        ? `Have ${reader.name} read through ${cache.name} before hitting ${database.name}, and record a requirement that cached data expires within 5 minutes.`
        : `Add a Redis cache in front of ${database.name} for ${reader.name} reads, and record a requirement that cached data expires within 5 minutes.`,
      highlights: [cache ? `Reuses ${cache.name}` : 'New cache', 'Freshness requirement'],
    });
  }

  const gateway = ofType('GATEWAY')[0];
  const authService = services.find((c) => /auth|account|user|identity|login/i.test(`${c.id} ${c.name}`));
  if (gateway) {
    out.push({
      id: 'suggest-rate-limit',
      tag: 'SECURITY',
      category: 'TRAFFIC CONTROL',
      title: `Rate limit at ${gateway.name}`,
      command: authService
        ? `Add rate limiting on ${gateway.name} for all public routes, and expose a POST /auth/login endpoint on ${authService.name}.`
        : `Add rate limiting on ${gateway.name} for all public routes.`,
      highlights: authService ? ['Requirement', 'API contract'] : ['Requirement'],
    });
  }

  const busiest = [...services].sort(
    (a, b) => relationships.filter((r) => r.from === b.id).length - relationships.filter((r) => r.from === a.id).length,
  )[0];
  if (busiest) {
    out.push({
      id: 'suggest-split',
      tag: 'REFACTOR',
      category: 'SERVICE BOUNDARIES',
      title: `Split ${busiest.name}`,
      command: `Split ${busiest.name} into a read service and a write service, and keep both connected to the same data stores.`,
      highlights: ['Two new components', 'Rewired connections'],
    });
  }

  return out.slice(0, limit);
}
