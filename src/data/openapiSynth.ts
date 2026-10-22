import type { Project } from '../types/schema.ts';
import { cacheChoicesFor, cacheRequirement, findCaches, findPublicEntry, isAuthOperation, rateLimitApplies, rateLimitRequirement } from './modelFacts.ts';

export interface SchemaDriftItem {
  id: string;
  requirementId: string;
  requirementText: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  expectedInContract: string;
  actualStatus: 'MISSING' | 'PARTIAL' | 'SATISFIED';
  remediationAdvice: string;
}

export interface DriftReport {
  timestamp: number;
  totalDrifts: number;
  criticalCount: number;
  warningCount: number;
  drifts: SchemaDriftItem[];
  isFullyCompliant: boolean;
}

type OpenApiPathItem = {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
  options?: OpenApiOperation;
  head?: OpenApiOperation;
  trace?: OpenApiOperation;
};

type OpenApiOperation = {
  operationId: string;
  tags: string[];
  summary: string;
  description?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  [key: string]: unknown;
};

type OpenApiParameter = {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema: OpenApiSchema;
};

type OpenApiRequestBody = {
  required: boolean;
  content: Record<string, { schema: OpenApiSchema }>;
};

type OpenApiResponse = {
  description: string;
  content?: Record<string, { schema: OpenApiSchema }>;
  headers?: Record<string, OpenApiHeader>;
};

type OpenApiHeader = {
  schema: OpenApiSchema;
  description?: string;
};

type OpenApiSchema = {
  type?: string;
  format?: string;
  enum?: string[];
  minimum?: number;
  minLength?: number;
  description?: string;
  default?: string | number;
  required?: string[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  $ref?: string;
  additionalProperties?: boolean;
};

/**
 * Multi-service OpenAPI 3.1 document derived only from the model's API
 * operations. Paths, owners, and responses come from the model; request and
 * response fields are left open because the model does not define them.
 */
export function generateMultiServiceOpenApi(project: Project) {
  const rateLimitReq = rateLimitRequirement(project);
  const paths: Record<string, OpenApiPathItem> = {};

  for (const operation of project.apiOperations) {
    const component = project.components.find((item) => item.id === operation.componentId);
    if (!component) continue;
    const auth = isAuthOperation(operation, component);
    const responses: Record<string, OpenApiResponse> = {
      '200': {
        description: auth
          ? `Authentication succeeded at ${component.name}. Response fields are not specified in the model.`
          : `Successful response from ${component.name}. Payload fields remain unspecified unless modeled.`,
      },
      '500': { description: 'Unexpected service error.' },
    };
    if (rateLimitApplies(rateLimitReq, operation, component)) {
      responses['429'] = {
        description: rateLimitReq.resolution
          ? `Rate limit exceeded. Recorded choice: ${rateLimitReq.resolution}.`
          : 'Rate limit exceeded; threshold and window remain unresolved.',
        headers: {
          'X-RateLimit-Limit': { schema: { type: 'integer' }, description: rateLimitReq.resolution || 'Limit value remains unresolved.' },
          'X-RateLimit-Remaining': { schema: { type: 'integer' }, description: 'Requests remaining in the active window.' },
          'Retry-After': { schema: { type: 'integer' }, description: 'Seconds before retry; window remains model-defined.' },
        },
      };
    }
    const cacheChoices = cacheChoicesFor(project, component.id);
    paths[operation.path] = {
      ...(paths[operation.path] || {}),
      [operation.method]: {
        operationId: operation.id,
        tags: [component.name],
        summary: operation.summary,
        description: `Derived from the ${component.name} API operation in the current architecture model.`,
        ...(operation.method === 'get' || operation.method === 'delete' ? {} : {
          requestBody: {
            required: true,
            description: 'Request fields are not specified in the model.',
            content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
          },
        }),
        responses,
        ...(Object.keys(cacheChoices).length ? { 'x-voicearchitect-cache-outage-choices': cacheChoices } : {}),
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: `${project.name} Multi-Service API Specification`,
      version: `${project.version}.0.0`,
      description: 'Generated from the current project API operations. Unspecified request and response fields are not inferred.',
    },
    servers: [{ url: `https://api.${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.local/v1`, description: 'Placeholder server; the model does not record a deployment URL.' }],
    paths,
    components: { schemas: { ErrorResponse: { type: 'object', properties: { error: { type: 'string' } } } } },
  };
}

/**
 * Compares the model's requirements with what the contract can express. Every
 * check is driven by the loaded model's own requirements, caches, and entry point.
 */
export function detectContractDrift(project: Project): DriftReport {
  const drifts: SchemaDriftItem[] = [];

  const rateLimitReq = rateLimitRequirement(project);
  const entry = findPublicEntry(project);
  if (rateLimitReq) {
    if (!rateLimitReq.resolution) {
      drifts.push({
        id: 'drift-rate-limit-headers',
        requirementId: rateLimitReq.id,
        requirementText: rateLimitReq.text,
        severity: 'WARNING',
        expectedInContract: 'Explicit X-RateLimit-Limit numeric integer header',
        actualStatus: 'PARTIAL',
        remediationAdvice: 'Record the exact request threshold and time window for the requirement.',
      });
    }
  } else if (entry) {
    drifts.push({
      id: 'drift-rate-limit-missing',
      requirementId: 'REQ-GAP-RATELIMIT',
      requirementText: `No rate-limiting requirement covers ${entry.name}`,
      severity: 'CRITICAL',
      expectedInContract: 'HTTP 429 Too Many Requests response with a Retry-After header',
      actualStatus: 'MISSING',
      remediationAdvice: `Add a rate-limit requirement for traffic entering through ${entry.name}.`,
    });
  }

  for (const cache of findCaches(project)) {
    const requirement = cacheRequirement(project, cache);
    if (requirement && !requirement.resolution) {
      drifts.push({
        id: `drift-${cache.id}-fallback`,
        requirementId: requirement.id,
        requirementText: requirement.text,
        severity: 'WARNING',
        expectedInContract: 'HTTP 503 or degraded-response behavior when the cache is unavailable',
        actualStatus: 'PARTIAL',
        remediationAdvice: `Choose fail-open or fail-closed behavior for a ${cache.name} outage.`,
      });
    }
  }

  const criticalCount = drifts.filter((d) => d.severity === 'CRITICAL').length;
  const warningCount = drifts.filter((d) => d.severity === 'WARNING').length;
  return {
    timestamp: Date.now(),
    totalDrifts: drifts.length,
    criticalCount,
    warningCount,
    drifts,
    isFullyCompliant: criticalCount === 0 && warningCount === 0,
  };
}
