import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectFromCompose } from '../src/data/composeImport.ts';
import { detectCodeDrift, driftProposal } from '../src/data/driftCheck.ts';
import { applyChange, makeCommerceProject } from '../src/data/commerce.ts';
import { applyOperations } from '../src/data/applyOperations.ts';
import { validateProposal } from '../src/types/schema.ts';

const v1 = readFileSync(new URL('../public/samples/ride-share-compose.yml', import.meta.url), 'utf8');
const v2 = readFileSync(new URL('../public/samples/ride-share-compose.v2.yml', import.meta.url), 'utf8');
const ids = (list) => list.map((x) => x.id).sort();
const keys = (list) => list.map((r) => `${r.from}>${r.to}`).sort();

test('a diagram imported from the same file is in sync', () => {
  const project = projectFromCompose(v1, 'ride-share-compose.yml');
  const report = detectCodeDrift(project, v1, 'ride-share-compose.yml');
  assert.equal(report.inSync, true);
  assert.equal(driftProposal(report, project), null);
});

test('drift sorts additions, removals, image changes, and connections', () => {
  const project = projectFromCompose(v1, 'ride-share-compose.yml');
  const report = detectCodeDrift(project, v2, 'ride-share-compose.v2.yml');

  assert.equal(report.inSync, false);
  assert.deepEqual(ids(report.addedInCode), ['notification-service', 'search']);
  assert.deepEqual(ids(report.removedFromCode), ['pricing-worker']);
  assert.deepEqual(report.changedInCode, [{ id: 'postgres', name: 'postgres', field: 'image', before: 'postgres:16', after: 'postgres:17' }]);
  assert.deepEqual(keys(report.connectionsAddedInCode), ['notification-service>kafka', 'trips-api>search']);
  // pricing-worker's connections go with it, so they are not listed separately.
  assert.deepEqual(report.connectionsRemovedFromCode, []);
  assert.deepEqual(report.plannedNotInCode, []);
});

test('applying the drift proposal makes the diagram match the code', () => {
  const project = projectFromCompose(v1, 'ride-share-compose.yml');
  const proposal = driftProposal(detectCodeDrift(project, v2, 'ride-share-compose.v2.yml'), project);
  const synced = applyChange(project, proposal);

  assert.equal(detectCodeDrift(synced, v2, 'ride-share-compose.v2.yml').inSync, true);
  assert.equal(synced.components.find((c) => c.id === 'postgres').sub, 'postgres:17');
  assert.equal(synced.components.find((c) => c.id === 'search').origin, 'code');
  assert.equal(synced.changes[0].originalInstruction, 'Sync the diagram with ride-share-compose.v2.yml');
});

test('planned work that is not in code yet is reported and never removed', () => {
  const imported = projectFromCompose(v1, 'ride-share-compose.yml');
  const planned = applyOperations(imported, validateProposal({
    text: 'add an audit service that reads trips',
    items: [{ key: 'ai-0', title: 'Add audit', detail: 'd' }],
    source: 'ai',
    operations: [
      { op: 'add_component', id: 'audit-service', name: 'Audit Service', type: 'SERVICE', sub: 'Compliance log', responsibilities: [] },
      { op: 'add_relationship', from: 'audit-service', to: 'trips-api', label: 'reads', protocol: null },
    ],
  })).project;

  const report = detectCodeDrift(planned, v1, 'ride-share-compose.yml');
  assert.equal(report.inSync, true, 'planned work alone is not drift');
  assert.deepEqual(ids(report.plannedNotInCode), ['audit-service']);
  assert.deepEqual(keys(report.plannedConnections), ['audit-service>trips-api']);

  const changed = detectCodeDrift(planned, v2, 'ride-share-compose.v2.yml');
  const proposal = driftProposal(changed, planned);
  assert.match(proposal.assumptions.join(' '), /Planned in the diagram but not in ride-share-compose\.v2\.yml yet, kept as is: Audit Service/);
  const synced = applyChange(planned, proposal);
  assert.ok(synced.components.some((c) => c.id === 'audit-service'));
});

test('a component planned by voice that later lands in code is recognized, not duplicated', () => {
  const imported = projectFromCompose(v1, 'ride-share-compose.yml');
  const withPlan = applyOperations(imported, validateProposal({
    text: 'add a notification service that consumes kafka',
    items: [{ key: 'ai-0', title: 'Add notifications', detail: 'd' }],
    source: 'ai',
    operations: [{ op: 'add_component', id: 'notification-service', name: 'Notification Service', type: 'SERVICE', sub: 'Push updates', responsibilities: [] }],
  })).project;

  const report = detectCodeDrift(withPlan, v2, 'ride-share-compose.v2.yml');
  assert.deepEqual(ids(report.addedInCode), ['search']);
  assert.ok(!report.changedInCode.some((c) => c.id === 'notification-service'), 'a hand-written description is not treated as an image change');
});

test('the commerce sample, which was never imported, treats everything as planned', () => {
  const project = makeCommerceProject();
  const report = detectCodeDrift(project, v1, 'ride-share-compose.yml');
  assert.equal(report.removedFromCode.length, 0);
  const codeIds = new Set(projectFromCompose(v1).components.map((c) => c.id));
  const shared = project.components.filter((c) => codeIds.has(c.id)).length; // gateway, redis, postgres, kafka
  assert.equal(report.plannedNotInCode.length, project.components.length - shared);
  assert.ok(report.addedInCode.length > 0);
});

test('risk findings and open decisions come from the imported stack, not the sample', async () => {
  const { deriveRiskFindings, countOpenDecisions } = await import('../src/data/analysis.ts');
  const { deriveManualDecisions } = await import('../src/data/changeDiff.ts');
  const project = projectFromCompose(v1, 'ride-share-compose.yml');

  const titles = deriveRiskFindings(project).map((f) => f.title);
  assert.ok(titles.includes('postgres is the only modeled database'));
  assert.ok(titles.includes('redis availability behavior is unspecified'));
  assert.ok(titles.includes('Authentication rate limiting is not specified'));
  const rate = deriveRiskFindings(project).find((f) => f.title === 'Authentication rate limiting is not specified');
  // The id is shown in brackets only when it differs from the name.
  assert.match(rate.evidence[0], /^accounts-api handles sign-in/);
  assert.ok(!JSON.stringify(deriveRiskFindings(project)).includes('Auth Service'), 'no sample component names leak in');

  assert.equal(countOpenDecisions(project), 2);
  assert.deepEqual(deriveManualDecisions(project).map((d) => d.id), ['rate-limit-threshold', 'redis-fallback', 'auth-payload']);
  assert.equal(deriveManualDecisions(project)[0].instruction, 'ride-share-platform baseline');
});

test('a model without caches, gateways, or auth gets no invented decisions', async () => {
  const { deriveRiskFindings, countOpenDecisions } = await import('../src/data/analysis.ts');
  const { deriveManualDecisions } = await import('../src/data/changeDiff.ts');
  const tiny = projectFromCompose('services:\n  worker:\n    image: busybox\n  db:\n    image: postgres:17\n    \n', 'tiny.yml');
  const titles = deriveRiskFindings(tiny).map((f) => f.title);
  assert.deepEqual(titles, ['db is the only modeled database']);
  assert.equal(countOpenDecisions(tiny), 0);
  assert.deepEqual(deriveManualDecisions(tiny), []);
});
