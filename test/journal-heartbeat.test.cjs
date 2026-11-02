'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { randomUUID } = require('node:crypto');
const { JournalStore } = require('../main/journal.cjs'), { createPomodoro } = require('../main/pomodoro.cjs'), { createJournalHeartbeat } = require('../main/journal-heartbeat.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixi-heartbeat-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let time = Date.parse('2026-10-26T10:00:00+08:00');
  const options = { now: () => time, timeZone: 'Asia/Shanghai' }, file = path.join(directory, 'journal.json');
  let journal = new JournalStore(file, options);
  const notifications = [], heartbeat = createJournalHeartbeat({ getJournal: () => journal, now: () => time, onChange: value => notifications.push(value) });
  const timer = createPomodoro({ now: () => time, onChange: (state, meta) => journal.observe(state, meta) });
  journal.observe(timer.snapshot(), { initial: true, persist: true });
  return { directory, file, heartbeat, timer, notifications, get journal() { return journal; }, advance: ms => { time += ms; return heartbeat.tick(); }, time: value => { time = value; }, now: () => time, replace: () => { journal = new JournalStore(path.join(directory, 'replacement.json'), options); return journal; } };
}
test('idle and paused sessions record each actually observed day without requiring an open journal', t => {
  for (const paused of [false, true]) {
    const f = fixture(t); f.heartbeat.tick();
    if (paused) { f.timer.command({ type: 'start', minutes: 25 }); f.advance(20000); f.timer.command({ type: 'pause' }); }
    f.advance(86400000); f.timer.tick(); f.advance(86400000); f.timer.tick();
    assert.equal(f.journal.snapshot().total.days, 3); assert.equal(f.journal.snapshot().total.streak, 3);
    const reloaded = new JournalStore(f.file, { now: f.now, timeZone: 'Asia/Shanghai' });
    assert.equal(reloaded.snapshot().total.days, 3); assert.equal(reloaded.snapshot().total.focusMs, paused ? 20000 : 0);
    assert.equal(reloaded.snapshot().total.sessions, 0);
  }
});
test('a gap without heartbeat observations does not fabricate absent companionship dates', t => {
  const f = fixture(t); f.heartbeat.tick(); f.advance(3 * 86400000);
  assert.deepEqual(Object.keys(f.journal.data.days), ['2026-10-26', '2026-10-29']);
  assert.equal(f.journal.snapshot().total.days, 2); assert.equal(f.journal.snapshot().total.streak, 1);
});
test('same-day dirty data flushes after fifteen seconds and unchanged visits do not keep writing', t => {
  const f = fixture(t); f.heartbeat.tick();
  const sessionId = randomUUID(), timer = { phase: 'focus', status: 'running', sessionId, durationMs: 60000, remainingMs: 60000, elapsedMs: 0 };
  f.journal.observe(timer); f.advance(1000); f.journal.observe({ ...timer, remainingMs: 59000, elapsedMs: 1000 });
  assert.equal(f.journal.dirty, true); f.advance(13000); assert.equal(f.journal.dirty, true); f.advance(1000);
  assert.equal(f.journal.dirty, false); assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).days['2026-10-26'].focusMs, 1000);
  let writes = 0; t.mock.method(f.journal, 'flush', () => { writes++; return true; }); f.advance(30000); f.advance(30000); assert.equal(writes, 0);
});
test('failed idle saves are retried without hammering the disk and changes in warning are notified', t => {
  const f = fixture(t); f.heartbeat.tick(); const rename = fs.renameSync; let attempts = 0;
  t.mock.method(fs, 'renameSync', (...args) => { attempts++; throw Error('disk full'); });
  f.advance(86400000); assert.equal(attempts, 1); assert.equal(f.journal.dirty, true); assert.match(f.notifications.at(-1).warning, /保存/);
  f.advance(1000); f.advance(1000); assert.equal(attempts, 1);
  fs.renameSync = rename; f.advance(13000); assert.equal(f.journal.dirty, false); assert.equal(f.notifications.at(-1).warning, null);
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).days['2026-10-27'].visited, true);
});
test('journal switching, scheduling clock rollback and a forced shutdown check cannot leave visits waiting forever', t => {
  const f = fixture(t); f.heartbeat.tick(); const replacement = f.replace();
  assert.equal(f.heartbeat.tick().checked, true); assert.equal(replacement.snapshot().total.days, 1);
  f.time(f.now() - 5000); assert.equal(f.heartbeat.tick().checked, true);
  replacement.data.days['2026-10-26'].note = '退出前的一句话'; replacement.dirty = true;
  assert.equal(f.heartbeat.tick(true).saved, true); assert.equal(JSON.parse(fs.readFileSync(replacement.file, 'utf8')).days['2026-10-26'].note, '退出前的一句话');
});
