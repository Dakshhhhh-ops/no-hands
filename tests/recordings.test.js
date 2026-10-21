import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApiMiddleware, interpretationKey, InterpretError } from '../server/interpret.ts';
import { RecordingStore, recordingKey } from '../server/recordings.ts';

const interpretation = {
  understood: true,
  summary: 'Cache trips',
  items: [{ title: 'Put Redis in front of trips-api', detail: 'trips-api reads through Redis.' }],
  assumptions: [],
  operations: [],
};
const project = {
  name: 'ride-share-platform',
  components: [{ id: 'trips-api', name: 'trips-api', type: 'SERVICE', sub: '', responsibilities: [] }],
  relationships: [],
  apiOperations: [],
  requirements: [],
};
const TEXT = 'Add a Redis cache in front of the trips API';
const GROQ = 'openai/gpt-oss-120b';

function call(middleware, { method = 'POST', url = '/api/interpret', body = { text: TEXT, project } } = {}) {
  const payload = method === 'POST' ? JSON.stringify(body) : '';
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  Object.assign(req, { method, url, headers: {}, socket: { remoteAddress: '10.1.1.1' } });
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end: (text) => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }),
    };
    middleware(req, res, () => resolve({ status: 'next' }));
  });
}

/** Runs fn with only the given provider variables set and a fresh temporary recordings folder. */
async function withEnv(vars, fn) {
  const names = ['GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'VOICEARCHITECT_PROVIDER', 'VOICEARCHITECT_MODEL', 'GROQ_MODEL'];
  const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  for (const n of names) delete process.env[n];
  Object.assign(process.env, vars);
  const dir = mkdtempSync(path.join(tmpdir(), 'va-rec-'));
  try {
    return await fn(new RecordingStore(dir), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  }
}

const groqRecording = () => ({ key: interpretationKey(GROQ, TEXT, project), provider: 'groq', model: GROQ, recordedAt: '2026-10-21T00:00:00Z', interpretation });

test('the recording key covers model, system prompt, output schema, and the exact user message', () => {
  const base = recordingKey('m', 'prompt', 'schema', 'message');
  assert.match(base, /^[a-f0-9]{64}$/);
  assert.equal(base, recordingKey('m', 'prompt', 'schema', 'message'));
  for (const changed of [
    recordingKey('m2', 'prompt', 'schema', 'message'),
    recordingKey('m', 'prompt2', 'schema', 'message'),
    recordingKey('m', 'prompt', 'schema2', 'message'),
    recordingKey('m', 'prompt', 'schema', 'message2'),
  ]) {
    assert.notEqual(changed, base);
  }
  const notes = { source: 'pasted', text: 'We decided to add a cache.' };
  assert.notEqual(interpretationKey('m', TEXT, project), interpretationKey('m', TEXT, project, notes));
  assert.notEqual(interpretationKey('m', TEXT, project), interpretationKey('m', `${TEXT}.`, project));
});

test('with recording on, a live answer is saved, and the same request is then served from it', () => withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, async (store, dir) => {
  let live = 0;
  const api = createApiMiddleware({ recordings: store, record: true, interpret: async () => { live += 1; return interpretation; } });
  const first = await call(api);
  assert.equal(first.status, 200);
  assert.equal(first.body.recorded, undefined);
  assert.equal(readdirSync(dir).length, 1);
  const saved = store.get(interpretationKey('claude-opus-5-5', TEXT, project));
  assert.equal(saved.model, 'claude-opus-5-5');
  assert.equal(saved.provider, 'anthropic');
  assert.doesNotMatch(JSON.stringify(saved), /sk-ant-test/);

  const second = await call(api);
  assert.equal(second.body.recorded, true);
  assert.equal(live, 1, 'the recording answered without a second live call');
}));

test('nothing is saved unless recording is on', () => withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, async (store, dir) => {
  const api = createApiMiddleware({ recordings: store, record: false, interpret: async () => interpretation });
  await call(api);
  assert.equal(readdirSync(dir).length, 0);
}));

test('without a key, a recording answers; without one either, the reply says to use the offline rules', () => withEnv({}, async (store) => {
  const api = createApiMiddleware({ recordings: store, interpret: async () => { throw new Error('must not be called'); } });
  const miss = await call(api);
  assert.equal(miss.status, 503);
  assert.equal(miss.body.fallback, 'no_key');

  store.save(groqRecording());
  const hit = await call(api);
  assert.equal(hit.status, 200);
  assert.equal(hit.body.recorded, true);
  assert.equal(hit.body.model, GROQ);
  assert.equal(hit.body.fallback, 'no_key');
  const status = await call(api, { method: 'GET', url: '/api/status' });
  assert.equal(status.body.ai, false);
  assert.equal(status.body.recordings, 1);
}));

test('a rate limit, the daily cap, a timeout, or a provider error tries a recording before the offline rules', () => withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, async (store) => {
  // Recorded with Groq while Claude is active, so only the fallback path can use it.
  store.save(groqRecording());

  const limited = createApiMiddleware({ recordings: store, env: { VOICEARCHITECT_RATE_PER_MINUTE: '1' }, interpret: async () => interpretation });
  assert.equal((await call(limited)).body.recorded, undefined);
  const second = await call(limited);
  assert.equal(second.body.recorded, true);
  assert.equal(second.body.fallback, 'rate_limit');

  const capped = createApiMiddleware({ recordings: store, env: { VOICEARCHITECT_DAILY_CAP: '1' }, interpret: async () => interpretation });
  await call(capped);
  assert.equal((await call(capped)).body.fallback, 'daily_cap');

  const slow = createApiMiddleware({ recordings: store, env: { VOICEARCHITECT_TIMEOUT_MS: '20' }, interpret: () => new Promise(() => {}) });
  const timedOut = await call(slow);
  assert.equal(timedOut.body.recorded, true);
  assert.equal(timedOut.body.fallback, 'timeout');

  const broken = createApiMiddleware({ recordings: store, interpret: async () => { throw new InterpretError('Could not reach the API.', 502); } });
  assert.equal((await call(broken)).body.fallback, 'provider_error');

  const unrecorded = await call(broken, { body: { text: 'connect billing to kafka', project } });
  assert.equal(unrecorded.status, 502);
  assert.equal(unrecorded.body.recorded, undefined);
  assert.equal(unrecorded.body.fallback, 'provider_error');
}));

test('a corrupt recording is ignored, and keys cannot point outside the folder', () => withEnv({}, async (store) => {
  const key = interpretationKey(GROQ, TEXT, project);
  store.save({ key, provider: 'groq', model: GROQ, recordedAt: 'x', interpretation: { understood: 'yes' } });
  assert.equal(store.get(key), null);
  assert.equal(store.get('../../etc/passwd'), null);
  assert.throws(() => store.save({ ...groqRecording(), key: '../../escape' }));
}));
