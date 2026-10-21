import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDictation, dictionaryWords } from '../src/data/dictation.ts';
import { parseFollowUp, combineInstruction } from '../src/data/reviewCommands.ts';
import { interpretPattern, resolveComponent } from '../src/data/patternRules.ts';
import { applyChange, makeCommerceProject } from '../src/data/commerce.js';
import { validateProject } from '../src/types/schema.ts';

/** A small shop: gateway, payment and order services, Redis, PostgreSQL, Kafka. */
function shop() {
  return validateProject({
    name: 'Shop', version: 1, changed: false, changes: [], activity: [], requirements: [],
    components: [
      { id: 'gateway', name: 'API Gateway', type: 'GATEWAY', sub: 'Routing', responsibilities: ['Routes requests.'] },
      { id: 'payment-service', name: 'Payment Service', type: 'SERVICE', sub: 'Payments', responsibilities: ['Takes payments.'] },
      { id: 'order-service', name: 'Order Service', type: 'SERVICE', sub: 'Orders', responsibilities: ['Places orders.'] },
      { id: 'redis', name: 'Redis', type: 'CACHE', sub: 'Session cache', responsibilities: ['Caches sessions.'] },
      { id: 'postgres', name: 'PostgreSQL', type: 'DATABASE', sub: 'Primary store', responsibilities: ['Stores data.'] },
      { id: 'kafka', name: 'Kafka', type: 'QUEUE', sub: 'Events', responsibilities: ['Carries events.'] },
    ],
    relationships: [
      { from: 'gateway', to: 'payment-service', label: 'pay' },
      { from: 'gateway', to: 'order-service', label: 'orders' },
      { from: 'order-service', to: 'redis', label: 'cart cache' },
      { from: 'payment-service', to: 'postgres', label: 'payments' },
    ],
    apiOperations: [],
  });
}

const ops = (proposal) => proposal.operations.map((o) => `${o.op}:${o.id || `${o.from}->${o.to}`}`);

// ---------- dictation cleanup ----------

test('cleanDictation fixes spoken product names and casing, and keeps the words', () => {
  assert.equal(cleanDictation('add a redis cache in front of post gres'), 'add a Redis cache in front of PostgreSQL');
  assert.equal(cleanDictation('connect the order service to kafka and rabbit mq'), 'connect the order service to Kafka and RabbitMQ');
  assert.equal(cleanDictation('put an api gateway in the docker compose file'), 'put an API Gateway in the docker-compose file');
  assert.equal(cleanDictation('use red is cache for sessions'), 'use Redis cache for sessions');
});

test('cleanDictation drops hesitations and dangling punctuation but not real words', () => {
  assert.equal(cleanDictation('So, um, add a cache ,, for the catalog service,'), 'add a cache, for the catalog service');
  assert.equal(cleanDictation('uh connect billing to kafka.'), 'connect billing to Kafka.');
  assert.equal(cleanDictation('I just like the current design'), 'I just like the current design');
  assert.equal(cleanDictation('payment service ke aage redis cache laga do'), 'payment service ke aage Redis cache laga do');
});

test('dictionaryWords lists component names and named technologies once', () => {
  const words = dictionaryWords(makeCommerceProject());
  assert.ok(words.includes('Auth Service'));
  assert.ok(words.includes('PostgreSQL'));
  assert.equal(new Set(words).size, words.length);
});

// ---------- follow-up commands ----------

test('parseFollowUp recognizes apply, cancel, and undo in English and Hinglish', () => {
  for (const text of ['apply', 'Apply it.', 'looks good, apply', 'haan apply karo', 'ok go ahead', 'lagu karo', 'yes confirm']) {
    assert.equal(parseFollowUp(text).type, 'apply', text);
  }
  for (const text of ['cancel', 'never mind', 'rehne do', 'chhodo', 'discard this']) {
    assert.equal(parseFollowUp(text).type, 'cancel', text);
  }
  for (const text of ['undo', 'undo that', 'go back', 'wapas karo', 'revert the last change']) {
    assert.equal(parseFollowUp(text).type, 'undo', text);
  }
});

test('anything else revises the pending change, and empty input does nothing', () => {
  assert.deepEqual(parseFollowUp('make it Postgres instead'), { type: 'revise', text: 'make it Postgres instead' });
  assert.equal(parseFollowUp('apply rate limiting to login').type, 'revise');
  assert.equal(parseFollowUp('   ').type, 'empty');
  assert.equal(combineInstruction('Add a cache to orders.', 'also add a rate limiter'), 'Add a cache to orders. Also add a rate limiter');
});

// ---------- offline patterns, Hinglish and English ----------

test('resolveComponent matches spoken names to the model', () => {
  const project = shop();
  assert.equal(resolveComponent(project, 'payment service').id, 'payment-service');
  assert.equal(resolveComponent(project, 'the order service').id, 'order-service');
  assert.equal(resolveComponent(project, 'Kafka').id, 'kafka');
  assert.equal(resolveComponent(project, 'billing'), null);
});

test('Hinglish: "payment service ke aage Redis cache laga do" puts the existing Redis in front of Payment Service', () => {
  const proposal = interpretPattern('payment service ke aage redis cache laga do', shop());
  assert.deepEqual(ops(proposal), ['add_relationship:payment-service->redis']);
  const next = applyChange(shop(), proposal);
  assert.ok(next.relationships.some((r) => r.from === 'payment-service' && r.to === 'redis'));
});

test('Hinglish: "order service ko Kafka se connect karo" connects Order Service to Kafka', () => {
  const proposal = interpretPattern('order service ko Kafka se connect karo', shop());
  assert.deepEqual(ops(proposal), ['add_relationship:order-service->kafka']);
  assert.equal(proposal.operations[0].label, 'publish');
});

test('Hinglish: "cache hata do aur database seedha use karo" removes the cache and reads the database directly', () => {
  const proposal = interpretPattern('cache hata do aur database seedha use karo', shop());
  assert.deepEqual(ops(proposal), ['remove_component:redis', 'add_relationship:order-service->postgres']);
  const next = applyChange(shop(), proposal);
  assert.ok(!next.components.some((c) => c.id === 'redis'));
  assert.ok(!next.relationships.some((r) => r.to === 'redis' || r.from === 'redis'));
  assert.ok(next.relationships.some((r) => r.from === 'order-service' && r.to === 'postgres'));
});

test('Hinglish: "auth service ko alag container mein daalo" adds Auth Service behind the gateway', () => {
  const proposal = interpretPattern('auth service ko alag container mein daalo', shop());
  assert.deepEqual(ops(proposal), ['add_component:auth-service', 'add_relationship:gateway->auth-service']);
  const next = applyChange(shop(), proposal);
  assert.equal(next.components.find((c) => c.id === 'auth-service').type, 'SERVICE');
});

test('English equivalents produce the same operations', () => {
  const project = shop();
  assert.deepEqual(ops(interpretPattern('Add a Redis cache in front of the payment service', project)), ['add_relationship:payment-service->redis']);
  assert.deepEqual(ops(interpretPattern('connect the order service to Kafka', project)), ['add_relationship:order-service->kafka']);
  assert.deepEqual(ops(interpretPattern('remove the cache and use the database directly', project)), ['remove_component:redis', 'add_relationship:order-service->postgres']);
  assert.deepEqual(ops(interpretPattern('move auth into its own container', project)), ['add_component:auth-service', 'add_relationship:gateway->auth-service']);
});

test('a new cache technology becomes a new component, and unknown names fall through', () => {
  const proposal = interpretPattern('order service ke aage memcached cache laga do', shop());
  assert.deepEqual(ops(proposal), ['add_component:memcached', 'add_relationship:order-service->memcached']);
  assert.equal(interpretPattern('billing ko kafka se connect karo', shop()), null);
  assert.equal(interpretPattern('make the diagram prettier', shop()), null);
});

test('"split payments into a separate service" is left to the payment-split rule, not the own-container pattern', () => {
  assert.equal(interpretPattern('Split payments into a separate service', makeCommerceProject()), null);
});
