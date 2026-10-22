import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Security headers for every response from the production server and `vite preview`.
 *
 * The CSP allows only this origin. Scripts and styles come from built files, so
 * there is no 'unsafe-inline' or 'unsafe-eval'; React sets inline styles through
 * the CSSOM, which CSP does not restrict. Fonts are self-hosted. Images may be
 * data: or blob: URLs because the PNG export draws the diagram from a blob.
 * The Wispr Flow sign-in is a top-level navigation, which the CSP does not govern.
 */
export const CONTENT_SECURITY_POLICY = [
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
].join('; ');

/** Only the browser microphone fallback needs a powerful feature, and only for this origin. */
export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=(self)',
  'payment=()',
  'usb=()',
].join(', ');

/** Two years, the preload list's minimum. Sent only over HTTPS, as RFC 6797 requires. */
export const STRICT_TRANSPORT_SECURITY = 'max-age=63072000; includeSubDomains';

/** True when the request reached us over HTTPS, directly or (if trusted) through a proxy. */
export function isHttps(req: IncomingMessage, trustProxy: boolean): boolean {
  if ((req.socket as { encrypted?: boolean } | undefined)?.encrypted) return true;
  if (!trustProxy) return false;
  const proto = req.headers['x-forwarded-proto'];
  const first = ((Array.isArray(proto) ? proto[0] ?? '' : proto || '').split(',')[0] ?? '').trim().toLowerCase();
  return first === 'https';
}

export function securityHeaders(https: boolean): Record<string, string> {
  return {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'Permissions-Policy': PERMISSIONS_POLICY,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(https ? { 'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY } : {}),
  };
}

export function applySecurityHeaders(req: IncomingMessage, res: ServerResponse, trustProxy: boolean): void {
  for (const [name, value] of Object.entries(securityHeaders(isHttps(req, trustProxy)))) res.setHeader(name, value);
}
