export const makeCommerceProject = () => ({
  name: 'Commerce Platform',
  version: 1,
  changed: false,
  components: [
    { id: 'web', name: 'Web & mobile', type: 'CLIENT', x: 42, y: 150, sub: 'Storefront clients' },
    { id: 'gateway', name: 'API Gateway', type: 'GATEWAY', x: 226, y: 150, sub: 'Routing · TLS · auth' },
    { id: 'auth', name: 'Auth Service', type: 'SERVICE', x: 424, y: 52, sub: 'Login · token issuance' },
    { id: 'catalog', name: 'Catalog Service', type: 'SERVICE', x: 424, y: 150, sub: 'Products · inventory' },
    { id: 'orders', name: 'Order Service', type: 'SERVICE', x: 424, y: 248, sub: 'Checkout · fulfillment' },
    { id: 'redis', name: 'Redis', type: 'CACHE', x: 650, y: 52, sub: 'Session cache' },
    { id: 'postgres', name: 'PostgreSQL', type: 'DATABASE', x: 650, y: 176, sub: 'Persistent data store' },
    { id: 'kafka', name: 'Kafka', type: 'QUEUE', x: 650, y: 280, sub: 'Order events' },
    { id: 'payment', name: 'Payment Provider', type: 'EXTERNAL', x: 836, y: 280, sub: 'External integration' },
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
});

export const DEMO_COMMAND = 'Move session storage to Redis, keep PostgreSQL as the source of truth, add rate limiting to the authentication endpoint, and make login resilient if Redis becomes unavailable.';

export function proposeChange(text) {
  const lower = text.toLowerCase();
  const items = [];
  if (lower.includes('redis') && lower.includes('session')) items.push({ key: 'redis-session', title: 'Set Redis as the explicit session store', detail: 'Update the Auth Service → Redis relationship to identify Redis as session storage.' });
  if (lower.includes('postgres') && (lower.includes('source of truth') || lower.includes('persistent'))) items.push({ key: 'postgres-owner', title: 'Preserve PostgreSQL as the source of truth', detail: 'Record the stated data-ownership constraint; do not infer Redis persistence behavior.' });
  if (lower.includes('rate limit') || lower.includes('rate-limit')) items.push({ key: 'rate-limit', title: 'Add an authentication rate-limiting requirement', detail: 'Attach a rate-limiting requirement to login. No threshold was specified.' });
  if (lower.includes('resilien') || lower.includes('unavailable') || lower.includes('failure')) items.push({ key: 'redis-fallback', title: 'Add a Redis-unavailable resilience requirement', detail: 'Record login resilience as required; fallback behavior remains unresolved.' });
  if (!items.length) items.push({ key: 'unresolved', title: 'Record this as an unresolved architecture request', detail: 'No demo rule matched. No component or relationship will change automatically.' });
  return { text, items, assumptions: ['No rate-limit threshold was provided.', 'Redis outage fallback and session persistence behavior are unspecified.', 'These are requirements to review, not claims that the behavior is implemented.'] };
}

export function applyChange(project, proposal) {
  const next = structuredClone(project);
  const lower = proposal.text.toLowerCase();
  const changes = [];
  const addRequirement = (id, text) => {
    if (!next.requirements.some((item) => item.id === id)) next.requirements.push({ id, text, status: 'confirmed' });
  };
  if (lower.includes('redis') && lower.includes('session')) {
    const edge = next.relationships.find((item) => item.from === 'auth' && item.to === 'redis');
    if (edge) edge.label = 'sessions · primary store';
    changes.push('Redis relationship labeled as primary session storage');
  }
  if (lower.includes('postgres') && (lower.includes('source of truth') || lower.includes('persistent'))) {
    addRequirement('REQ-DATA-OWNER', 'PostgreSQL remains the source of truth');
    changes.push('PostgreSQL source-of-truth constraint recorded');
  }
  if (lower.includes('rate limit') || lower.includes('rate-limit')) {
    addRequirement('REQ-AUTH-RATE', 'Authentication endpoint requires rate limiting; threshold unresolved');
    changes.push('Authentication rate-limiting requirement recorded');
  }
  if (lower.includes('resilien') || lower.includes('unavailable') || lower.includes('failure')) {
    addRequirement('REQ-REDIS-FAIL', 'Login must remain resilient when Redis is unavailable; fallback unresolved');
    changes.push('Redis outage resilience requirement recorded');
  }
  next.version += 1;
  next.changed = true;
  next.activity.unshift({ version: next.version, summary: changes.join(' · ') || 'Architecture request recorded for follow-up' });
  return next;
}
