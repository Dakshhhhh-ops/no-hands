import type { Project, Component, Relationship } from '../types/schema.ts';
import { HistoryTimeline } from './historyManager.ts';
import { deriveRiskFindings } from './analysis.js';
import { getBlastRadius } from './graphTraversal.ts';

export interface ArchitectureBranch {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  parentBranchId?: string;
  baseVersion: number;
  project: Project;
  history: HistoryTimeline;
}

export interface BranchComparisonMetrics {
  id: string;
  name: string;
  componentCount: number;
  relationshipCount: number;
  storageCount: number;
  serviceCount: number;
  estimatedCostPerMonth: number;
  riskCount: number;
  unresolvedCount: number;
  maxBlastRadius: number;
  hasSinglePointOfFailure: boolean;
}

export interface ScenarioComparison {
  branchA: BranchComparisonMetrics;
  branchB: BranchComparisonMetrics;
  costDeltaMonthly: number; // Positive means B is more expensive than A
  riskDelta: number;
  componentChanges: {
    addedInB: Component[];
    removedInB: Component[];
    modifiedInB: Array<{ id: string; before: Component; after: Component }>;
  };
}

/**
 * Creates the "Scenario A: Serverless & DynamoDB" architecture proposal.
 * Focuses on on-demand pay-per-request pricing, managed autoscaling, and NoSQL partitioning.
 */
export function createServerlessBranch(baseProject: Project): ArchitectureBranch {
  const serverlessProject: Project = {
    name: 'Commerce Platform (Serverless & DynamoDB)',
    version: baseProject.version + 1,
    changed: true,
    changes: [
      {
        id: 'CHG-SERVERLESS',
        originalInstruction: 'Fork architecture to Serverless compute with DynamoDB and EventBridge',
        timestamp: Date.now(),
        summary: 'Replaced container services with AWS Lambda, DynamoDB single-table design, and EventBridge.',
        affectedArtifacts: ['components', 'relationships', 'requirements'],
      },
    ],
    components: [
      { id: 'web', name: 'Web & Mobile Apps', type: 'CLIENT', sub: 'Next.js on CloudFront CDN', responsibilities: ['Edge-rendered storefront UI on CloudFront CDN.'], x: 40, y: 150 },
      { id: 'api-gateway', name: 'API Gateway HTTP API', type: 'GATEWAY', sub: 'Serverless HTTP Ingress', responsibilities: ['Direct route routing to serverless Lambda functions.'], x: 220, y: 150 },
      { id: 'auth-fn', name: 'Auth Lambda', type: 'SERVICE', sub: 'Node.js 20 Serverless Function', responsibilities: ['Validates credentials and mints JWT tokens on demand.'], x: 420, y: 50 },
      { id: 'catalog-fn', name: 'Catalog Lambda', type: 'SERVICE', sub: 'Go Serverless Micro-function', responsibilities: ['Serves high-concurrency cached product queries.'], x: 420, y: 150 },
      { id: 'orders-fn', name: 'Orders Lambda', type: 'SERVICE', sub: 'TypeScript Serverless Handler', responsibilities: ['Processes checkout and publishes order events.'], x: 420, y: 250 },
      { id: 'dynamodb', name: 'DynamoDB Global Table', type: 'DATABASE', sub: 'On-Demand Serverless NoSQL', responsibilities: ['Primary multi-region active-active datastore with sub-10ms latency.'], x: 650, y: 100 },
      { id: 'eventbridge', name: 'EventBridge Bus', type: 'QUEUE', sub: 'Serverless Event Router', responsibilities: ['Decoupled serverless pub/sub bus for asynchronous order processing.'], x: 650, y: 250 },
      { id: 'payment', name: 'Stripe API', type: 'EXTERNAL', sub: 'External Payment Gateway', responsibilities: ['Managed external checkout processing.'], x: 840, y: 250 },
    ],
    relationships: [
      { from: 'web', to: 'api-gateway', label: 'HTTPS / TLS 1.3' },
      { from: 'api-gateway', to: 'auth-fn', label: 'invoke login' },
      { from: 'api-gateway', to: 'catalog-fn', label: 'invoke catalog' },
      { from: 'api-gateway', to: 'orders-fn', label: 'invoke checkout' },
      { from: 'auth-fn', to: 'dynamodb', label: 'sessions & users' },
      { from: 'catalog-fn', to: 'dynamodb', label: 'products table' },
      { from: 'orders-fn', to: 'dynamodb', label: 'order records' },
      { from: 'orders-fn', to: 'eventbridge', label: 'order.placed event' },
      { from: 'eventbridge', to: 'payment', label: 'charge card' },
    ],
    requirements: [
      { id: 'REQ-SERVERLESS-SLA', text: 'Serverless execution time must remain under 150ms cold-start' },
      { id: 'REQ-DYNAMO-OWNER', text: 'DynamoDB on-demand capacity with continuous automated backups' },
    ],
    apiOperations: [
      { id: 'api-login', componentId: 'auth-fn', method: 'post', path: '/auth/login', summary: 'Serverless authentication endpoint' },
    ],
    activity: [
      { version: 2, summary: 'Created Serverless & DynamoDB scenario branch', sourceChangeId: 'CHG-SERVERLESS', originalInstruction: 'Branch into Serverless' },
    ],
  };

  return {
    id: 'branch-serverless',
    name: 'Scenario A: Serverless & DynamoDB',
    description: 'Zero idle cost, AWS Lambda execution, DynamoDB global on-demand tables, and EventBridge.',
    createdAt: Date.now(),
    parentBranchId: 'main',
    baseVersion: baseProject.version,
    project: serverlessProject,
    history: new HistoryTimeline(serverlessProject),
  };
}

/**
 * Creates the "Scenario B: Kubernetes & PostgreSQL Read Replicas" architecture proposal.
 * Focuses on high-throughput microservice containers, dedicated connection pooling, and multi-AZ replica resilience.
 */
export function createKubernetesBranch(baseProject: Project): ArchitectureBranch {
  const k8sProject: Project = {
    name: 'Commerce Platform (K8s & PostgreSQL Replicas)',
    version: baseProject.version + 1,
    changed: true,
    changes: [
      {
        id: 'CHG-K8S-REPLICAS',
        originalInstruction: 'Fork architecture to Kubernetes clusters with PostgreSQL Multi-AZ Read Replicas',
        timestamp: Date.now(),
        summary: 'Added Kubernetes pod auto-scaling, PostgreSQL read-replica pool, and Redis Sentinel cluster.',
        affectedArtifacts: ['components', 'relationships', 'requirements'],
      },
    ],
    components: [
      { id: 'web', name: 'Web & Mobile Clients', type: 'CLIENT', sub: 'React SPA on CDN', responsibilities: ['Storefront customer interface.'], x: 40, y: 150 },
      { id: 'gateway', name: 'Envoy Ingress Gateway', type: 'GATEWAY', sub: 'K8s Ingress Controller', responsibilities: ['Terminates TLS, mTLS to pods, and manages rate limiting.'], x: 220, y: 150 },
      { id: 'auth', name: 'Auth Pods (Deployment)', type: 'SERVICE', sub: '3x Replicas · Node.js', responsibilities: ['Stateless JWT verification and token issuance.'], x: 420, y: 50 },
      { id: 'catalog', name: 'Catalog Pods (Deployment)', type: 'SERVICE', sub: '5x Replicas · Go', responsibilities: ['High-volume product search and catalog delivery.'], x: 420, y: 150 },
      { id: 'orders', name: 'Orders Pods (Deployment)', type: 'SERVICE', sub: '3x Replicas · Java Spring', responsibilities: ['Saga orchestration for checkout and payments.'], x: 420, y: 250 },
      { id: 'redis-cluster', name: 'Redis Sentinel Cluster', type: 'CACHE', sub: '3-Node Master/Replica', responsibilities: ['Distributed session cache with automatic failover.'], x: 650, y: 50 },
      { id: 'postgres-primary', name: 'PostgreSQL Primary (Write-Master)', type: 'DATABASE', sub: 'Multi-AZ RDS Primary', responsibilities: ['Authoritative single-writer store for durable transactions.'], x: 650, y: 150 },
      { id: 'postgres-replicas', name: 'PostgreSQL Read Replicas', type: 'DATABASE', sub: '2x Read-Only Pool', responsibilities: ['Offloads product and history read queries from primary.'], x: 650, y: 240 },
      { id: 'kafka', name: 'Apache Kafka Cluster', type: 'QUEUE', sub: '3x Brokers · Zookeeperless', responsibilities: ['Persistent high-throughput event streaming.'], x: 650, y: 330 },
      { id: 'payment', name: 'Payment Provider API', type: 'EXTERNAL', sub: 'PCI-DSS Compliant Gateway', responsibilities: ['External payment processing.'], x: 840, y: 250 },
    ],
    relationships: [
      { from: 'web', to: 'gateway', label: 'HTTPS / TLS 1.3' },
      { from: 'gateway', to: 'auth', label: 'gRPC / login' },
      { from: 'gateway', to: 'catalog', label: 'gRPC / catalog' },
      { from: 'gateway', to: 'orders', label: 'gRPC / checkout' },
      { from: 'auth', to: 'redis-cluster', label: 'sessions' },
      { from: 'auth', to: 'postgres-primary', label: 'write user' },
      { from: 'catalog', to: 'postgres-replicas', label: 'read products' },
      { from: 'orders', to: 'postgres-primary', label: 'write orders' },
      { from: 'orders', to: 'kafka', label: 'publish order event' },
      { from: 'kafka', to: 'payment', label: 'payment event' },
    ],
    requirements: [
      { id: 'REQ-REPLICA-FAILOVER', text: 'PostgreSQL automated failover within 30 seconds of primary failure' },
      { id: 'REQ-K8S-HPA', text: 'Horizontal Pod Autoscaler triggers when CPU exceeds 70%' },
    ],
    apiOperations: [
      { id: 'api-login', componentId: 'auth', method: 'post', path: '/auth/login', summary: 'Envoy-routed auth endpoint' },
    ],
    activity: [
      { version: 2, summary: 'Created Kubernetes & Replicas scenario branch', sourceChangeId: 'CHG-K8S-REPLICAS', originalInstruction: 'Branch into Kubernetes' },
    ],
  };

  return {
    id: 'branch-k8s-postgres',
    name: 'Scenario B: Kubernetes & PostgreSQL Replicas',
    description: 'High-throughput container pods, Envoy mesh, PostgreSQL primary + 2 read replicas, and Redis Sentinel.',
    createdAt: Date.now(),
    parentBranchId: 'main',
    baseVersion: baseProject.version,
    project: k8sProject,
    history: new HistoryTimeline(k8sProject),
  };
}

/**
 * Calculates accurate architectural and cost metrics for a branch.
 */
export function calculateBranchMetrics(project: Project): BranchComparisonMetrics {
  const components = project.components;
  const storageNodes = components.filter((c) => ['DATABASE', 'CACHE', 'QUEUE'].includes(c.type));
  const serviceNodes = components.filter((c) => c.type === 'SERVICE');
  const risks = deriveRiskFindings(project);
  const unresolved = risks.filter((r) => r.kind === 'Unresolved decision').length;

  // Single Point of Failure (SPOF) check:
  // True if only 1 database component exists without replica modeling
  const databaseNodes = components.filter((c) => c.type === 'DATABASE');
  const hasSinglePointOfFailure = databaseNodes.length === 1 && !project.components.some((c) => /replica/i.test(c.id) || /dynamo/i.test(c.id));

  // Max blast radius across all components
  let maxBlastRadius = 0;
  for (const comp of components) {
    const blast = getBlastRadius(components, project.relationships, comp.id);
    if (blast.totalImpactCount > maxBlastRadius) {
      maxBlastRadius = blast.totalImpactCount;
    }
  }

  // Cost Estimation Model ($ / month):
  // Serverless/Lambda: base $25 + $20/fn + $40/DynamoDB on-demand = ~$180
  // Kubernetes: 3 EKS nodes ($140/node) + Managed RDS Primary ($120) + 2x Replicas ($160) = ~$650
  let estimatedCost = 60; // base cloud networking / domain / monitoring
  for (const comp of components) {
    if (comp.type === 'CLIENT') estimatedCost += 15; // CDN egress
    else if (comp.type === 'GATEWAY') estimatedCost += 35; // ALB / Gateway
    else if (comp.type === 'SERVICE') {
      estimatedCost += comp.sub.includes('Lambda') || comp.sub.includes('Serverless') ? 25 : 65; // pod vs function
    } else if (comp.type === 'DATABASE') {
      estimatedCost += comp.sub.includes('NoSQL') || comp.sub.includes('Dynamo') ? 50 : 120; // DynamoDB vs RDS Multi-AZ
    } else if (comp.type === 'CACHE') {
      estimatedCost += comp.sub.includes('Sentinel') || comp.sub.includes('Cluster') ? 80 : 35;
    } else if (comp.type === 'QUEUE') {
      estimatedCost += comp.sub.includes('Kafka') ? 110 : 30;
    }
  }

  return {
    id: project.name,
    name: project.name,
    componentCount: components.length,
    relationshipCount: project.relationships.length,
    storageCount: storageNodes.length,
    serviceCount: serviceNodes.length,
    estimatedCostPerMonth: Math.round(estimatedCost),
    riskCount: risks.length,
    unresolvedCount: unresolved,
    maxBlastRadius,
    hasSinglePointOfFailure,
  };
}

/**
 * Performs a deep side-by-side comparative analysis between two architecture branches.
 */
export function compareBranches(
  branchA: ArchitectureBranch,
  branchB: ArchitectureBranch
): ScenarioComparison {
  const metricsA = calculateBranchMetrics(branchA.project);
  const metricsB = calculateBranchMetrics(branchB.project);

  const compMapA = new Map(branchA.project.components.map((c) => [c.id, c]));
  const compMapB = new Map(branchB.project.components.map((c) => [c.id, c]));

  const addedInB: Component[] = [];
  const removedInB: Component[] = [];
  const modifiedInB: Array<{ id: string; before: Component; after: Component }> = [];

  for (const [id, compB] of compMapB.entries()) {
    if (!compMapA.has(id)) {
      addedInB.push(compB);
    } else {
      const compA = compMapA.get(id)!;
      if (compA.type !== compB.type || compA.sub !== compB.sub || compA.name !== compB.name) {
        modifiedInB.push({ id, before: compA, after: compB });
      }
    }
  }

  for (const [id, compA] of compMapA.entries()) {
    if (!compMapB.has(id)) {
      removedInB.push(compA);
    }
  }

  return {
    branchA: metricsA,
    branchB: metricsB,
    costDeltaMonthly: metricsB.estimatedCostPerMonth - metricsA.estimatedCostPerMonth,
    riskDelta: metricsB.riskCount - metricsA.riskCount,
    componentChanges: {
      addedInB,
      removedInB,
      modifiedInB,
    },
  };
}

