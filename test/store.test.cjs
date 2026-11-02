'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PetStore, validateSettings } = require('../main/store.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiqi-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, store: new PetStore(path.join(directory, 'data'), directory) };
}

test('garden clips have separate empty slots, import and reload without entering the ordinary idle pool',async t=>{
 const {store,directory}=fixture(t);assert.equal(store.state.gardenActions.length,14);assert.ok(store.state.gardenActions.every(slot=>slot.media===null));const source=path.join(directory,'garden.webm');fs.writeFileSync(source,Buffer.from([0x1a,0x45,0xdf,0xa3]));await store.importAction('garden-water',source);
 const next=new PetStore(store.directory,directory);assert.ok(next.snapshot().gardenActions.find(slot=>slot.id==='garden-water').media.url);assert.equal(next.state.actions.length,16);assert.ok(!next.state.actions.some(slot=>slot.id.startsWith('garden-')));
});

test('random idle defaults on for older profiles, persists an explicit choice and rejects non-booleans',t=>{
 const {store,directory}=fixture(t);assert.equal(store.state.settings.randomIdle,true);delete store.state.settings.randomIdle;store.save();
 const reloaded=new PetStore(store.directory,directory);assert.equal(reloaded.state.settings.randomIdle,true);reloaded.updateSettings({randomIdle:false});assert.equal(new PetStore(store.directory,directory).state.settings.randomIdle,false);
 assert.throws(()=>reloaded.updateSettings({randomIdle:'yes'}),/布尔值/);
});
function dragSources(directory, prefix = 'drag') {
  return Object.fromEntries(['preview', 'enter', 'hold', 'exit'].map(part => {
    const file = path.join(directory, `${prefix}-${part}.webm`);
    fs.writeFileSync(file, Buffer.from([0x1a, 0x45, 0xdf, 0xa3, part.length]));
    return [part, file];
  }));
}

test('a twelve-slot library retains every old action and drag phase while adding four wallet reactions',async t=>{
  const {store,directory}=fixture(t),original=path.join(directory,'wallet.webm');fs.writeFileSync(original,Buffer.from([0x1a,0x45,0xdf,0xa3]));
  await store.importAction('wallet',original);await store.importAction('idle',original);await store.importDragPack(dragSources(directory));
  const added=['wallet-careful','wallet-low','wallet-empty','wallet-wait'];
  store.state.actions=store.state.actions.filter(a=>!added.includes(a.id));store.save();const before=structuredClone(store.state);
  const upgraded=new PetStore(store.directory,directory);assert.equal(upgraded.state.actions.length,16);
  assert.deepEqual(upgraded.state.actions.filter(a=>!added.includes(a.id)),before.actions);
  for(const key of ['settings','idle','position','stats'])assert.deepEqual(upgraded.state[key],before[key]);
  for(const id of added){assert.equal(upgraded.slot(id).media,null);await upgraded.importAction(id,original);}
  const reloaded=new PetStore(store.directory,directory);for(const id of added)assert.equal(reloaded.slot(id).media.name,'wallet.webm');
  assert.deepEqual(reloaded.slot('drag').media,before.actions.find(a=>a.id==='drag').media);
});
test('new library includes sixteen empty action slots and no external media', t => {
  const { store } = fixture(t);
  assert.equal(store.snapshot().settings.scale, 1.65);
  assert.equal(store.snapshot().character.name, '知栖');
  assert.equal(store.snapshot().actions.length, 16);
  assert.ok(store.snapshot().actions.every(slot => slot.media === null));
});

test('pomodoro media pack migrates separately from the sixteen installed actions and persists through the same safe importer', async t => {
  const {store,directory}=fixture(t),original=path.join(directory,'study.webm');fs.writeFileSync(original,Buffer.from([0x1a,0x45,0xdf,0xa3]));
  await store.importAction('greeting',original);delete store.state.pomodoroActions;store.save();
  const before=structuredClone(store.state),upgraded=new PetStore(store.directory,directory);
  assert.equal(upgraded.state.pomodoroActions.length,6);assert.deepEqual(upgraded.state.actions,before.actions);
  await upgraded.importAction('pomodoro-study',original);const reloaded=new PetStore(store.directory,directory);
  assert.match(reloaded.snapshot().pomodoroActions.find(a=>a.id==='pomodoro-study').media.url,/pet-media:\/\/action\/pomodoro-study/);
  assert.equal(fs.readFileSync(reloaded.mediaPath('pomodoro-study')).compare(fs.readFileSync(original)),0);
  await reloaded.clearAction('pomodoro-study');assert.equal(reloaded.slot('pomodoro-study').media,null);assert.ok(fs.existsSync(original));
  for(const key of ['actions','idle','settings','stats'])assert.deepEqual(reloaded.state[key],before[key]);
});
test('import copies video, keeps original and persists managed media', async t => {
  const { store, directory } = fixture(t);
  const original = path.join(directory, '你好.webm');
  fs.writeFileSync(original, Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const state = await store.importAction('greeting', original);
  assert.equal(state.actions[0].media.name, '你好.webm');
  assert.match(state.actions[0].media.url, /^pet-media:\/\/action\/greeting/);
  assert.ok(fs.existsSync(original));
  const reloaded = new PetStore(store.directory, directory);
  assert.equal(reloaded.snapshot().actions[0].media.name, '你好.webm');
  await reloaded.clearAction('greeting');
  assert.ok(fs.existsSync(original));
  assert.equal(reloaded.snapshot().actions[0].media, null);
  assert.deepEqual(fs.readdirSync(store.mediaDirectory), []);
});
test('unsupported and empty files cannot fill a slot', async t => {
  const { store, directory } = fixture(t);
  const empty = path.join(directory, 'empty.mp4'); fs.writeFileSync(empty, '');
  await assert.rejects(store.importAction('working', empty), /非空/);
  await assert.rejects(store.importAction('working', path.join(directory, 'code.js')), /WebM/);
  await assert.rejects(store.importAction('../escape', empty), /未知/);
});

test('a ten-slot library upgrades without losing media, settings or stats and the new pat action persists', async t => {
  const { store, directory } = fixture(t);
  const original = path.join(directory, 'greeting.webm');
  fs.writeFileSync(original, Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  await store.importAction('greeting', original);
  await store.importAction('idle', original);
  store.updateSettings({ scale: 1.45, quietMode: true });
  store.state.stats.completedTasks = 3;
  store.state.position = { x: 120, y: 80 };
  store.state.actions = store.state.actions.filter(slot => !['pat','wallet','wallet-careful','wallet-low','wallet-empty','wallet-wait'].includes(slot.id));
  store.save();
  const legacy = structuredClone(store.state);
  const upgraded = new PetStore(store.directory, directory);
  assert.deepEqual(upgraded.state.actions.filter(slot => !['pat','wallet','wallet-careful','wallet-low','wallet-empty','wallet-wait'].includes(slot.id)), legacy.actions);
  for (const key of ['settings', 'stats', 'position', 'idle']) assert.deepEqual(upgraded.state[key], legacy[key]);
  assert.equal(upgraded.slot('pat').label, '摸摸头');
  assert.equal(upgraded.slot('pat').media, null);
  await upgraded.importAction('pat', original);
  const reloaded = new PetStore(store.directory, directory);
  assert.equal(reloaded.slot('pat').media.name, 'greeting.webm');
  assert.equal(fs.readFileSync(reloaded.mediaPath('pat')).compare(fs.readFileSync(original)), 0);
  await reloaded.clearAction('pat');
  assert.equal(reloaded.slot('pat').media, null);
  assert.deepEqual(reloaded.state.actions.filter(slot => !['pat','wallet','wallet-careful','wallet-low','wallet-empty','wallet-wait'].includes(slot.id)), legacy.actions);
  assert.deepEqual(reloaded.state.idle, legacy.idle);
});
test('loaded media cannot escape the managed media directory', t => {
  const { store, directory } = fixture(t);
  const state = store.state;
  state.actions[0].media = { file: '../outside.webm', name: 'outside.webm' };
  store.save();
  assert.equal(new PetStore(store.directory, directory).snapshot().actions[0].media, null);
});
test('settings reject invalid types and missing workspaces', t => {
  const { store } = fixture(t);
  assert.throws(() => validateSettings(store.state.settings, { scale: 9 }), /缩放/);
  assert.throws(() => validateSettings(store.state.settings, { scale: 2.01 }), /缩放/);
  assert.throws(() => validateSettings(store.state.settings, { scale: 0.64 }), /缩放/);
  assert.equal(validateSettings(store.state.settings, { scale: 2 }).scale, 2);
  assert.throws(() => validateSettings(store.state.settings, { quietMode: 'false' }), /布尔/);
  assert.throws(() => validateSettings(store.state.settings, { workspace: 'relative' }), /工作/);
  store.updateSettings({ quietMode: true, scale: 1.25 });
  assert.equal(new PetStore(store.directory, store.directory).snapshot().settings.scale, 1.25);
});

test('idle video persists separately and clearing it preserves all sixteen action slots', async t => {
  const { store, directory } = fixture(t);
  const original = path.join(directory, 'idle.webm');
  fs.writeFileSync(original, Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  await store.importAction('idle', original);
  const reloaded = new PetStore(store.directory, directory);
  assert.match(reloaded.snapshot().idle.media.url, /^pet-media:\/\/action\/idle/);
  assert.ok(reloaded.snapshot().actions.every(slot => slot.media === null));
  assert.equal(reloaded.snapshot().actions.length, 16);
  await reloaded.clearAction('idle');
  assert.equal(reloaded.snapshot().idle.media, null);
  assert.ok(fs.existsSync(original));
});

test('drag pack persists all phases, exposes only URLs, and leaves source files intact', async t => {
  const { store, directory } = fixture(t);
  const sources = dragSources(directory);
  const state = await store.importDragPack(sources);
  const drag = state.actions.find(action => action.id === 'drag').media;
  assert.equal(drag.file, undefined);
  for (const phase of ['enter', 'hold', 'exit']) {
    assert.match(drag.phases[phase].url, new RegExp(`^pet-media:\\/\\/action/drag\\?phase=${phase}&v=`));
    assert.equal(drag.phases[phase].file, undefined);
    assert.deepEqual(fs.readFileSync(store.mediaPath('drag', phase)), fs.readFileSync(sources[phase]));
  }
  assert.equal(fs.readdirSync(store.mediaDirectory).length, 4);
  const reloaded = new PetStore(store.directory, directory);
  assert.deepEqual(reloaded.snapshot().actions.find(action => action.id === 'drag').media, drag);
  assert.ok(Object.values(sources).every(file => fs.existsSync(file)));
  assert.equal(reloaded.snapshot().actions.length, 16);
  assert.equal(reloaded.snapshot().idle.media, null);
});

test('phase routing rejects traversal and other slots; invalid persisted pack falls back to preview', async t => {
  const { store, directory } = fixture(t);
  await store.importDragPack(dragSources(directory));
  fs.writeFileSync(path.join(store.directory, 'outside.webm'), 'outside');
  for (const phase of ['../outside.webm', '..\\outside.webm', 'preview', 'unknown', '']) assert.equal(store.mediaPath('drag', phase), null);
  assert.equal(store.mediaPath('greeting', 'enter'), null);
  assert.equal(store.mediaPath('idle', 'hold'), null);
  const original = store.slot('drag').media.phases.hold.file;
  store.slot('drag').media.phases.hold.file = '../outside.webm';
  assert.equal(store.mediaPath('drag', 'hold'), null);
  store.save();
  const reloaded = new PetStore(store.directory, directory);
  assert.ok(reloaded.mediaPath('drag'));
  assert.equal(reloaded.slot('drag').media.phases, undefined);
  store.slot('drag').media.phases.hold.file = original;
  fs.unlinkSync(store.mediaPath('drag', 'hold'));
  store.save();
  assert.equal(new PetStore(store.directory, directory).slot('drag').media.phases, undefined);
});

test('failed drag pack copy removes partial copies and preserves previous media and saved state', async t => {
  const { store, directory } = fixture(t);
  await store.importDragPack(dragSources(directory, 'before'));
  const originalState = fs.readFileSync(store.file, 'utf8');
  const originalFiles = fs.readdirSync(store.mediaDirectory).sort();
  const originalMedia = structuredClone(store.slot('drag').media);
  const replacement = dragSources(directory, 'replacement');
  const copyFile = fs.promises.copyFile;
  let copies = 0;
  fs.promises.copyFile = async (...args) => {
    await copyFile(...args);
    if (++copies === 2) throw new Error('simulated copy failure after file creation');
  };
  try { await assert.rejects(store.importDragPack(replacement), /simulated copy failure/); }
  finally { fs.promises.copyFile = copyFile; }
  assert.deepEqual(store.slot('drag').media, originalMedia);
  assert.equal(fs.readFileSync(store.file, 'utf8'), originalState);
  assert.deepEqual(fs.readdirSync(store.mediaDirectory).sort(), originalFiles);
  assert.ok(Object.values(replacement).every(file => fs.existsSync(file)));
});

test('failed drag pack save rolls back memory and cleans only newly copied files', async t => {
  const { store, directory } = fixture(t);
  await store.importDragPack(dragSources(directory, 'before'));
  const originalState = fs.readFileSync(store.file, 'utf8');
  const originalFiles = fs.readdirSync(store.mediaDirectory).sort();
  const originalMedia = structuredClone(store.slot('drag').media);
  const save = store.save;
  store.save = () => { throw new Error('simulated save failure'); };
  try { await assert.rejects(store.importDragPack(dragSources(directory, 'replacement')), /simulated save failure/); }
  finally { store.save = save; }
  assert.deepEqual(store.slot('drag').media, originalMedia);
  assert.equal(fs.readFileSync(store.file, 'utf8'), originalState);
  assert.deepEqual(fs.readdirSync(store.mediaDirectory).sort(), originalFiles);
});

test('drag pack validates all sources before copying and normal replacement clears all phase copies', async t => {
  const { store, directory } = fixture(t);
  const sources = dragSources(directory);
  await assert.rejects(store.importDragPack({ ...sources, exit: undefined }), /缺少/);
  await assert.rejects(store.importDragPack({ ...sources, hold: path.join(directory, 'missing.webm') }), /ENOENT/);
  assert.deepEqual(fs.readdirSync(store.mediaDirectory), []);
  await store.importDragPack(sources);
  await store.importAction('drag', sources.preview);
  assert.equal(fs.readdirSync(store.mediaDirectory).length, 1);
  assert.equal(store.slot('drag').media.phases, undefined);
  await store.importDragPack(sources);
  assert.equal(fs.readdirSync(store.mediaDirectory).length, 4);
  await store.clearAction('drag');
  assert.deepEqual(fs.readdirSync(store.mediaDirectory), []);
  assert.ok(Object.values(sources).every(file => fs.existsSync(file)));
});
