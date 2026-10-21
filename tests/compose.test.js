import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectFromCompose, ComposeImportError } from '../src/data/composeImport.ts';

const sample = readFileSync(new URL('../public/samples/ride-share-compose.yml', import.meta.url), 'utf8');

test('compose import infers component types from image and name', () => {
  const project = projectFromCompose(sample, 'ride-share-compose.yml');
  const type = (id) => project.components.find((c) => c.id === id)?.type;
  assert.equal(project.name, 'ride-share-platform');
  assert.equal(type('rider-app'), 'CLIENT');
  assert.equal(type('gateway'), 'GATEWAY');
  assert.equal(type('trips-api'), 'SERVICE');
  assert.equal(type('postgres'), 'DATABASE');
  assert.equal(type('redis'), 'CACHE');
  assert.equal(type('kafka'), 'QUEUE');
  assert.match(project.components.find((c) => c.id === 'postgres').sub, /postgres:16/);
});

test('compose import draws edges only from depends_on and environment evidence', () => {
  const project = projectFromCompose(sample);
  const edges = new Set(project.relationships.map((r) => `${r.from}>${r.to}`));
  for (const edge of ['rider-app>gateway', 'gateway>trips-api', 'gateway>accounts-api', 'accounts-api>postgres', 'accounts-api>redis', 'trips-api>postgres', 'trips-api>kafka', 'pricing-worker>kafka', 'pricing-worker>redis']) {
    assert.ok(edges.has(edge), `missing ${edge}`);
  }
  assert.equal(edges.size, 9, `unexpected edges: ${[...edges].join(', ')}`);
  assert.equal(project.relationships.find((r) => r.to === 'postgres').label, 'reads/writes');
  assert.ok(project.baseline);
});

test('compose import rejects files without services', () => {
  assert.throws(() => projectFromCompose('version: "3"\n'), ComposeImportError);
  assert.throws(() => projectFromCompose('services: [\n'), /not valid YAML/);
});

test('imported stacks get example instructions that name their own components', async () => {
  const { suggestInstructions } = await import('../src/data/suggestions.ts');
  const suggestions = suggestInstructions(projectFromCompose(sample));
  const commands = suggestions.map((s) => s.command).join('\n');
  assert.equal(suggestions.length, 4);
  assert.match(commands, /consumes events from kafka/);
  assert.match(commands, /read through redis before hitting postgres/);
  assert.match(commands, /rate limiting on gateway/);
  assert.match(commands, /POST \/auth\/login endpoint on accounts-api/);
  assert.deepEqual(suggestInstructions(null), []);
});
