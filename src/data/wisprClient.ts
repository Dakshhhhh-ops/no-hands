/**
 * Browser side of "Import from Wispr Flow". The server holds the Wispr Flow
 * tokens; the browser only ever sees connection status, item titles, and the
 * text of the one summary or note the person picks.
 */

export interface WisprItem {
  kind: 'meeting' | 'scratchpad';
  id: string;
  title: string;
  date?: string;
}

export class WisprClientError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'WisprClientError';
    this.code = code;
  }
}

async function getJson(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'same-origin', ...init });
  } catch {
    throw new WisprClientError('Could not reach the VoiceArchitect server. You can still paste your notes.', 'network');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WisprClientError(
      typeof body?.error === 'string' ? body.error : 'Wispr Flow is not answering right now. You can still paste your notes.',
      typeof body?.code === 'string' ? body.code : 'unavailable',
    );
  }
  return body;
}

/** Whether this browser session is connected, and the message for a sign-in error code, if any. */
export async function wisprStatus(code?: string): Promise<{ connected: boolean; message?: string }> {
  const query = code ? `?code=${encodeURIComponent(code)}` : '';
  const body = await getJson(`/api/wispr/status${query}`);
  return { connected: body?.connected === true, ...(typeof body?.message === 'string' ? { message: body.message } : {}) };
}

/** Recent Notetaker meetings and Scratchpad notes: titles only. */
export async function wisprItems(): Promise<WisprItem[]> {
  const body = await getJson('/api/wispr/items');
  return Array.isArray(body?.items) ? body.items : [];
}

/** The summary of one meeting, or the text of one Scratchpad note. Never a transcript. */
export async function wisprItemText(item: WisprItem): Promise<string> {
  const body = await getJson(`/api/wispr/item?kind=${encodeURIComponent(item.kind)}&id=${encodeURIComponent(item.id)}`);
  return typeof body?.text === 'string' ? body.text : '';
}

export async function wisprDisconnect(): Promise<void> {
  await getJson('/api/wispr/disconnect', { method: 'POST' });
}

/** Where the Connect button sends the browser; the server redirects to Wispr Flow's sign-in. */
export const WISPR_CONNECT_URL = '/api/wispr/connect';
