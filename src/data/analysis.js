import { RiskFindingSchema, TaskSchema } from '../types/schema.ts';
import { baselineLabel, cacheRequirement, callersOf, findAuthComponent, findCaches, findDatabases, findPublicEntry, rateLimitRequirement } from './modelFacts.js';

/** A recorded requirement saying the team accepts running this database as a single instance. */
export function singleInstanceAcceptance(project, db) {
  const name = db.name.toLowerCase();
  return project.requirements.find((r) => /single instance/i.test(r.text)
    && (r.text.toLowerCase().includes(name) || r.text.toLowerCase().includes(db.id.toLowerCase()))) || null;
}

export function deriveRiskFindings(project) {
  const findings = [];
  const requirements = project.requirements;
  const databases = findDatabases(project);

  // 1. Single database: one DATABASE component and nothing modeled to take over,
  //    unless the team has recorded that it accepts running a single instance.
  if (databases.length === 1) {
    const db = databases[0];
    const incoming = callersOf(project, db.id).map((node) => node.name);
    const accepted = singleInstanceAcceptance(project, db);
    if (accepted) {
      findings.push({
        kind: 'Requirement coverage',
        status: 'resolved',
        title: `Single ${db.name} instance is an accepted risk`,
        description: `The team recorded that ${db.name} runs without a replica for now. The availability risk is known and accepted, not removed.`,
        evidence: [`${accepted.id}: “${accepted.text}”`, `${db.name} (${db.id}) is still the only DATABASE node.`],
        requirementId: accepted.id,
        sourceChangeId: accepted.sourceChangeId,
        originalInstruction: accepted.originalInstruction,
      });
    } else findings.push({
      kind: 'Potential risk',
      status: 'open',
      fixKey: `database:${db.id}`,
      title: `${db.name} is the only modeled database`,
      description: 'The architecture shows one database component and no modeled replica or failover path. This is a potential availability risk; no availability target is specified.',
      evidence: [
        `${db.name} (${db.id}) is the only DATABASE node.`,
        incoming.length ? `Incoming data flows: ${incoming.join(', ')} → ${db.name}.` : `No component reads from or writes to ${db.name} yet.`,
        'No database replication or failover relationship appears in the model.',
      ],
      requirementId: undefined,
      sourceChangeId: db.sourceChangeId || 'BASELINE',
      originalInstruction: db.originalInstruction || baselineLabel(project),
    });
  }

  // 2. Each cache that something uses: is its outage behavior decided?
  for (const cache of findCaches(project)) {
    const users = callersOf(project, cache.id).map((node) => node.name);
    const resilience = cacheRequirement(project, cache);
    if (resilience) {
      findings.push({
        kind: resilience.resolution ? 'Requirement coverage' : 'Unresolved decision',
        status: resilience.resolution ? 'resolved' : 'open',
        ...(resilience.resolution ? {} : { fixKey: `cache:${cache.id}` }),
        title: resilience.resolution ? `${cache.name} outage behavior choice is recorded` : `${cache.name} outage behavior needs a decision`,
        description: resilience.resolution
          ? `The team recorded this ${cache.name} outage behavior: ${resilience.resolution}. This is a requirement, not evidence that the behavior is implemented.`
          : `Resilience to a ${cache.name} outage is required, but the fallback behavior is not defined. The requirement is not evidence that resilience is implemented.`,
        evidence: resilience.resolution
          ? [`${resilience.id}: ${resilience.text}`, `Recorded choice: ${resilience.resolution}`, 'Implementation and persistence behavior are not verified by this model.']
          : [`${resilience.id}: “${resilience.text}”`, 'No confirmed fallback behavior or persistence policy is recorded.'],
        requirementId: resilience.id,
        sourceChangeId: resilience.sourceChangeId,
        originalInstruction: resilience.originalInstruction,
      });
    } else if (users.length) {
      findings.push({
        kind: 'Unresolved decision',
        status: 'open',
        fixKey: `cache:${cache.id}`,
        title: `${cache.name} availability behavior is unspecified`,
        description: `${cache.name} is modeled as a cache for ${users.join(', ')}, but the requirements do not say what should happen if it becomes unavailable.`,
        evidence: [
          `${users.join(', ')} → ${cache.name} (${cache.sub || 'cache'}).`,
          `No ${cache.name} outage requirement or fallback relationship is recorded.`,
        ],
        requirementId: undefined,
        sourceChangeId: undefined,
        originalInstruction: undefined,
      });
    }
  }

  // 3. Rate limiting at the public entry point, when the model has one.
  const rateLimit = rateLimitRequirement(project);
  const auth = findAuthComponent(project);
  const entry = findPublicEntry(project);
  if (rateLimit) {
    findings.push({
      kind: 'Requirement coverage',
      status: rateLimit.resolution ? 'resolved' : 'open',
      ...(rateLimit.resolution ? {} : { fixKey: 'rate-limit' }),
      title: rateLimit.resolution
        ? `Rate limit recorded: ${rateLimit.resolution}`
        : 'Rate limiting is required; contract coverage is unverified',
      description: rateLimit.resolution
        ? `The team recorded this rate-limit threshold and window: ${rateLimit.resolution}. The model cannot verify runtime enforcement.`
        : 'The requirement is recorded, but its threshold and time window remain unspecified; the model also cannot verify runtime enforcement.',
      evidence: rateLimit.resolution
        ? [`${rateLimit.id}: ${rateLimit.text}`, `Recorded threshold and window: ${rateLimit.resolution}`, 'The project model does not represent a running API implementation.']
        : [`${rateLimit.id}: “${rateLimit.text}”`, 'The project model does not represent a running API implementation.'],
      requirementId: rateLimit.id,
      sourceChangeId: rateLimit.sourceChangeId,
      originalInstruction: rateLimit.originalInstruction,
    });
  } else if (entry) {
    findings.push({
      kind: 'Unresolved decision',
      status: 'open',
      fixKey: 'rate-limit',
      title: auth ? 'Authentication rate limiting is not specified' : 'Rate limiting at the public entry point is not specified',
      description: 'No rate-limit requirement appears in the model. This is a requirement gap, not proof that a running service is vulnerable.',
      evidence: [
        auth ? `${auth.name} (${auth.id}) handles sign-in.` : `${entry.name} (${entry.id}) receives public traffic.`,
        'No rate-limiting requirement is recorded.',
      ],
      requirementId: undefined,
      sourceChangeId: undefined,
      originalInstruction: undefined,
    });
  }

  // 4. Source-of-truth constraints name a real database and its flows.
  const owner = requirements.find((item) => /source of truth/i.test(item.text));
  if (owner) {
    const ownerText = owner.text.toLowerCase();
    const db = databases.find((d) => ownerText.includes(d.name.toLowerCase()) || ownerText.includes(d.id.toLowerCase())) || databases[0];
    const writers = db ? callersOf(project, db.id).map((n) => n.name) : [];
    findings.push({
      kind: 'Consistency check',
      status: 'resolved',
      title: `${db ? db.name : 'Data'} source-of-truth constraint is recorded`,
      description: db
        ? `The explicit ownership requirement is present. ${writers.length ? `${writers.join(', ')} ${writers.length === 1 ? 'points' : 'point'} to ${db.name}.` : `No component points to ${db.name} yet.`}`
        : 'The explicit ownership requirement is present, but the model has no database component.',
      evidence: [
        `${owner.id}: “${owner.text}”`,
        db
          ? `${db.name} incoming flows: ${project.relationships.filter((edge) => edge.to === db.id).map((edge) => edge.label).join(', ') || 'none'}.`
          : 'No DATABASE component is modeled.',
      ],
      requirementId: owner.id,
      sourceChangeId: owner.sourceChangeId,
      originalInstruction: owner.originalInstruction,
    });
  }

  return findings.map((f) => RiskFindingSchema.parse(f));
}

/** Decisions the team still has to make: risk findings of kind 'Unresolved decision'. */
export function countOpenDecisions(project) {
  return project ? deriveRiskFindings(project).filter((f) => f.kind === 'Unresolved decision').length : 0;
}

export function getProjectSyncStatus(project) {
  if (!project) return 'Ready';
  const unresolved = countOpenDecisions(project) > 0;
  if (project.changed) return unresolved ? 'Change applied · unresolved decisions remain' : 'Change applied';
  return unresolved ? 'Baseline loaded · unresolved decisions remain' : 'Baseline loaded';
}

export function deriveTasks(project) {
  const tasks = [];
  for (const requirement of project.requirements) {
    if (requirement.id === 'REQ-AUTH-RATE') {
      tasks.push({
        id: 'TASK-AUTH-RATE',
        epic: 'Secure authentication',
        title: 'Add rate limiting to login',
        priority: 'High',
        requirement,
        acceptance: [
          requirement.resolution
            ? `Apply the recorded limit: ${requirement.resolution}.`
            : 'Requests above the configured threshold receive HTTP 429.',
          'Rate-limit headers describe the current limit and retry window.',
          'The threshold and window are explicitly configured and documented.',
        ],
        unresolved: requirement.resolution
          ? `Decision recorded: ${requirement.resolution}. Implementation remains proposed.`
          : 'The product owner must choose the limit and time window.',
        // Direct foreign keys (Phase 1)
        requirementId: requirement.id,
        sourceChangeId: requirement.sourceChangeId,
        originalInstruction: requirement.originalInstruction,
      });
    }
    if (requirement.id === 'REQ-REDIS-FAIL') {
      tasks.push({
        id: 'TASK-REDIS-FAILOVER',
        epic: 'Improve login resilience',
        title: 'Define and implement login behavior during Redis outage',
        priority: 'High',
        requirement,
        acceptance: [
          requirement.resolution
            ? `Implement the recorded outage behavior: ${requirement.resolution}.`
            : 'Redis outage behavior is explicitly selected and documented.',
          'Login follows the selected behavior when Redis is unavailable.',
          'Automated tests cover the Redis failure path.',
        ],
        unresolved: requirement.resolution
          ? `Decision recorded: ${requirement.resolution}. Implementation remains proposed.`
          : 'Choose and document the login behavior when Redis is unavailable.',
        // Direct foreign keys (Phase 1)
        requirementId: requirement.id,
        sourceChangeId: requirement.sourceChangeId,
        originalInstruction: requirement.originalInstruction,
      });
    }
    if (requirement.id === 'REQ-DATA-OWNER') {
      tasks.push({
        id: 'TASK-DATA-OWNER',
        epic: 'Protect data ownership',
        title: 'Preserve PostgreSQL as the source of truth',
        priority: 'Medium',
        requirement,
        acceptance: [
          'Durable user and business records remain owned by PostgreSQL.',
          'Redis is used for session caching only.',
          'Tests or architecture documentation show the ownership boundary.',
        ],
        unresolved: 'The model does not define replication or recovery policy.',
        // Direct foreign keys (Phase 1)
        requirementId: requirement.id,
        sourceChangeId: requirement.sourceChangeId,
        originalInstruction: requirement.originalInstruction,
      });
    }
    if (!['REQ-AUTH-RATE', 'REQ-REDIS-FAIL', 'REQ-DATA-OWNER'].includes(requirement.id)) {
      const slug = requirement.id.replace(/^REQ-/, '').replace(/[^A-Z0-9]+/g, '-');
      tasks.push({
        id: `TASK-${slug}`,
        epic: `${project.name} requirements`,
        title: `Implement: ${requirement.text}`,
        priority: /payment|courier|security|duplicate/i.test(requirement.text) ? 'High' : 'Medium',
        requirement,
        acceptance: [
          `The system satisfies the requirement: ${requirement.text}`,
          'Document behavior for retries, unavailable dependencies, and invalid input where applicable.',
          'Add automated coverage and update the architecture contract before release.',
        ],
        unresolved: requirement.resolution
          ? `Recorded choice: ${requirement.resolution}. Implementation remains proposed.`
          : 'Implementation details and verification remain proposed; the model does not claim completion.',
        requirementId: requirement.id,
        sourceChangeId: requirement.sourceChangeId,
        originalInstruction: requirement.originalInstruction,
      });
    }
  }
  // Validate all tasks against Zod schema
  return tasks.map((t) => TaskSchema.parse(t));
}
