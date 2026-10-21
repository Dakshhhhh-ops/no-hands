import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeModel, activeProvider, apiMiddleware } from './interpret.ts';

/**
 * Production server: serves the built app from dist/ and the interpretation API routes.
 * Run with `npm run build && npm start`. Mirrors the caching and security headers
 * of nginx.conf, which can only serve static files and so can't host the API.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
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

function cacheControl(urlPath: string): string {
  if (urlPath === '/sw.js' || urlPath.endsWith('.html')) return 'no-cache, no-store, must-revalidate';
  if (urlPath.startsWith('/assets/') || /^\/workbox-.*\.js$/.test(urlPath)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

async function sendFile(res: ServerResponse, filePath: string, urlPath: string, method: string) {
  const body = await readFile(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', cacheControl(urlPath));
  res.setHeader('Content-Length', body.length);
  res.end(method === 'HEAD' ? undefined : body);
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
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  try {
    if ((await stat(filePath)).isFile()) {
      await sendFile(res, filePath, urlPath, method);
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
  await sendFile(res, path.join(ROOT, 'index.html'), '/index.html', method);
}

export const server = createServer((req, res) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  apiMiddleware(req, res, () => {
    serveStatic(req, res).catch(() => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    const provider = activeProvider();
    console.log(`VoiceArchitect on http://localhost:${PORT} (${provider ? `${provider}: ${activeModel(provider)}` : 'no model key, offline rules only'})`);
  });
}
