/**
 * npm run eval [-- --provider offline|groq|anthropic] [--delay ms]
 *
 * Runs the labelled instructions in evals/cases.ts through an interpreter, applies
 * the result with the same deterministic applier the app uses, and scores the
 * structural change: components and connections added or removed, and recorded
 * requirements. Writes evals/results/<provider>.json and prints a summary.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CASES } from '../evals/cases.ts';
import type { ComponentRef, EvalCase, Expectation } from '../evals/cases.ts';
import { makeCommerceProject, proposeChange, applyChange } from '../src/data/commerce.js';
import { makeFoodDeliveryProject } from '../src/data/foodDelivery.js';
import { projectFromCompose } from '../src/data/composeImport.ts';
import { interpretPattern } from '../src/data/patternRules.ts';
import { cleanDictation } from '../src/data/dictation.ts';
import { validateProposal } from '../src/types/schema.ts';
import type { Project, Proposal } from '../src/types/schema.ts';
import { interpretInstruction, activeModel } from '../server/interpret.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const provider = flag('provider', 'offline') as 'offline' | 'groq' | 'anthropic';
const delayMs = Number(flag('delay', provider === 'groq' ? '21000' : '0'));

function model(name: EvalCase['model']): Project {
  if (name === 'commerce') return makeCommerceProject();
  if (name === 'food') return makeFoodDeliveryProject();
  return projectFromCompose(readFileSync(new URL('../public/samples/ride-share-compose.yml', import.meta.url), 'utf8'), 'ride-share-compose.yml');
}

async function interpret(text: string, project: Project): Promise<Proposal> {
  const cleaned = cleanDictation(text);
  if (provider === 'offline') return interpretPattern(cleaned, project) || proposeChange(cleaned);
  const result = await interpretInstruction(cleaned, project, { provider });
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
  actual?: unknown;
}
const results: CaseResult[] = [];
for (const [index, testCase] of CASES.entries()) {
  if (index > 0 && delayMs) await sleep(delayMs);
  const before = model(testCase.model);
  let outcome: Omit<CaseResult, 'id' | 'language' | 'model' | 'text'>;
  try {
    const proposal = await interpret(testCase.text, before);
    const after = applyChange(before, proposal);
    const actual = delta(before, after);
    const options = 'anyOf' in testCase.expect ? testCase.expect.anyOf : [testCase.expect];
    const best = options.map((e) => score(e, actual, after)).sort((x, y) => Number(y.correct) - Number(x.correct) || y.found - x.found || x.unexpected - y.unexpected)[0];
    outcome = { ...best, actual: { ...actual, addComponents: actual.addComponents.map((c) => `${c.id} (${c.type})`) } };
  } catch (error) {
    outcome = { expected: 1, found: 0, unexpected: 0, correct: false, error: error instanceof Error ? error.message : String(error) };
  }
  results.push({ id: testCase.id, language: testCase.language, model: testCase.model, text: testCase.text, ...outcome });
  process.stdout.write(`${outcome.correct ? 'PASS' : 'FAIL'} ${testCase.id.padEnd(4)} ${testCase.language.padEnd(9)} ${testCase.text}${'error' in outcome ? `  [${outcome.error}]` : ''}\n`);
}

function summarize(rows: typeof results) {
  const expected = rows.reduce((n, r) => n + r.expected, 0);
  const found = rows.reduce((n, r) => n + r.found, 0);
  const unexpected = rows.reduce((n, r) => n + r.unexpected, 0);
  return {
    cases: rows.length,
    correct: rows.filter((r) => r.correct).length,
    recall: expected ? found / expected : 1,
    precision: found + unexpected ? found / (found + unexpected) : 1,
  };
}

const summary = {
  provider,
  model: provider === 'offline' ? 'offline rules' : activeModel(provider),
  date: new Date().toISOString().slice(0, 10),
  all: summarize(results),
  english: summarize(results.filter((r) => r.language === 'English')),
  hinglish: summarize(results.filter((r) => r.language === 'Hinglish')),
};
mkdirSync(new URL('../evals/results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../evals/results/${provider}.json`, import.meta.url), `${JSON.stringify({ summary, results }, null, 2)}\n`);

const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log(`\n${summary.model} · ${summary.date}`);
console.log('| Set | Correct cases | Recall | Precision |');
console.log('|---|---|---|---|');
for (const [label, s] of [['All', summary.all], ['English', summary.english], ['Hinglish', summary.hinglish]] as const) {
  console.log(`| ${label} | ${s.correct} / ${s.cases} | ${pct(s.recall)} | ${pct(s.precision)} |`);
}
