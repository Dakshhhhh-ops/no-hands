import { InterpretationSchema, validateProposal } from '../types/schema.ts';
import type { Project, Proposal } from '../types/schema.ts';
import { applyOperations } from './applyOperations.ts';

export interface AiStatus {
  ai: boolean;
  provider: 'groq' | 'anthropic' | null;
  model: string | null;
}

export function providerLabel(provider: AiStatus['provider']): string {
  return provider === 'groq' ? 'Groq' : provider === 'anthropic' ? 'Claude' : 'offline rules';
}

/** Asks the local server whether a model provider is configured. Any failure means "offline rules only". */
export async function fetchAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  try {
    const response = await fetch('/api/status', { signal });
    if (!response.ok) return { ai: false, provider: null, model: null };
    const body = await response.json();
    const provider = body?.provider === 'groq' || body?.provider === 'anthropic' ? body.provider : null;
    return { ai: Boolean(body?.ai), provider, model: typeof body?.model === 'string' ? body.model : null };
  } catch {
    return { ai: false, provider: null, model: null };
  }
}

export class AiInterpretError extends Error {}

/**
 * Sends the instruction and current model to the server's model provider, validates the reply, and
 * dry-runs the operations so the reviewer sees skipped operations before applying.
 */
export async function interpretWithModel(text: string, project: Project, signal?: AbortSignal): Promise<Proposal> {
  const { components, relationships, apiOperations, requirements, name } = project;
  let response: Response;
  try {
    response = await fetch('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, project: { name, components, relationships, apiOperations, requirements } }),
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new AiInterpretError('Could not reach the interpretation server.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new AiInterpretError(body?.error || `Interpretation failed (${response.status}).`);

  const parsed = InterpretationSchema.safeParse(body?.interpretation);
  if (!parsed.success) throw new AiInterpretError('The interpretation did not match the expected schema.');
  const interpretation = parsed.data;

  const operations = interpretation.understood ? interpretation.operations : [];
  const items = interpretation.items.map((item, index) => ({ key: `ai-${index}`, title: item.title, detail: item.detail }));
  if (!items.length) {
    items.push(interpretation.understood
      ? { key: 'ai-summary', title: interpretation.summary || 'Record this request', detail: 'No structural change is needed.' }
      : { key: 'unresolved', title: 'Clarify this architecture request', detail: interpretation.summary || 'The model could not map this to a change.' });
  }

  const draft = validateProposal({ text, items, assumptions: [...interpretation.assumptions], source: 'ai', operations });
  const { outcomes } = applyOperations(project, draft);
  const skipped = outcomes.filter((outcome) => !outcome.applied).map((outcome) => outcome.message);
  return { ...draft, assumptions: [...draft.assumptions, ...skipped] };
}
