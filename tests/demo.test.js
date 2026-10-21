import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommerceProject, DEMO_COMMAND, proposeChange, applyChange } from '../src/data/commerce.js';
import { checkOpenApiStructure, makeOpenApi, toYaml } from '../src/data/openapi.js';
import { deriveRiskFindings, deriveTasks, getProjectSyncStatus } from '../src/data/analysis.js';
import { deriveChangeDiff, deriveManualDecisions } from '../src/data/changeDiff.js';
import { getDiagramNeighborhood } from '../src/data/diagram.js';
import { createVerifiedExportZip, makeExportFiles } from '../src/data/export.js';
import { strFromU8, unzipSync } from 'fflate';

test('Commerce Platform fixture has the expected components and valid relationship references', () => {
  const project = makeCommerceProject();
  const names = project.components.map(({ name }) => name);
  for (const expected of ['Web & mobile', 'API Gateway', 'Auth Service', 'Catalog Service', 'Order Service', 'Redis', 'PostgreSQL', 'Kafka', 'Payment Provider']) assert.ok(names.includes(expected));
  const ids = new Set(project.components.map(({ id }) => id));
  for (const edge of project.relationships) assert.ok(ids.has(edge.from) && ids.has(edge.to), `relationship ${edge.from} → ${edge.to} must reference modeled components`);
});

test('sample change stays reviewable and preserves unresolved decisions', () => {
  const proposal = proposeChange(DEMO_COMMAND);
  assert.equal(proposal.items.length, 4);
  assert.ok(proposal.assumptions.some((item) => item.includes('threshold')));
  assert.ok(proposal.assumptions.some((item) => item.includes('fallback')));
  const unrelated = proposeChange('Add a dashboard for service health.');
  assert.equal(unrelated.items[0].key, 'unresolved');
  assert.ok(!unrelated.assumptions.some((item) => item.includes('rate-limit threshold')));
});

test('project status distinguishes the loaded baseline and an applied change with unresolved decisions', () => {
  const baseline = makeCommerceProject();
  assert.equal(getProjectSyncStatus(baseline), 'Baseline loaded · unresolved decisions remain');
  const changed = applyChange(baseline, proposeChange(DEMO_COMMAND));
  assert.equal(getProjectSyncStatus(changed), 'Change applied · unresolved decisions remain');
  assert.equal(getProjectSyncStatus(null), 'Ready');
});

test('before-and-after diff covers all artifact types with instruction provenance', () => {
  const project = applyChange(makeCommerceProject(), proposeChange(DEMO_COMMAND));
  const groups = deriveChangeDiff(project);
  assert.deepEqual(groups.map(({ id }) => id), ['components', 'relationships', 'requirements', 'apiOperations', 'risks', 'tasks']);
  for (const groupId of ['components', 'relationships', 'requirements', 'apiOperations', 'risks', 'tasks']) {
    const entries = groups.find(({ id }) => id === groupId).entries;
    assert.ok(entries.length > 0, `${groupId} should show the applied demo impact`);
    assert.ok(entries.every((entry) => entry.changeId === 'CHG-0002' && entry.instruction === DEMO_COMMAND), `${groupId} entries should retain their source`);
  }
  assert.equal(groups.find(({ id }) => id === 'apiOperations').entries[0].status, 'modified');
  assert.ok(deriveManualDecisions(project).some(({ id }) => id === 'rate-limit-threshold'));
  assert.ok(deriveManualDecisions(project).some(({ id }) => id === 'redis-fallback'));
  assert.equal(project.changes[0].originalInstruction, DEMO_COMMAND);
  assert.equal(project.changes[0].id, 'CHG-0002');
});

test('preview diff compares a new proposal with the latest model instead of the original baseline', () => {
  const baseline = makeCommerceProject();
  const current = applyChange(baseline, proposeChange('Move session storage to Redis'));
  const proposal = proposeChange('Add rate limiting to the authentication endpoint');
  const proposed = applyChange(current, proposal);
  const groups = deriveChangeDiff(proposed, current);

  assert.equal(groups.find(({ id }) => id === 'components').entries.length, 0);
  assert.equal(groups.find(({ id }) => id === 'relationships').entries.length, 0);
  for (const id of ['requirements', 'apiOperations', 'risks', 'tasks']) {
    assert.ok(groups.find((group) => group.id === id).entries.length > 0, `${id} should show only this proposal's changes`);
  }
});

test('diagram selection finds direct relationships and transitive downstream impact', () => {
  const project = makeCommerceProject();
  const neighborhood = getDiagramNeighborhood(project.components, project.relationships, 'web');
  assert.deepEqual([...neighborhood.directIds], ['gateway']);
  assert.ok(!neighborhood.downstreamIds.has('gateway'), 'the immediate dependency is shown separately from downstream impact');
  assert.ok(neighborhood.directRelationships.has('web->gateway:HTTPS'));
  for (const id of ['auth', 'catalog', 'orders', 'redis', 'postgres', 'kafka', 'payment']) {
    assert.ok(neighborhood.downstreamIds.has(id), `${id} is downstream from web`);
  }
  assert.deepEqual([...getDiagramNeighborhood(project.components, project.relationships, 'missing').downstreamIds], []);
});

test('applying the same request updates the diagram and records requirements only once', () => {
  const proposal = proposeChange(DEMO_COMMAND);
  const once = applyChange(makeCommerceProject(), proposal);
  const twice = applyChange(once, proposal);
  assert.equal(once.version, 2);
  assert.equal(twice.version, 3);
  assert.equal(twice.requirements.length, 3);
  assert.equal(twice.components.find(({ id }) => id === 'redis').sub, 'Primary session store');
  assert.equal(twice.relationships.find(({ from, to }) => from === 'auth' && to === 'redis').label, 'sessions · primary store');
});

test('OpenAPI contract has a basic 3.0 structure and gates rate limit details on the requirement', () => {
  const base = makeOpenApi(makeCommerceProject());
  const baseOperation = base.paths['/auth/login'].post;
  assert.equal(base.openapi, '3.0.3');
  assert.ok(!baseOperation.responses['429']);
  assert.deepEqual(checkOpenApiStructure(base), []);
  assert.ok(baseOperation.requestBody.content['application/json'].schema.additionalProperties);

  const project = applyChange(makeCommerceProject(), proposeChange(DEMO_COMMAND));
  const updated = makeOpenApi(project);
  const updatedOperation = updated.paths['/auth/login'].post;
  assert.deepEqual(checkOpenApiStructure(updated), []);
  assert.ok(updatedOperation.responses['429']);
  assert.ok(updatedOperation.responses['429'].headers['X-RateLimit-Limit'].description.includes('unresolved'));
  assert.match(toYaml(updated), /"429"/);
});

test('risk findings and proposed tasks follow the applied requirements', () => {
  const project = applyChange(makeCommerceProject(), proposeChange(DEMO_COMMAND));
  const findings = deriveRiskFindings(project);
  assert.ok(findings.some(({ kind }) => kind === 'Potential risk'));
  assert.ok(findings.some(({ title }) => title.includes('Redis outage')));
  assert.ok(findings.some(({ kind }) => kind === 'Requirement coverage'));
  assert.ok(findings.some(({ kind }) => kind === 'Consistency check'));
  const tasks = deriveTasks(project);
  assert.deepEqual(tasks.map(({ id }) => id), ['TASK-DATA-OWNER', 'TASK-AUTH-RATE', 'TASK-REDIS-FAILOVER']);
  assert.ok(tasks.every((task) => task.requirement.status === 'confirmed' && task.acceptance.length > 0 && task.unresolved));
});

test('Export All ZIP contains current artifacts and verifies its diagram entries', () => {
  const project = applyChange(makeCommerceProject(), proposeChange(DEMO_COMMAND));
  const timestamp = '2026-10-19T00:00:00.000Z';
  const expected = makeExportFiles(project, timestamp);
  const diagramPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv9sAAAAASUVORK5CYII=', 'base64'));
  const { data, files } = createVerifiedExportZip(project, timestamp, diagramPng);
  const contents = unzipSync(data);
  assert.deepEqual(files.sort(), [...Object.keys(expected), 'architecture.png'].sort());
  assert.ok(files.includes('risk-audit.json'));
  assert.ok(files.includes('risk-audit.md'));
  assert.ok(files.includes('architecture.svg'));
  assert.ok(files.includes('architecture.mmd'));
  assert.equal(Object.keys(contents).length, 11);
  for (const [name, text] of Object.entries(expected)) assert.equal(strFromU8(contents[name]), text, `${name} should match current export content`);
  assert.deepEqual(contents['architecture.png'], diagramPng);
  assert.match(strFromU8(contents['architecture.svg']), /<svg[^>]+viewBox=/);
  assert.match(strFromU8(contents['architecture.svg']), /Auth Service/);
  assert.match(strFromU8(contents['architecture.mmd']), /flowchart LR/);
  assert.throws(() => createVerifiedExportZip(project, timestamp), /rendered architecture PNG is required/);
  const architecture = JSON.parse(strFromU8(contents['architecture.json']));
  assert.equal(architecture.version, 2);
  const changeLog = JSON.parse(strFromU8(contents['change-log.json']));
  assert.ok(Number.isFinite(changeLog.entries[0].timestamp));
  assert.ok(architecture.requirements.some((item) => item.id === 'REQ-AUTH-RATE'));
  assert.match(strFromU8(contents['openapi.yaml']), /"429"/);
  assert.match(strFromU8(contents['README.md']), /Model version: 2/);
  assert.match(strFromU8(contents['README.md']), /fallback/);
  assert.match(strFromU8(contents['README.md']), /Validation status: Basic OpenAPI structural checks passed/);
});

test('What changed lists only components that actually changed, regardless of key order', () => {
  const project = makeCommerceProject();
  const next = applyChange(project, proposeChange('Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down.'));
  const components = deriveChangeDiff(next).find((group) => group.id === 'components');
  assert.deepEqual(components.entries.map((entry) => entry.id), ['redis']);
});

test('change entries name a component once when its name is its id, and show the id when they differ', () => {
  const project = makeCommerceProject();
  const next = applyChange(project, proposeChange('Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down.'));
  const redis = deriveChangeDiff(next).find((group) => group.id === 'components').entries[0];
  const component = next.components.find((c) => c.id === 'redis');
  assert.equal(redis.label, component.name === 'redis' ? 'redis' : `${component.name} (redis)`);
  assert.doesNotMatch(redis.label, /^(\S+) \(\1\)$/);
});

test('component labels show the id only when it differs from the name', async () => {
  const { componentLabel } = await import('../src/data/modelFacts.js');
  assert.equal(componentLabel({ id: 'payment-service', name: 'payment-service' }), 'payment-service');
  assert.equal(componentLabel({ id: 'postgres', name: 'PostgreSQL' }), 'PostgreSQL (postgres)');
});
