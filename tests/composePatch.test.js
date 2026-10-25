import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { patchCompose, unifiedDiff, ComposePatchError } from '../src/data/composePatch.ts';
import { projectFromCompose } from '../src/data/composeImport.ts';
import { detectCodeDrift } from '../src/data/driftCheck.ts';

const sample = readFileSync(new URL('../public/samples/ride-share-compose.yml', import.meta.url), 'utf8');
const FILE = 'ride-share-compose.yml';

/** The imported stack after a change: components and connections added or removed in the diagram. */
function changed({ add = [], remove = [], connect = [], disconnect = [] } = {}, source = sample) {
  const project = projectFromCompose(source, FILE);
  const gone = new Set(remove);
  project.components = project.components.filter((c) => !gone.has(c.id));
  project.relationships = project.relationships.filter((r) => !gone.has(r.from) && !gone.has(r.to)
    && !disconnect.some(([from, to]) => r.from === from && r.to === to));
  for (const [id, name, type, sub = ''] of add) project.components.push({ id, name, type, sub, responsibilities: [], x: 0, y: 0 });
  for (const [from, to] of connect) project.relationships.push({ from, to, label: 'calls' });
  return project;
}

const service = (text, name) => parse(text).services[name];

/** Importing the patched file again, or checking the changed diagram against it, finds nothing to sync. */
function assertNoDrift(project, text) {
  const report = detectCodeDrift(project, text, FILE);
  assert.equal(report.inSync, true, `drift: ${JSON.stringify({
    added: report.addedInCode.map((c) => c.id),
    removed: report.removedFromCode.map((c) => c.id),
    changed: report.changedInCode,
    edgesAdded: report.connectionsAddedInCode.map((r) => `${r.from}>${r.to}`),
    edgesRemoved: report.connectionsRemovedFromCode.map((r) => `${r.from}>${r.to}`),
  })}`);
}

test('an unchanged diagram leaves the file byte for byte as it was', () => {
  for (const name of ['ride-share-compose.yml', 'ride-share-compose.v2.yml']) {
    const text = readFileSync(new URL(`../public/samples/${name}`, import.meta.url), 'utf8');
    const patch = patchCompose(text, projectFromCompose(text, name), name);
    assert.equal(patch.changed, false, name);
    assert.equal(patch.text, text);
    assert.equal(patch.diff, '');
  }
});

test('an added cache becomes a pinned service, wired with depends_on and a connection string', () => {
  const project = changed({ add: [['trips-cache', 'Trips Cache', 'CACHE', 'Cache']], connect: [['trips-api', 'trips-cache']] });
  const patch = patchCompose(sample, project, FILE);
  assert.deepEqual(patch.added, [{ service: 'trips-cache', image: 'redis:7.4-alpine' }]);
  assert.deepEqual(patch.connected, [{ from: 'trips-api', to: 'trips-cache', env: 'REDIS_URL' }]);
  assert.equal(service(patch.text, 'trips-cache').image, 'redis:7.4-alpine');
  const trips = service(patch.text, 'trips-api');
  assert.deepEqual(trips.depends_on['trips-cache'], { condition: 'service_started' }, 'the long depends_on syntax stays long');
  assert.equal(trips.environment.REDIS_URL, 'redis://trips-cache:6379');
  assert.equal(projectFromCompose(patch.text, FILE).components.find((c) => c.id === 'trips-cache').type, 'CACHE');
  assertNoDrift(project, patch.text);
});

test('an added database gets credentials from the environment, never a literal password', () => {
  const project = changed({ add: [['orders-db', 'Orders DB', 'DATABASE', 'Order history']], connect: [['accounts-api', 'orders-db']] });
  const patch = patchCompose(sample, project, FILE);
  const db = service(patch.text, 'orders-db');
  assert.equal(db.image, 'postgres:17-alpine');
  assert.match(db.environment.POSTGRES_PASSWORD, /^\$\{POSTGRES_PASSWORD:\?/);
  // accounts-api already has a DATABASE_URL, so the new one gets its own name.
  assert.equal(service(patch.text, 'accounts-api').environment.ORDERS_DB_URL, 'postgres://app:${POSTGRES_PASSWORD}@orders-db:5432/app');
  assert.equal(service(patch.text, 'accounts-api').environment.DATABASE_URL, 'postgres://app:app@postgres:5432/accounts');
  assertNoDrift(project, patch.text);
});

test('connecting two existing services adds depends_on in the file\'s own style', () => {
  const project = changed({ connect: [['accounts-api', 'kafka']] });
  const patch = patchCompose(sample, project, FILE);
  assert.deepEqual(patch.connected, [{ from: 'accounts-api', to: 'kafka', env: 'KAFKA_BROKERS' }]);
  assert.match(patch.text, /depends_on: \[postgres, redis, kafka\]/, 'a flow list stays a flow list');
  assert.equal(service(patch.text, 'accounts-api').environment.KAFKA_BROKERS, 'kafka:9092');
  assertNoDrift(project, patch.text);
  // Only the two lines that change appear in the diff; the rest of the file is untouched.
  const changedLines = patch.diff.split('\n').filter((l) => /^[-+](?![-+]{2} )/.test(l));
  assert.deepEqual(changedLines, [
    '-    depends_on: [postgres, redis]',
    '+      KAFKA_BROKERS: kafka:9092',
    '+    depends_on: [postgres, redis, kafka]',
  ]);
});

test('a queue drawn as feeding a consumer is written on the consumer, in a list-style environment', () => {
  const project = changed({
    add: [['ride-events', 'Ride Events', 'QUEUE', 'Event queue']],
    connect: [['trips-api', 'ride-events'], ['ride-events', 'pricing-worker']],
  });
  const patch = patchCompose(sample, project, FILE);
  assert.equal(service(patch.text, 'ride-events').image, 'rabbitmq:4.0-alpine');
  const pricing = service(patch.text, 'pricing-worker');
  assert.deepEqual(pricing.depends_on, ['ride-events']);
  assert.ok(pricing.environment.includes('AMQP_URL=amqp://ride-events:5672'));
  assertNoDrift(project, patch.text);
});

test('a removed service leaves the file with every reference to it, and stale settings are flagged', () => {
  const project = changed({ remove: ['redis'] });
  const patch = patchCompose(sample, project, FILE);
  assert.deepEqual(patch.removed, ['redis']);
  const parsed = parse(patch.text).services;
  assert.equal(parsed.redis, undefined);
  assert.deepEqual(parsed['accounts-api'].depends_on, ['postgres']);
  assert.ok(patch.warnings.some((w) => /accounts-api still names the removed redis in SESSION_STORE/.test(w)));
  assert.ok(patch.warnings.some((w) => /pricing-worker still names the removed redis in CACHE_URL/.test(w)));
  assertNoDrift(project, patch.text);
});

test('a removed connection loses its depends_on entry; a connection string left in code is flagged', () => {
  const project = changed({ disconnect: [['gateway', 'accounts-api'], ['trips-api', 'kafka']] });
  const patch = patchCompose(sample, project, FILE);
  assert.deepEqual(patch.disconnected, [{ from: 'gateway', to: 'accounts-api' }, { from: 'trips-api', to: 'kafka' }]);
  assert.match(patch.text, /depends_on: \[trips-api\]/);
  assert.equal(service(patch.text, 'trips-api').depends_on.kafka, undefined);
  assert.ok(patch.warnings.some((w) => /trips-api still names kafka in KAFKA_BROKERS/.test(w)));
  const report = detectCodeDrift(project, patch.text, FILE);
  assert.deepEqual(report.connectionsAddedInCode.map((r) => `${r.from}>${r.to}`), ['trips-api>kafka'], 'only the flagged connection remains in code');
});

test('services only a person can build are listed, not invented', () => {
  const project = changed({ add: [['payment-service', 'Payment Service', 'SERVICE', 'Payments']], connect: [['gateway', 'payment-service']] });
  const patch = patchCompose(sample, project, FILE);
  assert.equal(patch.changed, false);
  assert.deepEqual(patch.notWritten, [{ id: 'payment-service', name: 'Payment Service', type: 'SERVICE' }]);
  assertNoDrift(project, patch.text);
});

test('comments, key order, blank lines, and quoting survive the patch', () => {
  const source = [
    '# Local stack. Keep this header.',
    'name: shop',
    '',
    'services:',
    '  # The storefront talks to the API only.',
    '  web:',
    '    image: "nginx:1.27"   # pinned on purpose',
    '    ports: ["80:80"]',
    '    depends_on: [api]',
    '',
    '  api:',
    '    build: ./api',
    '    environment:',
    '      # Read by the ORM',
    '      DATABASE_URL: postgres://app:app@db:5432/shop',
    '    depends_on:',
    '      - db',
    '      - legacy',
    '',
    '  db:',
    '    image: postgres:16',
    '',
    '  legacy:',
    '    image: legacy/soap:2  # to be retired',
    '',
  ].join('\n');
  const project = changed({ add: [['session-cache', 'Session Cache', 'CACHE', 'Sessions']], connect: [['api', 'session-cache']], remove: ['legacy'] }, source);
  const patch = patchCompose(source, project, 'docker-compose.yml');
  for (const kept of ['# Local stack. Keep this header.', '# The storefront talks to the API only.', '# pinned on purpose', '# Read by the ORM', 'image: "nginx:1.27"', 'ports: ["80:80"]', 'depends_on: [api]']) {
    assert.ok(patch.text.includes(kept), `kept: ${kept}`);
  }
  assert.ok(!patch.text.includes('legacy'), 'the removed service and its comment are gone');
  const order = ['web:', 'api:', 'db:', 'session-cache:'].map((key) => patch.text.indexOf(`  ${key}`));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'existing services keep their order; new ones go last');
  assert.match(patch.text, /\n\n {2}# Session Cache: added in VoiceArchitect \(cache\)\n {2}session-cache:\n {4}image: redis:7\.4-alpine/);
  assert.match(patch.text, /depends_on:\n {6}- db\n {6}- session-cache\n/, 'block lists stay block lists, indented as before');
  assertNoDrift(project, patch.text);
  // The diff touches only what changed.
  assert.match(patch.diff, /^--- a\/docker-compose\.yml\n\+\+\+ b\/docker-compose\.yml\n@@ /);
  assert.ok(patch.diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).every((l) => /legacy|# to be retired|^-$/.test(l)), patch.diff);
});

test('Windows line endings are kept', () => {
  // The sample may already have CRLF endings (a Windows checkout), so normalize before converting.
  const crlf = sample.replace(/\r?\n/g, '\r\n');
  const patch = patchCompose(crlf, changed({ connect: [['accounts-api', 'kafka']] }, crlf), FILE);
  assert.ok(patch.changed);
  assert.equal(patch.text.split('\n').length, patch.text.split('\r\n').length, 'every line ends with CRLF');
});

test('a file that is not valid compose YAML is refused', () => {
  assert.throws(() => patchCompose('services: [', changed()), ComposePatchError);
  assert.throws(() => patchCompose('name: x\n', changed()), /no "services" section/);
});

test('the unified diff matches diff -u', () => {
  const file = (letters) => `${letters.split('').join('\n')}\n`;
  // Changes more than six unchanged lines apart get their own hunks.
  assert.equal(unifiedDiff(file('abcdefghijklmn'), file('abcDefghijklmno'), 'a/x', 'b/x'), [
    '--- a/x', '+++ b/x',
    '@@ -1,7 +1,7 @@', ' a', ' b', ' c', '-d', '+D', ' e', ' f', ' g',
    '@@ -12,3 +12,4 @@', ' l', ' m', ' n', '+o', '',
  ].join('\n'));
  // Six or fewer apart, they share one.
  assert.equal(unifiedDiff(file('abcdefghij'), file('abcDefghijk'), 'a/x', 'b/x'), [
    '--- a/x', '+++ b/x',
    '@@ -1,10 +1,11 @@', ' a', ' b', ' c', '-d', '+D', ' e', ' f', ' g', ' h', ' i', ' j', '+k', '',
  ].join('\n'));
  assert.equal(unifiedDiff(file('abc'), file('abc')), '');
});
