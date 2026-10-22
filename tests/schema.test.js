import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProjectSchema,
  ComponentSchema,
  RelationshipSchema,
  RequirementSchema,
  ProposalSchema,
  TaskSchema,
  RiskFindingSchema,
  ManualDecisionSchema,
  validateProject,
  validateProposal,
} from '../src/types/schema.ts';
import { makeCommerceProject, proposeChange, applyChange, DEMO_COMMAND } from '../src/data/commerce.ts';
import { deriveRiskFindings, deriveTasks } from '../src/data/analysis.ts';
import { deriveChangeDiff, deriveManualDecisions } from '../src/data/changeDiff.ts';

test('Zod Schema: ProjectSchema validates valid baseline project', () => {
  const project = makeCommerceProject();
  const parsed = validateProject(project);
  assert.equal(parsed.name, 'Commerce Platform');
  assert.equal(parsed.components.length, 9);
  assert.equal(parsed.relationships.length, 10);
});

test('Zod Schema: Referential Integrity rejects dangling relationship edges', () => {
  const project = makeCommerceProject();
  // Introduce a relationship pointing to an unknown component
  project.relationships.push({
    from: 'web',
    to: 'ghost-service',
    label: 'HTTPS',
    protocol: 'HTTPS',
    description: 'Call to non-existent service',
  });

  assert.throws(
    () => validateProject(project),
    (err) => {
      assert.ok(err.name === 'ZodError');
      const issues = err.issues;
      assert.ok(issues.some((issue) => issue.message.includes('non-existent target component: "ghost-service"')));
      return true;
    }
  );
});

test('Zod Schema: ComponentType and NetworkZone enum enforcement', () => {
  // Invalid component type
  assert.throws(
    () =>
      ComponentSchema.parse({
        id: 'bad-comp',
        name: 'Bad Component',
        type: 'QUANTUM_COMPUTER', // Invalid enum
      }),
    (err) => err.name === 'ZodError'
  );

  // Invalid network zone
  assert.throws(
    () =>
      ComponentSchema.parse({
        id: 'bad-comp',
        name: 'Bad Component',
        type: 'SERVICE',
        networkZone: 'OUTER_SPACE', // Invalid enum
      }),
    (err) => err.name === 'ZodError'
  );
});

test('Zod Schema: Requirement ID convention enforcement', () => {
  // Valid REQ-* ID
  const validReq = RequirementSchema.parse({
    id: 'REQ-SEC-01',
    text: 'Must enforce strict TLS 1.3 encryption',
  });
  assert.equal(validReq.id, 'REQ-SEC-01');

  // Invalid ID not starting with REQ-
  assert.throws(
    () =>
      RequirementSchema.parse({
        id: 'INVALID-ID-01',
        text: 'Must enforce TLS',
      }),
    (err) => {
      assert.ok(err.name === 'ZodError');
      assert.ok(err.issues[0].message.includes('REQ-* convention'));
      return true;
    }
  );
});

test('Zod Schema: Task ID convention and priority validation', () => {
  const sampleReq = RequirementSchema.parse({
    id: 'REQ-SEC-01',
    text: 'Must enforce strict TLS 1.3 encryption',
  });

  const validTask = TaskSchema.parse({
    id: 'TASK-DATA-01',
    epic: 'Data Security',
    title: 'Migrate to TLS 1.3',
    priority: 'High',
    requirement: sampleReq,
    acceptance: ['TLS 1.2 is rejected', 'TLS 1.3 handshakes succeed'],
    unresolved: 'None',
    requirementId: sampleReq.id,
  });
  assert.equal(validTask.id, 'TASK-DATA-01');

  // Invalid Task ID
  assert.throws(
    () =>
      TaskSchema.parse({
        ...validTask,
        id: 'JIRA-1234', // Non TASK-* convention
      }),
    (err) => err.name === 'ZodError'
  );

  // Invalid Priority
  assert.throws(
    () =>
      TaskSchema.parse({
        ...validTask,
        priority: 'Urgent', // Invalid enum (must be High, Medium, or Low)
      }),
    (err) => err.name === 'ZodError'
  );
});

test('Zod Schema: ProposalSchema requires at least one proposal item', () => {
  assert.throws(
    () =>
      validateProposal({
        text: 'Empty proposal',
        items: [],
        assumptions: [],
      }),
    (err) => err.name === 'ZodError'
  );
});

test('Direct Foreign Keys: Risk findings and Tasks carry explicit requirementId', () => {
  const project = applyChange(makeCommerceProject(), proposeChange(DEMO_COMMAND));
  const findings = deriveRiskFindings(project);
  const tasks = deriveTasks(project);

  // Check rate-limiting risk finding has explicit requirementId foreign key
  const rateLimitRisk = findings.find((f) => f.title.includes('Rate limiting is required'));
  assert.ok(rateLimitRisk, 'Rate limiting risk finding should exist');
  assert.equal(rateLimitRisk.requirementId, 'REQ-AUTH-RATE');
  assert.equal(rateLimitRisk.sourceChangeId, 'CHG-0002');
  assert.equal(rateLimitRisk.originalInstruction, DEMO_COMMAND);

  // Check Redis outage risk finding has explicit requirementId foreign key
  const redisRisk = findings.find((f) => f.title.includes('Redis outage behavior'));
  assert.ok(redisRisk, 'Redis outage risk finding should exist');
  assert.equal(redisRisk.requirementId, 'REQ-REDIS-FAIL');
  assert.equal(redisRisk.sourceChangeId, 'CHG-0002');

  // Check engineering tasks carry explicit requirementId foreign keys
  for (const task of tasks) {
    assert.ok(task.requirementId, `Task ${task.id} must have a direct requirementId foreign key`);
    assert.equal(task.requirementId, task.requirement.id);
  }
});

test('Direct Foreign Keys: Manual decisions carry direct requirementId and changeId', () => {
  const project = applyChange(makeCommerceProject(), proposeChange(DEMO_COMMAND));
  const decisions = deriveManualDecisions(project);
  assert.ok(decisions.length >= 3);

  const rateLimitDecision = decisions.find((d) => d.id === 'rate-limit-threshold');
  assert.ok(rateLimitDecision);
  assert.equal(rateLimitDecision.requirementId, 'REQ-AUTH-RATE');
  assert.equal(rateLimitDecision.changeId, 'CHG-0002');
  assert.equal(rateLimitDecision.instruction, DEMO_COMMAND);

  const redisDecision = decisions.find((d) => d.id === 'redis-fallback');
  assert.ok(redisDecision);
  assert.equal(redisDecision.requirementId, 'REQ-REDIS-FAIL');
  assert.equal(redisDecision.changeId, 'CHG-0002');
});

