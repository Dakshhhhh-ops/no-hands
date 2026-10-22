import { parse } from 'yaml';
import { validateProject } from '../types/schema.ts';
import type { Component, ComponentType, Project, Relationship } from '../types/schema.ts';
import { toComponentId } from './applyOperations.ts';

/**
 * Builds a starting architecture model from a docker-compose file, so the
 * workspace begins from a real system instead of a hand-drawn sample.
 *
 * Edges come from evidence only: `depends_on`, `links`, and environment values
 * that name another service (for example DATABASE_URL=postgres://db:5432/app).
 * Nothing is invented; every component records where it came from.
 */

export class ComposeImportError extends Error {}

const TYPE_RULES: Array<[ComponentType, RegExp]> = [
  ['DATABASE', /\b(postgres(ql)?|postgis|mysql|mariadb|mongo(db)?|cockroach(db)?|cassandra|scylla|couchdb|dynamodb|elasticsearch|opensearch|clickhouse|timescale(db)?|influxdb|neo4j|minio|sqlserver|mssql|supabase\/postgres)\b/],
  ['CACHE', /\b(redis|valkey|memcached|keydb|dragonfly(db)?|varnish)\b/],
  ['QUEUE', /\b(kafka|redpanda|rabbitmq|nats|activemq|pulsar|zookeeper|sqs|localstack|mosquitto|emqx)\b/],
  ['GATEWAY', /\b(nginx|traefik|envoy|kong|haproxy|caddy|gateway|ingress|proxy|apisix|tyk)\b/],
  // Explicit backend words win over client heuristics such as the "-app" suffix.
  ['SERVICE', /\b(api|server|backend|worker|svc|service)\b/],
  ['CLIENT', /\b(frontend|front-end|[a-z]+-app|webapp|webui|ui|client|dashboard|storefront|next|nuxt|vite|react|angular|vue|svelte)\b/],
  ['EXTERNAL', /\b(mailhog|mailpit|smtp|stripe-mock|wiremock|prism)\b/],
];

const SUB_BY_TYPE: Record<ComponentType, string> = {
  CLIENT: 'Client application',
  GATEWAY: 'Routing · ingress',
  SERVICE: 'Application service',
  CACHE: 'Cache',
  DATABASE: 'Data store',
  QUEUE: 'Messaging',
  EXTERNAL: 'External or stub dependency',
};

const LABEL_BY_TARGET: Record<ComponentType, string> = {
  CLIENT: 'calls',
  GATEWAY: 'routes through',
  SERVICE: 'calls',
  CACHE: 'cache',
  DATABASE: 'reads/writes',
  QUEUE: 'publishes/consumes',
  EXTERNAL: 'integrates',
};

interface ComposeService {
  image?: unknown;
  build?: unknown;
  depends_on?: unknown;
  links?: unknown;
  environment?: unknown;
  ports?: unknown;
  command?: unknown;
}

function inferType(name: string, image: string): ComponentType {
  const haystack = `${name} ${image}`.toLowerCase().replace(/[_/:.]/g, ' ');
  for (const [type, pattern] of TYPE_RULES) {
    if (pattern.test(haystack)) return type;
  }
  return 'SERVICE';
}

function imageName(service: ComposeService): string {
  if (typeof service.image === 'string') return resolveComposeDefaults(service.image);
  if (typeof service.build === 'string') return `build: ${service.build}`;
  if (service.build && typeof service.build === 'object') {
    const context = (service.build as { context?: unknown }).context;
    if (typeof context === 'string') return `build: ${context}`;
  }
  return '';
}

function dependencyNames(service: ComposeService): string[] {
  const out: string[] = [];
  const dependsOn = service.depends_on;
  if (Array.isArray(dependsOn)) out.push(...dependsOn.map(String));
  else if (dependsOn && typeof dependsOn === 'object') out.push(...Object.keys(dependsOn));
  if (Array.isArray(service.links)) out.push(...service.links.map((link) => String(link).split(':')[0] ?? ''));
  return out;
}

function environmentValues(service: ComposeService): string[] {
  const env = service.environment;
  if (Array.isArray(env)) return env.map((entry) => String(entry).split('=').slice(1).join('='));
  if (env && typeof env === 'object') return Object.values(env).map((value) => String(value ?? ''));
  return [];
}

/**
 * Resolve Compose variable interpolation the way `docker compose` does without an
 * .env file: `${VAR:-default}` and `${VAR-default}` become the default, and a bare
 * `${VAR}` or `$VAR` stays visible as `$VAR` instead of being cut in half.
 */
export function resolveComposeDefaults(text: string): string {
  return text
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}/g, (_match, name: string, fallback?: string) => (fallback !== undefined ? fallback : `$${name}`))
    .replace(/\$\$/g, '$');
}

/** The published (host) port of a short-syntax mapping: "8000", "8000:80", "127.0.0.1:8000:80", "8000:80/tcp". */
function publishedPort(mapping: string): string {
  const parts = resolveComposeDefaults(mapping).replace(/\/(tcp|udp)$/i, '').split(':');
  // split always returns at least one part, so the fallback is never used.
  return (parts.length >= 2 ? parts[parts.length - 2] : parts[0]) ?? '';
}

function portSummary(service: ComposeService): string {
  if (!Array.isArray(service.ports) || !service.ports.length) return '';
  const first = service.ports[0];
  const text = typeof first === 'object' && first !== null
    ? resolveComposeDefaults(String((first as { published?: unknown; target?: unknown }).published ?? (first as { target?: unknown }).target ?? ''))
    : publishedPort(String(first));
  return text ? `port ${text}` : '';
}

export function projectFromCompose(source: string, fileName = 'docker-compose.yml'): Project {
  let doc: unknown;
  try {
    doc = parse(source);
  } catch (error) {
    throw new ComposeImportError(`This file is not valid YAML: ${(error as Error).message.split('\n')[0]}`);
  }
  const services = (doc as { services?: unknown })?.services;
  if (!services || typeof services !== 'object' || Array.isArray(services) || !Object.keys(services).length) {
    throw new ComposeImportError('No services were found. Choose a docker-compose file with a top-level "services" section.');
  }

  const entries = Object.entries(services as Record<string, ComposeService>);
  const idByName = new Map(entries.map(([name]) => [name, toComponentId(name) || 'service']));
  const typeById = new Map<string, ComponentType>();

  const components: Component[] = entries.map(([name, rawService]) => {
    const service = rawService || {};
    const id = idByName.get(name)!;
    const image = imageName(service);
    const type = inferType(name, image);
    typeById.set(id, type);
    const port = portSummary(service);
    return {
      id,
      name,
      type,
      sub: [image || SUB_BY_TYPE[type], port].filter(Boolean).join(' · '),
      responsibilities: [`Defined as the "${name}" service in ${fileName}${image ? ` (${image})` : ''}.`],
      x: 0,
      y: 0,
      origin: 'code',
    };
  });

  const relationships: Relationship[] = [];
  const addEdge = (from: string, to: string) => {
    if (from === to || relationships.some((r) => r.from === from && r.to === to)) return;
    const label = LABEL_BY_TARGET[typeById.get(to) || 'SERVICE'];
    relationships.push({ from, to, label, origin: 'code' });
  };

  for (const [name, rawService] of entries) {
    const service = rawService || {};
    const from = idByName.get(name)!;
    for (const dependency of dependencyNames(service)) {
      const to = idByName.get(dependency);
      if (to) addEdge(from, to);
    }
    for (const value of environmentValues(service)) {
      for (const [otherName, to] of idByName) {
        if (otherName === name) continue;
        const escaped = otherName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(^|[/@:=,\\s])${escaped}(:\\d+|[/\\s,]|$)`).test(value)) addEdge(from, to);
      }
    }
  }

  const composeName = (doc as { name?: unknown }).name;
  const project = {
    name: typeof composeName === 'string' && composeName.trim() ? composeName.trim() : `Imported from ${fileName}`,
    version: 1,
    changed: false,
    changes: [],
    components,
    relationships,
    apiOperations: [],
    requirements: [],
    activity: [],
  } as Project;
  project.baseline = structuredClone({
    name: project.name,
    version: project.version,
    components: project.components,
    relationships: project.relationships,
    apiOperations: project.apiOperations,
    requirements: project.requirements,
  });
  return validateProject(project);
}
