import type { Project, Component, Relationship } from '../types/schema.ts';
import { getBlastRadius } from './graphTraversal.ts';

export type ChaosTargetType = 'NODE_OUTAGE' | 'LATENCY_SPIKE' | 'PACKET_LOSS' | 'NETWORK_PARTITION';

export interface ChaosInjection {
  targetComponentId: string;
  type: ChaosTargetType;
  latencyMs?: number; // Added latency (e.g. 1500ms)
  failureRate?: number; // 0.0 to 1.0 (e.g. 1.0 for complete outage)
  label: string;
}

export interface NodeTelemetryStatus {
  componentId: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  activeLatencyMs: number;
  errorRatePercent: number;
  trafficRps: number;
  cpuUtilizationPercent: number;
  memoryUtilizationPercent: number;
  activeConnections: number;
  failureMessage?: string;
  isDirectTarget: boolean;
  isCascadedImpact: boolean;
}

export interface EdgeTelemetryStatus {
  from: string;
  to: string;
  label: string;
  trafficRps: number;
  status: 'FLOWING' | 'CONGESTED' | 'SEVERED' | 'DEGRADED';
  latencyMs: number;
  particleSpeedSeconds: number; // For SVG animation speed
  particleDensity: number; // 1 to 5 particles
  particleColor: string; // Hex or CSS color
}

export interface ChaosSimulationResult {
  injectedChaos: ChaosInjection[];
  overallSystemHealth: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL_FAILURE';
  totalRpsThroughput: number;
  droppedRps: number;
  averageLatencyMs: number;
  p99LatencyMs: number;
  nodeMetrics: Map<string, NodeTelemetryStatus>;
  edgeMetrics: Map<string, EdgeTelemetryStatus>;
  cascadingFailures: Array<{
    culpritId: string;
    victimId: string;
    cause: string;
  }>;
}

/**
 * Live Chaos Engineering & Telemetry Simulation Engine.
 * Evaluates real-time failure cascades, simulates queuing delays,
 * and dynamically calculates traffic rates and particle metrics across edges.
 */
export function simulateChaosAndTelemetry(
  project: Project,
  injectedChaos: ChaosInjection[] = [],
  baseIncomingRps = 1500
): ChaosSimulationResult {
  const compMap = new Map(project.components.map((c) => [c.id, c]));
  const nodeMetrics = new Map<string, NodeTelemetryStatus>();
  const edgeMetrics = new Map<string, EdgeTelemetryStatus>();
  const cascadingFailures: Array<{ culpritId: string; victimId: string; cause: string }> = [];

  const chaosMap = new Map(injectedChaos.map((c) => [c.targetComponentId, c]));

  // Check confirmed resilience requirements
  const hasRedisFallback = project.requirements.some(
    (r) => /redis/i.test(r.text) && /(fallback|unavailable|resilien)/i.test(r.text)
  );
  const hasRateLimit = project.requirements.some((r) => /rate.?limit/i.test(r.text));

  // Initialize all components as healthy
  for (const comp of project.components) {
    nodeMetrics.set(comp.id, {
      componentId: comp.id,
      status: 'HEALTHY',
      activeLatencyMs: 15,
      errorRatePercent: 0,
      trafficRps: 0,
      cpuUtilizationPercent: 28,
      memoryUtilizationPercent: 35,
      activeConnections: 45,
      isDirectTarget: false,
      isCascadedImpact: false,
    });
  }

  // 1. Apply Direct Injected Chaos
  for (const chaos of injectedChaos) {
    const node = nodeMetrics.get(chaos.targetComponentId);
    if (!node) continue;

    node.isDirectTarget = true;
    if (chaos.type === 'NODE_OUTAGE') {
      node.status = 'DOWN';
      node.errorRatePercent = 100;
      node.activeLatencyMs = 9999;
      node.failureMessage = `${compMap.get(chaos.targetComponentId)?.name || chaos.targetComponentId} is DOWN (Complete node outage injected)`;
      node.cpuUtilizationPercent = 0;
      node.activeConnections = 0;
    } else if (chaos.type === 'LATENCY_SPIKE') {
      node.status = 'DEGRADED';
      node.activeLatencyMs = (chaos.latencyMs || 1500) + 20;
      node.errorRatePercent = 12;
      node.cpuUtilizationPercent = 88;
      node.activeConnections = 350;
      node.failureMessage = `High latency penalty (+${chaos.latencyMs || 1500}ms) causing connection queue buildup`;
    } else if (chaos.type === 'NETWORK_PARTITION') {
      node.status = 'DOWN';
      node.errorRatePercent = 100;
      node.activeLatencyMs = 5000;
      node.failureMessage = 'Network partitioned: unable to route inbound or outbound packets';
    }
  }

  // 2. Compute Cascading Outages via Blast Radius
  for (const chaos of injectedChaos) {
    if (chaos.type === 'NODE_OUTAGE' || chaos.type === 'NETWORK_PARTITION') {
      const culpritId = chaos.targetComponentId;

      // Special Domain Rules:
      // If Redis is DOWN:
      if (culpritId === 'redis') {
        const authNode = nodeMetrics.get('auth');
        if (authNode) {
          if (hasRedisFallback) {
            // Degraded fallback to PostgreSQL
            authNode.status = 'DEGRADED';
            authNode.activeLatencyMs += 85;
            authNode.errorRatePercent = 3.5;
            authNode.failureMessage = 'Redis down: fallback route engaged; authenticating via PostgreSQL directly';
            cascadingFailures.push({
              culpritId: 'redis',
              victimId: 'auth',
              cause: 'Redis outage: degraded session fallback to PostgreSQL increased auth latency',
            });
          } else {
            // Complete failure of Auth
            authNode.status = 'DOWN';
            authNode.errorRatePercent = 95;
            authNode.activeLatencyMs = 5000;
            authNode.isCascadedImpact = true;
            authNode.failureMessage = 'Fatal cascade: Redis unavailable and no fallback policy defined';
            cascadingFailures.push({
              culpritId: 'redis',
              victimId: 'auth',
              cause: 'Redis session store failed; auth service has no fallback and dropped login traffic',
            });
          }
        }
      }

      // If PostgreSQL is DOWN:
      if (culpritId === 'postgres') {
        for (const depId of ['auth', 'catalog', 'orders']) {
          const victim = nodeMetrics.get(depId);
          if (victim) {
            victim.status = 'DOWN';
            victim.errorRatePercent = 100;
            victim.activeLatencyMs = 4000;
            victim.isCascadedImpact = true;
            victim.failureMessage = 'Durable datastore PostgreSQL is offline; database queries timed out';
            cascadingFailures.push({
              culpritId: 'postgres',
              victimId: depId,
              cause: 'PostgreSQL single point of failure outage cascaded upstream',
            });
          }
        }
      }

      // If Kafka is DOWN:
      if (culpritId === 'kafka') {
        const ordersNode = nodeMetrics.get('orders');
        if (ordersNode) {
          ordersNode.status = 'DEGRADED';
          ordersNode.activeLatencyMs += 220;
          ordersNode.failureMessage = 'Kafka cluster unreachable; order events queued in local buffer';
          cascadingFailures.push({
            culpritId: 'kafka',
            victimId: 'orders',
            cause: 'Order event stream partitioned; relying on local disk buffer',
          });
        }
      }
    }
  }

  // If Auth, Catalog, and Orders are down, Gateway and Web degrade/fail
  const backendDownCount = ['auth', 'catalog', 'orders'].filter(
    (id) => nodeMetrics.get(id)?.status === 'DOWN'
  ).length;

  if (backendDownCount >= 2) {
    const gw = nodeMetrics.get('gateway');
    if (gw) {
      gw.status = 'DOWN';
      gw.errorRatePercent = 85;
      gw.failureMessage = 'Multiple backend downstreams unavailable; HTTP 502/504 Bad Gateway';
    }
    const web = nodeMetrics.get('web');
    if (web) {
      web.status = 'DEGRADED';
      web.errorRatePercent = 80;
      web.failureMessage = 'Storefront degraded; checkout and product browsing offline';
    }
  }

  // 3. Traffic Flow and Edge Particle Calculation
  for (const rel of project.relationships) {
    const fromStatus = nodeMetrics.get(rel.from);
    const toStatus = nodeMetrics.get(rel.to);
    const edgeKey = `${rel.from}->${rel.to}`;

    let status: 'FLOWING' | 'CONGESTED' | 'SEVERED' | 'DEGRADED' = 'FLOWING';
    let latencyMs = 8;
    let particleSpeedSeconds = 2.4;
    let particleDensity = 2;
    let particleColor = '#4ef2d2'; // Default cyan
    let trafficRps = baseIncomingRps;

    // Scale traffic down based on hop tier
    if (rel.from === 'web') trafficRps = baseIncomingRps;
    else if (rel.from === 'gateway') trafficRps = Math.round(baseIncomingRps / 3);
    else trafficRps = Math.round(baseIncomingRps / 4);

    if (fromStatus?.status === 'DOWN' || toStatus?.status === 'DOWN') {
      status = 'SEVERED';
      trafficRps = 0;
      particleSpeedSeconds = 0;
      particleDensity = 0;
      particleColor = '#ef4444'; // Red severed
    } else if (fromStatus?.status === 'DEGRADED' || toStatus?.status === 'DEGRADED') {
      status = 'DEGRADED';
      latencyMs = Math.max(fromStatus?.activeLatencyMs || 0, toStatus?.activeLatencyMs || 0);
      particleSpeedSeconds = 4.8; // Slower particles
      particleDensity = 1;
      particleColor = '#f59e0b'; // Amber degraded
      trafficRps = Math.round(trafficRps * 0.4);
    } else {
      // Normal flowing traffic
      latencyMs = 12;
      particleSpeedSeconds = 2.0;
      particleDensity = 3;
      particleColor = '#4ef2d2';
    }

    edgeMetrics.set(edgeKey, {
      from: rel.from,
      to: rel.to,
      label: rel.label,
      trafficRps,
      status,
      latencyMs,
      particleSpeedSeconds,
      particleDensity,
      particleColor,
    });
  }

  // 4. Calculate Aggregate System Health & P99 Latency
  let totalLatency = 0;
  let maxLatency = 0;
  let activeNodes = 0;
  let downCount = 0;

  for (const node of nodeMetrics.values()) {
    if (node.status === 'DOWN') {
      downCount++;
    } else {
      totalLatency += node.activeLatencyMs;
      maxLatency = Math.max(maxLatency, node.activeLatencyMs);
      activeNodes++;
    }
  }

  const averageLatencyMs = activeNodes > 0 ? Math.round(totalLatency / activeNodes) : 9999;
  const p99LatencyMs = maxLatency > 0 ? maxLatency * 1.4 : 9999;

  let overallSystemHealth: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL_FAILURE' = 'OPTIMAL';
  if (downCount >= 2) overallSystemHealth = 'CRITICAL_FAILURE';
  else if (downCount === 1 || cascadingFailures.length > 0) overallSystemHealth = 'DEGRADED';

  const droppedRps = downCount > 0 ? Math.round(baseIncomingRps * Math.min(1.0, downCount * 0.35)) : 0;
  const totalRpsThroughput = Math.max(0, baseIncomingRps - droppedRps);

  return {
    injectedChaos,
    overallSystemHealth,
    totalRpsThroughput,
    droppedRps,
    averageLatencyMs,
    p99LatencyMs: Math.round(p99LatencyMs),
    nodeMetrics,
    edgeMetrics,
    cascadingFailures,
  };
}

