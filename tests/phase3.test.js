import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommerceProject, DEMO_COMMAND, proposeChange, applyChange } from '../src/data/commerce.js';
import { generateJsonPatch, applyJsonPatch } from '../src/data/jsonPatch.ts';
import { HistoryTimeline } from '../src/data/historyManager.ts';
import {
  createServerlessBranch,
  createKubernetesBranch,
  calculateBranchMetrics,
  compareBranches,
} from '../src/data/branching.ts';
import { detectMergeConflicts, executeMerge } from '../src/data/semanticMerge.ts';

test('RFC 6902 JSON Patch: generates atomic patches and computes exact inverse rollback', () => {
  const original = makeCommerceProject();
  const modified = structuredClone(original);
  
  // Apply changes: add a component, modify an existing one, remove an edge
  modified.components.push({
    id: 'search-service',
    name: 'Search Engine',
    type: 'SERVICE',
    sub: 'Elasticsearch proxy',
    responsibilities: ['Fast full-text product search'],
    x: 450,
    y: 200,
  });
  modified.components.find((c) => c.id === 'redis').sub = 'Distributed Multi-Cluster Cache';
  modified.relationships = modified.relationships.filter(
    (r) => !(r.from === 'orders' && r.to === 'kafka')
  );

  // 1. Generate forward RFC 6902 patch
  const patch = generateJsonPatch(original, modified);
  assert.ok(patch.length >= 3, 'Must produce operations for add, replace, and remove');

  // Verify operation types adhere to RFC 6902
  const ops = new Set(patch.map((p) => p.op));
  assert.ok(ops.has('replace'));

  // 2. Apply patch onto original
  const { result, inversePatch } = applyJsonPatch(original, patch);
  assert.equal(result.components.length, original.components.length + 1);
  assert.equal(
    result.components.find((c) => c.id === 'redis').sub,
    'Distributed Multi-Cluster Cache'
  );

  // 3. Apply inverse rollback patch -> Must recover exact original document
  const { result: rolledBack } = applyJsonPatch(result, inversePatch);
  assert.deepEqual(rolledBack.components, original.components);
  assert.deepEqual(rolledBack.relationships, original.relationships);
});

test('Time Travel History: manages undo, redo, and timeline version scrubbing', () => {
  const initial = makeCommerceProject();
  const history = new HistoryTimeline(initial);

  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);

  // Version 2: Add rate limiting
  const v2 = structuredClone(initial);
  v2.version = 2;
  v2.requirements.push({ id: 'REQ-RATE', text: '100 req/sec limit' });
  history.push(v2, 'Add rate limiting requirement', 'CHG-002');

  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);
  assert.equal(history.present.version, 2);

  // Version 3: Add analytics worker
  const v3 = structuredClone(v2);
  v3.version = 3;
  v3.components.push({ id: 'analytics', name: 'Analytics', type: 'SERVICE', sub: 'Metrics', responsibilities: [], x: 0, y: 0 });
  history.push(v3, 'Add analytics microservice', 'CHG-003');

  assert.equal(history.present.version, 3);
  assert.equal(history.past.length, 2);

  // 1. Undo to v2
  const undoneToV2 = history.undo();
  assert.equal(undoneToV2.version, 2);
  assert.equal(history.present.components.some((c) => c.id === 'analytics'), false);
  assert.equal(history.canRedo, true);

  // 2. Undo to v1 (initial)
  const undoneToV1 = history.undo();
  assert.equal(undoneToV1.version, 1);
  assert.equal(history.canUndo, false);

  // 3. Redo forward to v2
  const redoneToV2 = history.redo();
  assert.equal(redoneToV2.version, 2);
  assert.equal(history.canUndo, true);

  // 4. Redo forward to v3
  const redoneToV3 = history.redo();
  assert.equal(redoneToV3.version, 3);
  assert.equal(history.canRedo, false);

  // 5. Jump / Scrub directly to index 0 (v1)
  const scrubbed = history.jumpTo(0);
  assert.equal(scrubbed.version, 1);
});

test('one applied command creates one timestamped, undoable history entry', () => {
  const baseline = makeCommerceProject();
  const history = new HistoryTimeline(baseline);
  const applied = applyChange(baseline, proposeChange(DEMO_COMMAND));
  const change = applied.changes[0];
  history.push(applied, DEMO_COMMAND, change.id);

  assert.equal(applied.changes.length, 1);
  assert.equal(applied.activity.length, 1);
  assert.ok(Number.isFinite(change.timestamp));
  assert.equal(applied.activity[0].timestamp, change.timestamp);
  assert.equal(history.getFullTimeline().filter((entry) => entry.changeId === change.id).length, 1);
  assert.ok(history.getFullTimeline().find((entry) => entry.changeId === change.id).timestamp > 0);

  assert.equal(history.undo().version, baseline.version);
  assert.equal(history.redo().changes[0].timestamp, change.timestamp);
});

test('Scenario Branching: creates Serverless & K8s scenario branches with distinct metrics', () => {
  const base = makeCommerceProject();
  const serverlessBranch = createServerlessBranch(base);
  const k8sBranch = createKubernetesBranch(base);

  assert.equal(serverlessBranch.id, 'branch-serverless');
  assert.equal(k8sBranch.id, 'branch-k8s-postgres');

  // Verify Serverless characteristics
  const serverlessComps = serverlessBranch.project.components;
  assert.ok(serverlessComps.some((c) => c.id === 'dynamodb'));
  assert.ok(serverlessComps.some((c) => c.id === 'eventbridge'));

  // Verify K8s & PostgreSQL Replicas characteristics
  const k8sComps = k8sBranch.project.components;
  assert.ok(k8sComps.some((c) => c.id === 'postgres-replicas'));
  assert.ok(k8sComps.some((c) => c.id === 'redis-cluster'));

  // Calculate metrics
  const serverlessMetrics = calculateBranchMetrics(serverlessBranch.project);
  const k8sMetrics = calculateBranchMetrics(k8sBranch.project);

  assert.ok(serverlessMetrics.estimatedCostPerMonth > 0);
  assert.ok(k8sMetrics.estimatedCostPerMonth > serverlessMetrics.estimatedCostPerMonth, 'K8s cluster is more expensive than on-demand serverless');
  assert.equal(k8sMetrics.hasSinglePointOfFailure, false, 'Read replicas eliminate single DB SPOF');
});

test('Scenario Comparison: side-by-side trade-off analysis calculates cost and component deltas', () => {
  const base = makeCommerceProject();
  const serverless = createServerlessBranch(base);
  const k8s = createKubernetesBranch(base);

  const comparison = compareBranches(serverless, k8s);
  assert.ok(comparison.costDeltaMonthly > 0, 'Scenario B must have positive cost delta over Scenario A');
  assert.ok(comparison.componentChanges.addedInB.length > 0);
  assert.ok(comparison.componentChanges.removedInB.length > 0);

  // K8s introduces postgres-replicas which is absent in Serverless
  assert.ok(
    comparison.componentChanges.addedInB.some((c) => c.id === 'postgres-replicas')
  );
  // DynamoDB from Serverless is absent in K8s
  assert.ok(
    comparison.componentChanges.removedInB.some((c) => c.id === 'dynamodb')
  );
});

test('Semantic 3-Way Merge: auto-merges non-conflicting parallel additions', () => {
  const base = makeCommerceProject();

  // Target adds payment audit logger
  const target = structuredClone(base);
  target.components.push({
    id: 'audit-logger',
    name: 'Audit Logger',
    type: 'SERVICE',
    sub: 'Compliance logging',
    responsibilities: [],
    x: 0,
    y: 0,
  });

  // Source adds recommendations engine
  const source = structuredClone(base);
  source.components.push({
    id: 'recs-engine',
    name: 'Recommendations Engine',
    type: 'SERVICE',
    sub: 'ML Recommendations',
    responsibilities: [],
    x: 0,
    y: 0,
  });
  source.requirements.push({ id: 'REQ-RECS-01', text: 'Recommend top 5 items' });

  // Conflict detection
  const analysis = detectMergeConflicts(base, target, source);
  assert.equal(analysis.canAutoMerge, true, 'Independent additions must auto-merge cleanly');
  assert.equal(analysis.conflicts.length, 0);

  // Execute 3-way merge
  const result = executeMerge(base, target, source, {});
  assert.equal(result.success, true);
  assert.ok(result.mergedProject.components.some((c) => c.id === 'audit-logger'));
  assert.ok(result.mergedProject.components.some((c) => c.id === 'recs-engine'));
  assert.ok(result.mergedProject.requirements.some((r) => r.id === 'REQ-RECS-01'));
});

test('Semantic 3-Way Merge: detects divergent conflicting modifications and applies user resolutions', () => {
  const base = makeCommerceProject();

  // Target modifies Redis into Sentinel Cluster
  const target = structuredClone(base);
  const targetRedis = target.components.find((c) => c.id === 'redis');
  targetRedis.type = 'CACHE';
  targetRedis.sub = 'Redis Sentinel Failover Cluster';

  // Source modifies Redis into DynamoDB Session Store
  const source = structuredClone(base);
  const sourceRedis = source.components.find((c) => c.id === 'redis');
  sourceRedis.type = 'DATABASE';
  sourceRedis.sub = 'DynamoDB Fast Session Table';

  // Detect conflict
  const analysis = detectMergeConflicts(base, target, source);
  assert.equal(analysis.canAutoMerge, false, 'Conflicting changes must require resolution');
  assert.ok(analysis.conflicts.length > 0);
  assert.ok(analysis.conflicts.some((c) => c.entityId === 'redis'));

  // Attempt merge without resolution -> should fail
  const failedMerge = executeMerge(base, target, source, {});
  assert.equal(failedMerge.success, false);
  assert.ok(failedMerge.error.includes('unresolved conflict'));

  // Resolve conflict by choosing 'source' (DynamoDB session table)
  const resolutions = {};
  for (const conflict of analysis.conflicts) {
    resolutions[conflict.id] = 'source';
  }

  const resolvedMerge = executeMerge(base, target, source, resolutions);
  assert.equal(resolvedMerge.success, true);
  const mergedRedis = resolvedMerge.mergedProject.components.find((c) => c.id === 'redis');
  assert.equal(mergedRedis.type, 'DATABASE');
  assert.equal(mergedRedis.sub, 'DynamoDB Fast Session Table');
});

