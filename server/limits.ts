import type { IncomingMessage } from 'node:http';

/**
 * Abuse limits for the model-backed route. All in memory: a single server process,
 * reset on restart, which is enough to keep a public demo inside a free tier.
 *
 *   VOICEARCHITECT_RATE_PER_MINUTE  model previews per client IP per minute (default 6)
 *   VOICEARCHITECT_DAILY_CAP        model previews per UTC day, all clients together (default 300)
 *   VOICEARCHITECT_TIMEOUT_MS       longest a preview may take before the client falls back (default 45000)
 *   VOICEARCHITECT_MAX_BODY_KB      largest accepted request body (default 256)
 *   VOICEARCHITECT_TRUST_PROXY      "1" to take the client IP from X-Forwarded-For (behind a proxy)
 *
 * When a limit is hit, the route answers with a reason and the browser falls back
 * to the offline rules, so the app keeps working.
 */

export type FallbackReason = 'rate_limit' | 'daily_cap' | 'timeout' | 'provider_limit' | 'provider_error' | 'no_key';

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function readLimits(env: NodeJS.ProcessEnv = process.env) {
  return {
    perMinute: num(env.VOICEARCHITECT_RATE_PER_MINUTE, 6),
    dailyCap: num(env.VOICEARCHITECT_DAILY_CAP, 300),
    timeoutMs: num(env.VOICEARCHITECT_TIMEOUT_MS, 45_000),
    maxBodyBytes: num(env.VOICEARCHITECT_MAX_BODY_KB, 256) * 1024,
    trustProxy: env.VOICEARCHITECT_TRUST_PROXY === '1',
  };
}

/** Sliding one-minute window per key. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private limit: number;
  private windowMs: number;
  private now: () => number;

  // Explicit fields: Node's type stripping (used to run the server) has no parameter properties.
  constructor(limit: number, windowMs = 60_000, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  take(key: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const t = this.now();
    const recent = (this.hits.get(key) || []).filter((stamp) => t - stamp < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000)) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(t);
    return { ok: true };
  }

  private prune(t: number) {
    for (const [key, stamps] of this.hits) {
      if (!stamps.some((stamp) => t - stamp < this.windowMs)) this.hits.delete(key);
    }
  }
}

/** A cap on model calls per UTC day, shared by every client. */
export class DailyCap {
  private day = '';
  private used = 0;
  private cap: number;
  private now: () => number;

  constructor(cap: number, now: () => number = Date.now) {
    this.cap = cap;
    this.now = now;
  }

  private roll() {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
  }

  take(): boolean {
    this.roll();
    if (this.used >= this.cap) return false;
    this.used += 1;
    return true;
  }

  get reached(): boolean {
    this.roll();
    return this.used >= this.cap;
  }

  get remaining(): number {
    this.roll();
    return Math.max(0, this.cap - this.used);
  }
}

/** The client address: the socket, or the first X-Forwarded-For hop when behind a trusted proxy. */
export function clientKey(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || 'unknown';
}

/** Rejects when the promise takes longer than ms. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
