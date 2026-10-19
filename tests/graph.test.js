import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommerceProject } from '../src/data/commerce.js';
import {
  computeGraphLayout,
  getUpstreamDependencies,
  getDownstreamDependencies,
  getBlastRadius,
  detectCycles,
  getDeploymentPlan,
  getDiagramNeighborhood,
} from '../src/data/diagram.js';

test('Graph Layout: computeGraphLayout assigns non-colliding dynamic coordinates', () => {
  const project = makeCommerceProject();
  const layout = computeGraphLayout(project.components, project.relationships, {
    direction: 'LR',
    nodeWidth: 144,
    nodeHeight: 58,
    rankSeparation: 60,
    nodeSeparation: 40,
  });

  assert.equal(layout.components.length, project.components.length);
  assert.ok(layout.width >= 1000, 'Layout width should meet minimum canvas bounds');
  assert.ok(layout.height >= 390, 'Layout height should meet minimum canvas bounds');

  // Verify all coordinates are positive and within bounds
  for (const comp of layout.components) {
    assert.ok(comp.x >= 0, `Component ${comp.id} x should be non-negative`);
    assert.ok(comp.y >= 0, `Component ${comp.id} y should be non-negative`);
    assert.ok(comp.x + 144 <= layout.width, `Component ${comp.id} should fit in canvas width`);
    assert.ok(comp.y + 58 <= layout.height, `Component ${comp.id} should fit in canvas height`);
  }

  // Verify no two nodes completely overlap
  for (let i = 0; i < layout.components.length; i++) {
    for (let j = i + 1; j < layout.components.length; j++) {
      const a = layout.components[i];
      const b = layout.components[j];
      const xOverlap = Math.abs(a.x - b.x) < 144;
      const yOverlap = Math.abs(a.y - b.y) < 58;
      assert.ok(!(xOverlap && yOverlap), `Nodes ${a.id} and ${b.id} must not overlap`);
    }
  }
});

test('Graph Layout: dynamically handles added components without preset coordinates', () => {
  const project = makeCommerceProject();
  const newComponents = [
    ...project.components,
    { id: 'search-service', name: 'Search Service', type: 'SERVICE', sub: 'Elasticsearch wrapper' },
    { id: 'notification-worker', name: 'Notification Worker', type: 'SERVICE', sub: 'Email dispatcher' },
  ];
  const newRelationships = [
    ...project.relationships,
    { from: 'gateway', to: 'search-service', label: 'search' },
    { from: 'kafka', to: 'notification-worker', label: 'order events' },
  ];

  const layout = computeGraphLayout(newComponents, newRelationships);
  assert.equal(layout.components.length, 11);
  const searchNode = layout.components.find((c) => c.id === 'search-service');
  assert.ok(searchNode.x > 0 && searchNode.y > 0, 'Dynamically added component gets valid coordinates');
});

test('Upstream Traversal: identifies all callers and cascading outage impact', () => {
  const project = makeCommerceProject();
  const { upstreamIds, distances } = getUpstreamDependencies(
    project.components,
    project.relationships,
    'postgres'
  );

  // Directly calls postgres: auth, catalog, orders (1 hop)
  assert.ok(upstreamIds.has('auth'));
  assert.ok(upstreamIds.has('catalog'));
  assert.ok(upstreamIds.has('orders'));
  assert.equal(distances.get('auth'), 1);
  assert.equal(distances.get('catalog'), 1);
  assert.equal(distances.get('orders'), 1);

  // Transitive upstream: gateway (2 hops), web (3 hops)
  assert.ok(upstreamIds.has('gateway'));
  assert.equal(distances.get('gateway'), 2);
  assert.ok(upstreamIds.has('web'));
  assert.equal(distances.get('web'), 3);

  // Unrelated storage node should NOT be upstream from postgres
  assert.ok(!upstreamIds.has('redis'));
});

test('Downstream Traversal: tracks dependency path and hop distances', () => {
  const project = makeCommerceProject();
  const { downstreamIds, distances } = getDownstreamDependencies(
    project.components,
    project.relationships,
    'gateway'
  );

  // Direct downstream: auth, catalog, orders (1 hop)
  assert.ok(downstreamIds.has('auth'));
  assert.equal(distances.get('auth'), 1);

  // Transitive downstream: redis, postgres (2 hops)
  assert.ok(downstreamIds.has('redis'));
  assert.equal(distances.get('redis'), 2);
  assert.ok(downstreamIds.has('postgres'));
  assert.equal(distances.get('postgres'), 2);

  // Terminal downstream: payment provider (3 hops via orders -> kafka -> payment)
  assert.ok(downstreamIds.has('payment'));
  assert.equal(distances.get('payment'), 3);

  // Web is UPSTREAM from gateway, so it should not be in downstreamIds
  assert.ok(!downstreamIds.has('web'));
});

test('Blast Radius: computes holistic impact depth matrix and affected client apps', () => {
  const project = makeCommerceProject();
  const blast = getBlastRadius(project.components, project.relationships, 'auth');

  // Direct relations
  assert.deepEqual(blast.directCallers, ['gateway']);
  assert.deepEqual(blast.directDependencies.sort(), ['postgres', 'redis'].sort());

  // Upstream callers that break when Auth is down: gateway and web
  assert.ok(blast.upstreamIds.has('gateway'));
  assert.ok(blast.upstreamIds.has('web'));

  // Critical customer-facing clients impacted
  assert.deepEqual(blast.affectedClients, ['web']);

  // Verify Depth Matrix
  const selfNode = blast.depthMatrix.get('auth');
  assert.equal(selfNode.distance, 0);
  assert.equal(selfNode.direction, 'self');

  const webNode = blast.depthMatrix.get('web');
  assert.equal(webNode.distance, 2);
  assert.equal(webNode.direction, 'upstream');

  const redisNode = blast.depthMatrix.get('redis');
  assert.equal(redisNode.distance, 1);
  assert.equal(redisNode.direction, 'downstream');
});

test('Cycle Detection: Tarjan algorithm confirms baseline is acyclic', () => {
  const project = makeCommerceProject();
  const report = detectCycles(project.components, project.relationships);
  assert.equal(report.hasCycle, false);
  assert.equal(report.cycleCount, 0);
  assert.equal(report.cycles.length, 0);
});

test('Cycle Detection: Tarjan algorithm detects introduced circular dependencies', () => {
  const project = makeCommerceProject();
  // Introduce a cycle: orders -> catalog -> auth -> orders
  const cyclicRelationships = [
    ...project.relationships,
    { from: 'orders', to: 'catalog', label: 'query catalog' },
    { from: 'catalog', to: 'auth', label: 'check session' },
    { from: 'auth', to: 'orders', label: 'lookup recent orders' },
  ];

  const report = detectCycles(project.components, cyclicRelationships);
  assert.equal(report.hasCycle, true);
  assert.ok(report.cycleCount > 0);
  assert.ok(report.stronglyConnectedComponents.length > 0);

  // At least one SCC must contain auth and catalog
  const cyclicNodes = report.stronglyConnectedComponents.flat();
  assert.ok(cyclicNodes.includes('auth'));
  assert.ok(cyclicNodes.includes('catalog'));
});

test('Topological Sorting: Kahn algorithm calculates deployment boot stages', () => {
  const project = makeCommerceProject();
  const plan = getDeploymentPlan(project.components, project.relationships);

  assert.equal(plan.isAcyclic, true);
  assert.equal(plan.warnings.length, 0);
  assert.ok(plan.stages.length >= 3);

  // Storage and independent infrastructure must deploy in Wave 1
  const wave1Ids = plan.stages[0].componentIds;
  assert.ok(wave1Ids.includes('postgres'), 'PostgreSQL must boot in Stage 1');
  assert.ok(wave1Ids.includes('redis'), 'Redis must boot in Stage 1');
  assert.ok(wave1Ids.includes('payment'), 'External payment must be available in Stage 1');

  // Verify prerequisite order in full sequence:
  // If A calls B, B must be deployed BEFORE A.
  const seq = plan.orderedComponentIds;
  assert.ok(seq.indexOf('postgres') < seq.indexOf('catalog'), 'Postgres must precede Catalog');
  assert.ok(seq.indexOf('postgres') < seq.indexOf('auth'), 'Postgres must precede Auth');
  assert.ok(seq.indexOf('redis') < seq.indexOf('auth'), 'Redis must precede Auth');
  assert.ok(seq.indexOf('auth') < seq.indexOf('gateway'), 'Auth must precede Gateway');
  assert.ok(seq.indexOf('gateway') < seq.indexOf('web'), 'Gateway must precede Web');
});

test('Diagram Neighborhood: backward compatibility and enriched metadata', () => {
  const project = makeCommerceProject();
  const neighborhood = getDiagramNeighborhood(project.components, project.relationships, 'postgres');

  // Preserves existing properties expected by UI and tests
  assert.ok(neighborhood.directIds instanceof Set);
  assert.ok(neighborhood.directRelationships instanceof Set);
  assert.ok(neighborhood.downstreamIds instanceof Set);

  // Enriched Phase 2 properties
  assert.ok(neighborhood.upstreamIds instanceof Set);
  assert.ok(neighborhood.blastRadius);
  assert.ok(neighborhood.cycleReport);

  // Postgres has no downstream dependencies, but has upstream callers
  assert.equal(neighborhood.downstreamIds.size, 0);
  assert.ok(neighborhood.upstreamIds.has('gateway'));
  assert.ok(neighborhood.upstreamIds.has('web'));
  assert.equal(neighborhood.cycleReport.hasCycle, false);
});
