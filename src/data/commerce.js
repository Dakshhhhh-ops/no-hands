import { validateProject, validateProposal } from '../types/schema.ts';

export const makeCommerceProject = () => {
  const project = {
    name: 'Commerce Platform',
    version: 1,
    changed: false,
    changes: [],
    components: [
      { id: 'web', name: 'Web & mobile', type: 'CLIENT', x: 42, y: 150, sub: 'Storefront clients', responsibilities: ['Presents product browsing, cart, and checkout experiences to shoppers.'] },
      { id: 'gateway', name: 'API Gateway', type: 'GATEWAY', x: 226, y: 150, sub: 'Routing · TLS · auth', responsibilities: ['Routes client requests to backend services.', 'Terminates TLS and forwards authentication requests.'] },
      { id: 'auth', name: 'Auth Service', type: 'SERVICE', x: 424, y: 52, sub: 'Login · token issuance', responsibilities: ['Authenticates users and issues tokens.', 'Uses Redis for sessions and PostgreSQL for user records.'] },
      { id: 'catalog', name: 'Catalog Service', type: 'SERVICE', x: 424, y: 150, sub: 'Products · inventory', responsibilities: ['Serves product and inventory data to client requests.'] },
      { id: 'orders', name: 'Order Service', type: 'SERVICE', x: 424, y: 248, sub: 'Checkout · fulfillment', responsibilities: ['Coordinates checkout and fulfillment.', 'Publishes order events for downstream processing.'] },
      { id: 'redis', name: 'Redis', type: 'CACHE', x: 650, y: 52, sub: 'Session cache', responsibilities: ['Caches authentication session state.', 'Persistence and outage behavior are not specified in the baseline.'] },
      { id: 'postgres', name: 'PostgreSQL', type: 'DATABASE', x: 650, y: 176, sub: 'Persistent data store', responsibilities: ['Stores user, product, and order records in the demo model.'] },
      { id: 'kafka', name: 'Kafka', type: 'QUEUE', x: 650, y: 280, sub: 'Order events', responsibilities: ['Carries order events to downstream consumers.'] },
      { id: 'payment', name: 'Payment Provider', type: 'EXTERNAL', x: 836, y: 280, sub: 'External integration', responsibilities: ['Represents the external payment integration reached by order events.'] },
    ],
    relationships: [
      { from: 'web', to: 'gateway', label: 'HTTPS' },
      { from: 'gateway', to: 'auth', label: 'login' },
      { from: 'gateway', to: 'catalog', label: 'catalog API' },
      { from: 'gateway', to: 'orders', label: 'checkout' },
      { from: 'auth', to: 'redis', label: 'sessions' },
      { from: 'auth', to: 'postgres', label: 'users' },
      { from: 'catalog', to: 'postgres', label: 'products' },
      { from: 'orders', to: 'postgres', label: 'orders' },
      { from: 'orders', to: 'kafka', label: 'publish' },
      { from: 'kafka', to: 'payment', label: 'payment event' },
    ],
    apiOperations: [{ id: 'api-login', componentId: 'auth', method: 'post', path: '/auth/login', summary: 'Authenticate a user and begin a session' }],
    requirements: [],
    activity: [],
  };

  project.baseline = structuredClone({
    name: project.name,
    version: project.version,
    components: project.components,
    relationships: project.relationships,
    apiOperations: project.apiOperations,
    requirements: project.requirements,
  });

  return validateProject(project);
};

export const DEMO_COMMAND = 'Move session storage to Redis, keep PostgreSQL as the source of truth, add rate limiting to the authentication endpoint, and make login resilient if Redis becomes unavailable.';

export function proposeChange(text) {
  const lower = text.toLowerCase();
  const items = [];
  if (lower.includes('redis') && lower.includes('session')) items.push({ key: 'redis-session', title: 'Set Redis as the explicit session store', detail: 'Update the Auth Service → Redis relationship to identify Redis as session storage.' });
  if (lower.includes('postgres') && (lower.includes('source of truth') || lower.includes('persistent'))) items.push({ key: 'postgres-owner', title: 'Preserve PostgreSQL as the source of truth', detail: 'Record the stated data-ownership constraint; do not infer Redis persistence behavior.' });
  if (lower.includes('rate limit') || lower.includes('rate-limit')) items.push({ key: 'rate-limit', title: 'Add an authentication rate-limiting requirement', detail: 'Attach a rate-limiting requirement to login; the exact limit can be recorded during review.' });
  if (lower.includes('resilien') || lower.includes('unavailable') || lower.includes('failure')) items.push({ key: 'redis-fallback', title: 'Add a Redis-unavailable resilience requirement', detail: 'Record login resilience as required; the team can specify outage behavior during review.' });
  if (/\b(add|use|introduce)\b/.test(lower) && /\bredis\b/.test(lower) && /\bcache\b/.test(lower) && /\bcatalog|product\b/.test(lower)) {
    items.push({ key: 'redis-cache', title: 'Use Redis as the Catalog cache', detail: 'Add a Catalog Service → existing Redis relationship. Cache expiry and invalidation remain unspecified.' });
  }
  if (/\b(split|separate|extract)\b/.test(lower) && /\b(payment|payments)\b/.test(lower) && /\b(service|services)\b/.test(lower)) {
    items.push({ key: 'payment-split', title: 'Separate payment processing into a service', detail: 'Add an internal Payment Service between order events and the external Payment Provider.' });
  }
  if (!items.length) items.push({ key: 'unresolved', title: 'Record this as an unresolved architecture request', detail: 'No demo rule matched. No component or relationship will change automatically.' });
  const assumptions = [];
  if (items.some((item) => item.key === 'rate-limit')) assumptions.push('The rate-limit threshold and time window are still undecided.');
  if (items.some((item) => item.key === 'redis-fallback')) assumptions.push('Redis outage fallback behavior is still undecided.');
  if (items.some((item) => item.key === 'redis-session')) assumptions.push('Redis session persistence behavior is still unspecified.');
  assumptions.push(items[0].key === 'unresolved' ? 'No architecture facts will be added until the request is clarified.' : 'A recorded requirement does not mean the behavior is implemented.');

  return validateProposal({ text, items, assumptions });
}

export function applyChange(project, proposal, decisions = {}) {
  const next = structuredClone(project);
  const lower = proposal.text.toLowerCase();
  const changes = [];
  const changeId = `CHG-${String(next.version + 1).padStart(4, '0')}`;
  const timestamp = Date.now();
  const provenance = { sourceChangeId: changeId, originalInstruction: proposal.text };
  const affectedArtifacts = new Set();
  const existingResolution = (id) => next.requirements.find((item) => item.id === id)?.resolution || '';
  const chosenRateLimitThreshold = Object.hasOwn(decisions, 'rateLimitThreshold')
    ? decisions.rateLimitThreshold?.trim() || ''
    : existingResolution('REQ-AUTH-RATE');
  const chosenRedisFallback = Object.hasOwn(decisions, 'redisFallback')
    ? decisions.redisFallback?.trim() || ''
    : existingResolution('REQ-REDIS-FAIL');

  const addRequirement = (id, text, resolution) => {
    const existingIndex = next.requirements.findIndex((item) => item.id === id);
    const existing = existingIndex >= 0 ? next.requirements[existingIndex] : null;
    const requirement = { ...existing, id, text, status: 'confirmed', ...provenance };
    const chosenResolution = resolution?.trim() || existing?.resolution;
    if (chosenResolution) requirement.resolution = chosenResolution;
    else delete requirement.resolution;
    if (existingIndex >= 0) next.requirements[existingIndex] = requirement;
    else next.requirements.push(requirement);
    affectedArtifacts.add('requirements');
  };

  if (lower.includes('redis') && lower.includes('session')) {
    const edge = next.relationships.find((item) => item.from === 'auth' && item.to === 'redis');
    if (edge) { edge.label = 'sessions · primary store'; Object.assign(edge, provenance); }
    const redis = next.components.find((item) => item.id === 'redis');
    if (redis) { redis.sub = 'Primary session store'; Object.assign(redis, provenance); }
    const operation = next.apiOperations.find((item) => item.componentId === 'auth');
    if (operation) Object.assign(operation, provenance);
    affectedArtifacts.add('components');
    affectedArtifacts.add('relationships');
    affectedArtifacts.add('apiOperations');
    changes.push('Redis relationship labeled as primary session storage');
  }

  if (lower.includes('postgres') && (lower.includes('source of truth') || lower.includes('persistent'))) {
    addRequirement('REQ-DATA-OWNER', 'PostgreSQL remains the source of truth');
    changes.push('PostgreSQL source-of-truth constraint recorded');
  }

  if (lower.includes('rate limit') || lower.includes('rate-limit')) {
    const threshold = chosenRateLimitThreshold;
    addRequirement(
      'REQ-AUTH-RATE',
      threshold
        ? `Authentication endpoint requires rate limiting; configured threshold: ${threshold}`
        : 'Authentication endpoint requires rate limiting; threshold unresolved',
      threshold,
    );
    const operation = next.apiOperations.find((item) => item.id === 'api-login');
    if (operation) Object.assign(operation, provenance);
    affectedArtifacts.add('apiOperations');
    affectedArtifacts.add('risks');
    affectedArtifacts.add('tasks');
    changes.push(threshold
      ? `Authentication rate-limit choice recorded: ${threshold}`
      : 'Authentication rate-limiting requirement recorded; threshold unresolved');
  }

  if (lower.includes('resilien') || lower.includes('unavailable') || lower.includes('failure')) {
    const fallback = chosenRedisFallback;
    addRequirement(
      'REQ-REDIS-FAIL',
      fallback
        ? `Login must remain resilient when Redis is unavailable; selected fallback: ${fallback}`
        : 'Login must remain resilient when Redis is unavailable; fallback unresolved',
      fallback,
    );
    affectedArtifacts.add('risks');
    affectedArtifacts.add('tasks');
    changes.push(fallback
      ? `Redis outage choice recorded: ${fallback}`
      : 'Redis outage resilience requirement recorded; fallback unresolved');
  }

  if (proposal.items.some((item) => item.key === 'redis-cache')) {
    if (next.components.some((item) => item.id === 'redis') && !next.relationships.some((item) => item.from === 'catalog' && item.to === 'redis')) {
      next.relationships.push({ from: 'catalog', to: 'redis', label: 'product cache', ...provenance });
      affectedArtifacts.add('relationships');
      changes.push('Catalog Service connected to the existing Redis cache');
    } else {
      changes.push('Redis cache request recorded; no duplicate cache component added');
    }
  }

  if (proposal.items.some((item) => item.key === 'payment-split')) {
    if (!next.components.some((item) => item.id === 'payment-service')) {
      next.components.push({ id: 'payment-service', name: 'Payment Service', type: 'SERVICE', x: 640, y: 380, sub: 'Payment orchestration', responsibilities: ['Processes payment requests and coordinates the external payment provider.'], ...provenance });
      const eventEdge = next.relationships.find((item) => item.from === 'kafka' && item.to === 'payment');
      if (eventEdge) {
        eventEdge.to = 'payment-service';
        eventEdge.label = 'payment event';
        Object.assign(eventEdge, provenance);
      }
      next.relationships.push({ from: 'payment-service', to: 'payment', label: 'provider request', ...provenance });
      next.apiOperations.push({ id: 'api-payment-create', componentId: 'payment-service', method: 'post', path: '/payments', summary: 'Create and process a payment', ...provenance });
      affectedArtifacts.add('components');
      affectedArtifacts.add('relationships');
      affectedArtifacts.add('apiOperations');
      changes.push('Payment Service added between order events and the Payment Provider');
    } else {
      changes.push('Payment Service already exists; no duplicate service added');
    }
  }

  if (lower.includes('postgres') && (lower.includes('source of truth') || lower.includes('persistent'))) {
    affectedArtifacts.add('risks');
    affectedArtifacts.add('tasks');
  }

  next.version += 1;
  next.changed = true;
  const summary = changes.join(' · ') || 'Architecture request recorded for follow-up';
  next.changes.unshift({ id: changeId, version: next.version, originalInstruction: proposal.text, summary, affectedArtifacts: [...affectedArtifacts], timestamp });
  next.activity.unshift({ version: next.version, summary, sourceChangeId: changeId, originalInstruction: proposal.text, timestamp });

  return validateProject(next);
}
