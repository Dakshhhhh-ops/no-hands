import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Document, Pair, Scalar, YAMLMap } from 'yaml';
import type { Component, ComponentType, Project } from '../types/schema.ts';
import { projectFromCompose } from './composeImport.ts';
import { toComponentId } from './applyOperations.ts';

/**
 * Writes an applied change back into the user's own docker-compose file.
 *
 * The file is edited through the `yaml` Document API, so comments, key order, and
 * flow or block style survive; only the lines that change are touched.
 *
 *   cache, database, or queue added in the diagram -> a new service with a pinned image
 *   a connection to a data store or queue          -> depends_on plus a connection-string env var
 *   a connection between two existing services     -> depends_on
 *   a service removed from the diagram             -> the service and every reference to it
 *   a connection removed from the diagram          -> its depends_on and links entries
 *
 * Application services, gateways, clients, and external systems that exist only in the
 * diagram are not written: their image or build context is something only a person
 * can name. They stay planned, exactly as the drift check reports them.
 *
 * Pure: no DOM, no network. The caller shows `diff` and `removed` before any download.
 */

export class ComposePatchError extends Error {}

export interface ComposePatch {
  fileName: string;
  /** The updated file. Equal to the input when nothing needs writing. */
  text: string;
  /** Unified diff from the imported file to `text`; empty when unchanged. */
  diff: string;
  changed: boolean;
  added: Array<{ service: string; image: string }>;
  /** Services deleted from the file because they were removed from the diagram. */
  removed: string[];
  connected: Array<{ from: string; to: string; env?: string }>;
  disconnected: Array<{ from: string; to: string }>;
  /** Components in the diagram that the file cannot hold yet. */
  notWritten: Array<{ id: string; name: string; type: ComponentType }>;
  /** What the patch left alone on purpose and a person should check. */
  warnings: string[];
}

/** A known data store or broker: a pinned image, how others reach it, and what it needs to start. */
interface Flavor {
  image: string;
  envName: string;
  url: (host: string) => string;
  serviceEnv?: Record<string, string>;
}

const FLAVORS: Array<{ match: RegExp; flavor: Flavor }> = [
  { match: /\bvalkey\b/, flavor: { image: 'valkey/valkey:8.0-alpine', envName: 'REDIS_URL', url: (h) => `redis://${h}:6379` } },
  { match: /\b(redis|keydb|dragonfly)/, flavor: { image: 'redis:7.4-alpine', envName: 'REDIS_URL', url: (h) => `redis://${h}:6379` } },
  { match: /\bmemcached?\b/, flavor: { image: 'memcached:1.6-alpine', envName: 'MEMCACHED_SERVERS', url: (h) => `${h}:11211` } },
  {
    match: /\bmariadb\b/,
    flavor: {
      image: 'mariadb:11.4', envName: 'DATABASE_URL', url: (h) => `mysql://app:\${MARIADB_PASSWORD}@${h}:3306/app`,
      serviceEnv: { MARIADB_DATABASE: 'app', MARIADB_USER: 'app', MARIADB_PASSWORD: '${MARIADB_PASSWORD:?Set MARIADB_PASSWORD in .env}', MARIADB_RANDOM_ROOT_PASSWORD: 'yes' },
    },
  },
  {
    match: /\bmysql\b/,
    flavor: {
      image: 'mysql:8.4', envName: 'DATABASE_URL', url: (h) => `mysql://app:\${MYSQL_PASSWORD}@${h}:3306/app`,
      serviceEnv: { MYSQL_DATABASE: 'app', MYSQL_USER: 'app', MYSQL_PASSWORD: '${MYSQL_PASSWORD:?Set MYSQL_PASSWORD in .env}', MYSQL_RANDOM_ROOT_PASSWORD: 'yes' },
    },
  },
  { match: /\bmongo(db)?\b/, flavor: { image: 'mongo:8.0', envName: 'MONGODB_URI', url: (h) => `mongodb://${h}:27017/app` } },
  {
    match: /\b(elasticsearch|elastic|opensearch)\b/,
    flavor: { image: 'elasticsearch:8.15.3', envName: 'ELASTICSEARCH_URL', url: (h) => `http://${h}:9200`, serviceEnv: { 'discovery.type': 'single-node' } },
  },
  { match: /\b(kafka|redpanda)\b/, flavor: { image: 'apache/kafka:3.9.0', envName: 'KAFKA_BROKERS', url: (h) => `${h}:9092` } },
  { match: /\brabbit(mq)?\b/, flavor: { image: 'rabbitmq:4.0-alpine', envName: 'AMQP_URL', url: (h) => `amqp://${h}:5672` } },
  { match: /\bnats\b/, flavor: { image: 'nats:2.10-alpine', envName: 'NATS_URL', url: (h) => `nats://${h}:4222` } },
  {
    match: /\b(postgres(ql)?|postgis|pg|timescale(db)?)\b/,
    flavor: {
      image: 'postgres:17-alpine', envName: 'DATABASE_URL', url: (h) => `postgres://app:\${POSTGRES_PASSWORD}@${h}:5432/app`,
      serviceEnv: { POSTGRES_USER: 'app', POSTGRES_DB: 'app', POSTGRES_PASSWORD: '${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}' },
    },
  },
];

const INFRA: ReadonlySet<ComponentType> = new Set(['CACHE', 'DATABASE', 'QUEUE']);
/** What an unnamed cache, database, or queue becomes. */
const DEFAULT_TECH: Partial<Record<ComponentType, string>> = { CACHE: 'redis', DATABASE: 'postgres', QUEUE: 'rabbitmq' };

function flavorFor(text: string): Flavor | null {
  const haystack = text.toLowerCase().replace(/[_/:.]/g, ' ');
  return FLAVORS.find((f) => f.match.test(haystack))?.flavor ?? null;
}

/** The flavor of a data store, queue, or cache added in the diagram: from its name and description, else by type. */
export function flavorForComponent(component: Pick<Component, 'id' | 'name' | 'sub' | 'type'>): Flavor | null {
  if (!INFRA.has(component.type)) return null;
  return flavorFor(`${component.name} ${component.sub} ${component.id}`) ?? flavorFor(DEFAULT_TECH[component.type] ?? '');
}

const envNameFor = (service: string) => `${service.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')}_URL`;
const mentions = (value: string, host: string) => {
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[/@:=,\\s])${escaped}(:\\d+|[/\\s,]|$)`).test(value);
};

function scalarText(node: unknown): string {
  if (isScalar(node)) return String(node.value ?? '');
  return typeof node === 'string' ? node : '';
}

/** Block sequences in this file are indented under their key (the default) or flush with it. */
function sequencesIndented(source: string): boolean {
  const match = /^([ \t]*)[^\s#][^\n]*:[ \t]*(?:#[^\n]*)?\r?\n(?:[ \t]*#[^\n]*\r?\n)*([ \t]*)- /m.exec(source);
  return match ? (match[2] ?? '').length > (match[1] ?? '').length : true;
}

/**
 * The yaml library writes one space before an inline comment. Lines that differ from the
 * original only in that spacing get the original back, so the diff shows real changes only.
 */
function keepCommentSpacing(source: string, written: string): string {
  const squeeze = (line: string) => line.replace(/[ \t]+#/, ' #').trimEnd();
  const originals = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    if (line.includes('#')) originals.set(squeeze(line), line);
  }
  return written.split('\n').map((line) => (line.includes('#') ? originals.get(squeeze(line)) ?? line : line)).join('\n');
}

interface Context {
  doc: Document;
  services: YAMLMap;
}

function serviceNode(ctx: Context, name: string): YAMLMap | null {
  const node = ctx.services.get(name, true);
  return isMap(node) ? node : null;
}

function environmentValues(service: YAMLMap): Array<{ key: string; value: string }> {
  const env = service.get('environment', true);
  if (isMap(env)) return env.items.map((pair) => ({ key: scalarText(pair.key), value: scalarText(pair.value) }));
  if (isSeq(env)) {
    return env.items.map((item) => {
      const [key = '', ...rest] = scalarText(item).split('=');
      return { key, value: rest.join('=') };
    });
  }
  return [];
}

function addEnvironment(ctx: Context, service: YAMLMap, key: string, value: string) {
  const env = service.get('environment', true);
  if (isSeq(env)) env.add(ctx.doc.createNode(`${key}=${value}`));
  else if (isMap(env)) env.set(key, value);
  else service.set('environment', ctx.doc.createNode({ [key]: value }));
}

function dependsOnNames(service: YAMLMap): string[] {
  const deps = service.get('depends_on', true);
  if (isSeq(deps)) return deps.items.map(scalarText);
  if (isMap(deps)) return deps.items.map((pair) => scalarText(pair.key));
  return [];
}

function addDependsOn(ctx: Context, service: YAMLMap, target: string) {
  if (dependsOnNames(service).includes(target)) return;
  const deps = service.get('depends_on', true);
  if (isSeq(deps)) deps.add(ctx.doc.createNode(target));
  else if (isMap(deps)) deps.set(target, ctx.doc.createNode({ condition: 'service_started' }));
  else service.set('depends_on', ctx.doc.createNode([target]));
}

/** Drops `target` from depends_on and links; returns true when anything was removed. */
function removeReferences(service: YAMLMap, target: string): boolean {
  let removed = false;
  const deps = service.get('depends_on', true);
  if (isSeq(deps)) {
    const before = deps.items.length;
    deps.items = deps.items.filter((item) => scalarText(item) !== target);
    removed ||= deps.items.length !== before;
    if (!deps.items.length) service.delete('depends_on');
  } else if (isMap(deps)) {
    removed = deps.delete(target) || removed;
    if (!deps.items.length) service.delete('depends_on');
  }
  const links = service.get('links', true);
  if (isSeq(links)) {
    const before = links.items.length;
    links.items = links.items.filter((item) => scalarText(item).split(':')[0] !== target);
    removed ||= links.items.length !== before;
    if (!links.items.length) service.delete('links');
  }
  return removed;
}

export function patchCompose(source: string, project: Project, fileName = 'docker-compose.yml'): ComposePatch {
  const doc = parseDocument(source);
  if (doc.errors.length) throw new ComposePatchError(`The imported file is not valid YAML: ${doc.errors[0]?.message.split('\n')[0] ?? 'parse error'}`);
  const servicesNode = doc.get('services', true);
  if (!isMap(servicesNode)) throw new ComposePatchError('The imported file has no "services" section to update.');
  const ctx: Context = { doc, services: servicesNode };

  // Code as it is now: the services and the connections the importer finds in it.
  const code = projectFromCompose(source, fileName);
  const serviceNames = servicesNode.items.map((pair) => scalarText(pair.key)).filter(Boolean);
  const serviceById = new Map(serviceNames.map((name) => [toComponentId(name) || 'service', name]));
  const modelById = new Map(project.components.map((c) => [c.id, c]));
  const codeEdges = new Set(code.relationships.map((r) => `${r.from}>${r.to}`));
  const hasEdge = (edges: Set<string>, a: string, b: string) => edges.has(`${a}>${b}`) || edges.has(`${b}>${a}`);
  const warnings: string[] = [];

  // Services removed from the diagram leave the file, with every reference to them.
  const removed: string[] = [];
  for (const [id, name] of serviceById) {
    if (modelById.has(id)) continue;
    servicesNode.delete(name);
    serviceById.delete(id);
    removed.push(name);
  }
  for (const gone of removed) {
    for (const name of serviceById.values()) {
      const service = serviceNode(ctx, name);
      if (!service) continue;
      removeReferences(service, gone);
      const stale = environmentValues(service).filter((entry) => mentions(entry.value, gone));
      for (const entry of stale) warnings.push(`${name} still names the removed ${gone} in ${entry.key}. Remove it by hand if nothing else uses it.`);
    }
  }

  // Caches, databases, and queues added in the diagram become services with a pinned image.
  const added: ComposePatch['added'] = [];
  const notWritten: ComposePatch['notWritten'] = [];
  const indentSeq = sequencesIndented(source);
  for (const component of project.components) {
    if (serviceById.has(component.id)) continue;
    const flavor = flavorForComponent(component);
    if (!flavor) {
      notWritten.push({ id: component.id, name: component.name, type: component.type });
      continue;
    }
    const value = doc.createNode({ image: flavor.image, ...(flavor.serviceEnv ? { environment: flavor.serviceEnv } : {}) });
    const key = doc.createNode(component.id) as Scalar;
    key.spaceBefore = true;
    key.commentBefore = ` ${component.name}: added in VoiceArchitect (${component.type.toLowerCase()})`;
    servicesNode.items.push(doc.createPair(key, value) as Pair<unknown, unknown>);
    serviceById.set(component.id, component.id);
    added.push({ service: component.id, image: flavor.image });
  }

  // New connections between services in the file: depends_on on the side that needs the
  // other, plus a connection string when the other side is a data store or queue.
  const connected: ComposePatch['connected'] = [];
  const typeOf = (id: string) => modelById.get(id)?.type;
  const imageOf = (name: string) => scalarText(serviceNode(ctx, name)?.get('image', true));
  for (const rel of project.relationships) {
    const fromName = serviceById.get(rel.from);
    const toName = serviceById.get(rel.to);
    if (!fromName || !toName || fromName === toName || hasEdge(codeEdges, rel.from, rel.to)) continue;
    const fromInfra = INFRA.has(typeOf(rel.from) ?? 'SERVICE');
    const toInfra = INFRA.has(typeOf(rel.to) ?? 'SERVICE');
    // A consumer depends on its queue: queue -> consumer is written on the consumer.
    const [dependent, dependency, dependencyId] = fromInfra && !toInfra ? [toName, fromName, rel.from] : [fromName, toName, rel.to];
    const service = serviceNode(ctx, dependent);
    if (!service || connected.some((c) => c.from === dependent && c.to === dependency)) continue;
    addDependsOn(ctx, service, dependency);
    let env: string | undefined;
    const dependencyComponent = modelById.get(dependencyId);
    const flavor = dependencyComponent && INFRA.has(dependencyComponent.type)
      ? flavorFor(imageOf(dependency)) ?? flavorForComponent(dependencyComponent)
      : null;
    const existing = environmentValues(service);
    if (flavor && !existing.some((entry) => mentions(entry.value, dependency))) {
      env = existing.some((entry) => entry.key === flavor.envName) ? envNameFor(dependency) : flavor.envName;
      addEnvironment(ctx, service, env, flavor.url(dependency));
    }
    connected.push({ from: dependent, to: dependency, ...(env ? { env } : {}) });
  }

  // Connections removed from the diagram lose their depends_on and links entries.
  const modelEdges = new Set(project.relationships.map((r) => `${r.from}>${r.to}`));
  const disconnected: ComposePatch['disconnected'] = [];
  for (const rel of code.relationships) {
    const fromName = serviceById.get(rel.from);
    const toName = serviceById.get(rel.to);
    if (!fromName || !toName || hasEdge(modelEdges, rel.from, rel.to)) continue;
    const service = serviceNode(ctx, fromName);
    if (!service) continue;
    if (removeReferences(service, toName)) disconnected.push({ from: fromName, to: toName });
    for (const entry of environmentValues(service).filter((e) => mentions(e.value, toName))) {
      warnings.push(`${fromName} still names ${toName} in ${entry.key}, so the connection is still in code. Remove it by hand to finish disconnecting them.`);
    }
  }

  const changed = Boolean(added.length || removed.length || connected.length || disconnected.length);
  const written = keepCommentSpacing(source, doc.toString({ lineWidth: 0, flowCollectionPadding: false, indentSeq }));
  // Keep Windows line endings when the file has them.
  const text = !changed ? source : source.includes('\r\n') ? written.replace(/\r?\n/g, '\r\n') : written;
  return {
    fileName,
    text,
    diff: changed ? unifiedDiff(source, text, `a/${fileName}`, `b/${fileName}`) : '',
    changed,
    added,
    removed,
    connected,
    disconnected,
    notWritten,
    warnings,
  };
}

/* ---------- unified diff ---------- */

type Op = { kind: ' ' | '-' | '+'; line: string; a: number; b: number };

const lines = (text: string) => {
  const out = text.replace(/\r\n/g, '\n').split('\n');
  if (out.length && out[out.length - 1] === '') out.pop();
  return out;
};

/** Line operations from `a` to `b`: common prefix and suffix, then a longest-common-subsequence middle. */
function diffOps(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }

  const n = endA - start;
  const m = endB - start;
  // lcs[i * (m + 1) + j] = LCS length of a[start+i..endA) and b[start+j..endB).
  const lcs = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * (m + 1) + j] = a[start + i] === b[start + j]
        ? (lcs[(i + 1) * (m + 1) + j + 1] ?? 0) + 1
        : Math.max(lcs[(i + 1) * (m + 1) + j] ?? 0, lcs[i * (m + 1) + j + 1] ?? 0);
    }
  }

  const ops: Op[] = [];
  for (let k = 0; k < start; k += 1) ops.push({ kind: ' ', line: a[k] ?? '', a: k, b: k });
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      ops.push({ kind: ' ', line: a[start + i] ?? '', a: start + i, b: start + j });
      i += 1; j += 1;
    } else if (j >= m || (i < n && (lcs[(i + 1) * (m + 1) + j] ?? 0) >= (lcs[i * (m + 1) + j + 1] ?? 0))) {
      ops.push({ kind: '-', line: a[start + i] ?? '', a: start + i, b: start + j });
      i += 1;
    } else {
      ops.push({ kind: '+', line: b[start + j] ?? '', a: start + i, b: start + j });
      j += 1;
    }
  }
  for (let k = 0; k < a.length - endA; k += 1) ops.push({ kind: ' ', line: a[endA + k] ?? '', a: endA + k, b: endB + k });
  return ops;
}

/** A unified diff (as `diff -u` writes it) with `context` unchanged lines around each change. */
export function unifiedDiff(before: string, after: string, fromFile = 'a', toFile = 'b', context = 3): string {
  const ops = diffOps(lines(before), lines(after));
  const changes = ops.flatMap((op, index) => (op.kind === ' ' ? [] : [index]));
  if (!changes.length) return '';

  const hunks: Array<[number, number]> = [];
  for (const index of changes) {
    const last = hunks[hunks.length - 1];
    if (last && index - last[1] <= context * 2 + 1) last[1] = index;
    else hunks.push([index, index]);
  }

  const out = [`--- ${fromFile}`, `+++ ${toFile}`];
  for (const [first, last] of hunks) {
    const from = Math.max(0, first - context);
    const to = Math.min(ops.length - 1, last + context);
    const slice = ops.slice(from, to + 1);
    const aLen = slice.filter((op) => op.kind !== '+').length;
    const bLen = slice.filter((op) => op.kind !== '-').length;
    const head = slice[0];
    const aStart = head ? (aLen ? head.a + 1 : head.a) : 0;
    const bStart = head ? (bLen ? head.b + 1 : head.b) : 0;
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    for (const op of slice) out.push(`${op.kind}${op.line}`);
  }
  return `${out.join('\n')}\n`;
}

