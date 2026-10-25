import type { Page } from '@playwright/test';

/**
 * Answers the app's own API calls inside the page, by wrapping fetch before any app code
 * runs, instead of intercepting the network with page.route. In WebKit, request
 * interception sometimes stalls the lazy-loaded workspace chunk, and the page never
 * leaves "Opening the workspace…".
 *
 * `answers` maps a path such as "/api/interpret" to the JSON it returns. Every other
 * request goes to the server as usual.
 */
export async function mockApi(page: Page, answers: Record<string, unknown>) {
  await page.addInitScript((mocked: Record<string, unknown>) => {
    const original = window.fetch.bind(window);
    const sent: Array<{ path: string; body: unknown }> = [];
    Object.defineProperty(window, '__mockedRequests', { value: sent });
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || !Object.hasOwn(mocked, url.pathname)) return original(input, init);
      sent.push({ path: url.pathname, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify(mocked[url.pathname]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  }, answers);
}

/** The bodies the page sent to mocked paths, oldest first. */
export async function mockedRequests(page: Page, path: string): Promise<unknown[]> {
  return page.evaluate((wanted) => {
    const sent = (window as unknown as { __mockedRequests?: Array<{ path: string; body: unknown }> }).__mockedRequests ?? [];
    return sent.filter((request) => request.path === wanted).map((request) => request.body);
  }, path);
}
