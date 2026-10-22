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
