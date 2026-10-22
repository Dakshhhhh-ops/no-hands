/**
 * npm run eval [-- --provider offline|groq|anthropic] [--runs n] [--delay ms]
 *
 * Runs the labelled instructions in evals/cases.ts through an interpreter, applies
 * the result with the same deterministic applier the app uses, and scores the
 * structural change: components and connections added or removed, and recorded
 * requirements. Model output varies between runs, so a model is run several
 * times with a different seed each run (Groq's benchmarking advice), and the
 * report gives the mean, the range, and which cases pass every run. Writes
 * evals/results/<provider>.json and prints a summary.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CASES } from '../evals/cases.ts';
import type { ComponentRef, EvalCase, Expectation } from '../evals/cases.ts';
import { makeCommerceProject, proposeChange, applyChange } from '../src/data/commerce.ts';
import { makeFoodDeliveryProject } from '../src/data/foodDelivery.ts';
import { projectFromCompose } from '../src/data/composeImport.ts';
import { interpretPattern } from '../src/data/patternRules.ts';
import { cleanDictation } from '../src/data/dictation.ts';
import { validateProposal } from '../src/types/schema.ts';
import type { Project, Proposal } from '../src/types/schema.ts';
import { interpretInstruction, activeModel } from '../server/interpret.ts';
import type { Usage } from '../server/interpret.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const provider = flag('provider', 'offline') as 'offline' | 'groq' | 'anthropic';
const delayMs = Number(flag('delay', provider === 'groq' ? '21000' : '0'));
// The offline rules are deterministic, so one run says everything; a model gets three by default.
const runs = Math.max(1, Math.round(Number(flag('runs', provider === 'offline' ? '1' : '3'))) || 1);
const seeds = Array.from({ length: runs }, (_, i) => i + 1);

// Fail fast instead of recording a run of authentication errors.
const keyFor = { groq: 'GROQ_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } as const;
if (provider !== 'offline' && !process.env[keyFor[provider]] && !(provider === 'anthropic' && process.env.ANTHROPIC_AUTH_TOKEN)) {
  console.error(`${keyFor[provider]} is not set. Add it to .env.local (never commit it) and run again.`);
  process.exit(1);
}
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function model(name: EvalCase['model']): Project {
  if (name === 'commerce') return makeCommerceProject();
  if (name === 'food') return makeFoodDeliveryProject();
  return projectFromCompose(readFileSync(new URL('../public/samples/ride-share-compose.yml', import.meta.url), 'utf8'), 'ride-share-compose.yml');
}

// Token counts of the most recent model call (counts only; no instruction text is kept).
let lastUsage: Usage | null = null;

async function interpret(text: string, project: Project, seed: number): Promise<Proposal> {
  const cleaned = cleanDictation(text);
  if (provider === 'offline') return interpretPattern(cleaned, project) || proposeChange(cleaned);
  lastUsage = null;
  const result = await interpretInstruction(cleaned, project, { provider, seed, onUsage: (usage) => { lastUsage = usage; } });
  const items = result.items.length
    ? result.items.map((item, i) => ({ key: `ai-${i}`, title: item.title, detail: item.detail }))
    : [{ key: 'ai-summary', title: result.summary || 'No change', detail: '' }];
  return validateProposal({ text: cleaned, items, assumptions: result.assumptions, source: 'ai', operations: result.understood ? result.operations : [] });
}

/** The structural difference between two models. */
function delta(before: Project, after: Project) {
  const ids = (p: Project) => new Set(p.components.map((c) => c.id));
  const edges = (p: Project) => new Set(p.relationships.map((r) => `${r.from}->${r.to}`));
  const reqs = (p: Project) => new Map(p.requirements.map((r) => [r.id, r.text]));
  const [b, a] = [ids(before), ids(after)];
  const [be, ae] = [edges(before), edges(after)];
  const [br, ar] = [reqs(before), reqs(after)];
  return {
    addComponents: after.components.filter((c) => !b.has(c.id)),
    removeComponents: [...b].filter((id) => !a.has(id)),
    addRelationships: [...ae].filter((e) => !be.has(e)),
    removeRelationships: [...be].filter((e) => !ae.has(e)),
    addRequirements: [...ar].filter(([id, text]) => br.get(id) !== text).map(([, text]) => text),
  };
}

type Delta = ReturnType<typeof delta>;

function resolve(ref: ComponentRef, after: Project): string[] {
  if (typeof ref === 'string') return [ref];
  return after.components.filter((c) => (!ref.type || c.type === ref.type) && ref.name.test(c.name)).map((c) => c.id);
}

/** How well one expectation explains the actual change. */
function score(expect: Expectation, actual: Delta, after: Project) {
  const total = actual.addComponents.length + actual.removeComponents.length + actual.addRelationships.length + actual.removeRelationships.length + actual.addRequirements.length;
  if (expect.none) return { expected: 0, found: 0, unexpected: total, correct: total === 0 };
  const used = { addComponents: new Set<string>(), addRelationships: new Set<string>(), addRequirements: new Set<string>() };
  let expected = 0;
  let found = 0;
  for (const want of expect.addComponents || []) {
    expected += 1;
    const hit = actual.addComponents.find((c) => c.type === want.type && want.name.test(c.name) && !used.addComponents.has(c.id));
    if (hit) { found += 1; used.addComponents.add(hit.id); }
  }
  for (const id of expect.removeComponents || []) {
    expected += 1;
    if (actual.removeComponents.includes(id)) found += 1;
  }
  for (const want of expect.addRelationships || []) {
    expected += 1;
    const froms = resolve(want.from, after);
    const tos = resolve(want.to, after);
    const hit = actual.addRelationships.find((e) => froms.some((f) => tos.some((t) => e === `${f}->${t}`)) && !used.addRelationships.has(e));
    if (hit) { found += 1; used.addRelationships.add(hit); }
  }
  for (const want of expect.removeRelationships || []) {
    expected += 1;
    if (actual.removeRelationships.includes(`${want.from}->${want.to}`)) found += 1;
  }
  for (const want of expect.addRequirements || []) {
    expected += 1;
    const hit = actual.addRequirements.find((t) => want.test(t) && !used.addRequirements.has(t));
    if (hit) { found += 1; used.addRequirements.add(hit); }
  }
  // Removing a component removes its connections; those are not counted as unexpected.
  const removedIds = new Set(actual.removeComponents);
  const cascade = (edge: string) => edge.split('->').some((id) => removedIds.has(id));
  const expectedRemovals = new Set(expect.removeComponents || []);
  const unexpected =
    actual.addComponents.filter((c) => !used.addComponents.has(c.id)).length +
    actual.removeComponents.filter((id) => !expectedRemovals.has(id)).length +
    actual.addRelationships.filter((e) => !used.addRelationships.has(e)).length +
    actual.removeRelationships.filter((e) => !cascade(e) && !(expect.removeRelationships || []).some((r) => `${r.from}->${r.to}` === e)).length +
    actual.addRequirements.filter((t) => !used.addRequirements.has(t)).length;
  return { expected, found, unexpected, correct: found === expected && unexpected === 0 };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface CaseResult {
  id: string;
  language: EvalCase['language'];
  model: EvalCase['model'];
  text: string;
  expected: number;
  found: number;
  unexpected: number;
  correct: boolean;
  error?: string;
  usage?: Usage | null;
  actual?: unknown;
}
async function runOnce(seed: number, label: string): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const testCase of CASES) {
    if (delayMs && (results.length > 0 || seed !== seeds[0])) await sleep(delayMs);
    const before = model(testCase.model);
    let outcome: Omit<CaseResult, 'id' | 'language' | 'model' | 'text'>;
    try {
      const proposal = await interpret(testCase.text, before, seed);
      const after = applyChange(before, proposal);
      const actual = delta(before, after);
      const options = 'anyOf' in testCase.expect ? testCase.expect.anyOf : [testCase.expect];
      const best = options.map((e) => score(e, actual, after)).sort((x, y) => Number(y.correct) - Number(x.correct) || y.found - x.found || x.unexpected - y.unexpected)[0];
      outcome = { ...best, usage: lastUsage, actual: { ...actual, addComponents: actual.addComponents.map((c) => `${c.id} (${c.type})`) } };
    } catch (error) {
      outcome = { expected: 1, found: 0, unexpected: 0, correct: false, error: error instanceof Error ? error.message : String(error) };
    }
    results.push({ id: testCase.id, language: testCase.language, model: testCase.model, text: testCase.text, ...outcome });
    process.stdout.write(`${label} ${outcome.correct ? 'PASS' : 'FAIL'} ${testCase.id.padEnd(4)} ${testCase.language.padEnd(9)} ${testCase.text}${outcome.error ? `  [${outcome.error}]` : ''}\n`);
  }
  return results;
}

// A request the provider refused or failed (quota, network) says nothing about the
// model's interpretation, so it is reported separately and left out of the score.
function summarize(all: CaseResult[]) {
  const rows = all.filter((r) => !r.error);
  const expected = rows.reduce((n, r) => n + r.expected, 0);
  const found = rows.reduce((n, r) => n + r.found, 0);
  const unexpected = rows.reduce((n, r) => n + r.unexpected, 0);
  return {
    cases: rows.length,
    errors: all.length - rows.length,
    correct: rows.filter((r) => r.correct).length,
    recall: expected ? found / expected : 1,
    precision: found + unexpected ? found / (found + unexpected) : 1,
  };
}

type Summary = ReturnType<typeof summarize>;

/** Mean and range of one subset across all runs. */
function across(perRun: Summary[]) {
  const correct = perRun.map((s) => s.correct);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    cases: perRun[0].cases,
    errors: perRun.reduce((n, s) => n + s.errors, 0),
    correctMean: mean(correct),
    correctMin: Math.min(...correct),
    correctMax: Math.max(...correct),
    recallMean: mean(perRun.map((s) => s.recall)),
    precisionMean: mean(perRun.map((s) => s.precision)),
  };
}

/** Mean token counts per preview, or null when the interpreter reports none (offline rules). */
function averageUsage(rows: CaseResult[]) {
  const usages = rows.map((r) => r.usage).filter((u): u is Usage => Boolean(u));
  if (!usages.length) return null;
  const mean = (pick: (u: Usage) => number) => Math.round(usages.reduce((n, u) => n + pick(u), 0) / usages.length);
  const input = mean((u) => u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens);
  const output = mean((u) => u.outputTokens);
  return { previews: usages.length, input, cacheRead: mean((u) => u.cacheReadTokens), output, total: input + output };
}

const runResults: Array<{ seed: number; results: CaseResult[] }> = [];
for (const [i, seed] of seeds.entries()) {
  const label = runs > 1 ? `[run ${i + 1}/${runs}, seed ${seed}]` : '';
  runResults.push({ seed, results: await runOnce(seed, label) });
}

const subset = (results: CaseResult[], language?: string) => summarize(language ? results.filter((r) => r.language === language) : results);
const perCase = CASES.map((c) => {
  const passes = runResults.filter((run) => run.results.find((r) => r.id === c.id)?.correct).length;
  const errors = runResults.filter((run) => run.results.find((r) => r.id === c.id)?.error).length;
  return { id: c.id, language: c.language, text: c.text, passes, errors, runs };
});

const summary = {
  provider,
  model: provider === 'offline' ? 'offline rules' : activeModel(provider),
  date: new Date().toISOString().slice(0, 10),
  runs,
  seeds: provider === 'offline' ? [] : seeds,
  all: across(runResults.map((r) => subset(r.results))),
  english: across(runResults.map((r) => subset(r.results, 'English'))),
  hinglish: across(runResults.map((r) => subset(r.results, 'Hinglish'))),
  passEveryRun: perCase.filter((c) => c.passes === runs).map((c) => c.id),
  passSomeRuns: perCase.filter((c) => c.passes > 0 && c.passes < runs).map((c) => `${c.id} (${c.passes}/${runs})`),
  passNoRun: perCase.filter((c) => c.passes === 0).map((c) => c.id),
  tokensPerPreview: averageUsage(runResults.flatMap((r) => r.results)),
};
mkdirSync(new URL('../evals/results/', import.meta.url), { recursive: true });
// One file per interpreter and model, so comparing Claude models keeps every result.
const resultFile = provider === 'offline' ? 'offline' : `${provider}-${slug(activeModel(provider) || provider)}`;
writeFileSync(new URL(`../evals/results/${resultFile}.json`, import.meta.url), `${JSON.stringify({ summary, perCase, runs: runResults }, null, 2)}\n`);

const pct = (x: number) => `${Math.round(x * 100)}%`;
const correct = (s: ReturnType<typeof across>) => (runs === 1 || s.correctMin === s.correctMax
  ? `${s.correctMin} / ${s.cases}`
  : `${s.correctMean.toFixed(1)} / ${s.cases} (range ${s.correctMin} to ${s.correctMax})`);
console.log(`\n${summary.model} · ${summary.date} · ${runs} run${runs === 1 ? '' : 's'}`);
console.log(`| Set | Correct cases${runs > 1 ? ', mean' : ''} | Recall | Precision |`);
console.log('|---|---|---|---|');
for (const [label, s] of [['All', summary.all], ['English', summary.english], ['Hinglish', summary.hinglish]] as const) {
  console.log(`| ${label} | ${correct(s)} | ${pct(s.recallMean)} | ${pct(s.precisionMean)} |`);
}
if (summary.tokensPerPreview) {
  const t = summary.tokensPerPreview;
  console.log(`
Tokens per preview (mean of ${t.previews}): ${t.input} input (${t.cacheRead} read from cache), ${t.output} output, ${t.total} total.`);
}
if (summary.all.errors) console.log(`\nWarning: ${summary.all.errors} request(s) failed and were left out of the score; see the JSON for messages.`);
console.log(`\nPass every run: ${summary.passEveryRun.length}/${CASES.length}. Pass some runs: ${summary.passSomeRuns.join(', ') || 'none'}. Pass no run: ${summary.passNoRun.join(', ') || 'none'}.`);
