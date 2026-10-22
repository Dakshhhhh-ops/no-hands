import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import { activeModel, activeProvider, apiMiddleware } from './interpret.ts';
import { applySecurityHeaders } from './securityHeaders.ts';

/**
 * Production server: serves the built app from dist/ and the interpretation API routes.
 * Run with `npm run build && npm start`. Every response carries the headers from
 * securityHeaders.ts; text assets are sent Brotli- or gzip-compressed when the browser
 * accepts it.
 */

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Text formats worth compressing. Images and woff2 are already compressed. */
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.yml', '.yaml', '.txt']);
/** Below this, compression saves less than the extra header costs. */
const MIN_COMPRESS_BYTES = 1024;

export function cacheControl(urlPath: string): string {
  if (urlPath === '/sw.js' || urlPath.endsWith('.html')) return 'no-cache, no-store, must-revalidate';
  if (urlPath.startsWith('/assets/') || /^\/workbox-.*\.js$/.test(urlPath)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

/** The best encoding the request accepts: br, then gzip, else none. Honors q=0. */
export function pickEncoding(acceptEncoding: string | string[] | undefined): 'br' | 'gzip' | null {
  const header = (Array.isArray(acceptEncoding) ? acceptEncoding.join(',') : acceptEncoding || '').toLowerCase();
  const accepted = new Set<string>();
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().split(';').map((s) => s.trim());
    const q = params.find((p) => p.startsWith('q='));
    if (name && !(q && Number(q.slice(2)) === 0)) accepted.add(name);
  }
  if (accepted.has('br')) return 'br';
  if (accepted.has('gzip')) return 'gzip';
  return null;
}

interface Cached { mtimeMs: number; raw: Buffer; br?: Buffer; gzip?: Buffer }

export function createAppServer({ root: rootOption = DIST, trustProxy = process.env.VOICEARCHITECT_TRUST_PROXY === '1' } = {}) {
  // Resolved once, so the containment check below compares like with like on every platform.
  const root = path.resolve(rootOption);
  // Built files never change while the server runs, so each is read and compressed once.
  const cache = new Map<string, Cached>();

  async function load(filePath: string): Promise<Cached> {
    const { mtimeMs } = await stat(filePath);
    const hit = cache.get(filePath);
    if (hit && hit.mtimeMs === mtimeMs) return hit;
    const entry: Cached = { mtimeMs, raw: await readFile(filePath) };
    cache.set(filePath, entry);
    return entry;
  }

  async function sendFile(req: IncomingMessage, res: ServerResponse, filePath: string, urlPath: string) {
    const entry = await load(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let body = entry.raw;
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', cacheControl(urlPath));
    if (COMPRESSIBLE.has(ext) && entry.raw.length >= MIN_COMPRESS_BYTES) {
      res.setHeader('Vary', 'Accept-Encoding');
      const encoding = pickEncoding(req.headers['accept-encoding']);
      if (encoding === 'br') {
        entry.br ??= brotliCompressSync(entry.raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 11, [zlib.BROTLI_PARAM_SIZE_HINT]: entry.raw.length } });
        body = entry.br;
      } else if (encoding === 'gzip') {
        entry.gzip ??= gzipSync(entry.raw, { level: 9 });
        body = entry.gzip;
      }
      if (encoding) res.setHeader('Content-Encoding', encoding);
    }
    res.statusCode = 200;
    res.setHeader('Content-Length', body.length);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function serveStatic(req: IncomingMessage, res: ServerResponse) {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.statusCode = 405;
      res.end();
      return;
    }
    let urlPath: string;
    try {
      urlPath = decodeURIComponent((req.url || '/').split('?')[0] ?? '');
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    const filePath = path.join(root, path.normalize(urlPath));
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    try {
      if ((await stat(filePath)).isFile()) {
        await sendFile(req, res, filePath, urlPath);
        return;
      }
    } catch {
      // Not a file: fall through to the SPA entry point or a 404.
    }
    if (path.extname(urlPath)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    await sendFile(req, res, path.join(root, 'index.html'), '/index.html');
  }

  return createServer((req, res) => {
    applySecurityHeaders(req, res, trustProxy);
    const fail = () => {
      if (!res.headersSent) res.statusCode = 500;
      if (!res.writableEnded) res.end();
    };
    // Every promise is caught: an unhandled rejection would stop the whole server.
    apiMiddleware(req, res, () => {
      serveStatic(req, res).catch(fail);
    }).catch(fail);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createAppServer().listen(PORT, () => {
    const provider = activeProvider();
    console.log(`VoiceArchitect on http://localhost:${PORT} (${provider ? `${provider}: ${activeModel(provider)}` : 'no model key: recorded answers, then offline rules'})`);
  });
}
