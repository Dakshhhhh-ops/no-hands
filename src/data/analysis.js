import { RiskFindingSchema, TaskSchema } from '../types/schema.ts';

export function deriveRiskFindings(project) {
  const findings = [];
  const databases = project.components.filter((item) => item.type === 'DATABASE');
  const postgres = project.components.find((item) => item.id === 'postgres');
  const incoming = project.relationships
    .filter((edge) => edge.to === 'postgres')
    .map((edge) => project.components.find((node) => node.id === edge.from)?.name)
    .filter(Boolean);
  const requirements = project.requirements;

  // 1. Single database SPOF check
  if (databases.length === 1 && postgres) {
    findings.push({
      kind: 'Potential risk',
      title: 'PostgreSQL is the only modeled database',
      description: 'The architecture shows one database component and no modeled replica or failover path. This is a potential availability risk; no availability target is specified.',
      evidence: [
        `${postgres.name} (${postgres.id}) is the only DATABASE node.`,
        `Incoming data flows: ${incoming.join(', ')} → PostgreSQL.`,
        'No database replication or failover relationship appears in the model.',
      ],
      // Direct foreign key
      requirementId: undefined,
      sourceChangeId: postgres.sourceChangeId || 'BASELINE',
      originalInstruction: postgres.originalInstruction || 'Commerce Platform baseline fixture',
    });
  }

  // 2. Redis outage resilience check
  const resilience = requirements.find((item) => /redis/i.test(item.text) && /(unavailable|resilien|fallback)/i.test(item.text));
  if (resilience) {
    findings.push({
      kind: resilience.resolution ? 'Requirement coverage' : 'Unresolved decision',
      title: resilience.resolution ? 'Redis outage behavior choice is recorded' : 'Redis outage behavior needs a decision',
      description: resilience.resolution
        ? `The team recorded this Redis outage behavior: ${resilience.resolution}. This is a requirement, not evidence that the behavior is implemented.`
        : 'Login resilience is required, but fallback behavior is not defined. The requirement is not evidence that resilience is implemented.',
      evidence: resilience.resolution
        ? [`${resilience.id}: ${resilience.text}`, `Recorded choice: ${resilience.resolution}`, 'Implementation and session persistence behavior are not verified by this model.']
        : [`${resilience.id}: “${resilience.text}”`, 'No confirmed fallback behavior or session persistence policy is recorded.'],
      // Direct foreign keys (Phase 1)
      requirementId: resilience.id,
      sourceChangeId: resilience.sourceChangeId,
      originalInstruction: resilience.originalInstruction,
    });
  } else {
    findings.push({
      kind: 'Unresolved decision',
      title: 'Redis availability behavior is unspecified',
      description: 'Redis is modeled as the session cache, but the requirements do not say what login should do if Redis becomes unavailable.',
      evidence: [
        'Redis is modeled as the session cache.',
        'No Redis outage requirement or fallback relationship is recorded.',
      ],
      requirementId: undefined,
      sourceChangeId: undefined,
      originalInstruction: undefined,
    });
  }

  // 3. Rate limiting requirement coverage check
  const rateLimit = requirements.find((item) => /rate.?limit/i.test(item.text));
  if (rateLimit) {
    findings.push({
      kind: 'Requirement coverage',
      title: 'Rate limiting is required; contract coverage is unverified',
      description: rateLimit.resolution
        ? `The team recorded this rate-limit threshold and window: ${rateLimit.resolution}. The demo cannot verify runtime enforcement.`
        : 'The requirement is recorded, but its threshold and time window remain unspecified; the demo also cannot verify runtime enforcement.',
      evidence: rateLimit.resolution
        ? [`${rateLimit.id}: ${rateLimit.text}`, `Recorded threshold and window: ${rateLimit.resolution}`, 'The project model does not represent a running API implementation.']
        : [`${rateLimit.id}: “${rateLimit.text}”`, 'The project model does not represent a running API implementation.'],
      // Direct foreign keys (Phase 1)
      requirementId: rateLimit.id,
      sourceChangeId: rateLimit.sourceChangeId,
      originalInstruction: rateLimit.originalInstruction,
    });
  } else {
    findings.push({
      kind: 'Unresolved decision',
      title: 'Authentication rate limiting is not specified',
      description: 'No rate-limit requirement appears in the model. This is a requirement gap, not proof that a running service is vulnerable.',
      evidence: [
        'Auth Service (auth) handles login.',
        'No rate-limiting requirement is recorded.',
      ],
      requirementId: undefined,
      sourceChangeId: undefined,
      originalInstruction: undefined,
    });
  }

  // 4. PostgreSQL source of truth consistency check
  const owner = requirements.find((item) => /postgres/i.test(item.text) && /source of truth/i.test(item.text));
  if (owner) {
    findings.push({
      kind: 'Consistency check',
      title: 'PostgreSQL source-of-truth constraint is recorded',
      description: 'The explicit ownership requirement is present. Auth, Catalog, and Order flows point to PostgreSQL, while Redis is designated for sessions.',
      evidence: [
        `${owner.id}: “${owner.text}”`,
        `PostgreSQL incoming flows: ${project.relationships.filter((edge) => edge.to === 'postgres').map((edge) => edge.label).join(', ')}.`,
        `Redis component description: ${project.components.find((item) => item.id === 'redis')?.sub || 'not modeled'}.`,
      ],
      // Direct foreign keys (Phase 1)
      requirementId: owner.id,
      sourceChangeId: owner.sourceChangeId,
      originalInstruction: owner.originalInstruction,
    });
  }

  // Validate all findings against Zod schema
  return findings.map((f) => RiskFindingSchema.parse(f));
}

export function getProjectSyncStatus(project) {
  if (!project) return 'Ready';
  const rateLimit = project.requirements.find((item) => /rate.?limit/i.test(item.text));
  const redisResilience = project.requirements.find((item) => /redis/i.test(item.text) && /(unavailable|resilien|fallback)/i.test(item.text));
  const unresolved = !rateLimit?.resolution || !redisResilience?.resolution;
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
