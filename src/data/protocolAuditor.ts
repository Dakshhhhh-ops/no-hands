import type { Project, Relationship } from '../types/schema.ts';

export interface ProtocolAuditFinding {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'RECOMMENDATION';
  sourceId: string;
  targetId: string;
  protocol: string;
  title: string;
  description: string;
  mitigation: string;
}

export interface ResilienceAuditReport {
  timestamp: number;
  criticalCount: number;
  warningCount: number;
  recommendationCount: number;
  findings: ProtocolAuditFinding[];
  score: number; // 0 to 100 resilience health score
}

/**
 * Audits communication protocols across the architecture graph:
 * - Detects risky synchronous blocking chains (e.g. Web -> Gateway -> Order -> Payment).
 * - Identifies missing circuit breakers on external third-party integrations.
 * - Flags unbuffered synchronous database write paths.
 * - Recommends asynchronous event-driven decoupling.
 */
export function auditProtocolsAndResilience(project: Project): ResilienceAuditReport {
  const findings: ProtocolAuditFinding[] = [];
  const compMap = new Map(project.components.map((c) => [c.id, c]));

  // 1. Audit External Integrations (Circuit Breaker / Timeout requirement)
  const externalNodes = project.components.filter((c) => c.type === 'EXTERNAL');
  for (const ext of externalNodes) {
    const incomingRels = project.relationships.filter((r) => r.to === ext.id);
    for (const rel of incomingRels) {
      const fromComp = compMap.get(rel.from);
      const isAsync = /event|publish|queue|kafka/i.test(rel.label);

      if (!isAsync) {
        findings.push({
          id: `audit-sync-external-${rel.from}-${ext.id}`,
          severity: 'CRITICAL',
          sourceId: rel.from,
          targetId: ext.id,
          protocol: rel.label,
          title: `Synchronous blocking call to external provider "${ext.name}"`,
          description: `"${fromComp?.name || rel.from}" makes a direct synchronous call to "${ext.name}". An external outage or network latency spike will tie up container worker threads and cascade upward.`,
          mitigation: 'Implement an Envoy/Resilience4j Circuit Breaker with a 2000ms hard timeout and an asynchronous retry dead-letter queue (DLQ).',
        });
      } else {
        findings.push({
          id: `audit-async-external-${rel.from}-${ext.id}`,
          severity: 'RECOMMENDATION',
          sourceId: rel.from,
          targetId: ext.id,
          protocol: rel.label,
          title: `Asynchronous decoupling to "${ext.name}" is modeled`,
          description: `Event-driven connection via "${rel.label}" prevents upstream caller starvation during third-party degradation.`,
          mitigation: 'Ensure idempotency keys are passed to prevent duplicate charges upon event replay.',
        });
      }
    }
  }

  // 2. Audit Deep Synchronous Call Chains (Cascading Latency / Failure Cascades)
  // Check if Web -> Gateway -> Service -> Database are all synchronous
  const syncChains: string[][] = [];
  function traceSync(current: string, path: string[]) {
    if (path.length >= 4) {
      syncChains.push([...path]);
      return;
    }
    const outgoing = project.relationships.filter((r) => r.from === current);
    for (const edge of outgoing) {
      const target = compMap.get(edge.to);
      const isSync = !/event|publish|queue|kafka/i.test(edge.label);
      if (isSync && target && !path.includes(edge.to)) {
        traceSync(edge.to, [...path, edge.to]);
      }
    }
  }

  const clientNodes = project.components.filter((c) => c.type === 'CLIENT');
  for (const client of clientNodes) {
    traceSync(client.id, [client.id]);
  }

  if (syncChains.length > 0) {
    const deepest = syncChains.sort((a, b) => b.length - a.length)[0];
    const chainNames = deepest.map((id) => compMap.get(id)?.name || id).join(' → ');
    findings.push({
      id: 'audit-deep-sync-chain',
      severity: 'WARNING',
      sourceId: deepest[0],
      targetId: deepest[deepest.length - 1],
      protocol: 'Synchronous Chain',
      title: `Deep Synchronous Request Cascade (${deepest.length} hops)`,
      description: `Execution path (${chainNames}) relies on multiple synchronous hops. Any single downstream slowdown compounds latency linearly.`,
      mitigation: 'Decouple read paths using localized edge caches and decouple write paths using Kafka/SQS event publishing.',
    });
  }

  // 3. Audit Cache Outage Resilience
  const cacheNodes = project.components.filter((c) => c.type === 'CACHE');
  const redisFallbackReq = project.requirements.find(
    (r) => /redis/i.test(r.text) && /(fallback|unavailable|resilien)/i.test(r.text)
  );

  for (const cache of cacheNodes) {
    if (!redisFallbackReq) {
      findings.push({
        id: `audit-cache-fallback-missing-${cache.id}`,
        severity: 'CRITICAL',
        sourceId: 'auth',
        targetId: cache.id,
        protocol: 'Cache access',
        title: `No fallback policy recorded for cache component "${cache.name}"`,
        description: `If ${cache.name} crashes, dependent login/session authentication will fail completely without a fallback degraded path.`,
        mitigation: 'Adopt fail-open authentication to PostgreSQL with rate-limiting, or cluster Redis with Sentinel automatic failover.',
      });
    }
  }

  const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
  const warningCount = findings.filter((f) => f.severity === 'WARNING').length;
  const recommendationCount = findings.filter((f) => f.severity === 'RECOMMENDATION').length;

  // Calculate score (100 minus penalties)
  const score = Math.max(20, Math.min(100, 100 - criticalCount * 25 - warningCount * 10));

  return {
    timestamp: Date.now(),
    criticalCount,
    warningCount,
    recommendationCount,
    findings,
    score,
  };
}

