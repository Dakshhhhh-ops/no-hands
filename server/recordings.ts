import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InterpretationSchema } from '../src/types/schema.ts';
import type { Interpretation } from '../src/types/schema.ts';

/**
 * Recorded answers: a successful live interpretation saved as JSON in the repo,
 * keyed by a SHA-256 of everything that determines it: the model, the system
 * prompt, the output schema, and the exact user message (instruction, model
 * snapshot, and any imported notes). A recording answers only when a live call
 * is not possible (no key, a rate limit, the daily cap, a timeout, a provider
 * error), before falling back to the offline rules. With a working key every
 * preview is a live call. Changing the prompt or schema simply stops old
 * recordings from matching.
 *
 * Files hold the interpretation and metadata only; no keys, and no request text
 * beyond what the interpretation itself says.
 */

const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'recordings');

export interface Recording {
  key: string;
  provider: 'anthropic' | 'groq';
  model: string;
  recordedAt: string;
  interpretation: Interpretation;
}

export function recordingKey(model: string, systemPrompt: string, outputSchema: string, userMessage: string): string {
  return createHash('sha256').update(JSON.stringify([model, systemPrompt, outputSchema, userMessage])).digest('hex');
}

export class RecordingStore {
  private dir: string;

  constructor(dir: string = process.env.VOICEARCHITECT_RECORDINGS_DIR || DEFAULT_DIR) {
    this.dir = dir;
  }

  private file(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid recording key.');
    return path.join(this.dir, `${key}.json`);
  }

  get(key: string): Recording | null {
    try {
      const file = this.file(key);
      if (!existsSync(file)) return null;
      const data = JSON.parse(readFileSync(file, 'utf8')) as Recording;
      const parsed = InterpretationSchema.safeParse(data.interpretation);
      if (!parsed.success || data.key !== key) return null;
      return { ...data, interpretation: parsed.data };
    } catch {
      return null;
    }
  }

  /** The first recording that matches any of the keys, in order. */
  find(keys: string[]): Recording | null {
    for (const key of keys) {
      const hit = this.get(key);
      if (hit) return hit;
    }
    return null;
  }

  save(recording: Recording) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(recording.key), `${JSON.stringify(recording, null, 2)}\n`);
  }

  count(): number {
    try {
      return readdirSync(this.dir).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).length;
    } catch {
      return 0;
    }
  }
}
