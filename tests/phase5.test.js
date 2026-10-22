import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommerceProject, proposeChange, applyChange } from '../src/data/commerce.ts';
import {
  simulateChaosAndTelemetry,
} from '../src/data/chaosSimulator.ts';
import {
  generateAdrFromChange,
  formatAdrMarkdown,
} from '../src/data/adrWorkflow.ts';

test('Outage simulator: evaluates baseline health under normal traffic', () => {
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

test('Outage simulator: simulates Redis outage cascade and graceful fallback mitigation', () => {
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
  assert.equal(authRedisEdge.particleColor, 'var(--va-rose)');

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

test('Outage simulator: simulates Postgres outage and cascades across all dependent tiers', () => {
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

test('ADR Workflow: drafts a proposed record with every sign-off pending', () => {
  const baseProject = makeCommerceProject();
  const proposal = proposeChange(
    'Add Redis session cache with rate limiting. Fallback to Postgres if Redis is unavailable.'
  );
  const changedProject = applyChange(baseProject, proposal);
  const adr = generateAdrFromChange(changedProject);

  assert.ok(adr.id.startsWith('ADR-'));
  assert.equal(adr.status, 'PROPOSED');
  assert.equal(adr.complianceSignoffs.length, 4);
  // A requirement mentioning rate limiting is not a Security Lead's approval.
  for (const signoff of adr.complianceSignoffs) {
    assert.equal(signoff.approved, false);
    assert.equal(signoff.signee, 'Unassigned');
    assert.equal(signoff.timestamp, undefined);
  }

  const markdown = formatAdrMarkdown(adr);
  assert.ok(markdown.includes('# ADR-'));
  assert.ok(markdown.includes('## Context'));
  assert.ok(markdown.includes('## Decision'));
  assert.ok(markdown.includes('## Consequences'));
  assert.ok(markdown.includes('## Multi-Role Sign-off Matrix'));
  assert.ok(markdown.includes('PENDING'));
  assert.ok(!markdown.includes('APPROVED'));
});
