import { validateProposal } from '../types/schema.ts';
import type { ArchitectureOperation, Component, Project, Proposal, ProposalItem } from '../types/schema.ts';
import { cacheRequirement, callersOf, findAuthComponent, findDatabases, findPublicEntry, rateLimitRequirement } from './modelFacts.ts';

/**
 * How each open risk finding can be resolved. Every fix is a list of ordinary
 * model operations, so it goes through the same review dialog and deterministic
 * applier as a spoken change. Choices are offered, never picked silently: a
 * value is only used when the person chooses it or types their own.
 */

/** What one chosen fix adds to the resolution proposal. */
export interface FixBuild {
  item: ProposalItem;
  operations: ArchitectureOperation[];
}

export interface FixChoice {
  id: string;
  label: string;
  detail: string;
  build: () => FixBuild;
}

/** The ways one open finding can be resolved. */
export interface RiskFix {
  key: string;
  question: string;
  custom: boolean;
  placeholder?: string;
  choices: FixChoice[];
  buildCustom?: (text: string) => FixBuild;
}

/** The person's pick for one finding: a listed choice, or their own text. */
export interface FixSelection {
  choiceId?: string;
  custom?: string;
}

interface CacheOption {
  id: string;
  label: string;
  value: string;
}

const slug = (text: string): string => String(text).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

function databaseFix(project: Project, db: Component): RiskFix {
  const replicaId = `${db.id}-replica`;
  return {
    key: `database:${db.id}`,
    question: `How should ${db.name} handle a failure?`,
    custom: false,
    choices: [
      {
        id: 'replica',
        label: 'Add a standby replica',
        detail: `Adds “${db.name} replica” and a replication link, so the model has a failover path.`,
        build: () => ({
          item: { key: `fix-${db.id}-replica`, title: `Add a standby replica for ${db.name}`, detail: `${db.name} replicates to a new ${db.name} replica that can take over if the primary fails.` },
          operations: [
            {
              op: 'add_component', id: replicaId, name: `${db.name} replica`, type: 'DATABASE', sub: 'Standby replica · failover',
              responsibilities: [`Holds a replicated copy of ${db.name} and takes over if the primary fails.`],
            },
            { op: 'add_relationship', from: db.id, to: replicaId, label: 'replication', protocol: null },
          ],
        }),
      },
      {
        id: 'accept',
        label: 'Accept a single instance for now',
        detail: 'Records that the team knowingly runs one instance. The risk stays visible as accepted.',
        build: () => ({
          item: { key: `fix-${db.id}-accept`, title: `Accept a single ${db.name} instance`, detail: 'Record the decision so the risk is tracked as accepted rather than unnoticed.' },
          operations: [{
            op: 'add_requirement', id: `REQ-${slug(db.id)}-SINGLE`,
            text: `${db.name} runs as a single instance; the team accepts the availability risk`,
            status: 'confirmed', resolution: 'Accepted: single instance, no replica planned',
          }],
        }),
      },
    ],
  };
}

function cacheFix(project: Project, cache: Component): RiskFix {
  const existing = cacheRequirement(project, cache);
  const users = callersOf(project, cache.id).map((c) => c.name);
  const store: Component | undefined = findDatabases(project)[0];
  const who = users.length ? users.join(' and ') : 'Its callers';
  const record = (choice: string): FixBuild => ({
    item: { key: `fix-${cache.id}-outage`, title: `Record ${cache.name} outage behavior`, detail: `If ${cache.name} is unavailable: ${choice}.` },
    operations: [{
      op: 'add_requirement', id: existing?.id || `REQ-${slug(cache.id)}-FAIL`,
      text: `${who} must keep working when ${cache.name} is unavailable; selected fallback: ${choice}`,
      status: 'confirmed', resolution: choice,
    }],
  });
  const options = [
    store && { id: 'read-through', label: `Fall back to ${store.name}`, value: `read from ${store.name} until ${cache.name} recovers` },
    { id: 'fail-closed', label: 'Fail closed', value: `reject requests that need ${cache.name} until it recovers` },
    { id: 'degrade', label: 'Serve degraded', value: `serve without ${cache.name} and accept slower responses` },
  ].filter((o): o is CacheOption => Boolean(o));
  return {
    key: `cache:${cache.id}`,
    question: `What should happen when ${cache.name} is down?`,
    custom: true,
    placeholder: 'Or describe your own fallback',
    choices: options.map((o) => ({ id: o.id, label: o.label, detail: `If ${cache.name} is unavailable: ${o.value}.`, build: () => record(o.value) })),
    buildCustom: (text) => record(text),
  };
}

function rateLimitFix(project: Project): RiskFix {
  const existing = rateLimitRequirement(project);
  const auth = findAuthComponent(project);
  // Non-null: fixFor only builds this fix when the model has a public entry.
  const entry = findPublicEntry(project)!;
  const where = auth ? 'Authentication endpoint' : `${entry.name}`;
  const record = (choice: string): FixBuild => ({
    item: { key: 'fix-rate-limit', title: 'Record the rate limit', detail: `${where}: ${choice}.` },
    operations: [{
      op: 'add_requirement', id: existing?.id || (auth ? 'REQ-AUTH-RATE' : 'REQ-ENTRY-RATE'),
      text: `${where} requires rate limiting; configured threshold: ${choice}`,
      status: 'confirmed', resolution: choice,
    }],
  });
  const options = auth
    ? ['5 attempts per minute per IP', '10 attempts per minute per account', '20 attempts per hour per account']
    : ['100 requests per minute per client', '10 requests per second per client', '1,000 requests per hour per API key'];
  return {
    key: 'rate-limit',
    question: auth ? 'What limit should sign-in use?' : `What limit should ${entry.name} use?`,
    custom: true,
    placeholder: 'Or type your own limit and window',
    choices: options.map((value, i) => ({ id: `limit-${i}`, label: value, detail: `${where}: ${value}.`, build: () => record(value) })),
    buildCustom: (text) => record(text),
  };
}

/** The fix options for one finding, by its fixKey, or null when it has none. */
export function fixFor(project: Project | null | undefined, fixKey: string | null | undefined): RiskFix | null {
  if (!project || !fixKey) return null;
  const [kind, id] = fixKey.split(':');
  if (kind === 'database') {
    const db = project.components.find((c) => c.id === id && c.type === 'DATABASE');
    return db ? databaseFix(project, db) : null;
  }
  if (kind === 'cache') {
    const cache = project.components.find((c) => c.id === id);
    return cache ? cacheFix(project, cache) : null;
  }
  if (kind === 'rate-limit') return findPublicEntry(project) ? rateLimitFix(project) : null;
  return null;
}

/**
 * One reviewable proposal from the chosen fixes.
 * @param selections {fixKey: {choiceId} | {custom: string}}
 */
export function resolutionProposal(
  project: Project,
  selections: Record<string, FixSelection | null | undefined>,
): Proposal | null {
  const items: ProposalItem[] = [];
  const operations: ArchitectureOperation[] = [];
  for (const [fixKey, pick] of Object.entries(selections)) {
    const fix = fixFor(project, fixKey);
    if (!fix || !pick) continue;
    const built = pick.custom?.trim() && fix.buildCustom
      ? fix.buildCustom(pick.custom.trim())
      : fix.choices.find((c) => c.id === pick.choiceId)?.build() || null;
    if (!built) continue;
    items.push(built.item);
    operations.push(...built.operations);
  }
  if (!items.length) return null;
  const text = `Resolve ${items.length} risk finding${items.length === 1 ? '' : 's'}: ${items.map((i) => i.title.toLowerCase()).join('; ')}`;
  return validateProposal({
    text,
    items,
    assumptions: ['Recording a choice makes it a requirement. It does not mean the behavior is implemented yet.'],
    source: 'resolve',
    operations,
  });
}
