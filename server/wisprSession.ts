import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { WisprSessionSchema } from '../src/types/schema.ts';
import type { WisprSession } from '../src/types/schema.ts';

/**
 * Seals the Wispr Flow sign-in into the cookie itself, so it survives a server restart
 * (Render's free plan sleeps after 15 idle minutes) with no database.
 *
 * - AES-256-GCM, with the key derived by HKDF-SHA256 from WISPR_SESSION_SECRET.
 * - A fresh 96-bit nonce for every seal. The tag also covers the cookie name and format
 *   version, so a value sealed for another purpose does not open here.
 * - The payload carries its own expiry and is checked with WisprSessionSchema after
 *   decryption. Tampered, truncated, expired, or foreign cookies all open to null.
 *
 * Tokens are never logged; the browser holds only ciphertext in an HttpOnly cookie.
 */

const FORMAT = 'v1';
const AAD = Buffer.from('va_wispr/v1');
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Shorter secrets are refused: a guessable key would let anyone forge a session. */
export const MIN_SECRET_LENGTH = 32;

export type SecretStatus = 'ok' | 'missing' | 'short';

export function secretStatus(secret: string | undefined): SecretStatus {
  if (!secret) return 'missing';
  return secret.length >= MIN_SECRET_LENGTH ? 'ok' : 'short';
}

export class SessionSealer {
  /** False when no usable secret was given: the key is random, so sessions end with the process. */
  readonly persistent: boolean;
  private key: Buffer;

  constructor(secret?: string) {
    this.persistent = secretStatus(secret) === 'ok';
    this.key = this.persistent
      ? Buffer.from(hkdfSync('sha256', secret as string, 'voicearchitect', 'wispr-session-v1', 32))
      : randomBytes(32);
  }

  seal(session: WisprSession): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(AAD);
    const body = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
    return `${FORMAT}.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')}`;
  }

  /** The session in `value`, or null when it was tampered with, expired, or sealed with another key. */
  unseal(value: string, now: number): WisprSession | null {
    if (!value.startsWith(`${FORMAT}.`)) return null;
    const raw = Buffer.from(value.slice(FORMAT.length + 1), 'base64url');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
      decipher.setAAD(AAD);
      decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
      const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]).toString('utf8');
      const parsed = WisprSessionSchema.safeParse(JSON.parse(plain));
      if (!parsed.success || parsed.data.expiresAt <= now) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }
}
