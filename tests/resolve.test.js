import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommerceProject, proposeChange, applyChange } from '../src/data/commerce.js';
import { deriveRiskFindings, countOpenDecisions } from '../src/data/analysis.js';
import { fixFor, resolutionProposal } from '../src/data/riskResolution.js';

const DEMO = 'Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down.';
const open = (project) => deriveRiskFindings(project).filter((f) => f.status === 'open');

test('every open finding in the commerce demo offers a fix', () => {
  const project = applyChange(makeCommerceProject(), proposeChange(DEMO));
  const findings = open(project);
  assert.ok(findings.length >= 2);
  for (const finding of findings) assert.ok(fixFor(project, finding.fixKey), `no fix for ${finding.title}`);
});

test('choosing a fix for every open finding resolves all of them after review', () => {
  const project = applyChange(makeCommerceProject(), proposeChange(DEMO));
  const selections = Object.fromEntries(open(project).map((f) => [f.fixKey, { choiceId: fixFor(project, f.fixKey).choices[0].id }]));
  const proposal = resolutionProposal(project, selections);
  assert.equal(proposal.source, 'resolve');
  const next = applyChange(project, proposal);
  assert.deepEqual(open(next).map((f) => f.title), []);
  assert.equal(countOpenDecisions(next), 0);
  assert.ok(next.components.some((c) => c.id === 'postgres-replica'));
  assert.equal(next.requirements.find((r) => r.id === 'REQ-AUTH-RATE').resolution, '5 attempts per minute per IP');
});

test('a typed choice is recorded verbatim and accepting the single database keeps the risk visible', () => {
  const project = makeCommerceProject();
  const proposal = resolutionProposal(project, {
    'database:postgres': { choiceId: 'accept' },
    'cache:redis': { custom: 'serve sessions from signed cookies' },
    'rate-limit': { custom: '3 attempts per 30 seconds' },
  });
  const next = applyChange(project, proposal);
  const findings = deriveRiskFindings(next);
  assert.deepEqual(open(next), []);
  assert.ok(findings.some((f) => f.title === 'Single PostgreSQL instance is an accepted risk' && f.status === 'resolved'));
  assert.ok(next.requirements.some((r) => r.resolution === 'serve sessions from signed cookies'));
  assert.ok(findings.some((f) => f.title === 'Rate limit recorded: 3 attempts per 30 seconds'));
});

test('nothing is proposed when no fix is chosen', () => {
  assert.equal(resolutionProposal(makeCommerceProject(), {}), null);
});
