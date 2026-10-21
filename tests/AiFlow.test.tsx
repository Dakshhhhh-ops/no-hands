import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';

// The shared setup mock lists only some icons; this full-app test renders the real ones.
vi.mock('lucide-react', async (importOriginal) => importOriginal());
// The shared setup stubs the domain modules; this test exercises the real ones end to end.
vi.unmock('../src/data/commerce.js');
vi.unmock('../src/data/foodDelivery.js');
vi.unmock('../src/data/analysis.js');
vi.unmock('../src/data/export.js');
vi.unmock('../src/data/diagramExport.js');
vi.unmock('../src/data/branching.ts');
vi.unmock('../src/data/semanticMerge.ts');
vi.unmock('../src/data/historyManager.ts');

const interpretation = {
  understood: true,
  summary: 'Add a notification service fed by order events',
  items: [{ title: 'Add Notification Service', detail: 'Consumes order events from Kafka and notifies customers.' }],
  assumptions: ['Delivery channels (email, SMS, push) are not specified.'],
  operations: [
    { op: 'add_component', id: 'notification-service', name: 'Notification Service', type: 'SERVICE', sub: 'Order updates', responsibilities: ['Notifies customers about orders.'] },
    { op: 'add_relationship', from: 'kafka', to: 'notification-service', label: 'order events', protocol: null },
    { op: 'add_relationship', from: 'kafka', to: 'search-index', label: 'index', protocol: null },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Model interpretation flow', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/status')) return jsonResponse({ ai: true, provider: 'groq', model: 'openai/gpt-oss-120b' });
      if (url.endsWith('/api/interpret')) return jsonResponse({ interpretation, provider: 'groq', model: 'openai/gpt-oss-120b' });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('previews a Claude proposal, shows skipped operations, and applies the valid ones', async () => {
    render(<App />);

    expect(await screen.findByText('Interpreted by Groq')).toBeInTheDocument();
    expect(await screen.findByText(/Groq · openai\/gpt-oss-120b/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Load sample'));

    fireEvent.change(screen.getByLabelText('Your instruction'), {
      target: { value: 'add a notification service that listens to order events' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Preview my change/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Review this change' });
    expect(within(dialog).getByText('Add Notification Service')).toBeInTheDocument();
    expect(within(dialog).getByText(/search-index does not exist/)).toBeInTheDocument();

    const interpretCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/interpret'));
    const sent = JSON.parse(String((interpretCall?.[1] as RequestInit).body));
    expect(sent.text).toBe('add a notification service that listens to order events');
    expect(sent.project.components.some((c: { id: string }) => c.id === 'kafka')).toBe(true);

    fireEvent.click(within(dialog).getByRole('button', { name: /Apply change/ }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Review this change' })).not.toBeInTheDocument());
    expect((await screen.findAllByText(/Notification Service/)).length).toBeGreaterThan(0);
  });

  it('falls back to offline rules when the interpretation server fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/status')) return jsonResponse({ ai: true, provider: 'groq', model: 'openai/gpt-oss-120b' });
      return jsonResponse({ error: 'Rate limited by the Anthropic API. Try again in a moment.' }, 429);
    });
    render(<App />);
    await screen.findByText(/Interpreted by Groq/);
    fireEvent.click(screen.getByText('Load sample'));

    fireEvent.change(screen.getByLabelText('Your instruction'), { target: { value: 'add rate limiting to login' } });
    fireEvent.click(screen.getByRole('button', { name: /Preview my change/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Review this change' });
    expect(within(dialog).getByText('Add an authentication rate-limiting requirement')).toBeInTheDocument();
    expect((await screen.findAllByText(/Using offline rules instead/)).length).toBeGreaterThan(0);
  });
});
