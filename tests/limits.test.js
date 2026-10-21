import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApiMiddleware, InterpretError } from '../server/interpret.ts';
import { DailyCap, RateLimiter, readLimits } from '../server/limits.ts';

const interpretation = { understood: true, summary: 'ok', items: [], assumptions: [], operations: [] };

/** A minimal request and response pair for the Connect-style middleware. */
function call(middleware, { method = 'POST', url = '/api/interpret', body = { text: 'add a cache', project: {} }, ip = '10.0.0.1', raw } = {}) {
  const payload = raw ?? (method === 'POST' ? JSON.stringify(body) : '');
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  Object.assign(req, { method, url, headers: {}, socket: { remoteAddress: ip } });
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
      end: (text) => resolve({ status: res.statusCode, headers, body: text ? JSON.parse(text) : null }),
    };
    middleware(req, res, () => resolve({ status: 'next' }));
  });
}

/** Runs fn with a model key set, so the route is in model mode, then restores the environment. */
async function withModelKey(fn) {
  const saved = { key: process.env.GROQ_API_KEY, provider: process.env.VOICEARCHITECT_PROVIDER };
  process.env.GROQ_API_KEY = 'test-key-not-used';
  delete process.env.VOICEARCHITECT_PROVIDER;
  try {
    return await fn();
  } finally {
    if (saved.key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = saved.key;
    if (saved.provider === undefined) delete process.env.VOICEARCHITECT_PROVIDER; else process.env.VOICEARCHITECT_PROVIDER = saved.provider;
  }
}

test('limits read from the environment with safe defaults', () => {
  assert.deepEqual(readLimits({}), { perMinute: 6, dailyCap: 300, timeoutMs: 45000, maxBodyBytes: 256 * 1024, trustProxy: false });
  assert.equal(readLimits({ VOICEARCHITECT_RATE_PER_MINUTE: '2', VOICEARCHITECT_DAILY_CAP: 'nonsense' }).dailyCap, 300);
  assert.equal(readLimits({ VOICEARCHITECT_RATE_PER_MINUTE: '2' }).perMinute, 2);
});

test('the per-IP limiter allows a burst, refuses the next, and recovers after a minute', () => {
  let now = 0;
  const limiter = new RateLimiter(2, 60_000, () => now);
  assert.equal(limiter.take('a').ok, true);
  assert.equal(limiter.take('a').ok, true);
  const refused = limiter.take('a');
  assert.equal(refused.ok, false);
  assert.equal(refused.retryAfterSeconds, 60);
  assert.equal(limiter.take('b').ok, true);
  now = 60_001;
  assert.equal(limiter.take('a').ok, true);
});

test('the daily cap resets at the next UTC day', () => {
  let now = Date.UTC(2026, 9, 21, 23, 59);
  const cap = new DailyCap(1, () => now);
  assert.equal(cap.take(), true);
  assert.equal(cap.take(), false);
  assert.equal(cap.reached, true);
  now = Date.UTC(2026, 9, 22, 0, 1);
  assert.equal(cap.take(), true);
});

test('too many previews from one address fall back with a reason and Retry-After', () => withModelKey(async () => {
  const api = createApiMiddleware({ env: { VOICEARCHITECT_RATE_PER_MINUTE: '2' }, interpret: async () => interpretation });
  assert.equal((await call(api)).status, 200);
  assert.equal((await call(api)).status, 200);
  const limited = await call(api);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.fallback, 'rate_limit');
  assert.ok(Number(limited.headers['retry-after']) >= 1);
  assert.equal((await call(api, { ip: '10.0.0.2' })).status, 200);
}));

test('the daily cap falls back, and /api/status reports it before the next preview', () => withModelKey(async () => {
  const api = createApiMiddleware({ env: { VOICEARCHITECT_DAILY_CAP: '1' }, interpret: async () => interpretation });
  assert.equal((await call(api)).status, 200);
  const capped = await call(api);
  assert.equal(capped.status, 429);
  assert.equal(capped.body.fallback, 'daily_cap');
  const status = await call(api, { method: 'GET', url: '/api/status' });
  assert.equal(status.body.ai, true);
  assert.equal(status.body.fallback, 'daily_cap');
}));

test('a slow model times out into a fallback instead of hanging the request', () => withModelKey(async () => {
  const api = createApiMiddleware({ env: { VOICEARCHITECT_TIMEOUT_MS: '30' }, interpret: () => new Promise(() => {}) });
  const slow = await call(api);
  assert.equal(slow.status, 504);
  assert.equal(slow.body.fallback, 'timeout');
}));

test('provider rate limits and provider errors are reported as fallbacks', () => withModelKey(async () => {
  const limited = createApiMiddleware({ interpret: async () => { throw new InterpretError('Rate limited by the Groq API.', 429); } });
  assert.deepEqual((await call(limited)).body, { error: 'Rate limited by the Groq API.', fallback: 'provider_limit' });
  const broken = createApiMiddleware({ interpret: async () => { throw new InterpretError('Could not reach the Groq API.', 502); } });
  const result = await call(broken);
  assert.equal(result.status, 502);
  assert.equal(result.body.fallback, 'provider_error');
}));

test('oversized bodies are refused before any model call', () => withModelKey(async () => {
  let called = false;
  const api = createApiMiddleware({ env: { VOICEARCHITECT_MAX_BODY_KB: '1' }, interpret: async () => { called = true; return interpretation; } });
  const big = await call(api, { raw: JSON.stringify({ text: 'x'.repeat(4096), project: {} }) });
  assert.equal(big.status, 413);
  assert.equal(called, false);
}));

test('/api/health answers without exposing keys', async () => {
  const api = createApiMiddleware({ interpret: async () => interpretation });
  const health = await call(api, { method: 'GET', url: '/api/health' });
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.ok(['model', 'offline'].includes(health.body.interpreter));
  assert.doesNotMatch(JSON.stringify(health.body), /key|token/i);
});

test('instructions are never logged', () => withModelKey(async () => {
  const secret = 'move the billing-ledger-7781 service';
  const logged = [];
  const originals = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const name of Object.keys(originals)) console[name] = (...args) => logged.push(args.join(' '));
  try {
    const api = createApiMiddleware({ env: { VOICEARCHITECT_RATE_PER_MINUTE: '1' }, interpret: async () => { throw new InterpretError('boom', 502); } });
    await call(api, { body: { text: secret, project: {} } });
    await call(api, { body: { text: secret, project: {} } });
  } finally {
    Object.assign(console, originals);
  }
  assert.ok(!logged.some((line) => line.includes('billing-ledger-7781') || line.includes('test-key-not-used')));
}));
