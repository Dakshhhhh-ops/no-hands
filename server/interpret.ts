import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { InterpretationSchema } from '../src/types/schema.ts';
import { DailyCap, RateLimiter, clientKey, readLimits, withTimeout } from './limits.ts';
import type { FallbackReason } from './limits.ts';
import type { Interpretation } from '../src/types/schema.ts';

/**
 * Server-side interpreter. The API key stays on the server; the browser only ever
 * sees the validated interpretation. Two providers are supported:
 *   - Groq (GROQ_API_KEY), default model openai/gpt-oss-120b with strict JSON schema
 *   - Anthropic (ANTHROPIC_API_KEY), default model claude-opus-5-5
 * If both keys are set, Groq is used unless VOICEARCHITECT_PROVIDER=anthropic.
 * VOICEARCHITECT_PROVIDER=offline ignores all keys and uses the offline rules.
 * Settings are read on every call because Vite loads .env.local after this module.
 */

export type Provider = 'groq' | 'anthropic';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const SYSTEM_PROMPT = `You turn a spoken or typed instruction into precise edits to a software architecture model.

The model has components (id, name, type, sub, responsibilities), directed relationships (from -> to, label, optional protocol), API operations owned by a component, and requirements (REQ-* ids). Component types: CLIENT, GATEWAY, SERVICE, CACHE, DATABASE, QUEUE, EXTERNAL.

Return operations that make exactly the change the instruction asks for:
- Reuse existing component ids exactly as given. New component ids are short kebab-case, for example "notification-service".
- Direction follows the flow of calls or data: caller -> callee, producer -> queue, queue -> consumer.
- When the instruction asks for a quality or policy rather than a new box (rate limiting, encryption, a latency target, "keep X as the source of truth"), record it with add_requirement on a descriptive REQ-* id such as REQ-AUTH-RATE-LIMIT instead of inventing a component.
- Set an add_requirement's resolution to the concrete choice the speaker states (for example "5 attempts per minute per IP" or "read from PostgreSQL until Redis recovers") and null when they state none. Never invent a value. To record a choice on an existing requirement, reuse its id.
- When a new service needs to be reachable by clients, connect it through the existing gateway if there is one.
- Remove components or connections only when the instruction explicitly asks for it. Removing a component also removes its connections and API operations automatically, so do not remove those separately.
- Do not add anything the instruction does not ask for or clearly imply. If a detail is needed but not stated (a threshold, a retry policy, which database), do not guess it: leave it out and list it in assumptions as an open question.
- In update operations, set every field you are not changing to null. Set protocol to null unless the instruction names one.
- The text may come from speech-to-text. Read through transcription slips such as "red is" for Redis, "post gress" for PostgreSQL, or "cue" for queue.
- The instruction may be in English, Hindi written in Latin letters, or Hinglish (the two mixed). Read it for meaning. Common Hinglish: "laga do" / "lagao" / "daal do" = add or put; "hata do" / "hatao" / "nikal do" = remove; "jodo" / "connect karo" = connect; "X ko Y se connect karo" = connect X to Y; "X ke aage" = in front of X; "seedha" = directly; "alag container mein daalo" = run as its own service; "aur" = and; "bhi" = also; "mat karo" = do not.
- Always write items and assumptions in English, whatever language the instruction uses.

items: one entry per logical change, with a short imperative title and a one-sentence detail a reviewer can check.
assumptions: open questions and anything you interpreted rather than read literally, written for an engineer reviewing the change. Never mention schema field names such as sub or id.
New components: match the naming style of the existing components, and give sub a short description of the component's role. Never invent file paths, image names, ports, or versions for them; they do not exist in code yet.
If the text is not a request to change this architecture, or it is too ambiguous to act on, set understood to false, return no operations, and put a clarifying question in assumptions.`;

export function activeProvider(): Provider | null {
  const forced = process.env.VOICEARCHITECT_PROVIDER;
  // 'offline' forces the built-in rules even when keys are present (used by the browser tests).
  if (forced === 'offline') return null;
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (forced === 'groq') return hasGroq ? 'groq' : null;
  if (forced === 'anthropic') return hasAnthropic ? 'anthropic' : null;
  if (hasGroq) return 'groq';
  if (hasAnthropic) return 'anthropic';
  return null;
}

export function activeModel(provider = activeProvider()): string | null {
  if (provider === 'groq') return process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  if (provider === 'anthropic') return process.env.VOICEARCHITECT_MODEL || 'claude-opus-5-5';
  return null;
}

export function aiConfigured(): boolean {
  return activeProvider() !== null;
}

export class InterpretError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

interface ModelSnapshot {
  name?: unknown;
  components?: unknown;
  relationships?: unknown;
  apiOperations?: unknown;
  requirements?: unknown;
}

/** Only the parts of the project the model needs; provenance and history are dropped. */
function compactProject(project: ModelSnapshot) {
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  return {
    name: project.name,
    components: list(project.components).map((c) => ({ id: c.id, name: c.name, type: c.type, sub: c.sub, responsibilities: c.responsibilities })),
    relationships: list(project.relationships).map((r) => ({ from: r.from, to: r.to, label: r.label, ...(r.protocol ? { protocol: r.protocol } : {}) })),
    apiOperations: list(project.apiOperations).map((a) => ({ id: a.id, componentId: a.componentId, method: a.method, path: a.path, summary: a.summary })),
    requirements: list(project.requirements).map((q) => ({ id: q.id, text: q.text, status: q.status })),
  };
}

function userMessage(instruction: string, project: ModelSnapshot): string {
  return `<current_architecture>\n${JSON.stringify(compactProject(project))}\n</current_architecture>\n\n<instruction>\n${instruction}\n</instruction>`;
}

function parseInterpretation(text: string): Interpretation {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InterpretError('The model returned malformed JSON.', 502);
  }
  const parsed = InterpretationSchema.safeParse(raw);
  if (!parsed.success) throw new InterpretError('The model returned an interpretation that failed schema validation.', 502);
  return { ...parsed.data, assumptions: parsed.data.assumptions.filter((line) => !SCHEMA_PLUMBING.test(line)) };
}

/**
 * Reviewer-facing assumptions should be about the architecture. Smaller models
 * sometimes narrate how they filled the JSON ("protocol left as null"), so those
 * lines are dropped; real open questions pass through untouched.
 */
const SCHEMA_PLUMBING = /\bnull\b|\bsub (field|description)\b|\bplaceholder\b|\bempty string\b|\bprotocol\b[^.]*\b(not|un)(defined|specified|stated)\b/i;

/**
 * JSON Schema for strict structured outputs: every object closed and fully
 * required, `const` rewritten as a one-value `enum`, no `$schema` header.
 */
export function strictJsonSchema(): Record<string, unknown> {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$schema') continue;
      if (key === 'const') {
        out.enum = [value];
        continue;
      }
      out[key] = visit(value);
    }
    if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
      out.required = Object.keys(out.properties as object);
      out.additionalProperties = false;
    }
    return out;
  };
  return visit(z.toJSONSchema(InterpretationSchema)) as Record<string, unknown>;
}

let anthropicClient: Anthropic | null = null;

async function interpretWithAnthropic(instruction: string, project: ModelSnapshot, anthropic: Anthropic): Promise<Interpretation> {
  const response = await anthropic.beta.messages.create({
    model: activeModel('anthropic')!,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: (process.env.VOICEARCHITECT_EFFORT || 'medium') as 'low' | 'medium' | 'high',
      format: zodOutputFormat(InterpretationSchema),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage(instruction, project) }],
  });

  if (response.stop_reason === 'refusal') throw new InterpretError('The model declined to interpret this instruction.', 422);
  if (response.stop_reason === 'max_tokens') throw new InterpretError('The interpretation was cut off. Try a shorter instruction.', 502);
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new InterpretError('The model returned no interpretation.', 502);
  return parseInterpretation(textBlock.text);
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Sampling settings that keep the same instruction close to the same proposal.
 * Groq documents seed as best-effort determinism and recommends 0.5-0.7 for
 * reasoning models, so the default is the low end of that range plus a fixed seed.
 */
export function groqSampling(env: NodeJS.ProcessEnv = process.env, seedOverride?: number) {
  const temperature = Number(env.GROQ_TEMPERATURE);
  const seed = seedOverride ?? Number(env.GROQ_SEED);
  return {
    temperature: Number.isFinite(temperature) && env.GROQ_TEMPERATURE !== undefined && env.GROQ_TEMPERATURE !== '' ? temperature : 0.5,
    seed: Number.isInteger(seed) && (seedOverride !== undefined || (env.GROQ_SEED ?? '') !== '') ? seed : 7,
  };
}

async function interpretWithGroq(instruction: string, project: ModelSnapshot, fetchImpl: FetchLike, seed?: number): Promise<Interpretation> {
  const model = activeModel('groq')!;
  const request = (responseFormat: Record<string, unknown>, system: string) => {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage(instruction, project) },
      ],
      response_format: responseFormat,
      // Groq's free tier allows ~8k tokens a minute; a typical reply uses well under 1k.
      max_completion_tokens: Number(process.env.GROQ_MAX_TOKENS) || 3000,
      ...groqSampling(process.env, seed),
    };
    if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = process.env.GROQ_REASONING_EFFORT || 'medium';
    return fetchImpl(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(readLimits().timeoutMs),
    });
  };

  const schema = strictJsonSchema();
  let response: Response;
  try {
    response = await request({ type: 'json_schema', json_schema: { name: 'architecture_interpretation', strict: true, schema } }, SYSTEM_PROMPT);
    // Free-tier rate limits reset within seconds; wait once if Groq says the wait is short.
    if (response.status === 429) {
      const waitSeconds = Number(response.headers.get('retry-after')) || 5;
      if (waitSeconds <= 20) {
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        response = await request({ type: 'json_schema', json_schema: { name: 'architecture_interpretation', strict: true, schema } }, SYSTEM_PROMPT);
      }
    }
    // Models without schema support reject response_format; retry in JSON object mode.
    if (response.status === 400) {
      const detail = await response.clone().text();
      if (/response_format|json_schema|structured/i.test(detail) && /support/i.test(detail)) {
        response = await request(
          { type: 'json_object' },
          `${SYSTEM_PROMPT}\n\nReply with only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`,
        );
      }
    }
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new InterpretError('Groq took too long to answer. Try again.', 504);
    }
    throw new InterpretError('Could not reach the Groq API.', 502);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new InterpretError('The Groq API key was rejected.', 502);
    if (response.status === 429) throw new InterpretError('Rate limited by the Groq API. Try again in a moment.', 429);
    const detail = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
    const message = typeof detail?.error?.message === 'string' ? detail.error.message.slice(0, 160) : '';
    throw new InterpretError(`Groq API error ${response.status}${message ? `: ${message}` : ''}`, 502);
  }

  const data = await response.json().catch(() => null) as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }> } | null;
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === 'length') throw new InterpretError('The interpretation was cut off. Try a shorter instruction.', 502);
  if (typeof choice?.message?.content !== 'string') throw new InterpretError('The model returned no interpretation.', 502);
  return parseInterpretation(choice.message.content);
}

export interface InterpretOptions {
  provider?: Provider | null;
  anthropic?: Anthropic;
  fetch?: FetchLike;
  /** Overrides the sampling seed (Groq); the eval uses a different seed per run. */
  seed?: number;
}

export async function interpretInstruction(text: string, project: ModelSnapshot, options: InterpretOptions = {}): Promise<Interpretation> {
  const instruction = String(text || '').trim();
  if (!instruction) throw new InterpretError('The instruction is empty.', 400);
  if (instruction.length > 4000) throw new InterpretError('The instruction is too long. Keep it under 4,000 characters.', 400);

  const provider = options.provider === undefined ? activeProvider() : options.provider;
  if (provider === 'groq') return interpretWithGroq(instruction, project, options.fetch || fetch, options.seed);
  if (provider === 'anthropic') {
    anthropicClient ??= options.anthropic ? null : new Anthropic();
    return interpretWithAnthropic(instruction, project, options.anthropic || anthropicClient!);
  }
  throw new InterpretError('No model provider is configured.', 503);
}

function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new InterpretError('Request body is too large.', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new InterpretError('Request body is not valid JSON.', 400));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** A refusal the browser answers by switching to the offline rules for this preview. */
function sendFallback(res: ServerResponse, status: number, fallback: FallbackReason, error: string, retryAfterSeconds?: number) {
  if (retryAfterSeconds) res.setHeader('Retry-After', String(retryAfterSeconds));
  sendJson(res, status, { error, fallback, ...(retryAfterSeconds ? { retryAfter: retryAfterSeconds } : {}) });
}

export interface ApiOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  /** Replaces the model call; used by tests. */
  interpret?: (text: string, project: ModelSnapshot) => Promise<Interpretation>;
}

/**
 * Connect-style middleware for /api/health, /api/status, and /api/interpret.
 * Instructions and keys are never logged.
 */
export function createApiMiddleware(options: ApiOptions = {}) {
  const limits = readLimits(options.env);
  const perIp = new RateLimiter(limits.perMinute, 60_000, options.now);
  const daily = new DailyCap(limits.dailyCap, options.now);
  const startedAt = (options.now || Date.now)();
  const interpret = options.interpret || ((text: string, project: ModelSnapshot) => interpretInstruction(text, project));

  return async function apiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = (req.url || '').split('?')[0];
    if (url === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, {
        status: 'ok',
        uptimeSeconds: Math.round(((options.now || Date.now)() - startedAt) / 1000),
        interpreter: aiConfigured() ? 'model' : 'offline',
      });
      return;
    }
    if (url === '/api/status' && req.method === 'GET') {
      const provider = activeProvider();
      sendJson(res, 200, {
        ai: provider !== null,
        provider,
        model: activeModel(provider),
        fallback: provider !== null && daily.reached ? 'daily_cap' : null,
      });
      return;
    }
    if (url !== '/api/interpret') {
      next();
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Use POST.' });
      return;
    }
    if (!aiConfigured()) {
      sendJson(res, 503, { error: 'No model is configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY on the server (.env.local locally) and restart.' });
      return;
    }

    const slot = perIp.take(clientKey(req, limits.trustProxy));
    if (!slot.ok) {
      sendFallback(res, 429, 'rate_limit', 'Too many previews from this address in the last minute.', slot.retryAfterSeconds);
      return;
    }
    try {
      const body = await readJsonBody(req, limits.maxBodyBytes);
      if (!daily.take()) {
        sendFallback(res, 429, 'daily_cap', "Today's model limit for this server is used up.");
        return;
      }
      const interpretation = await withTimeout(interpret(String(body.text || ''), (body.project || {}) as ModelSnapshot), limits.timeoutMs);
      sendJson(res, 200, { interpretation, provider: activeProvider(), model: activeModel() });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        sendFallback(res, 504, 'timeout', 'The model took too long to answer.');
      } else if (error instanceof InterpretError) {
        if (error.status === 429) sendFallback(res, 429, 'provider_limit', error.message);
        else if (error.status >= 500) sendFallback(res, error.status, error.status === 504 ? 'timeout' : 'provider_error', error.message);
        else sendJson(res, error.status, { error: error.message });
      } else if (error instanceof Anthropic.AuthenticationError) {
        sendFallback(res, 502, 'provider_error', 'The Anthropic API key was rejected.');
      } else if (error instanceof Anthropic.RateLimitError) {
        sendFallback(res, 429, 'provider_limit', 'Rate limited by the Anthropic API. Try again in a moment.');
      } else if (error instanceof Anthropic.APIError) {
        sendFallback(res, 502, 'provider_error', `Anthropic API error ${error.status ?? ''}`.trim());
      } else {
        sendFallback(res, 500, 'provider_error', 'Interpretation failed unexpectedly.');
      }
    }
  };
}

/** The middleware the dev, preview, and production servers use. */
export const apiMiddleware = createApiMiddleware();
