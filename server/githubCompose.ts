/**
 * Import a docker-compose file from a public GitHub repository.
 *
 * - Only https://github.com/<owner>/<repo>, optionally /tree/<ref>/<path>, is accepted.
 * - Requests go to api.github.com and raw.githubusercontent.com only. Redirects are
 *   followed by hand and only to those two hosts, so a link can never make the
 *   server fetch anything else.
 * - Every request shares one deadline (5 s by default), and a file over the size cap
 *   (256 KB) is refused while it streams, not after it has been read.
 * - Private repositories are refused with a clear message, even when GITHUB_TOKEN
 *   could read them. The token is optional, raises GitHub's rate limit, and is sent
 *   to api.github.com only. It is never logged or returned.
 * - The file is read at a commit sha, so "check against the latest commit" can say
 *   exactly which commit it compared with.
 */

export const COMPOSE_NAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'] as const;
export const MAX_COMPOSE_BYTES = 256 * 1024;
export const GITHUB_TIMEOUT_MS = 5000;
const ALLOWED_HOSTS = new Set(['api.github.com', 'raw.githubusercontent.com']);
const MAX_REDIRECTS = 3;

export type GitHubErrorCode = 'bad_url' | 'not_found' | 'private' | 'no_compose' | 'too_large' | 'timeout' | 'rate_limited' | 'redirect' | 'unavailable';

export class GitHubImportError extends Error {
  code: GitHubErrorCode;
  status: number;
  constructor(code: GitHubErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface GitHubLocation {
  owner: string;
  repo: string;
  /** Segments after /tree/: the ref, possibly with slashes, then a folder or file path. */
  treeSegments: string[];
}

export interface GitHubCompose {
  owner: string;
  repo: string;
  /** The branch, tag, or sha the link named, or the default branch. */
  ref: string;
  /** The commit the file was read at. */
  sha: string;
  /** Path of the compose file within the repository. */
  path: string;
  fileName: string;
  text: string;
  /** Where the file can be seen on github.com, at that commit. */
  htmlUrl: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GitHubOptions {
  fetch?: FetchLike;
  token?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SEGMENT = /^[A-Za-z0-9._@+-][A-Za-z0-9._@+ -]*$/;
const BAD_URL = 'Use a public GitHub repository link, such as https://github.com/owner/repo or https://github.com/owner/repo/tree/main/deploy.';

/** Checks a link and splits it into owner, repo, and anything after /tree/. Throws for anything else. */
export function parseGitHubUrl(input: string): GitHubLocation {
  const text = String(input ?? '').trim();
  // URL parsing would quietly resolve "..", "%2e%2e", and "." segments; a link with any is refused instead.
  if (/(?:\/|%2f)(?:\.|%2e){1,2}(?=\/|%2f|[?#]|$)/i.test(text)) throw new GitHubImportError('bad_url', BAD_URL, 400);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new GitHubImportError('bad_url', BAD_URL, 400);
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) {
    throw new GitHubImportError('bad_url', BAD_URL, 400);
  }
  let segments: string[];
  try {
    segments = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    throw new GitHubImportError('bad_url', BAD_URL, 400);
  }
  const [owner = '', rawRepo = '', kind, ...rest] = segments;
  const repo = rawRepo.replace(/\.git$/, '');
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') throw new GitHubImportError('bad_url', BAD_URL, 400);
  if (kind === undefined) return { owner, repo, treeSegments: [] };
  if ((kind !== 'tree' && kind !== 'blob') || !rest.length) throw new GitHubImportError('bad_url', BAD_URL, 400);
  if (rest.some((part) => part === '.' || part === '..' || !SEGMENT.test(part))) throw new GitHubImportError('bad_url', BAD_URL, 400);
  return { owner, repo, treeSegments: rest };
}

const encodePath = (parts: string[]) => parts.map(encodeURIComponent).join('/');

/** Fetches with the shared deadline, following redirects only to the allowed hosts. */
async function request(fetchImpl: FetchLike, url: string, init: RequestInit, token: string | undefined): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const host = new URL(current).hostname;
    if (!ALLOWED_HOSTS.has(host)) throw new GitHubImportError('redirect', 'GitHub sent the request somewhere other than GitHub, so it was stopped.', 502);
    const headers = new Headers(init.headers);
    headers.set('User-Agent', 'VoiceArchitect');
    if (token && host === 'api.github.com') headers.set('Authorization', `Bearer ${token}`);
    let response: Response;
    try {
      response = await fetchImpl(current, { ...init, headers, redirect: 'manual' });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new GitHubImportError('timeout', 'GitHub took too long to answer. Try again in a moment.', 504);
      }
      throw new GitHubImportError('unavailable', 'GitHub could not be reached. Try again in a moment.', 502);
    }
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) throw new GitHubImportError('unavailable', 'GitHub answered with a redirect but no location.', 502);
    current = new URL(location, current).toString();
  }
  throw new GitHubImportError('redirect', 'GitHub redirected too many times.', 502);
}

function apiError(response: Response, notFound: GitHubImportError): GitHubImportError {
  if (response.status === 404) return notFound;
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (response.status === 429 || remaining === '0') {
      return new GitHubImportError('rate_limited', "GitHub's rate limit for this server is used up. Try again later; setting GITHUB_TOKEN on the server raises it.", 429);
    }
  }
  if (response.status === 401) return new GitHubImportError('unavailable', 'GitHub refused the server\'s GITHUB_TOKEN. Remove or replace it.', 502);
  return new GitHubImportError('unavailable', `GitHub answered with an error (${response.status}). Try again in a moment.`, 502);
}

/** Reads a body as text, refusing it as soon as it passes `maxBytes`. */
async function readCapped(response: Response, maxBytes: number, name: string): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  const tooLarge = () => new GitHubImportError('too_large', `${name} is larger than ${Math.round(maxBytes / 1024)} KB, so it was not imported.`, 413);
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function json<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new GitHubImportError('unavailable', 'GitHub sent an answer that could not be read.', 502);
  }
}

interface ContentEntry { name?: unknown; path?: unknown; type?: unknown; size?: unknown }

export async function fetchComposeFromGitHub(link: string, options: GitHubOptions = {}): Promise<GitHubCompose> {
  const location = parseGitHubUrl(link);
  const fetchImpl = options.fetch || ((input, init) => fetch(input, init));
  const maxBytes = options.maxBytes ?? MAX_COMPOSE_BYTES;
  const signal = AbortSignal.timeout(options.timeoutMs ?? GITHUB_TIMEOUT_MS);
  const token = options.token || undefined;
  const api = (path: string) => request(fetchImpl, `https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal }, token);
  let { owner, repo } = location;
  let slug = `${owner}/${repo}`;
  const notFound = new GitHubImportError('not_found', `github.com/${slug} was not found. If it is private, it cannot be imported: only public repositories can.`, 404);

  const repoResponse = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!repoResponse.ok) throw apiError(repoResponse, notFound);
  const meta = await json<{ private?: unknown; visibility?: unknown; default_branch?: unknown; full_name?: unknown }>(repoResponse);
  if (meta.private === true || (typeof meta.visibility === 'string' && meta.visibility !== 'public')) {
    throw new GitHubImportError('private', `github.com/${slug} is a private repository. Only public repositories can be imported; use Choose a file for a private one.`, 403);
  }
  // A renamed or moved repository answers under its current name; later requests use that name.
  const [canonicalOwner, canonicalRepo, extra] = typeof meta.full_name === 'string' ? meta.full_name.split('/') : [];
  if (canonicalOwner && canonicalRepo && extra === undefined && OWNER.test(canonicalOwner) && REPO.test(canonicalRepo)) {
    owner = canonicalOwner;
    repo = canonicalRepo;
    slug = `${owner}/${repo}`;
  }

  // The ref may contain slashes (feature/cache), so the shortest prefix GitHub knows is the ref.
  let ref = typeof meta.default_branch === 'string' ? meta.default_branch : 'HEAD';
  let sha = '';
  let pathParts: string[] = [];
  const candidates = location.treeSegments.length
    ? location.treeSegments.slice(0, 3).map((_, i) => i + 1)
    : [0];
  for (const take of candidates) {
    const tryRef = take ? location.treeSegments.slice(0, take).join('/') : ref;
    const commit = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(tryRef)}`);
    if (commit.ok) {
      const body = await json<{ sha?: unknown }>(commit);
      if (typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/.test(body.sha)) throw new GitHubImportError('unavailable', 'GitHub sent an answer that could not be read.', 502);
      ref = tryRef;
      sha = body.sha;
      pathParts = take ? location.treeSegments.slice(take) : [];
      break;
    }
    if (commit.status !== 404 && commit.status !== 422) throw apiError(commit, notFound);
  }
  if (!sha) throw new GitHubImportError('not_found', `No branch, tag, or commit named "${location.treeSegments[0] ?? ref}" was found in github.com/${slug}.`, 404);

  // A link to a file is that file; a link to a folder (or the repository) is searched for the usual names.
  let filePath: string;
  const last = pathParts[pathParts.length - 1] ?? '';
  if (/\.ya?ml$/i.test(last)) {
    filePath = pathParts.join('/');
  } else {
    const folder = pathParts.join('/');
    const listing = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(pathParts)}?ref=${sha}`);
    if (!listing.ok) {
      throw apiError(listing, new GitHubImportError('no_compose', `The folder "${folder}" was not found in github.com/${slug} at ${ref}.`, 404));
    }
    const entries = await json<ContentEntry[] | ContentEntry>(listing);
    const files = (Array.isArray(entries) ? entries : []).filter((e) => e.type === 'file' && typeof e.name === 'string');
    const found = COMPOSE_NAMES.map((name) => files.find((e) => e.name === name)).find(Boolean);
    if (!found || typeof found.name !== 'string') {
      throw new GitHubImportError('no_compose', `No compose file in ${folder ? `"${folder}"` : 'the root'} of github.com/${slug} at ${ref}. Looked for ${COMPOSE_NAMES.join(', ')}.`, 404);
    }
    if (typeof found.size === 'number' && found.size > maxBytes) {
      throw new GitHubImportError('too_large', `${found.name} is larger than ${Math.round(maxBytes / 1024)} KB, so it was not imported.`, 413);
    }
    filePath = folder ? `${folder}/${found.name}` : found.name;
  }

  const fileName = filePath.split('/').pop() || 'docker-compose.yml';
  const raw = await request(fetchImpl, `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${sha}/${encodePath(filePath.split('/'))}`, { signal }, undefined);
  if (!raw.ok) {
    throw raw.status === 404
      ? new GitHubImportError('no_compose', `${filePath} was not found in github.com/${slug} at ${ref}.`, 404)
      : apiError(raw, notFound);
  }
  let text: string;
  try {
    text = await readCapped(raw, maxBytes, fileName);
  } catch (error) {
    if (error instanceof GitHubImportError) throw error;
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new GitHubImportError('timeout', 'GitHub took too long to answer. Try again in a moment.', 504);
    }
    throw new GitHubImportError('unavailable', 'The file could not be read from GitHub.', 502);
  }
  return {
    owner,
    repo,
    ref,
    sha,
    path: filePath,
    fileName,
    text,
    htmlUrl: `https://github.com/${owner}/${repo}/blob/${sha}/${encodePath(filePath.split('/'))}`,
  };
}
