import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const compiled = await build({
  stdin: { contents: `export {TrainingPanel} from './src/professional/training/TrainingPanel';export {createElement} from 'react';export {act,create} from 'react-test-renderer';`, resolveDir: root },
  tsconfig: root + '/tsconfig.json', bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['react', 'react/jsx-runtime', 'react-test-renderer'],
  plugins: [{ name: 'synthetic-transports', setup(b) {
    b.onLoad({ filter: /supabaseClient\.ts$/ }, () => ({ contents: 'export const supabase=globalThis.trainingNavigationDb;', loader: 'js' }));
    b.onLoad({ filter: /professional[\\/]training[\\/]api\.ts$/ }, () => ({ contents: 'export const trainingApi=globalThis.trainingNavigationApi;export const trainingError=e=>e.message;', loader: 'js' }));
    b.onLoad({ filter: /PanelSelect\.tsx$/ }, () => ({ contents: `import{createElement}from'react';export function PanelSelect(props){return createElement('select',props);}`, loader: 'js' }));
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  } }],
});
const oldWindow = globalThis.window;
const listeners = new Map();
globalThis.window = {
  addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
  removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
  confirm() { return true; },
};
globalThis.trainingNavigationDb = { from() {
  const query = { select() { return this; }, eq() { return this; }, order() { return this; }, range() { return this; }, abortSignal() { return this; }, async retry() { return { data: [], error: null }; } };
  return query;
} };
let snapshots = [], failGeneration = true;
globalThis.trainingNavigationApi = {
  async history() { return { rows: snapshots, total: snapshots.length }; },
  async generate(org, record, revision, input, key) {
    if (failGeneration) throw Error('Synthetic network failure');
    const plan = { display_name: 'مراجع مصنوعی', created_at: '2026-11-09T09:00:00Z', input: structuredClone(input), notes: [], weeks: [{ week: 1, sessions: [{ day: 0, title: 'روز اول', date: input.start_date, estimated_minutes: 45, lines: [] }] }] };
    snapshots = [{ id: key, plan, intake_revision: revision, approved_at: null, created_at: plan.created_at }];
    return { id: key, plan };
  },
};
const module = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url));
const { TrainingPanel, createElement, act, create } = module.exports;
const text = n => typeof n === 'string' ? n : (n?.children ?? []).map(text).join('');
const blocked = () => {
  const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, returnValue: undefined };
  for (const listener of listeners.get('beforeunload') ?? []) listener(event);
  return event.defaultPrevented;
};
let tree;
try {
  await act(async () => { tree = create(createElement(TrainingPanel, { org: 'synthetic-org', record: 'synthetic-record', revision: 1, name: 'مراجع مصنوعی', canWrite: true, onBusy() {} })); });
  const press = async label => {
    const button = tree.root.findAllByType('button').find(n => text(n) === label);
    assert(button, label); await act(async () => button.props.onClick());
  };
  assert.equal(blocked(), false, 'A clean manual form must not warn');
  await press('تمرین‌دهی خودکار');
  assert.equal(blocked(), false, 'A clean automatic form must not warn');
  await act(async () => tree.root.findByProps({ 'aria-label': 'تمرین شنبه' }).props.onChange({ target: { checked: true } }));
  assert.equal(blocked(), true, 'Unsaved automatic settings must protect page unload');
  await press('ساخت پیش‌نویس تمرین');
  assert.equal(blocked(), true, 'A failed generation must preserve the warning and settings');
  assert.equal(tree.root.findByProps({ 'aria-label': 'تمرین شنبه' }).props.checked, true);
  failGeneration = false;
  await press('ساخت پیش‌نویس تمرین');
  assert.equal(snapshots.length, 1);
  assert.equal(blocked(), false, 'A persisted draft must release the warning');
  await act(async () => tree.root.findByProps({ 'aria-label': 'تمرین شنبه' }).props.onChange({ target: { checked: false } }));
  assert.equal(blocked(), true, 'Further edits must restore protection');
  await press('تنظیم دستی برنامه تمرینی');
  assert.equal(blocked(), false, 'The inactive automatic form must not add warnings');
  await act(async () => tree.unmount()); tree = null;
  assert.equal(listeners.get('beforeunload')?.size ?? 0, 0, 'Unmount must remove all warnings');
  console.log('PASS training navigation: clean forms, dirty automatic inputs, failed generation, persisted draft, subsequent edits, mode switch and listener cleanup');
} finally {
  if (tree) await act(async () => tree.unmount());
  globalThis.window = oldWindow;
  delete globalThis.trainingNavigationDb; delete globalThis.trainingNavigationApi;
}
