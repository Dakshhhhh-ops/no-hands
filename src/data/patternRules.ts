import { validateProposal } from '../types/schema.ts';
import type { ArchitectureOperation, Component, Project, Proposal } from '../types/schema.ts';
import { cleanDictation } from './dictation.ts';

/**
 * Offline understanding for a few common change shapes, in English and Hinglish,
 * against any model. Each match becomes ordinary operations that go through the
 * same validated applier as a model's proposal. Anything that does not match
 * returns null, and the caller falls back to the older keyword rules.
 *
 *   add a Redis cache in front of the payment service  | payment service ke aage Redis cache laga do
 *   connect the order service to Kafka                  | order service ko Kafka se connect karo
 *   remove the cache and use the database directly      | cache hata do aur database seedha use karo
 *   move auth into its own container                    | auth service ko alag container mein daalo
 */

const norm = (text: string) =>
  cleanDictation(text).toLowerCase().replace(/[.,!?;:"'“”]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (text: string) => text.toLowerCase().replace(/[-_]/g, ' ').trim();
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (text: string) => text.replace(/\b\w/g, (c) => c.toUpperCase());
const STOP = /^(?:the|a|an|our|my|this|that|us|wala|wali|vala|vali)\s+/;

/** The component a spoken phrase refers to, preferring the longest exact name or id match. */
export function resolveComponent(project: Project, phrase: string, types?: Component['type'][]): Component | null {
  const target = words(phrase).replace(STOP, '').trim();
  if (!target) return null;
  const pool = project.components.filter((c) => !types || types.includes(c.type));
  const keys = (c: Component) => {
    const name = words(c.name);
    const id = words(c.id);
    const bare = name.replace(/\s+(service|server|api|app)$/, '');
    return [...new Set([name, id, bare])].filter((k) => k.length > 1);
  };
  let best: { component: Component; score: number } | null = null;
  for (const component of pool) {
    for (const k of keys(component)) {
      const exact = target === k || target === `${k} service` || `${target} service` === k;
      const contains = new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(target);
      const score = exact ? 1000 + k.length : contains ? k.length : 0;
      if (score && (!best || score > best.score)) best = { component, score };
    }
  }
  return best?.component || null;
}

/** "cache" / "database" alone mean the only component of that type, when there is exactly one. */
function resolveByType(project: Project, phrase: string, type: Component['type'], generic: RegExp) {
  const named = resolveComponent(project, phrase, [type]);
  if (named) return named;
  if (generic.test(words(phrase))) {
    const all = project.components.filter((c) => c.type === type);
    return all.length === 1 ? all[0] : null;
  }
  return null;
}

const hasEdge = (project: Project, from: string, to: string) =>
  project.relationships.some((r) => r.from === from && r.to === to);

type Match = { items: Proposal['items']; operations: ArchitectureOperation[]; assumptions: string[] };

function addCache(project: Project, targetPhrase: string, cachePhrase: string): Match | null {
  const target = resolveComponent(project, targetPhrase);
  if (!target) return null;
  const tech = cachePhrase.trim() ? titleCase(cleanDictation(cachePhrase.trim())) : '';
  const existing = tech ? resolveComponent(project, tech, ['CACHE']) : null;
  const operations: ArchitectureOperation[] = [];
  let cacheId = existing?.id;
  let cacheName = existing?.name;
  if (!existing) {
    cacheName = tech ? `${tech} cache` : `${target.name} cache`;
    cacheName = cacheName.replace(/\bcache cache\b/i, 'cache').replace(/^\w/, (c) => c.toUpperCase());
    cacheId = slug(tech && project.components.every((c) => c.id !== slug(tech)) ? tech : cacheName);
    operations.push({
      op: 'add_component', id: cacheId, name: cacheName, type: 'CACHE',
      sub: `Cache for ${target.name}`, responsibilities: [`Caches data for ${target.name}.`],
    });
  }
  if (!hasEdge(project, target.id, cacheId!)) {
    operations.push({ op: 'add_relationship', from: target.id, to: cacheId!, label: 'cache', protocol: null });
  }
  if (!operations.length) return null;
  return {
    items: [{ key: 'pattern-cache', title: `Put ${existing ? existing.name : cacheName} in front of ${target.name}`, detail: `${target.name} reads through ${existing ? existing.name : `a new ${cacheName}`}.` }],
    operations,
    assumptions: ['Cache expiry, invalidation, and what happens when the cache is down are not specified.'],
  };
}

function connect(project: Project, fromPhrase: string, toPhrase: string): Match | null {
  const from = resolveComponent(project, fromPhrase);
  const to = resolveComponent(project, toPhrase);
  if (!from || !to || from.id === to.id) return null;
  if (hasEdge(project, from.id, to.id)) {
    return {
      items: [{ key: 'pattern-connect', title: `${from.name} already connects to ${to.name}`, detail: 'No change is needed.' }],
      operations: [],
      assumptions: [`${from.name} → ${to.name} is already in the model.`],
    };
  }
  const label = to.type === 'QUEUE' ? 'publish' : to.type === 'DATABASE' ? 'data' : to.type === 'CACHE' ? 'cache' : 'calls';
  return {
    items: [{ key: 'pattern-connect', title: `Connect ${from.name} to ${to.name}`, detail: `Adds ${from.name} → ${to.name}.` }],
    operations: [{ op: 'add_relationship', from: from.id, to: to.id, label, protocol: null }],
    assumptions: [`The connection is labelled "${label}"; rename it during review if it carries something more specific.`],
  };
}

function bypassCache(project: Project, cachePhrase: string, dbPhrase: string): Match | null {
  const cache = resolveByType(project, cachePhrase, 'CACHE', /\bcache\b/);
  const db = resolveByType(project, dbPhrase, 'DATABASE', /\b(database|db)\b/);
  if (!cache || !db) return null;
  const callers = project.relationships.filter((r) => r.to === cache.id).map((r) => r.from);
  const operations: ArchitectureOperation[] = [{ op: 'remove_component', id: cache.id }];
  for (const caller of callers) {
    if (caller !== db.id && !hasEdge(project, caller, db.id)) {
      operations.push({ op: 'add_relationship', from: caller, to: db.id, label: 'direct read', protocol: null });
    }
  }
  const names = callers.map((id) => project.components.find((c) => c.id === id)?.name || id);
  return {
    items: [
      { key: 'pattern-remove-cache', title: `Remove ${cache.name}`, detail: `${cache.name} and its connections are removed.` },
      ...(names.length ? [{ key: 'pattern-direct-db', title: `Read ${db.name} directly`, detail: `${names.join(', ')} ${names.length === 1 ? 'reads' : 'read'} ${db.name} without the cache.` }] : []),
    ],
    operations,
    assumptions: [`Load on ${db.name} rises without the cache; capacity is not modeled.`],
  };
}

function ownContainer(project: Project, phrase: string): Match | null {
  const cleaned = words(phrase).replace(STOP, '').trim();
  const existing = resolveComponent(project, cleaned, ['SERVICE']);
  if (existing) {
    return {
      items: [{ key: 'pattern-own-service', title: `${existing.name} already runs on its own`, detail: 'It is already a separate service in the model, so nothing changes.' }],
      operations: [],
      assumptions: [`${existing.name} is already modeled as its own service.`],
    };
  }
  if (!cleaned) return null;
  const base = cleaned.replace(/\s+(service|server)$/, '');
  const name = `${titleCase(base)} Service`;
  const id = slug(`${base}-service`);
  const gateway = project.components.find((c) => c.type === 'GATEWAY');
  const operations: ArchitectureOperation[] = [{
    op: 'add_component', id, name, type: 'SERVICE', sub: 'Runs in its own container', responsibilities: [`Handles ${base} on its own.`],
  }];
  if (gateway) operations.push({ op: 'add_relationship', from: gateway.id, to: id, label: base, protocol: null });
  return {
    items: [{ key: 'pattern-own-service', title: `Run ${name} in its own container`, detail: gateway ? `${gateway.name} routes ${base} requests to it.` : 'It is not connected to anything yet.' }],
    operations,
    assumptions: ['The new service has no image, port, or data store yet; those come from code.'],
  };
}

const CACHE_VERB = String.raw`(?:laga do|lagao|laga|laga dijiye|add karo|add kar do|daal do|daalo|dal do|rakho|rakh do)`;
const CONNECT_VERB = String.raw`(?:connect|jodo|jod do|link)(?:\s+(?:karo|kar do|kijiye|kardo))?`;
const REMOVE_VERB = String.raw`(?:hata do|hatao|hata|nikal do|nikalo|remove karo|remove kar do)`;
const PUT_VERB = String.raw`(?:daalo|daal do|dal do|rakho|rakh do|chalao|chala do|karo|kar do)`;

const PATTERNS: Array<{ re: RegExp; run: (p: Project, m: RegExpMatchArray) => Match | null }> = [
  // Hinglish
  { re: new RegExp(String.raw`^(.+?)\s+(?:ke\s+)?(?:aage|saamne|samne|pehle)\s+(?:(\w+)\s+)?cache\s+${CACHE_VERB}$`), run: (p, m) => addCache(p, m[1], m[2] || '') },
  { re: new RegExp(String.raw`^(.+?)\s+ko\s+(.+?)\s+(?:se|ke saath|ke sath|with|to)\s+${CONNECT_VERB}$`), run: (p, m) => connect(p, m[1], m[2]) },
  { re: new RegExp(String.raw`^(.+?)\s+${REMOVE_VERB}\s+(?:aur|and)\s+(.+?)\s+(?:seedha|sidha|directly)\s+(?:use|istemal|access)(?:\s+(?:karo|kar do|kardo))?$`), run: (p, m) => bypassCache(p, m[1], m[2]) },
  { re: new RegExp(String.raw`^(.+?)\s+ko\s+(?:alag|apne|apna|khud ke)\s+(?:container|service)\s+(?:mein|me|main)\s+${PUT_VERB}$`), run: (p, m) => ownContainer(p, m[1]) },
  // English
  { re: /^(?:please\s+)?(?:add|put|place)\s+(?:a|an)\s+(?:(\w+)\s+)?cache\s+(?:in front of|before|for)\s+(?:the\s+)?(.+)$/, run: (p, m) => addCache(p, m[2], m[1] || '') },
  { re: /^(?:please\s+)?connect\s+(?:the\s+)?(.+?)\s+(?:to|with)\s+(?:the\s+)?(.+)$/, run: (p, m) => connect(p, m[1], m[2]) },
  { re: /^(?:please\s+)?(?:remove|drop)\s+(?:the\s+)?(.+?)\s+and\s+(?:use|read|call)\s+(?:the\s+)?(.+?)\s+directly$/, run: (p, m) => bypassCache(p, m[1], m[2]) },
  // "split X into a separate service" means extracting work, which the keyword rules handle; not matched here.
  { re: /^(?:please\s+)?(?:move|put|run)\s+(?:the\s+)?(.+?)\s+(?:into|in|as)\s+(?:a\s+)?(?:separate|its own|their own|own)\s+(?:container|service)$/, run: (p, m) => ownContainer(p, m[1]) },
];

/** A proposal for a recognized pattern, or null when no pattern matches. */
export function interpretPattern(text: string, project: Project): Proposal | null {
  const key = norm(text);
  for (const { re, run } of PATTERNS) {
    const m = key.match(re);
    if (!m) continue;
    const match = run(project, m);
    if (!match) continue;
    return validateProposal({
      text: cleanDictation(text),
      items: match.items,
      assumptions: match.assumptions,
      source: 'rules',
      operations: match.operations,
    });
  }
  return null;
}
