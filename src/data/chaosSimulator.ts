import type { Project, Component } from '../types/schema.ts';

/**
 * Outage simulator. Everything here is a model of the diagram, not measurement:
 * the numbers come from the assumptions below and the shape of the graph. The
 * rules are generic and work on any model, not only the bundled samples.
 */

/** Requests per second assumed to enter through the model's entry points. */
export const ASSUMED_INGRESS_RPS = 1500;
/** Latency assumed for each component a request passes through. */
export const ASSUMED_HOP_LATENCY_MS = 15;
/** Extra latency when a component answers from its database because its cache is down. */
export const ASSUMED_CACHE_FALLBACK_PENALTY_MS = 85;
/** Extra latency when a component buffers events because its queue is down. */
export const ASSUMED_QUEUE_BUFFER_PENALTY_MS = 220;

export type ChaosTargetType = 'NODE_OUTAGE' | 'LATENCY_SPIKE' | 'NETWORK_PARTITION';

export interface ChaosInjection {
  targetComponentId: string;
  type: ChaosTargetType;
  latencyMs?: number;
  label: string;
}

export interface NodeTelemetryStatus {
  componentId: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  /** Modeled latency added by this component, including penalties. */
  activeLatencyMs: number;
  /** Share of this component's requests that fail in the model. */
  errorRatePercent: number;
  trafficRps: number;
  failureMessage?: string;
  isDirectTarget: boolean;
  isCascadedImpact: boolean;
}

export interface EdgeTelemetryStatus {
  from: string;
  to: string;
  label: string;
  trafficRps: number;
  status: 'FLOWING' | 'SEVERED' | 'DEGRADED';
  latencyMs: number;
  particleSpeedSeconds: number;
  particleDensity: number;
  particleColor: string;
}

export interface ChaosSimulationResult {
  injectedChaos: ChaosInjection[];
  overallSystemHealth: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL_FAILURE';
  totalRpsThroughput: number;
  droppedRps: number;
  averageLatencyMs: number;
  /** Modeled latency of the slowest request path that still succeeds. */
  slowestPathMs: number;
  nodeMetrics: Map<string, NodeTelemetryStatus>;
  edgeMetrics: Map<string, EdgeTelemetryStatus>;
  cascadingFailures: Array<{ culpritId: string; victimId: string; cause: string }>;
}

/** Gateways and clients route each request to one dependency; other components call all of theirs. */
const isRouter = (c: Component | undefined) => c?.type === 'GATEWAY' || c?.type === 'CLIENT';

/** A cache outage is survivable only when the model records a fallback for it. */
function hasRecordedFallback(project: Project, cache: Component): boolean {
  return project.requirements.some((r) => {
    const text = r.text.toLowerCase();
    const namesCache = text.includes(cache.name.toLowerCase()) || text.includes(cache.id.toLowerCase()) || /\bcache\b/.test(text);
    return namesCache && /(fallback|unavailable|resilien|outage|down)/.test(text);
  });
}

export function simulateChaosAndTelemetry(
  project: Project,
  injectedChaos: ChaosInjection[] = [],
  baseIncomingRps = ASSUMED_INGRESS_RPS,
): ChaosSimulationResult {
  const byId = new Map(project.components.map((c) => [c.id, c]));
  const deps = new Map<string, string[]>(project.components.map((c) => [c.id, []]));
  const callers = new Map<string, string[]>(project.components.map((c) => [c.id, []]));
  for (const r of project.relationships) {
    if (byId.has(r.from) && byId.has(r.to)) {
      deps.get(r.from)!.push(r.to);
      callers.get(r.to)!.push(r.from);
    }
  }

  const nodeMetrics = new Map<string, NodeTelemetryStatus>();
  for (const c of project.components) {
    nodeMetrics.set(c.id, {
      componentId: c.id,
      status: 'HEALTHY',
      activeLatencyMs: ASSUMED_HOP_LATENCY_MS,
      errorRatePercent: 0,
      trafficRps: 0,
      isDirectTarget: false,
      isCascadedImpact: false,
    });
  }
  const cascadingFailures: ChaosSimulationResult['cascadingFailures'] = [];
  const nameOf = (id: string) => byId.get(id)?.name || id;

  // 1. Direct injections.
  for (const chaos of injectedChaos) {
    const node = nodeMetrics.get(chaos.targetComponentId);
    if (!node) continue;
    node.isDirectTarget = true;
    if (chaos.type === 'LATENCY_SPIKE') {
      node.status = 'DEGRADED';
      node.activeLatencyMs += chaos.latencyMs ?? 1500;
      node.failureMessage = `${nameOf(node.componentId)} answers ${chaos.latencyMs ?? 1500}ms slower (simulated)`;
    } else {
      node.status = 'DOWN';
      node.errorRatePercent = 100;
      node.failureMessage = `${nameOf(node.componentId)} is down (simulated)`;
    }
  }

  // 2. Cascade to callers until nothing changes. Rules depend only on component types.
  // States only get worse each pass, so this settles; the cap is a safety net.
  let changed = true;
  for (let pass = 0; changed && pass < project.components.length * 3 + 5; pass += 1) {
    changed = false;
    for (const c of project.components) {
      const node = nodeMetrics.get(c.id)!;
      if (node.isDirectTarget && node.status === 'DOWN') continue;
      const myDeps = deps.get(c.id)!;
      if (!myDeps.length) continue;
      const downDeps = myDeps.filter((d) => nodeMetrics.get(d)!.status === 'DOWN');

      let next: NodeTelemetryStatus['status'] = node.isDirectTarget ? node.status : 'HEALTHY';
      let penalty = 0;
      let reason = '';
      let culprit = '';

      if (isRouter(c)) {
        if (downDeps.length === myDeps.length) {
          next = 'DOWN';
          reason = `every component ${c.name} routes to is down`;
          culprit = downDeps[0];
        } else if (downDeps.length) {
          next = 'DEGRADED';
          reason = `${downDeps.length} of ${myDeps.length} routes fail`;
          culprit = downDeps[0];
        }
      } else {
        for (const d of downDeps) {
          const dep = byId.get(d)!;
          if (dep.type === 'QUEUE') {
            if (next !== 'DOWN') next = 'DEGRADED';
            penalty += ASSUMED_QUEUE_BUFFER_PENALTY_MS;
            reason ||= `${dep.name} is down, so events are buffered`;
          } else if (dep.type === 'EXTERNAL') {
            if (next !== 'DOWN') next = 'DEGRADED';
            reason ||= `${dep.name} is unreachable`;
          } else if (dep.type === 'CACHE' && hasRecordedFallback(project, dep)) {
            if (next !== 'DOWN') next = 'DEGRADED';
            penalty += ASSUMED_CACHE_FALLBACK_PENALTY_MS;
            reason ||= `${dep.name} is down; the recorded fallback serves requests more slowly`;
          } else {
            next = 'DOWN';
            reason = `it depends on ${dep.name}, which is down${dep.type === 'CACHE' ? ', and no fallback is recorded' : ''}`;
          }
          culprit ||= d;
        }
      }

      // A slowed dependency slows its synchronous callers too.
      const degradedDeps = myDeps.filter((d) => nodeMetrics.get(d)!.status === 'DEGRADED');
      if (next === 'HEALTHY' && degradedDeps.length && !isRouter(c)) {
        next = 'DEGRADED';
        reason = `${nameOf(degradedDeps[0])} is degraded`;
        culprit = degradedDeps[0];
      }

      const latency = (node.isDirectTarget ? node.activeLatencyMs : ASSUMED_HOP_LATENCY_MS) + penalty;
      if (next !== node.status || latency !== node.activeLatencyMs) {
        const wasCascade = node.isCascadedImpact;
        node.status = next;
        node.activeLatencyMs = latency;
        node.errorRatePercent = next === 'DOWN' ? 100 : node.errorRatePercent;
        node.isCascadedImpact = next !== 'HEALTHY' && !node.isDirectTarget;
        if (node.isCascadedImpact) {
          node.failureMessage = `${c.name}: ${reason} (simulated)`;
          if (!wasCascade) cascadingFailures.push({ culpritId: culprit, victimId: c.id, cause: `${c.name} ${next === 'DOWN' ? 'fails' : 'degrades'} because ${reason}` });
        }
        changed = true;
      }
    }
  }

  // 3. Share of requests that fail from each component, and traffic per component.
  const failure = new Map<string, number>();
  const failShare = (id: string, seen = new Set<string>()): number => {
    if (failure.has(id)) return failure.get(id)!;
    const node = nodeMetrics.get(id)!;
    if (node.status === 'DOWN') return 1;
    if (!isRouter(byId.get(id)) || seen.has(id)) return 0;
    seen.add(id);
    const myDeps = deps.get(id)!;
    const share = myDeps.length ? myDeps.reduce((sum, d) => sum + failShare(d, seen), 0) / myDeps.length : 0;
    failure.set(id, share);
    return share;
  };

  const clients = project.components.filter((c) => c.type === 'CLIENT');
  const entries = clients.length ? clients : project.components.filter((c) => callers.get(c.id)!.length === 0);
  const entryList = entries.length ? entries : project.components.slice(0, 1);
  const perEntry = entryList.length ? baseIncomingRps / entryList.length : 0;

  const traffic = new Map<string, number>(project.components.map((c) => [c.id, 0]));
  const pushTraffic = (id: string, rps: number, path: Set<string>) => {
    if (path.has(id) || rps <= 0) return;
    traffic.set(id, traffic.get(id)! + rps);
    if (nodeMetrics.get(id)!.status === 'DOWN') return;
    const myDeps = deps.get(id)!;
    const next = new Set(path).add(id);
    const share = isRouter(byId.get(id)) && myDeps.length ? rps / myDeps.length : rps;
    myDeps.forEach((d) => pushTraffic(d, share, next));
  };
  entryList.forEach((e) => pushTraffic(e.id, perEntry, new Set()));
  for (const [id, rps] of traffic) {
    const node = nodeMetrics.get(id)!;
    node.trafficRps = Math.round(rps);
    if (node.status !== 'DOWN' && isRouter(byId.get(id))) node.errorRatePercent = Math.round(failShare(id) * 100);
  }

  const droppedRps = Math.round(entryList.reduce((sum, e) => sum + perEntry * failShare(e.id), 0));

  // 4. Edges.
  const edgeMetrics = new Map<string, EdgeTelemetryStatus>();
  for (const r of project.relationships) {
    const from = nodeMetrics.get(r.from);
    const to = nodeMetrics.get(r.to);
    const severed = from?.status === 'DOWN' || to?.status === 'DOWN';
    const degraded = !severed && (from?.status === 'DEGRADED' || to?.status === 'DEGRADED');
    const fromNode = byId.get(r.from);
    const fromDeps = deps.get(r.from)?.length || 1;
    const rps = severed ? 0 : Math.round((traffic.get(r.from) || 0) / (isRouter(fromNode) ? fromDeps : 1));
    edgeMetrics.set(`${r.from}->${r.to}`, {
      from: r.from,
      to: r.to,
      label: r.label,
      trafficRps: rps,
      status: severed ? 'SEVERED' : degraded ? 'DEGRADED' : 'FLOWING',
      latencyMs: to?.activeLatencyMs ?? ASSUMED_HOP_LATENCY_MS,
      particleSpeedSeconds: severed ? 0 : degraded ? 4.8 : 2.0,
      particleDensity: severed ? 0 : degraded ? 1 : 3,
      particleColor: severed ? '#ef4444' : degraded ? '#f59e0b' : '#4ef2d2',
    });
  }

  // 5. Path latency: routers pick one branch, other components wait for all their calls.
  const pathLatency = (id: string, path: Set<string>, pick: 'avg' | 'max'): number | null => {
    const node = nodeMetrics.get(id)!;
    if (node.status === 'DOWN' || path.has(id)) return null;
    const next = new Set(path).add(id);
    const below = deps.get(id)!.map((d) => pathLatency(d, next, pick)).filter((v): v is number => v !== null);
    if (!below.length) return node.activeLatencyMs;
    const tail = isRouter(byId.get(id)) && pick === 'avg' ? below.reduce((a, b) => a + b, 0) / below.length : Math.max(...below);
    return node.activeLatencyMs + tail;
  };
  const avgPaths = entryList.map((e) => pathLatency(e.id, new Set(), 'avg')).filter((v): v is number => v !== null);
  const maxPaths = entryList.map((e) => pathLatency(e.id, new Set(), 'max')).filter((v): v is number => v !== null);

  const downCount = [...nodeMetrics.values()].filter((n) => n.status === 'DOWN').length;
  const degradedCount = [...nodeMetrics.values()].filter((n) => n.status === 'DEGRADED').length;
  const overallSystemHealth: ChaosSimulationResult['overallSystemHealth'] =
    droppedRps >= baseIncomingRps * 0.5 || entryList.every((e) => nodeMetrics.get(e.id)!.status === 'DOWN')
      ? 'CRITICAL_FAILURE'
      : downCount || degradedCount ? 'DEGRADED' : 'OPTIMAL';

  return {
    injectedChaos,
    overallSystemHealth,
    totalRpsThroughput: Math.max(0, Math.round(baseIncomingRps) - droppedRps),
    droppedRps,
    averageLatencyMs: avgPaths.length ? Math.round(avgPaths.reduce((a, b) => a + b, 0) / avgPaths.length) : 0,
    slowestPathMs: maxPaths.length ? Math.round(Math.max(...maxPaths)) : 0,
    nodeMetrics,
    edgeMetrics,
    cascadingFailures,
  };
}
