import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommerceProject, proposeChange, applyChange } from '../src/data/commerce.js';
import {
  simulateChaosAndTelemetry,
} from '../src/data/chaosSimulator.ts';
import {
  OrSet,
  CollaborativeStudioRoom,
} from '../src/data/crdtStudio.ts';
import {
  generateAdrFromChange,
  formatAdrMarkdown,
} from '../src/data/adrWorkflow.ts';

test('Live Chaos Simulator: evaluates baseline health under normal traffic', () => {
  const project = makeCommerceProject();
  const sim = simulateChaosAndTelemetry(project, [], 1500);

  assert.equal(sim.overallSystemHealth, 'OPTIMAL');
  assert.equal(sim.droppedRps, 0);
  assert.ok(sim.totalRpsThroughput > 0);
  assert.equal(sim.cascadingFailures.length, 0);

  // All baseline components should be HEALTHY
  for (const comp of project.components) {
    const metric = sim.nodeMetrics.get(comp.id);
    assert.ok(metric);
    assert.equal(metric.status, 'HEALTHY');
    assert.equal(metric.errorRatePercent, 0);
  }

  // All edges should have active traffic and particle parameters
  for (const edge of project.relationships) {
    const key = `${edge.from}->${edge.to}`;
    const em = sim.edgeMetrics.get(key);
    assert.ok(em, `Edge metric missing for ${key}`);
    assert.equal(em.status, 'FLOWING');
    assert.ok(em.particleSpeedSeconds > 0);
    assert.ok(em.particleColor);
  }
});

test('Live Chaos Simulator: simulates Redis outage cascade and graceful fallback mitigation', () => {
  const baseProject = makeCommerceProject();

  // 1. Without Redis fallback requirement: Redis outage collapses Auth
  const outageSim = simulateChaosAndTelemetry(baseProject, [
    {
      targetComponentId: 'redis',
      type: 'NODE_OUTAGE',
      label: 'Simulated Redis Cluster Outage',
    },
  ]);

  assert.notEqual(outageSim.overallSystemHealth, 'OPTIMAL');
  const redisMetric = outageSim.nodeMetrics.get('redis');
  assert.equal(redisMetric.status, 'DOWN');
  assert.equal(redisMetric.isDirectTarget, true);

  // Auth should be cascaded to DOWN because of hard dependency without fallback
  const authMetric = outageSim.nodeMetrics.get('auth');
  assert.equal(authMetric.status, 'DOWN');
  assert.equal(authMetric.isCascadedImpact, true);
  assert.ok(authMetric.errorRatePercent > 50);

  // Auth -> Redis edge should be severed
  const authRedisEdge = outageSim.edgeMetrics.get('auth->redis');
  assert.ok(authRedisEdge);
  assert.equal(authRedisEdge.status, 'SEVERED');
  assert.equal(authRedisEdge.particleColor, '#ef4444');

  // 2. With Redis fallback requirement: Auth gracefully degrades to DEGRADED via Postgres
  const proposal = proposeChange(
    'Add Redis session cache with rate limiting. Fallback to Postgres if Redis is unavailable.'
  );
  const resilientProject = applyChange(baseProject, proposal);

  const resilientSim = simulateChaosAndTelemetry(resilientProject, [
    {
      targetComponentId: 'redis',
      type: 'NODE_OUTAGE',
      label: 'Simulated Redis Cluster Outage',
    },
  ]);

  const resilientAuth = resilientSim.nodeMetrics.get('auth');
  assert.equal(resilientAuth.status, 'DEGRADED'); // Not DOWN! Gracefully degraded
  assert.ok(resilientAuth.errorRatePercent < 20); // Low error rate due to fallback
  assert.ok(resilientAuth.activeLatencyMs > 20); // Latency increases because of direct DB queries
});

test('Live Chaos Simulator: simulates Postgres outage and cascades across all dependent tiers', () => {
  const project = makeCommerceProject();
  const dbOutageSim = simulateChaosAndTelemetry(project, [
    {
      targetComponentId: 'postgres',
      type: 'NODE_OUTAGE',
      label: 'Postgres Primary Crash',
    },
  ]);

  assert.equal(dbOutageSim.overallSystemHealth, 'CRITICAL_FAILURE');
  const pgMetric = dbOutageSim.nodeMetrics.get('postgres');
  assert.equal(pgMetric.status, 'DOWN');

  // Transitive callers (Auth, Catalog, Orders) should be cascaded
  const authMetric = dbOutageSim.nodeMetrics.get('auth');
  const catalogMetric = dbOutageSim.nodeMetrics.get('catalog');
  const ordersMetric = dbOutageSim.nodeMetrics.get('orders');

  assert.ok(authMetric.isCascadedImpact);
  assert.ok(catalogMetric.isCascadedImpact);
  assert.ok(ordersMetric.isCascadedImpact);
  assert.ok(dbOutageSim.cascadingFailures.length >= 3);
});

test('CRDT Studio: OrSet provides conflict-free add, remove, and multi-peer convergence', () => {
  const setA = new OrSet();
  const setB = new OrSet();

  // Peer A adds analytics
  setA.add({ id: 'analytics', name: 'Realtime Analytics Worker' }, 'peer-alice');
  // Peer B adds search
  setB.add({ id: 'search', name: 'Elasticsearch Indexer' }, 'peer-bob');

  // Merge B into A
  setA.merge(setB);
  const valuesA = setA.values();
  assert.equal(valuesA.length, 2);
  assert.ok(valuesA.some((c) => c.id === 'analytics'));
  assert.ok(valuesA.some((c) => c.id === 'search'));

  // Peer B removes search and adds notification
  setB.remove('search');
  setB.add({ id: 'notifications', name: 'Notification Service' }, 'peer-bob');

  // Merge B back into A: search should be tombstoned in A
  setA.merge(setB);
  const updatedA = setA.values();
  assert.equal(updatedA.length, 2);
  assert.ok(updatedA.some((c) => c.id === 'analytics'));
  assert.ok(updatedA.some((c) => c.id === 'notifications'));
  assert.ok(!updatedA.some((c) => c.id === 'search'));
});

test('CRDT Studio: CollaborativeStudioRoom tracks peer presences and cursor tracking', () => {
  const room = new CollaborativeStudioRoom('room-arch-1', 'peer-main', 'Chief Architect');
  
  // Local presence
  const local = room.updateLocalPresence(350, 220, 'diagram', 'auth');
  assert.equal(local.peerId, 'peer-main');
  assert.equal(local.cursorX, 350);
  assert.equal(local.selectedComponentId, 'auth');

  // Simulate remote peers
  const peers = room.simulateRemotePeers();
  assert.ok(peers.length >= 2);
  assert.ok(peers.some((p) => p.name.includes('SRE')));
  assert.ok(peers.some((p) => p.name.includes('Security')));

  const active = room.getActivePeers();
  assert.ok(active.length >= 3);
});

test('ADR Workflow: synthesizes standard Architecture Decision Record and signs off roles', () => {
  const baseProject = makeCommerceProject();

  // Baseline ADR: missing rate limiting & fallback, so Security and SRE do not sign off yet
  const baseAdr = generateAdrFromChange(baseProject);
  assert.ok(baseAdr.id.startsWith('ADR-'));
  assert.ok(baseAdr.complianceSignoffs.length === 4);
  
  const secSignoff = baseAdr.complianceSignoffs.find((s) => s.role === 'Security Lead');
  const sreSignoff = baseAdr.complianceSignoffs.find((s) => s.role === 'SRE / Infrastructure Lead');
  assert.equal(secSignoff?.approved, false);
  assert.equal(sreSignoff?.approved, false);

  // Apply change with rate limiting and fallback
  const proposal = proposeChange(
    'Add Redis session cache with rate limiting. Fallback to Postgres if Redis is unavailable.'
  );
  const changedProject = applyChange(baseProject, proposal);
  const changedAdr = generateAdrFromChange(changedProject);

  const changedSecSignoff = changedAdr.complianceSignoffs.find((s) => s.role === 'Security Lead');
  const changedSreSignoff = changedAdr.complianceSignoffs.find((s) => s.role === 'SRE / Infrastructure Lead');
  assert.equal(changedSecSignoff?.approved, true);
  assert.equal(changedSreSignoff?.approved, true);

  // Format ADR markdown
  const markdown = formatAdrMarkdown(changedAdr);
  assert.ok(markdown.includes('# ADR-'));
  assert.ok(markdown.includes('## Context'));
  assert.ok(markdown.includes('## Decision'));
  assert.ok(markdown.includes('## Consequences'));
  assert.ok(markdown.includes('## Multi-Role Sign-off Matrix'));
  assert.ok(markdown.includes('Security Lead'));
});
