import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommerceProject, applyChange } from '../src/data/commerce.js';
import { applyOperations, toRequirementId } from '../src/data/applyOperations.ts';
import { InterpretationSchema, validateProposal } from '../src/types/schema.ts';
import { interpretInstruction, InterpretError, strictJsonSchema } from '../server/interpret.ts';

const proposal = (operations, text = 'test instruction') =>
  validateProposal({ text, items: [{ key: 'ai-0', title: 't', detail: 'd' }], assumptions: [], source: 'ai', operations });

test('applyOperations adds a service, wires it, and records provenance', () => {
  const project = makeCommerceProject();
  const { project: next, outcomes } = applyOperations(project, proposal([
    { op: 'add_component', id: 'Notification Service', name: 'Notification Service', type: 'SERVICE', sub: 'Email · push', responsibilities: ['Sends order updates.'] },
    { op: 'add_relationship', from: 'kafka', to: 'notification-service', label: 'order events', protocol: null },
    { op: 'add_api_operation', id: 'api-notify-prefs', componentId: 'notification-service', method: 'put', path: 'notifications/preferences', summary: 'Update preferences' },
  ], 'add a notification service that listens to order events'));

  assert.ok(outcomes.every((o) => o.applied));
  const service = next.components.find((c) => c.id === 'notification-service');
  assert.equal(service.name, 'Notification Service');
  assert.equal(service.sourceChangeId, 'CHG-0002');
  assert.ok(next.relationships.some((r) => r.from === 'kafka' && r.to === 'notification-service'));
  assert.equal(next.apiOperations.find((a) => a.id === 'api-notify-prefs').path, '/notifications/preferences');
  assert.equal(next.version, project.version + 1);
  assert.equal(next.changes[0].originalInstruction, 'add a notification service that listens to order events');
  assert.deepEqual(new Set(next.changes[0].affectedArtifacts), new Set(['components', 'relationships', 'apiOperations']));
});

test('applyOperations skips operations that reference unknown components instead of corrupting the model', () => {
  const project = makeCommerceProject();
  const { project: next, outcomes } = applyOperations(project, proposal([
    { op: 'add_relationship', from: 'catalog', to: 'elasticsearch', label: 'search index', protocol: null },
    { op: 'update_component', id: 'ghost', name: 'Ghost', type: null, sub: null, responsibilities: null },
    { op: 'add_component', id: 'redis', name: 'Second Redis', type: 'CACHE', sub: '', responsibilities: [] },
  ]));

  assert.equal(outcomes.filter((o) => o.applied).length, 0);
  assert.match(outcomes[0].message, /elasticsearch does not exist/);
  assert.equal(next.components.length, project.components.length);
  assert.equal(next.relationships.length, project.relationships.length);
});

test('removing a component cascades to its connections and API operations', () => {
  const project = makeCommerceProject();
  const { project: next, outcomes } = applyOperations(project, proposal([{ op: 'remove_component', id: 'auth' }]));

  assert.ok(outcomes[0].applied);
  assert.match(outcomes[0].message, /3 connections and 1 API operation/);
  assert.ok(!next.components.some((c) => c.id === 'auth'));
  assert.ok(!next.relationships.some((r) => r.from === 'auth' || r.to === 'auth'));
  assert.ok(!next.apiOperations.some((a) => a.componentId === 'auth'));
});

test('requirements get normalized REQ ids and update in place', () => {
  assert.equal(toRequirementId('req-auth rate'), 'REQ-AUTH-RATE');
  assert.equal(toRequirementId('latency target'), 'REQ-LATENCY-TARGET');
  const project = makeCommerceProject();
  const first = applyOperations(project, proposal([{ op: 'add_requirement', id: 'auth-rate', text: 'Rate limit login', status: 'unresolved' }])).project;
  const second = applyOperations(first, proposal([{ op: 'add_requirement', id: 'REQ-AUTH-RATE', text: 'Rate limit login to 10/min', status: 'confirmed' }])).project;
  const matches = second.requirements.filter((r) => r.id === 'REQ-AUTH-RATE');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].text, 'Rate limit login to 10/min');
});

test('applyChange routes AI proposals through operations and keeps rule proposals on the old path', () => {
  const project = makeCommerceProject();
  const next = applyChange(project, proposal([{ op: 'add_relationship', from: 'catalog', to: 'redis', label: 'product cache', protocol: null }]));
  assert.ok(next.relationships.some((r) => r.from === 'catalog' && r.to === 'redis' && r.label === 'product cache'));
});

function fakeClient(reply, stopReason = 'end_turn') {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          return {
            stop_reason: stopReason,
            content: [{ type: 'text', text: typeof reply === 'string' ? reply : JSON.stringify(reply) }],
            usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
          };
        },
      },
    },
  };
}

const validReply = {
  understood: true,
  summary: 'Add a notification service fed by order events',
  items: [{ title: 'Add Notification Service', detail: 'Consumes order events from Kafka.' }],
  assumptions: ['Delivery channels are not specified.'],
  operations: [
    { op: 'add_component', id: 'notification-service', name: 'Notification Service', type: 'SERVICE', sub: '', responsibilities: [] },
    { op: 'add_relationship', from: 'kafka', to: 'notification-service', label: 'order events', protocol: null },
  ],
};

test('interpretInstruction sends the model and instruction, and validates the structured reply', async () => {
  const client = fakeClient(validReply);
  const result = await interpretInstruction('add a notification service', makeCommerceProject(), { provider: 'anthropic', anthropic: client });

  assert.equal(InterpretationSchema.safeParse(result).success, true);
  assert.equal(result.operations.length, 2);
  const params = client.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.fallbacks, 'default');
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.deepEqual(params.system[0].cache_control, { type: 'ephemeral' });
  assert.match(params.system[0].text, /^You turn a spoken or typed instruction/);
  assert.equal(params.output_config.format.type, 'json_schema');
  const userText = params.messages[0].content;
  assert.match(userText, /<instruction>\nadd a notification service\n<\/instruction>/);
  assert.match(userText, /"id":"kafka"/);
  assert.doesNotMatch(userText, /"(baseline|activity|changes|sourceChangeId)":/);
});

test('interpretInstruction rejects empty input, refusals, truncation, and malformed output', async () => {
  const anthropic = (client) => ({ provider: 'anthropic', anthropic: client });
  await assert.rejects(interpretInstruction('   ', {}, anthropic(fakeClient(validReply))), (e) => e instanceof InterpretError && e.status === 400);
  await assert.rejects(interpretInstruction('x', {}, anthropic(fakeClient(validReply, 'refusal'))), (e) => e instanceof InterpretError && e.status === 422);
  await assert.rejects(interpretInstruction('x', {}, anthropic(fakeClient(validReply, 'max_tokens'))), (e) => e instanceof InterpretError && e.status === 502);
  await assert.rejects(interpretInstruction('x', {}, anthropic(fakeClient('{not json'))), /malformed JSON/);
  await assert.rejects(interpretInstruction('x', {}, anthropic(fakeClient({ understood: true }))), /schema validation/);
  await assert.rejects(interpretInstruction('x', {}, { provider: null }), (e) => e instanceof InterpretError && e.status === 503);
});

function groqResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
const groqOk = (content, finish = 'stop') => groqResponse({ choices: [{ finish_reason: finish, message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] });

test('the strict JSON schema closes every object and avoids unsupported keywords', () => {
  const schema = strictJsonSchema();
  const text = JSON.stringify(schema);
  assert.ok(!text.includes('"const"'));
  assert.ok(!text.includes('$schema'));
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object' && node.properties) {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
    }
    Object.values(node).forEach(visit);
  };
  visit(schema);
});

test('Groq requests use strict structured output and validate the reply', async () => {
  process.env.GROQ_API_KEY = 'test-key';
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return groqOk(validReply); };
  const result = await interpretInstruction('add a notification service', makeCommerceProject(), { provider: 'groq', fetch });

  assert.equal(result.operations.length, 2);
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'openai/gpt-oss-120b');
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[1].content, /<instruction>\nadd a notification service\n<\/instruction>/);
  assert.equal(body.temperature, 0.5);
  assert.equal(body.seed, 7);
});

test('Groq sampling uses a fixed seed and a low temperature, both overridable', async () => {
  const { groqSampling } = await import('../server/interpret.ts');
  assert.deepEqual(groqSampling({}), { temperature: 0.5, seed: 7 });
  assert.deepEqual(groqSampling({ GROQ_TEMPERATURE: '0.7', GROQ_SEED: '42' }), { temperature: 0.7, seed: 42 });
  assert.deepEqual(groqSampling({ GROQ_TEMPERATURE: 'warm', GROQ_SEED: '1.5' }), { temperature: 0.5, seed: 7 });
  assert.equal(groqSampling({}, 3).seed, 3);
});

test('Groq rate limits are retried once after a short wait, and errors map to clear messages', async () => {
  process.env.GROQ_API_KEY = 'test-key';
  let attempts = 0;
  const flaky = async () => (++attempts === 1 ? groqResponse({}, { status: 429, headers: { 'retry-after': '0.01' } }) : groqOk(validReply));
  const result = await interpretInstruction('x', {}, { provider: 'groq', fetch: flaky });
  assert.equal(attempts, 2);
  assert.equal(result.understood, true);

  await assert.rejects(interpretInstruction('x', {}, { provider: 'groq', fetch: async () => groqResponse({}, { status: 401 }) }), /Groq API key was rejected/);
  await assert.rejects(interpretInstruction('x', {}, { provider: 'groq', fetch: async () => groqResponse({}, { status: 429, headers: { 'retry-after': '60' } }) }), (e) => e.status === 429);
  await assert.rejects(interpretInstruction('x', {}, { provider: 'groq', fetch: async () => groqOk(validReply, 'length') }), /cut off/);
  await assert.rejects(interpretInstruction('x', {}, { provider: 'groq', fetch: async () => groqOk({ understood: 'yes' }) }), /schema validation/);
});

test('an explicit removal of a connection already removed with its component counts as done', () => {
  const project = makeCommerceProject();
  const { outcomes } = applyOperations(project, proposal([
    { op: 'remove_component', id: 'payment' },
    { op: 'remove_relationship', from: 'kafka', to: 'payment' },
  ]));
  assert.ok(outcomes.every((o) => o.applied));
});

test('assumptions that only narrate JSON plumbing are dropped, real questions are kept', async () => {
  const reply = {
    ...validReply,
    assumptions: [
      'Protocol for the new relationships is not defined; left as null.',
      'Exact build path is not specified; assumed a placeholder description in sub field.',
      'Which delivery channels (email, SMS, push) should be supported?',
    ],
  };
  const result = await interpretInstruction('x', {}, { provider: 'anthropic', anthropic: fakeClient(reply) });
  assert.deepEqual(result.assumptions, ['Which delivery channels (email, SMS, push) should be supported?']);
});

test('VOICEARCHITECT_PROVIDER=offline ignores configured keys', async () => {
  const { activeProvider, activeModel, aiConfigured } = await import('../server/interpret.ts');
  const saved = { ...process.env };
  try {
    process.env.GROQ_API_KEY = 'gsk_test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    delete process.env.VOICEARCHITECT_PROVIDER;
    assert.equal(activeProvider(), 'anthropic', 'Claude is the default when both keys are set');
    process.env.VOICEARCHITECT_PROVIDER = 'groq';
    assert.equal(activeProvider(), 'groq', 'Groq stays available on request');
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VOICEARCHITECT_PROVIDER;
    assert.equal(activeProvider(), 'groq', 'Groq is the fallback without a Claude key');
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    process.env.VOICEARCHITECT_PROVIDER = 'offline';
    assert.equal(activeProvider(), null);
    assert.equal(activeModel(), null);
    assert.equal(aiConfigured(), false);
    await assert.rejects(interpretInstruction('add a cache', {}), (e) => e instanceof InterpretError && e.status === 503);
  } finally {
    for (const key of ['GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'VOICEARCHITECT_PROVIDER']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('the interpretation prompt accepts Hinglish and answers reviewers in English', async () => {
  const { SYSTEM_PROMPT } = await import('../server/interpret.ts');
  assert.match(SYSTEM_PROMPT, /Hinglish/);
  assert.match(SYSTEM_PROMPT, /"hata do"/);
  assert.match(SYSTEM_PROMPT, /Always write items and assumptions in English/);
});

test('Claude Haiku 5.5 gets no server-side fallback; other Claude models do; usage reports counts only', async () => {
  const { supportsServerSideFallback } = await import('../server/interpret.ts');
  assert.equal(supportsServerSideFallback('claude-haiku-5-5'), false);
  assert.equal(supportsServerSideFallback('claude-sonnet-5-5'), true);
  assert.equal(supportsServerSideFallback('claude-opus-5-5'), true);

  const saved = process.env.VOICEARCHITECT_MODEL;
  process.env.VOICEARCHITECT_MODEL = 'claude-haiku-5-5';
  try {
    const client = fakeClient(validReply);
    const usage = [];
    await interpretInstruction('add a notification service', makeCommerceProject(), { provider: 'anthropic', anthropic: client, onUsage: (u) => usage.push(u) });
    assert.equal(client.calls[0].model, 'claude-haiku-5-5');
    assert.equal('fallbacks' in client.calls[0], false);
    assert.equal('betas' in client.calls[0], false);
    assert.deepEqual(usage, [{ inputTokens: 1200, outputTokens: 300, cacheReadTokens: 900, cacheWriteTokens: 0 }]);
    assert.doesNotMatch(JSON.stringify(usage), /notification/);
  } finally {
    if (saved === undefined) delete process.env.VOICEARCHITECT_MODEL; else process.env.VOICEARCHITECT_MODEL = saved;
  }
});
