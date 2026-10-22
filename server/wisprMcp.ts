import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SessionSealer, secretStatus } from './wisprSession.ts';
import type { WisprSession } from '../src/types/schema.ts';

/**
 * "Import from Wispr Flow": reads one recent Notetaker meeting summary or Scratchpad
 * note through Wispr Flow's read-only MCP server, so it can become a reviewed change.
 *
 * - Discovery at run time: the protected-resource metadata names the authorization
 *   server, and that server's RFC 8414 metadata names every endpoint.
 * - OAuth: dynamic client registration, authorization code grant with PKCE (S256),
 *   the resource parameter set to the MCP URL, and a checked state value.
 * - The sign-in, tokens included, is sealed with AES-256-GCM into an HttpOnly, Secure,
 *   SameSite=Lax cookie (server/wisprSession.ts, keyed by WISPR_SESSION_SECRET), so it
 *   survives a server restart. The browser holds only ciphertext. An expired access
 *   token is refreshed with the refresh token, with the same resource indicator.
 * - MCP over Streamable HTTP: initialize, tools/list, tools/call. Tools are chosen
 *   from what tools/list returns; transcript and dictation tools are never used.
 *
 * Tested against mocks only (tests/wispr.test.js) until a real sign-in is done.
 */

export const MCP_URL = 'https://api.wisprflow.ai/connect/mcp';
export const RESOURCE_METADATA_URL = 'https://api.wisprflow.ai/.well-known/oauth-protected-resource';
const SCOPE = 'openid offline_access';
const COOKIE = 'va_wispr';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MCP_PROTOCOL_VERSION = '2025-06-18';
const MAX_NOTE_CHARS = 20_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type WisprErrorCode = 'not_connected' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'denied' | 'state_mismatch' | 'discovery' | 'unavailable' | 'no_tool' | 'not_found';

export class WisprError extends Error {
  code: WisprErrorCode;
  status: number;
  constructor(code: WisprErrorCode, message: string, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** What the person sees for each failure. Sourced from Wispr's MCP help article where it names the cause. */
export const WISPR_MESSAGES: Record<WisprErrorCode, string> = {
  not_connected: 'Connect Wispr Flow first, or paste your notes instead.',
  unauthorized: 'Your Wispr Flow connection expired or was revoked. Connect again.',
  forbidden: 'Wispr Flow refused access. It needs Notetaker and MCP access on your account (and Cloud Sync, if Flow asks for it). HIPAA-covered accounts, and accounts whose organization admin has disabled MCP, cannot connect.',
  rate_limited: 'Wispr Flow says too many requests. Wait about a minute, then try again.',
  denied: 'The Wispr Flow authorization was cancelled or failed. If you signed in with email and password, the login page must return you to the authorization step to finish; start again with Connect.',
  state_mismatch: 'The sign-in could not be verified (the state did not match). Start again with Connect.',
  discovery: "Wispr Flow's sign-in service could not be reached. Try again later, or paste your notes instead.",
  unavailable: 'Wispr Flow is not answering right now. Try again later, or paste your notes instead.',
  no_tool: "Wispr Flow's MCP server did not offer a tool for meeting summaries or Scratchpad notes.",
  not_found: 'That meeting or note was not found.',
};

interface AuthServer {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
}

interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/** A sign-in as one request sees it: the sealed part plus what this process remembers. */
interface Session extends WisprSession {
  mcpSessionId?: string;
  tools?: McpTool[];
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
}

export interface NoteItem {
  kind: 'meeting' | 'scratchpad';
  id: string;
  title: string;
  date?: string;
}

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const pkceChallenge = (verifier: string) => b64url(createHash('sha256').update(verifier).digest());

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Maps an HTTP status from Wispr to the person-facing error. */
function httpError(status: number): WisprError {
  if (status === 401) return new WisprError('unauthorized', WISPR_MESSAGES.unauthorized, 401);
  if (status === 403) return new WisprError('forbidden', WISPR_MESSAGES.forbidden, 403);
  if (status === 429) return new WisprError('rate_limited', WISPR_MESSAGES.rate_limited, 429);
  if (status === 404) return new WisprError('not_found', WISPR_MESSAGES.not_found, 404);
  return new WisprError('unavailable', WISPR_MESSAGES.unavailable, 502);
}

/** Wispr reports some refusals as tool errors with these sentences (from its MCP help article). */
function toolTextError(text: string): WisprError | null {
  if (/too many requests/i.test(text)) return new WisprError('rate_limited', WISPR_MESSAGES.rate_limited, 429);
  if (/cloud sync must be enabled|hipaa|disabled by your organization|bAA/i.test(text)) return new WisprError('forbidden', `${WISPR_MESSAGES.forbidden} Wispr Flow said: "${text.slice(0, 200)}"`, 403);
  if (/not found/i.test(text)) return new WisprError('not_found', WISPR_MESSAGES.not_found, 404);
  return null;
}

/** Reads a JSON-RPC response from a plain JSON body or a text/event-stream body. */
async function readRpc(response: Response, id: number): Promise<{ result?: unknown; error?: { message?: string } }> {
  const type = response.headers.get('content-type') || '';
  const text = await response.text();
  const messages: unknown[] = [];
  if (type.includes('text/event-stream')) {
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (data) {
        try { messages.push(JSON.parse(data)); } catch { /* ignore keep-alives */ }
      }
    }
  } else if (text) {
    const parsed = JSON.parse(text);
    messages.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  const match = messages.find((m) => (m as { id?: unknown })?.id === id) as { result?: unknown; error?: { message?: string } } | undefined;
  if (!match) throw new WisprError('unavailable', WISPR_MESSAGES.unavailable);
  return match;
}

const words = (tool: McpTool) => `${tool.name} ${tool.description || ''}`.toLowerCase().replace(/[_-]/g, ' ');
const FORBIDDEN_TOOL = /\b(transcripts?|dictation|dictations|history|chat)\b/;

/**
 * Picks the tools for listing and reading meetings and Scratchpad notes from what
 * the server offers. Tools about transcripts, dictation history, or chats are
 * never chosen.
 */
export function chooseTools(tools: McpTool[]) {
  const allowed = tools.filter((tool) => !FORBIDDEN_TOOL.test(words(tool).replace(/\b(no|without|exclud\w*) transcripts?\b/g, '')));
  const pick = (subject: RegExp, action: RegExp, not?: RegExp) => allowed.find((tool) => {
    const text = words(tool);
    return subject.test(text) && action.test(text) && !(not && not.test(text));
  }) || null;
  // A meeting tool may mention "notes" in its description, so note tools must not be about meetings.
  return {
    listMeetings: pick(/\bmeetings?\b/, /\b(list|search|recent|find)\b/),
    readMeeting: pick(/\bmeetings?\b/, /\b(summary|summaries|get|read|fetch|details?)\b/),
    listNotes: pick(/\b(scratchpad|notes?)\b/, /\b(list|search|recent|find)\b/, /\bmeetings?\b/),
    readNote: pick(/\b(scratchpad|notes?)\b/, /\b(get|read|fetch|content)\b/, /\bmeetings?\b/),
  };
}

/** Arguments for a tool call: the id where the schema asks for one, a small limit, and transcripts turned off. */
export function toolArguments(tool: McpTool, id?: string): Record<string, unknown> {
  const props = tool.inputSchema?.properties || {};
  const args: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(props)) {
    const key = name.toLowerCase();
    if (id && /(^id$|_id$|id$)/.test(key)) args[name] = id;
    else if (/transcript/.test(key) && schema.type === 'boolean') args[name] = false;
    else if (/^(limit|max_?results|count|page_?size)$/.test(key) && (schema.type === 'integer' || schema.type === 'number')) args[name] = 5;
  }
  return args;
}

/** Text content of a tool result, or an error the person can act on. */
function toolText(result: unknown): string {
  const r = result as { content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown; isError?: boolean } | undefined;
  const text = (r?.content || []).filter((c) => c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n');
  if (r?.isError) throw toolTextError(text) || new WisprError('unavailable', `${WISPR_MESSAGES.unavailable} Wispr Flow said: "${text.slice(0, 200)}"`);
  if (!text && r?.structuredContent) return JSON.stringify(r.structuredContent);
  return text;
}

/** Finds note-like items (id plus a title or name) anywhere in a tool's JSON output. */
export function extractItems(text: string, kind: NoteItem['kind']): NoteItem[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  const out: NoteItem[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const id = o.id ?? o.meeting_id ?? o.meetingId ?? o.note_id ?? o.noteId;
    const title = o.title ?? o.name ?? o.subject;
    if ((typeof id === 'string' || typeof id === 'number') && typeof title === 'string') {
      const date = o.date ?? o.start_time ?? o.startTime ?? o.created_at ?? o.createdAt ?? o.updated_at;
      out.push({ kind, id: String(id), title: title.slice(0, 200), ...(typeof date === 'string' ? { date } : {}) });
      return;
    }
    Object.values(o).forEach(visit);
  };
  visit(data);
  return out.slice(0, 10);
}

/** A readable summary from a read tool's output, without any transcript fields. */
export function summaryText(text: string): string {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return text.slice(0, MAX_NOTE_CHARS); }
  const parts: string[] = [];
  const visit = (node: unknown, key = '') => {
    if (/transcript|dictation/i.test(key)) return;
    if (typeof node === 'string') {
      if (/summary|notes?|content|body|text|title|decisions?|action|tasks?/i.test(key) && node.trim()) parts.push(node.trim());
      return;
    }
    if (Array.isArray(node)) { node.forEach((item) => visit(item, key)); return; }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) visit(v, k);
  };
  visit(data);
  return (parts.length ? parts.join('\n\n') : text).slice(0, MAX_NOTE_CHARS);
}

export interface WisprOptions {
  fetch?: FetchLike;
  now?: () => number;
  resourceMetadataUrl?: string;
  trustProxy?: boolean;
  /** Key for sealing sign-ins into the cookie. Defaults to WISPR_SESSION_SECRET. */
  secret?: string;
}

/** What one process remembers about a session; rebuilt on demand after a restart. */
interface RuntimeEntry {
  mcpSessionId?: string;
  tools?: McpTool[];
  /** An access token too large for the cookie, valid for the token generation that expires at tokenExpiresAt. */
  accessToken?: string;
  tokenExpiresAt?: number;
  lastUsed: number;
}

/** Browsers drop cookies over 4096 bytes, name and attributes included. */
const MAX_COOKIE_VALUE = 3800;
const MAX_RUNTIME_ENTRIES = 500;
let warnedAboutSecret = false;

const persisted = (session: Session): WisprSession => ({
  sid: session.sid,
  createdAt: session.createdAt,
  expiresAt: session.expiresAt,
  ...(session.redirectUri ? { redirectUri: session.redirectUri } : {}),
  ...(session.clientId ? { clientId: session.clientId } : {}),
  ...(session.state ? { state: session.state } : {}),
  ...(session.verifier ? { verifier: session.verifier } : {}),
  ...(session.tokens ? { tokens: session.tokens } : {}),
});

export class WisprConnector {
  private fetchImpl: FetchLike;
  private now: () => number;
  private resourceMetadataUrl: string;
  private trustProxy: boolean;
  private sealer: SessionSealer;
  /** MCP session ids and tool lists per sign-in. A cache only: losing it costs one initialize. */
  private runtime = new Map<string, RuntimeEntry>();
  /** Sign-ins ended with Disconnect, refused by this process until they would have expired. */
  private revoked = new Map<string, number>();
  /** One refresh at a time per sign-in, so parallel requests do not spend a rotating refresh token twice. */
  private refreshing = new Map<string, Promise<Tokens>>();
  private clients = new Map<string, string>();
  private authServer: Promise<AuthServer> | null = null;
  private mcpUrl = MCP_URL;
  private rpcId = 0;

  constructor(options: WisprOptions = {}) {
    this.fetchImpl = options.fetch || ((input, init) => fetch(input, init));
    this.now = options.now || Date.now;
    this.resourceMetadataUrl = options.resourceMetadataUrl || RESOURCE_METADATA_URL;
    this.trustProxy = options.trustProxy ?? process.env.VOICEARCHITECT_TRUST_PROXY === '1';
    const secret = options.secret ?? process.env.WISPR_SESSION_SECRET;
    this.sealer = new SessionSealer(secret);
    if (options.secret === undefined && !this.sealer.persistent && !warnedAboutSecret) {
      warnedAboutSecret = true;
      const status = secretStatus(secret);
      // Says only whether the secret is set and long enough, never its value.
      console.warn(`WISPR_SESSION_SECRET is ${status === 'short' ? 'shorter than 32 characters, so it is ignored' : 'not set'}: Wispr Flow sign-ins will end when the server restarts.`);
    }
  }

  // ---------- discovery and registration ----------

  /** Protected-resource metadata, then the authorization server's RFC 8414 metadata. */
  discover(): Promise<AuthServer> {
    this.authServer ??= (async () => {
      try {
        const resource = await (await this.fetchImpl(this.resourceMetadataUrl, { headers: { Accept: 'application/json' } })).json() as { resource?: string; authorization_servers?: string[] };
        if (resource.resource) this.mcpUrl = resource.resource;
        const issuer = resource.authorization_servers?.[0];
        if (!issuer) throw new Error('no authorization server');
        const url = new URL(issuer);
        // RFC 8414: the well-known segment goes before any path component of the issuer.
        const metadataUrl = `${url.origin}/.well-known/oauth-authorization-server${url.pathname === '/' ? '' : url.pathname}`;
        const meta = await (await this.fetchImpl(metadataUrl, { headers: { Accept: 'application/json' } })).json() as AuthServer;
        if (!meta.authorization_endpoint || !meta.token_endpoint) throw new Error('incomplete metadata');
        if (meta.code_challenge_methods_supported && !meta.code_challenge_methods_supported.includes('S256')) throw new Error('no S256');
        return meta;
      } catch {
        this.authServer = null;
        throw new WisprError('discovery', WISPR_MESSAGES.discovery, 502);
      }
    })();
    return this.authServer;
  }

  private async clientFor(redirectUri: string, meta: AuthServer, previous: Session | null): Promise<string> {
    // The client registered for this callback URL is kept in the sealed session, so a restart needs no new registration.
    if (previous?.clientId && previous.redirectUri === redirectUri) return previous.clientId;
    const known = this.clients.get(redirectUri);
    if (known) return known;
    if (!meta.registration_endpoint) throw new WisprError('discovery', WISPR_MESSAGES.discovery);
    const response = await this.fetchImpl(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_name: 'VoiceArchitect',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: SCOPE,
      }),
    });
    if (!response.ok) throw httpError(response.status);
    const body = await response.json() as { client_id?: string };
    if (!body.client_id) throw new WisprError('discovery', WISPR_MESSAGES.discovery);
    this.clients.set(redirectUri, body.client_id);
    return body.client_id;
  }

  // ---------- sessions, sealed into the cookie ----------

  /** The sign-in this request carries, or null when there is none or its cookie does not open. */
  private readSession(req: IncomingMessage): Session | null {
    const cookie = String(req.headers.cookie || '');
    const value = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!value) return null;
    const stored = this.sealer.unseal(value, this.now());
    if (!stored || this.revoked.has(stored.sid)) return null;
    const session: Session = { ...stored };
    const cached = this.runtime.get(stored.sid);
    if (cached) {
      session.mcpSessionId = cached.mcpSessionId;
      session.tools = cached.tools;
      if (session.tokens && !session.tokens.accessToken && cached.accessToken && cached.tokenExpiresAt === session.tokens.expiresAt) {
        session.tokens = { ...session.tokens, accessToken: cached.accessToken };
      }
    }
    return session;
  }

  /** Keeps what does not belong in the cookie (MCP session, tool list) for this process. */
  private remember(session: Session) {
    this.runtime.delete(session.sid);
    this.runtime.set(session.sid, {
      mcpSessionId: session.mcpSessionId,
      tools: session.tools,
      accessToken: session.tokens?.accessToken,
      tokenExpiresAt: session.tokens?.expiresAt,
      lastUsed: this.now(),
    });
    // Oldest first in insertion order, so the least recently used go first.
    while (this.runtime.size > MAX_RUNTIME_ENTRIES) {
      const oldest = this.runtime.keys().next().value;
      if (oldest === undefined) break;
      this.runtime.delete(oldest);
    }
  }

  private writeCookie(res: ServerResponse, session: Session) {
    const stored = persisted(session);
    let value = this.sealer.seal(stored);
    if (value.length > MAX_COOKIE_VALUE && stored.tokens?.accessToken) {
      // A very large access token stays in this process; after a restart the refresh token fetches a new one.
      value = this.sealer.seal({ ...stored, tokens: { ...stored.tokens, accessToken: undefined } });
    }
    const maxAge = Math.max(0, Math.floor((session.expiresAt - this.now()) / 1000));
    res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/api/wispr; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
  }

  private clearCookie(res: ServerResponse) {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/api/wispr; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  }

  private revoke(session: Session) {
    const now = this.now();
    for (const [sid, expiresAt] of this.revoked) if (expiresAt <= now) this.revoked.delete(sid);
    this.revoked.set(session.sid, session.expiresAt);
    this.runtime.delete(session.sid);
  }

  /** The callback URL on the origin the person is using. */
  redirectUri(req: IncomingMessage): string {
    const forwardedProto = this.trustProxy ? (String(req.headers['x-forwarded-proto'] || '').split(',')[0] ?? '').trim() : '';
    const proto = forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : (req.socket as { encrypted?: boolean } | undefined)?.encrypted ? 'https' : 'http';
    const forwardedHost = this.trustProxy ? (String(req.headers['x-forwarded-host'] || '').split(',')[0] ?? '').trim() : '';
    const host = forwardedHost || String(req.headers.host || '');
    if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) throw new WisprError('discovery', 'The request host is not valid.', 400);
    return `${proto}://${host}/api/wispr/callback`;
  }

  // ---------- OAuth ----------

  /** Starts a fresh sign-in: returns it and the authorization URL to send the browser to. */
  async startAuthorization(req: IncomingMessage, previous: Session | null): Promise<{ session: Session; url: string }> {
    const meta = await this.discover();
    const redirectUri = this.redirectUri(req);
    const clientId = await this.clientFor(redirectUri, meta, previous);
    const now = this.now();
    const session: Session = {
      sid: b64url(randomBytes(18)),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      redirectUri,
      clientId,
      state: b64url(randomBytes(24)),
      verifier: b64url(randomBytes(48)),
    };
    const url = new URL(meta.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPE,
      state: session.state ?? '',
      code_challenge: pkceChallenge(session.verifier ?? ''),
      code_challenge_method: 'S256',
      resource: this.mcpUrl,
    }).toString();
    return { session, url: url.toString() };
  }

  /** Finishes sign-in from the callback query; the tokens go into the sealed session. */
  async finishAuthorization(session: Session | null, query: URLSearchParams): Promise<void> {
    const state = query.get('state') || '';
    if (!session?.state || !session.verifier || !session.clientId || !session.redirectUri || !state || !sameString(state, session.state)) {
      throw new WisprError('state_mismatch', WISPR_MESSAGES.state_mismatch, 400);
    }
    const { verifier, clientId, redirectUri } = session;
    session.state = undefined;
    session.verifier = undefined;
    if (query.get('error') || !query.get('code')) throw new WisprError('denied', WISPR_MESSAGES.denied, 400);
    const meta = await this.discover();
    const response = await this.fetchImpl(meta.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: query.get('code')!,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource: this.mcpUrl,
      }).toString(),
    });
    if (!response.ok) throw response.status === 400 ? new WisprError('denied', WISPR_MESSAGES.denied, 400) : httpError(response.status);
    session.tokens = this.readTokens(await response.json());
  }

  private readTokens(body: { access_token?: string; refresh_token?: string; expires_in?: number }): Tokens {
    if (!body.access_token) throw new WisprError('denied', WISPR_MESSAGES.denied, 400);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: body.expires_in ? this.now() + body.expires_in * 1000 : undefined,
    };
  }

  /** A current access token, refreshed first when it has expired (or was not kept after a restart). */
  private async accessToken(session: Session): Promise<string> {
    const tokens = session.tokens;
    if (!tokens || (!tokens.accessToken && !tokens.refreshToken)) throw new WisprError('not_connected', WISPR_MESSAGES.not_connected, 401);
    const stale = !tokens.accessToken || (tokens.expiresAt !== undefined && tokens.expiresAt - 30_000 < this.now());
    if (!stale) return tokens.accessToken!;
    const refreshToken = tokens.refreshToken;
    const clientId = session.clientId;
    if (!refreshToken || !clientId) {
      session.tokens = undefined;
      throw new WisprError('unauthorized', WISPR_MESSAGES.unauthorized, 401);
    }
    let pending = this.refreshing.get(session.sid);
    if (!pending) {
      pending = this.refresh(refreshToken, clientId).finally(() => this.refreshing.delete(session.sid));
      this.refreshing.set(session.sid, pending);
    }
    let fresh: Tokens;
    try {
      fresh = await pending;
    } catch (error) {
      session.tokens = undefined;
      throw error;
    }
    session.tokens = fresh;
    return fresh.accessToken;
  }

  /** The refresh_token grant, with the same resource indicator as the sign-in. */
  private async refresh(refreshToken: string, clientId: string): Promise<Tokens> {
    const meta = await this.discover();
    const response = await this.fetchImpl(meta.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, resource: this.mcpUrl }).toString(),
    });
    if (!response.ok) throw new WisprError('unauthorized', WISPR_MESSAGES.unauthorized, 401);
    const fresh = this.readTokens(await response.json());
    // A server that does not rotate refresh tokens leaves the old one in force.
    return { ...fresh, refreshToken: fresh.refreshToken || refreshToken };
  }

  // ---------- MCP over Streamable HTTP ----------

  private async rpc(session: Session, method: string, params?: unknown): Promise<unknown> {
    // The MCP URL comes from discovery; after a restart nothing has discovered it yet.
    await this.discover();
    const id = ++this.rpcId;
    const response = await this.fetchImpl(this.mcpUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.accessToken(session)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        ...(session.mcpSessionId ? { 'Mcp-Session-Id': session.mcpSessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
    });
    if (response.status === 404 && session.mcpSessionId) {
      // The MCP session ended; start a new one once.
      session.mcpSessionId = undefined;
      session.tools = undefined;
      await this.ensureMcp(session);
      return this.rpc(session, method, params);
    }
    if (response.status === 401) session.tokens = undefined;
    if (!response.ok) throw httpError(response.status);
    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId) session.mcpSessionId = sessionId;
    const message = await readRpc(response, id);
    if (message.error) throw toolTextError(message.error.message || '') || new WisprError('unavailable', WISPR_MESSAGES.unavailable);
    return message.result;
  }

  private async ensureMcp(session: Session): Promise<McpTool[]> {
    if (session.tools) return session.tools;
    await this.rpc(session, 'initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'VoiceArchitect', version: '0.1.0' },
    });
    await this.fetchImpl(this.mcpUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.accessToken(session)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        ...(session.mcpSessionId ? { 'Mcp-Session-Id': session.mcpSessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    const listed = await this.rpc(session, 'tools/list') as { tools?: McpTool[] };
    session.tools = Array.isArray(listed?.tools) ? listed.tools : [];
    return session.tools;
  }

  private async callTool(session: Session, tool: McpTool, id?: string): Promise<string> {
    const result = await this.rpc(session, 'tools/call', { name: tool.name, arguments: toolArguments(tool, id) });
    return toolText(result);
  }

  /** Recent meetings and Scratchpad notes: titles and ids only. */
  async listRecent(session: Session): Promise<NoteItem[]> {
    const tools = chooseTools(await this.ensureMcp(session));
    if (!tools.listMeetings && !tools.listNotes) throw new WisprError('no_tool', WISPR_MESSAGES.no_tool, 404);
    const items: NoteItem[] = [];
    if (tools.listMeetings) items.push(...extractItems(await this.callTool(session, tools.listMeetings), 'meeting'));
    if (tools.listNotes) items.push(...extractItems(await this.callTool(session, tools.listNotes), 'scratchpad'));
    return items;
  }

  /** One meeting summary or Scratchpad note as plain text, never a transcript. */
  async readItem(session: Session, kind: NoteItem['kind'], id: string): Promise<string> {
    const tools = chooseTools(await this.ensureMcp(session));
    const tool = kind === 'meeting' ? tools.readMeeting : tools.readNote;
    if (!tool) throw new WisprError('no_tool', WISPR_MESSAGES.no_tool, 404);
    return summaryText(await this.callTool(session, tool, id));
  }

  // ---------- HTTP routes ----------

  /** Handles /api/wispr/*; returns false for any other path. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith('/api/wispr/')) return false;
    let session = this.readSession(req);
    const opened = session ? JSON.stringify(persisted(session)) : null;
    let signedOut = false;
    // Before any response: the cookie follows the session (new tokens, a refresh, a revoked connection).
    const commit = () => {
      if (signedOut) { this.clearCookie(res); return; }
      if (!session) return;
      this.remember(session);
      if (JSON.stringify(persisted(session)) !== opened) this.writeCookie(res, session);
    };
    const send = (status: number, body: unknown) => {
      commit();
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    const redirect = (location: string) => {
      commit();
      res.statusCode = 302;
      res.setHeader('Location', location);
      res.setHeader('Cache-Control', 'no-store');
      res.end();
    };
    const fail = (error: unknown) => {
      const e = error instanceof WisprError ? error : new WisprError('unavailable', WISPR_MESSAGES.unavailable);
      send(e.status, { error: e.message, code: e.code });
    };
    const connectedSession = (): Session => {
      const current = session;
      if (!current?.tokens) throw new WisprError('not_connected', WISPR_MESSAGES.not_connected, 401);
      return current;
    };
    try {
      const route = url.pathname.slice('/api/wispr/'.length);
      if (route === 'status' && req.method === 'GET') {
        // A failed sign-in returns to the app with only a code; the message for it comes from here.
        const code = url.searchParams.get('code') || '';
        const message = Object.hasOwn(WISPR_MESSAGES, code) ? WISPR_MESSAGES[code as WisprErrorCode] : undefined;
        send(200, { connected: Boolean(session?.tokens), ...(message ? { message } : {}) });
      } else if (route === 'connect' && req.method === 'GET') {
        // The browser navigated here, so a failure goes back to the app rather than to a JSON page.
        try {
          const started = await this.startAuthorization(req, session);
          session = started.session;
          redirect(started.url);
        } catch (error) {
          const code = error instanceof WisprError ? error.code : 'discovery';
          redirect(`/app?wispr=error&code=${encodeURIComponent(code)}`);
        }
      } else if (route === 'callback' && req.method === 'GET') {
        try {
          await this.finishAuthorization(session, url.searchParams);
          redirect('/app?wispr=connected');
        } catch (error) {
          const code = error instanceof WisprError ? error.code : 'unavailable';
          redirect(`/app?wispr=error&code=${encodeURIComponent(code)}`);
        }
      } else if (route === 'items' && req.method === 'GET') {
        send(200, { items: await this.listRecent(connectedSession()) });
      } else if (route === 'item' && req.method === 'GET') {
        const current = connectedSession();
        const kind = url.searchParams.get('kind') === 'meeting' ? 'meeting' : 'scratchpad';
        const id = url.searchParams.get('id') || '';
        if (!id) throw new WisprError('not_found', WISPR_MESSAGES.not_found, 404);
        send(200, { kind, id, text: await this.readItem(current, kind, id) });
      } else if (route === 'disconnect' && req.method === 'POST') {
        if (session) this.revoke(session);
        session = null;
        signedOut = true;
        send(200, { connected: false });
      } else {
        send(404, { error: 'Not found.' });
      }
    } catch (error) {
      fail(error);
    }
    return true;
  }
}
