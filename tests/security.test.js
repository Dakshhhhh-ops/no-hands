import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import {
  CONTENT_SECURITY_POLICY, PERMISSIONS_POLICY, STRICT_TRANSPORT_SECURITY, isHttps, securityHeaders,
} from '../server/securityHeaders.ts';
import { cacheControl, createAppServer, pickEncoding } from '../server/serve.ts';

const directives = Object.fromEntries(CONTENT_SECURITY_POLICY.split(';').map((d) => {
  const [name, ...values] = d.trim().split(/\s+/);
  return [name, values];
}));

test('the CSP allows only this origin, with no inline or eval escape hatches', () => {
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['script-src'], ["'self'"]);
  assert.deepEqual(directives['style-src'], ["'self'"]);
  assert.deepEqual(directives['font-src'], ["'self'"]);
  assert.deepEqual(directives['connect-src'], ["'self'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'none'"]);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-inline|unsafe-eval|https?:/);
  // The PNG export draws the diagram from a blob: URL; nothing else is allowed in.
  assert.deepEqual(directives['img-src'], ["'self'", 'data:', 'blob:']);
});

test('only the browser-mic fallback keeps a powerful feature, and only for this origin', () => {
  assert.match(PERMISSIONS_POLICY, /(^|, )microphone=\(self\)/);
  for (const feature of ['camera', 'geolocation', 'payment', 'usb']) assert.match(PERMISSIONS_POLICY, new RegExp(`${feature}=\\(\\)`));
});

test('HSTS is sent only over HTTPS, and a forwarded protocol counts only behind a trusted proxy', () => {
  const plain = { socket: {}, headers: {} };
  const forwarded = { socket: {}, headers: { 'x-forwarded-proto': 'https' } };
  const tls = { socket: { encrypted: true }, headers: {} };
  assert.equal(isHttps(plain, true), false);
  assert.equal(isHttps(forwarded, false), false, 'a client cannot claim HTTPS without a trusted proxy');
  assert.equal(isHttps(forwarded, true), true);
  assert.equal(isHttps({ socket: {}, headers: { 'x-forwarded-proto': 'https, http' } }, true), true);
  assert.equal(isHttps(tls, false), true);
  assert.equal(securityHeaders(false)['Strict-Transport-Security'], undefined);
  assert.equal(securityHeaders(true)['Strict-Transport-Security'], STRICT_TRANSPORT_SECURITY);
  assert.match(STRICT_TRANSPORT_SECURITY, /max-age=(\d+)/);
  assert.ok(Number(STRICT_TRANSPORT_SECURITY.match(/max-age=(\d+)/)[1]) >= 31536000);
});

test('encoding negotiation prefers Brotli, falls back to gzip, and honors q=0', () => {
  assert.equal(pickEncoding('gzip, deflate, br'), 'br');
  assert.equal(pickEncoding('gzip'), 'gzip');
  assert.equal(pickEncoding('br;q=0, gzip;q=0.8'), 'gzip');
  assert.equal(pickEncoding('identity'), null);
  assert.equal(pickEncoding(undefined), null);
});

test('hashed assets are cached for a year; the page and service worker are always revalidated', () => {
  assert.equal(cacheControl('/assets/index-abc.js'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControl('/index.html'), 'no-cache, no-store, must-revalidate');
  assert.equal(cacheControl('/sw.js'), 'no-cache, no-store, must-revalidate');
});

// ---------- the real server, on a temporary dist folder ----------

async function withServer(options, fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'va-dist-'));
  mkdirSync(path.join(root, 'assets'));
  writeFileSync(path.join(root, 'index.html'), `<!doctype html><title>t</title>${'<p>VoiceArchitect</p>'.repeat(200)}`);
  writeFileSync(path.join(root, 'assets', 'app.css'), '.va-app{color:red}'.repeat(400));
  writeFileSync(path.join(root, 'assets', 'tiny.css'), '.a{}');
  writeFileSync(path.join(root, 'assets', 'logo.png'), Buffer.alloc(4096, 7));
  const server = createAppServer({ root, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base, root);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

/** Raw fetch: Node's fetch would decompress for us, hiding what was sent. */
async function get(base, urlPath, headers = {}) {
  const { request } = await import('node:http');
  return new Promise((resolve, reject) => {
    const req = request(`${base}${urlPath}`, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('every response, page, asset, API, and error, carries the security headers', () => withServer({ trustProxy: false }, async (base) => {
  for (const urlPath of ['/', '/assets/app.css', '/api/health', '/missing.js', '/some/route']) {
    const res = await get(base, urlPath);
    assert.equal(res.headers['content-security-policy'], CONTENT_SECURITY_POLICY, urlPath);
    assert.equal(res.headers['permissions-policy'], PERMISSIONS_POLICY, urlPath);
    assert.equal(res.headers['x-frame-options'], 'DENY', urlPath);
    assert.equal(res.headers['x-content-type-options'], 'nosniff', urlPath);
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin', urlPath);
    assert.equal(res.headers['strict-transport-security'], undefined, `${urlPath}: no HSTS over plain HTTP`);
  }
}));

test('behind a trusted HTTPS proxy, responses carry HSTS', () => withServer({ trustProxy: true }, async (base) => {
  const res = await get(base, '/', { 'X-Forwarded-Proto': 'https' });
  assert.equal(res.headers['strict-transport-security'], STRICT_TRANSPORT_SECURITY);
}));

test('text assets are sent compressed with the encoding the browser asked for, and decode to the original', () => withServer({}, async (base, root) => {
  const { readFileSync } = await import('node:fs');
  const original = readFileSync(path.join(root, 'assets', 'app.css'));

  const br = await get(base, '/assets/app.css', { 'Accept-Encoding': 'gzip, br' });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.equal(br.headers.vary, 'Accept-Encoding');
  assert.equal(Number(br.headers['content-length']), br.body.length);
  assert.ok(br.body.length < original.length / 10);
  assert.deepEqual(brotliDecompressSync(br.body), original);

  const gz = await get(base, '/assets/app.css', { 'Accept-Encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.deepEqual(gunzipSync(gz.body), original);

  const plain = await get(base, '/assets/app.css');
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.deepEqual(plain.body, original);

  const tiny = await get(base, '/assets/tiny.css', { 'Accept-Encoding': 'br' });
  assert.equal(tiny.headers['content-encoding'], undefined, 'tiny files are not worth compressing');
  const png = await get(base, '/assets/logo.png', { 'Accept-Encoding': 'br' });
  assert.equal(png.headers['content-encoding'], undefined, 'images are already compressed');
  assert.equal(png.headers['content-type'], 'image/png');
}));

test('a root given with forward slashes or a trailing slash still serves the app', async () => {
  await withServer({}, async (_base, root) => {
    for (const variant of [root.split(path.sep).join('/'), `${root}${path.sep}`]) {
      const server = createAppServer({ root: variant });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const res = await get(`http://127.0.0.1:${server.address().port}`, '/');
        assert.equal(res.status, 200, variant);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  });
});

test('files outside dist are never served, unknown routes get the app, missing files get a 404', () => withServer({}, async (base, root) => {
  // A real file right next to dist, reached by encoded ../ segments.
  const outside = path.join(path.dirname(root), `${path.basename(root)}-secret.txt`);
  writeFileSync(outside, 'SECRET');
  try {
    for (const attempt of [`/..%2f${path.basename(outside)}`, `/%2e%2e/${path.basename(outside)}`, `/assets/..%2f..%2f${path.basename(outside)}`]) {
      const res = await get(base, attempt);
      assert.ok([403, 404].includes(res.status), `${attempt} -> ${res.status}`);
      assert.doesNotMatch(res.body.toString(), /SECRET/);
    }
  } finally {
    rmSync(outside, { force: true });
  }
  const route = await get(base, '/workspace/anything');
  assert.equal(route.status, 200);
  assert.match(route.headers['content-type'], /text\/html/);
  assert.equal((await get(base, '/assets/nope.js')).status, 404);
}));

// ---------- hostile request bodies never stop the server ----------

async function post(base, urlPath, raw) {
  const { request } = await import('node:http');
  return new Promise((resolve, reject) => {
    const req = request(`${base}${urlPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(raw);
  });
}

test('null, arrays, and null items in the project answer an error, and the server keeps running', () => withServer({ trustProxy: false }, async (base) => {
  const notAnObject = ['null', '[]', '"text"', '42', 'true'];
  for (const raw of notAnObject) {
    const res = await post(base, '/api/interpret', raw);
    assert.equal(res.status, 400, raw);
    assert.match(res.body, /must be a JSON object/, raw);
  }
  // Valid objects with junk inside the project: the offline answer (or a recording), never a crash.
  const junk = [
    { text: 'add a cache', project: { components: [null] } },
    { text: 'add a cache', project: { components: [null, 5, 'x', [], { id: 7, name: null, responsibilities: [1, null] }] } },
    { text: 'add a cache', project: { relationships: [null, 5], apiOperations: [null], requirements: [null] } },
    { text: 'add a cache', project: null },
    { text: null, project: { components: 'nope' } },
  ];
  for (const body of junk) {
    const res = await post(base, '/api/interpret', JSON.stringify(body));
    assert.ok(res.status < 500 || res.status === 503, `${JSON.stringify(body)} -> ${res.status} ${res.body}`);
  }
  const health = await get(base, '/api/health');
  assert.equal(health.status, 200, 'the server still answers after every hostile body');
}));

test('an oversized body gets a 413 answer, not a reset connection, and the server keeps running', () => withServer({ trustProxy: false }, async (base) => {
  // Well over the 256 KB default, sent the way a browser would: one request, the whole body.
  const big = JSON.stringify({ text: 'x'.repeat(1024 * 1024), project: {} });
  for (let i = 0; i < 5; i += 1) {
    const res = await post(base, '/api/interpret', big);
    assert.equal(res.status, 413, `attempt ${i + 1}`);
    assert.match(res.body, /too large/);
  }
  const health = await get(base, '/api/health');
  assert.equal(health.status, 200);
}));

test('a client that never stops sending gets the 413 and is disconnected', () => withServer({ trustProxy: false }, async (base) => {
  const { request } = await import('node:http');
  const outcome = await new Promise((resolve) => {
    const req = request(`${base}/api/interpret`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } });
    const chunk = Buffer.alloc(64 * 1024, 120);
    const timer = setInterval(() => { if (!req.destroyed) req.write(chunk); }, 5);
    let status = 0;
    req.on('response', (res) => { status = res.statusCode; res.resume(); });
    req.on('error', () => {});
    req.on('close', () => { clearInterval(timer); resolve({ status }); });
    setTimeout(() => { clearInterval(timer); req.destroy(); resolve({ status, stillOpen: true }); }, 5000).unref();
  });
  assert.equal(outcome.status, 413);
  assert.equal(outcome.stillOpen, undefined, 'the server closed the connection');
}));


test('importing from GitHub left the CSP exactly as it was: the browser still talks only to this origin', () => {
  // GitHub is reached by the server, never by the page, so no GitHub host may appear here.
  assert.equal(CONTENT_SECURITY_POLICY, [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /github/i);
});

test('the GitHub import route answers with the same security headers as every other response', () => withServer({ trustProxy: false }, async (base) => {
  // A link to another host is refused before any request to GitHub, so this needs no network.
  const response = await fetch(`${base}/api/github/compose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://gitlab.com/octo/shop' }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  assert.equal((await response.json()).code, 'bad_url');
}));
