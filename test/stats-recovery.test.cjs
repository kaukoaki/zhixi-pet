'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { PetStore } = require('../main/store.cjs'), { createPomodoro } = require('../main/pomodoro.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixi-stats-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new PetStore(path.join(directory, 'profile'), directory); store.save(); return { directory, store };
}
test('a completion save failure keeps its count in memory without escaping the timer callback, then retries exactly once', t => {
  const { store, directory } = fixture(t); let now = 0; const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', () => { throw Error('disk full'); });
  const timer = createPomodoro({ now: () => now, onComplete: () => store.increment('focusSessions') });
  timer.command({ type: 'start', minutes: 1 }); now += 60000; assert.doesNotThrow(() => timer.tick());
  assert.equal(timer.snapshot().status, 'completed'); assert.equal(store.state.stats.focusSessions, 1); assert.equal(store.pendingStats, true); assert.match(store.statsWarning, /统计/);
  assert.equal(JSON.parse(fs.readFileSync(store.file, 'utf8')).stats.focusSessions, 0); assert.equal(store.retryStats(), false); assert.equal(store.state.stats.focusSessions, 1);
  fs.renameSync = rename; assert.equal(store.retryStats(), true); assert.equal(store.retryStats(), true);
  assert.equal(store.pendingStats, false); assert.equal(store.statsWarning, null); assert.equal(new PetStore(store.directory, directory).state.stats.focusSessions, 1);
});
test('several failed increments preserve both counters and a later ordinary save persists them and clears the warning', t => {
  const { store, directory } = fixture(t), rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', () => { throw Error('locked'); });
  assert.equal(store.increment('completedTasks'), false); assert.equal(store.increment('completedTasks'), false); assert.equal(store.increment('focusSessions'), false);
  assert.deepEqual(store.state.stats, { completedTasks: 2, focusSessions: 1 });
  fs.renameSync = rename; store.updateSettings({ quietMode: true });
  assert.equal(store.pendingStats, false); assert.equal(store.statsWarning, null);
  const next = new PetStore(store.directory, directory); assert.deepEqual(next.state.stats, { completedTasks: 2, focusSessions: 1 }); assert.equal(next.state.settings.quietMode, true);
});
test('successful increments and unknown counter requests do not produce pending work', t => {
  const { store } = fixture(t); assert.equal(store.increment('focusSessions'), true); assert.equal(store.pendingStats, false);
  assert.equal(store.increment('not-a-counter'), false); assert.equal(store.retryStats(), true); assert.equal(store.state.stats.focusSessions, 1);
});
