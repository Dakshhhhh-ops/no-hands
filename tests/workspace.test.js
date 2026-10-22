import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HistoryTimeline } from '../src/data/historyManager.ts';
import { projectFromCompose } from '../src/data/composeImport.ts';
import { makeCommerceProject } from '../src/data/commerce.ts';
import { forkBranch } from '../src/data/branching.ts';
import {
  WORKSPACE_KEY, HISTORY_LIMIT, loadWorkspace, parseWorkspace, saveWorkspace, serializeWorkspace,
} from '../src/data/workspaceStorage.ts';

const compose = readFileSync(new URL('../public/samples/ride-share-compose.yml', import.meta.url), 'utf8');

/** A Map-backed stand-in for localStorage; `quota` makes setItem throw above that many characters. */
function memoryStorage(quota = Infinity) {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      if (value.length > quota) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
    removeItem: (key) => data.delete(key),
  };
}

/** The imported ride-share stack with one applied change: a cache in front of the trips API. */
function importedWithOneChange() {
  const imported = projectFromCompose(compose, 'ride-share-compose.yml');
  const history = new HistoryTimeline(imported);
  const next = structuredClone(imported);
  next.version = 2;
  next.components.push({ id: 'trips-cache', name: 'Trips Cache', type: 'CACHE', sub: 'Cache', responsibilities: [], x: 0, y: 0 });
  next.relationships.push({ from: 'trips-api', to: 'trips-cache', label: 'cache' });
  next.changes = [{ id: 'CHG-1', version: 2, originalInstruction: 'Add a cache in front of the trips API', summary: 'Added a cache', affectedArtifacts: [] }];
  history.push(next, 'Add a cache in front of the trips API', 'CHG-1');
  return {
    sampleChoice: 'commerce',
    currentBranchId: 'main',
    importedProject: imported,
    branches: { main: { id: 'main', name: 'Main Branch', description: 'ride-share-platform primary architecture', project: next, history } },
  };
}

test('an imported stack, its applied change, and its undo step survive a save and load', () => {
  const storage = memoryStorage();
  assert.equal(saveWorkspace(importedWithOneChange(), storage), true);
  const restored = loadWorkspace(storage);
  assert.ok(restored);
  assert.equal(restored.importedProject.name, 'ride-share-platform');
  const main = restored.branches.main;
  assert.ok(main.project.components.some((c) => c.id === 'trips-cache'));
  assert.equal(main.history.canUndo, true);
  assert.equal(main.history.canRedo, false);

  const undone = main.history.undo();
  assert.ok(undone);
  assert.equal(undone.components.some((c) => c.id === 'trips-cache'), false, 'undo after a reload removes the change');
  assert.equal(main.history.canRedo, true);
  assert.ok(main.history.redo().components.some((c) => c.id === 'trips-cache'), 'and redo puts it back');
});

test('every branch and the one being worked on are kept', () => {
  const state = importedWithOneChange();
  const fork = forkBranch(state.branches.main.project, { id: 'branch-1', name: 'Branch 1', parentBranchId: 'main' });
  state.branches['branch-1'] = fork;
  state.currentBranchId = 'branch-1';
  const restored = parseWorkspace(serializeWorkspace(state));
  assert.deepEqual(Object.keys(restored.branches).sort(), ['branch-1', 'main']);
  assert.equal(restored.currentBranchId, 'branch-1');
  assert.equal(restored.branches['branch-1'].baseProject.version, state.branches.main.project.version, 'the merge base is kept');
});

test('nothing saved, unreadable JSON, or data that fails the schema all start fresh', () => {
  assert.equal(parseWorkspace(null), null);
  assert.equal(parseWorkspace(''), null);
  assert.equal(parseWorkspace('{not json'), null);
  assert.equal(parseWorkspace('"a string"'), null);
  assert.equal(parseWorkspace(JSON.stringify({ schemaVersion: 2 })), null);

  const good = JSON.parse(serializeWorkspace(importedWithOneChange()));
  assert.ok(parseWorkspace(JSON.stringify(good)), 'the unbroken save loads');
  const variants = {
    'no main branch': (w) => { w.branches = { other: { ...w.branches.main, id: 'other' } }; w.currentBranchId = 'other'; },
    'current branch missing': (w) => { w.currentBranchId = 'branch-9'; },
    'branch saved under another id': (w) => { w.branches.main.id = 'elsewhere'; },
    'edge to a missing component': (w) => { w.branches.main.project.relationships.push({ from: 'trips-api', to: 'ghost', label: 'calls' }); },
    'history entry with a bad project': (w) => { w.branches.main.history.past[0].project.components = 'none'; },
    'unknown sample': (w) => { w.sampleChoice = 'banking'; },
  };
  for (const [name, breakIt] of Object.entries(variants)) {
    const copy = structuredClone(good);
    breakIt(copy);
    assert.equal(parseWorkspace(JSON.stringify(copy)), null, name);
  }
});

test('a storage that throws on read is treated as empty', () => {
  assert.equal(loadWorkspace({ getItem: () => { throw new Error('SecurityError'); } }), null);
  assert.equal(loadWorkspace(null), null);
});

test(`only the newest ${HISTORY_LIMIT} undo steps are saved`, () => {
  const project = makeCommerceProject();
  const history = new HistoryTimeline(project);
  let current = project;
  for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
    current = { ...structuredClone(current), version: current.version + 1 };
    history.push(current, `step ${i}`);
  }
  const state = { sampleChoice: 'commerce', currentBranchId: 'main', importedProject: null, branches: { main: { id: 'main', name: 'Main Branch', description: '', project: current, history } } };
  const restored = parseWorkspace(serializeWorkspace(state));
  assert.equal(restored.branches.main.history.past.length, HISTORY_LIMIT);
  assert.equal(restored.branches.main.history.past.at(-1).label, `step ${HISTORY_LIMIT + 4}`, 'the newest step is the one kept');
  assert.equal(history.past.length, HISTORY_LIMIT + 5, 'the live session keeps everything');
});

test('a full quota keeps the model and drops undo steps first', () => {
  const state = importedWithOneChange();
  const withoutHistory = serializeWorkspace(state, 0).length;
  const storage = memoryStorage(withoutHistory + 10);
  assert.equal(saveWorkspace(state, storage), true);
  const restored = loadWorkspace(storage);
  assert.ok(restored.branches.main.project.components.some((c) => c.id === 'trips-cache'), 'the current model is saved');
  assert.equal(restored.branches.main.history.canUndo, false);

  const tiny = memoryStorage(10);
  tiny.data.set(WORKSPACE_KEY, 'stale');
  assert.equal(saveWorkspace(state, tiny), false);
  assert.equal(tiny.getItem(WORKSPACE_KEY), null, 'a stale save is removed rather than left behind');
});
