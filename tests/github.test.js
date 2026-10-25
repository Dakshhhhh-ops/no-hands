import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchComposeFromGitHub, parseGitHubUrl, GitHubImportError, MAX_COMPOSE_BYTES } from '../server/githubCompose.ts';

const SHA = 'a'.repeat(40);
const COMPOSE = 'name: shop\nservices:\n  web:\n    image: nginx:1.27\n';

/**
 * A fake of the two GitHub hosts the importer may use. Any other URL fails the test,
 * so nothing here can reach the network.
 */
function fakeGitHub({
  repo = { full_name: 'octo/shop', private: false, visibility: 'public', default_branch: 'main' },
  repoStatus = 200,
  refs = { main: SHA },
  files = { '': [{ name: 'docker-compose.yml', type: 'file', size: COMPOSE.length }, { name: 'README.md', type: 'file', size: 10 }] },
  raw = { 'docker-compose.yml': COMPOSE },
  rawHeaders = {},
  hook,
} = {}) {
  const log = [];
  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const fetch = async (input, init = {}) => {
    const url = new URL(input);
    log.push({ url: input, auth: new Headers(init.headers).get('authorization'), redirect: init.redirect });
    const hooked = hook?.(url, init);
    if (hooked) return hooked;
    if (url.hostname === 'api.github.com') {
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[0] !== 'repos' || parts[1] !== 'octo' || parts[2] !== 'shop') return json({ message: 'Not Found' }, 404);
      if (parts.length === 3) return repoStatus === 200 ? json(repo) : json({ message: 'x' }, repoStatus);
      if (parts[3] === 'commits') {
        const ref = parts.slice(4).join('/');
        return refs[ref] ? json({ sha: refs[ref] }) : json({ message: 'No commit found' }, 422);
      }
      if (parts[3] === 'contents') {
        assert.equal(url.searchParams.get('ref'), SHA, 'listings are read at the commit sha');
        const folder = parts.slice(4).join('/');
        return files[folder] ? json(files[folder]) : json({ message: 'Not Found' }, 404);
      }
    }
    if (url.hostname === 'raw.githubusercontent.com') {
      const [owner, name, sha, ...path] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      assert.deepEqual([owner, name, sha], ['octo', 'shop', SHA], 'the file is read at the commit sha');
      const text = raw[path.join('/')];
      return text === undefined ? new Response('404: Not Found', { status: 404 }) : new Response(text, { status: 200, headers: rawHeaders });
    }
    throw new Error(`Unexpected network call in a test: ${input}`);
  };
  return { fetch, log };
}

const rejects = (promise, code, status) => assert.rejects(promise, (error) => {
  assert.ok(error instanceof GitHubImportError, `expected GitHubImportError, got ${error}`);
  assert.equal(error.code, code);
  if (status) assert.equal(error.status, status);
  return true;
});

test('a repository link imports the compose file at the root, read at the default branch\'s commit', async () => {
  const gh = fakeGitHub();
  const out = await fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: gh.fetch, token: 'ghp_secret' });
  assert.deepEqual({ ...out, text: undefined }, {
    owner: 'octo', repo: 'shop', ref: 'main', sha: SHA, path: 'docker-compose.yml', fileName: 'docker-compose.yml', text: undefined,
    htmlUrl: `https://github.com/octo/shop/blob/${SHA}/docker-compose.yml`,
  });
  assert.equal(out.text, COMPOSE);
  assert.ok(gh.log.every((call) => ['api.github.com', 'raw.githubusercontent.com'].includes(new URL(call.url).hostname)));
  assert.ok(gh.log.every((call) => call.redirect === 'manual'), 'redirects are never followed automatically');
  assert.ok(gh.log.filter((c) => c.url.startsWith('https://api.github.com/')).every((c) => c.auth === 'Bearer ghp_secret'));
  assert.ok(gh.log.filter((c) => c.url.startsWith('https://raw.githubusercontent.com/')).every((c) => c.auth === null), 'the token goes to the API only');
});

test('a /tree/ link reads that ref and folder, including refs with a slash, and a /blob/ link reads that file', async () => {
  const gh = fakeGitHub({
    refs: { main: SHA, 'feature/cache': SHA },
    files: { deploy: [{ name: 'compose.yaml', type: 'file', size: 40 }] },
    raw: { 'deploy/compose.yaml': COMPOSE, 'ops/stack.yml': COMPOSE },
  });
  const folder = await fetchComposeFromGitHub('https://github.com/octo/shop/tree/main/deploy', { fetch: gh.fetch });
  assert.equal(folder.path, 'deploy/compose.yaml');
  assert.equal(folder.ref, 'main');
  const slashed = await fetchComposeFromGitHub('https://github.com/octo/shop/tree/feature/cache/deploy', { fetch: gh.fetch });
  assert.equal(slashed.ref, 'feature/cache');
  assert.equal(slashed.path, 'deploy/compose.yaml');
  const file = await fetchComposeFromGitHub('https://github.com/octo/shop/blob/main/ops/stack.yml', { fetch: gh.fetch });
  assert.equal(file.path, 'ops/stack.yml');
  assert.equal(file.fileName, 'stack.yml');
});

test('anything but a github.com repository link is refused before any request', async () => {
  const gh = fakeGitHub();
  for (const link of [
    'http://github.com/octo/shop',
    'https://gitlab.com/octo/shop',
    'https://github.com.evil.example/octo/shop',
    'https://evil.example/github.com/octo/shop',
    'https://user:pass@github.com/octo/shop',
    'https://github.com:8443/octo/shop',
    'https://raw.githubusercontent.com/octo/shop/main/docker-compose.yml',
    'https://api.github.com/repos/octo/shop',
    'https://github.com/octo',
    'https://github.com/octo/shop/issues',
    'https://github.com/octo/shop/tree/main/../../etc',
    'https://github.com/octo/shop/tree/main/%2e%2e/secrets',
    'https://github.com/-octo/shop',
    'file:///etc/passwd',
    'not a url',
    '',
  ]) {
    await rejects(fetchComposeFromGitHub(link, { fetch: gh.fetch }), 'bad_url', 400);
  }
  assert.equal(gh.log.length, 0);
  assert.deepEqual(parseGitHubUrl('https://github.com/octo/shop.git'), { owner: 'octo', repo: 'shop', treeSegments: [] });
});

test('a redirect is followed only to GitHub\'s own hosts', async () => {
  const moved = fakeGitHub({
    hook: (url) => (url.pathname === '/repos/octo/old' ? new Response(null, { status: 301, headers: { Location: 'https://api.github.com/repos/octo/shop' } }) : null),
  });
  const out = await fetchComposeFromGitHub('https://github.com/octo/old', { fetch: moved.fetch });
  assert.equal(out.text, COMPOSE, 'a renamed repository is followed on api.github.com');

  const away = fakeGitHub({
    hook: (url) => (url.hostname === 'raw.githubusercontent.com' ? new Response(null, { status: 302, headers: { Location: 'https://evil.example/payload' } }) : null),
  });
  await rejects(fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: away.fetch }), 'redirect', 502);
  assert.ok(!away.log.some((call) => call.url.includes('evil.example')), 'the other host is never requested');
});

test('a compose file over 256 KB is refused, whether GitHub states the size or not', async () => {
  const big = `services:\n${'  # padding line to make the file large\n'.repeat(Math.ceil(MAX_COMPOSE_BYTES / 38) + 10)}`;
  const listed = fakeGitHub({ files: { '': [{ name: 'docker-compose.yml', type: 'file', size: big.length }] }, raw: { 'docker-compose.yml': big } });
  await rejects(fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: listed.fetch }), 'too_large', 413);
  assert.ok(!listed.log.some((c) => c.url.startsWith('https://raw.')), 'a file listed as too large is not downloaded');

  // The listing understates the size and no Content-Length is sent: the stream is cut off.
  const streamed = fakeGitHub({ raw: { 'docker-compose.yml': big } });
  await rejects(fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: streamed.fetch }), 'too_large', 413);
  const declared = fakeGitHub({ raw: { 'docker-compose.yml': COMPOSE }, rawHeaders: { 'Content-Length': String(MAX_COMPOSE_BYTES + 1) } });
  await rejects(fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: declared.fetch }), 'too_large', 413);
});

test('a private or missing repository gets a clear message', async () => {
  const missing = fakeGitHub({ repoStatus: 404 });
  await assert.rejects(fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: missing.fetch }), (error) => {
    assert.equal(error.code, 'not_found');
    assert.equal(error.status, 404);
    assert.match(error.message, /github\.com\/octo\/shop was not found\. If it is private, it cannot be imported: only public repositories can\./);
    return true;
  });
  // With a token that can see it, GitHub returns the repository, but it is still refused.
  const visible = fakeGitHub({ repo: { private: true, visibility: 'private', default_branch: 'main' } });
  await assert.rejects(fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: visible.fetch, token: 'ghp_x' }), (error) => {
    assert.equal(error.code, 'private');
    assert.match(error.message, /private repository\. Only public repositories can be imported/);
    return true;
  });
  assert.equal(visible.log.length, 1, 'nothing past the repository check is requested');
});

test('a repository without a compose file says which names were looked for', async () => {
  const gh = fakeGitHub({ files: { '': [{ name: 'README.md', type: 'file', size: 10 }, { name: 'compose', type: 'dir' }] } });
  await assert.rejects(fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: gh.fetch }), (error) => {
    assert.equal(error.code, 'no_compose');
    assert.equal(error.status, 404);
    assert.match(error.message, /No compose file in the root of github\.com\/octo\/shop at main\. Looked for docker-compose\.yml, docker-compose\.yaml, compose\.yml, compose\.yaml\./);
    return true;
  });
  const noRef = fakeGitHub();
  await rejects(fetchComposeFromGitHub('https://github.com/octo/shop/tree/nope', { fetch: noRef.fetch }), 'not_found', 404);
});

test('GitHub\'s rate limit and a slow answer become clear errors', async () => {
  const limited = fakeGitHub({ hook: () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }) });
  await rejects(fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: limited.fetch }), 'rate_limited', 429);

  const slow = (input, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  const started = Date.now();
  await rejects(fetchComposeFromGitHub('https://github.com/octo/shop', { fetch: slow, timeoutMs: 50 }), 'timeout', 504);
  assert.ok(Date.now() - started < 2000);
});


// ---------- POST /api/github/compose ----------

/** Calls the API middleware like a browser would, with a JSON body. */
async function post(api, path, body, { method = 'POST', ip = '10.0.0.1', raw } = {}) {
  const { Readable } = await import('node:stream');
  const req = Readable.from(method === 'POST' ? [Buffer.from(raw ?? JSON.stringify(body))] : []);
  Object.assign(req, { method, url: path, headers: { 'content-type': 'application/json' }, socket: { remoteAddress: ip } });
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      end: (text) => resolve({ status: res.statusCode, headers, body: text ? JSON.parse(text) : null }),
    };
    api(req, res, () => resolve({ status: 404, headers, body: null }));
  });
}

test('the route returns the file for a good link and a clear error otherwise', async () => {
  const { createApiMiddleware } = await import('../server/interpret.ts');
  const gh = fakeGitHub();
  const api = createApiMiddleware({ record: false, github: (link) => fetchComposeFromGitHub(link, { fetch: gh.fetch }) });

  const ok = await post(api, '/api/github/compose', { url: 'https://github.com/octo/shop' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.text, COMPOSE);
  assert.equal(ok.body.sha, SHA);
  assert.equal(ok.headers['cache-control'], 'no-store');

  const bad = await post(api, '/api/github/compose', { url: 'https://evil.example/octo/shop' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'bad_url');
  assert.match(bad.body.error, /public GitHub repository link/);

  assert.equal((await post(api, '/api/github/compose', {})).body.code, 'bad_url', 'a missing url is a bad link');
  assert.equal((await post(api, '/api/github/compose', null, { method: 'GET' })).status, 405);
  assert.equal((await post(api, '/api/github/compose', null, { raw: '{not json' })).status, 400);
  assert.equal((await post(api, '/api/github/compose', null, { raw: JSON.stringify({ url: 'x'.repeat(8000) }) })).status, 413, 'a link is never kilobytes long');
});

test('the route shares the per-IP limit size with the model route, in its own budget', async () => {
  const { createApiMiddleware } = await import('../server/interpret.ts');
  let calls = 0;
  const api = createApiMiddleware({
    record: false,
    env: { VOICEARCHITECT_RATE_PER_MINUTE: '2' },
    github: async () => { calls += 1; throw new GitHubImportError('not_found', 'not found', 404); },
  });
  assert.equal((await post(api, '/api/github/compose', { url: 'https://github.com/a/b' })).status, 404);
  assert.equal((await post(api, '/api/github/compose', { url: 'https://github.com/a/b' })).status, 404);
  const limited = await post(api, '/api/github/compose', { url: 'https://github.com/a/b' });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'rate_limited');
  assert.ok(Number(limited.headers['retry-after']) >= 1);
  assert.equal(calls, 2, 'a limited request never reaches GitHub');
  assert.equal((await post(api, '/api/github/compose', { url: 'https://github.com/a/b' }, { ip: '10.0.0.2' })).status, 404, 'other addresses are not affected');
});

test('an unexpected failure is answered without GitHub\'s own words', async () => {
  const { createApiMiddleware } = await import('../server/interpret.ts');
  const api = createApiMiddleware({ record: false, github: async () => { throw new Error('ECONNRESET internal detail'); } });
  const out = await post(api, '/api/github/compose', { url: 'https://github.com/octo/shop' });
  assert.equal(out.status, 502);
  assert.doesNotMatch(out.body.error, /ECONNRESET/);
});
