'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createRendererWatchdog } = require('../main/renderer-watchdog.cjs');
function fixture() {
  let now = 0, active = true, recoveries = 0;
  const dog = createRendererWatchdog({ now: () => now, timeoutMs: 100, active: () => active, recover: () => recoveries++ });
  return { dog, step(ms) { now += ms; dog.tick(); }, active(value) { active = value; }, get recoveries() { return recoveries; } };
}
test('missed renderer heartbeats trigger one recovery and a new renderer can fail again', () => {
  const f = fixture();
  f.step(50); f.dog.beat(); f.step(50); f.step(50);
  assert.equal(f.recoveries, 1); assert.equal(f.dog.isStale(), true);
  f.step(50); assert.equal(f.recoveries, 1);
  f.dog.beat(); assert.equal(f.dog.isStale(), false);
  f.step(50); f.step(50); assert.equal(f.recoveries, 2);
});
test('healthy heartbeats and hidden windows do not restart the renderer', () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) { f.step(40); f.dog.beat(); }
  f.active(false); for (let i = 0; i < 20; i++) f.step(40);
  f.active(true); f.step(40); f.dog.beat();
  assert.equal(f.recoveries, 0);
});
test('sleep or main-loop delay gives the renderer a fresh heartbeat grace period', () => {
  const f = fixture();
  f.step(50000); assert.equal(f.recoveries, 0);
  f.step(50); f.dog.beat(); f.step(50);
  assert.equal(f.recoveries, 0);
  f.step(-50000); assert.equal(f.recoveries, 0);
});
