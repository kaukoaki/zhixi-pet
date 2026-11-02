'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const createDragReaction = require('../renderer/drag-reaction.js');

const media = { url: 'preview.webm', phases: { enter: { url: 'enter.webm' }, hold: { url: 'hold.webm' }, exit: { url: 'exit.webm' } } };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(options = {}) {
  const plays = []; let idles = 0;
  const playback = {
    play(url, detail) { const record = { url, ...detail }; plays.push(record); return options.play?.(record) ?? Promise.resolve(true); },
    idle() { idles++; return Promise.resolve(true); }
  };
  const reaction = createDragReaction({ playback, getMedia: () => options.media === undefined ? media : options.media });
  return { reaction, plays, get idles() { return idles; } };
}

test('drag enters once, loops the suspended reaction for any hold duration, and exits on release', async () => {
  const f = fixture();
  await f.reaction.start();
  assert.equal(f.reaction.phase, 'enter'); assert.equal(f.plays[0].loop, false);
  f.plays[0].onEnded(); await flush();
  assert.equal(f.reaction.phase, 'hold'); assert.equal(f.plays[1].url, 'hold.webm'); assert.equal(f.plays[1].loop, true);
  // Native looping never invokes the end handoff, even after many clip lengths.
  for (let clip = 0; clip < 20; clip++) { f.plays[1].onEnded(); await flush(); }
  assert.equal(f.reaction.phase, 'hold'); assert.equal(f.idles, 0);
  await f.reaction.release();
  assert.equal(f.reaction.phase, 'exit'); assert.equal(f.plays[2].loop, false);
  f.plays[2].onEnded();
  assert.equal(f.reaction.phase, 'idle'); assert.equal(f.reaction.held, false); assert.equal(f.idles, 1);
});

test('release before the entry loads cannot resurrect the held reaction', async () => {
  let resolveEntry;
  const f = fixture({ play: record => record.url === 'enter.webm' ? new Promise(resolve => { resolveEntry = resolve; }) : Promise.resolve(true) });
  const starting = f.reaction.start();
  await f.reaction.release();
  resolveEntry(false); await starting;
  f.plays[0].onEnded(); await flush();
  assert.equal(f.reaction.phase, 'exit'); assert.equal(f.reaction.held, false);
  assert.deepEqual(f.plays.map(play => play.url), ['enter.webm', 'exit.webm']);
  assert.equal(f.idles, 0);
});

test('a quick new grab invalidates the old exit callback', async () => {
  const f = fixture(); await f.reaction.start(); await f.reaction.release();
  const oldExit = f.plays[1];
  await f.reaction.start();
  oldExit.onEnded(); await flush();
  assert.equal(f.reaction.held, true); assert.equal(f.reaction.phase, 'enter'); assert.equal(f.idles, 0);
  f.plays[2].onEnded(); await flush();
  assert.equal(f.reaction.phase, 'hold');
});

test('legacy drag media loops only while held and falls back to idle on release', async () => {
  const f = fixture({ media: { url: 'legacy.webm' } });
  await f.reaction.start();
  assert.equal(f.plays[0].url, 'legacy.webm'); assert.equal(f.plays[0].loop, true);
  await f.reaction.release();
  assert.equal(f.idles, 1); assert.equal(f.reaction.phase, 'idle');
});

test('load failure restores idle without releasing the physical hold or retrying stale phases', async () => {
  const f = fixture({ play: () => Promise.resolve(false) });
  await f.reaction.start();
  assert.equal(f.reaction.held, true); assert.equal(f.reaction.phase, 'fallback'); assert.equal(f.idles, 1);
  f.plays[0].onEnded(); await flush();
  assert.equal(f.plays.length, 1);
  await f.reaction.release();
  assert.equal(f.reaction.phase, 'idle'); assert.equal(f.plays.length, 1);
});

test('menus cannot interrupt a held reaction; a later normal preview invalidates a pending exit', async () => {
  const f = fixture(); await f.reaction.start();
  const generation = f.reaction.state.generation;
  assert.equal(f.reaction.interrupt(), false);
  assert.equal(f.reaction.state.generation, generation); assert.equal(f.reaction.held, true);
  await f.reaction.release(); const exit = f.plays.at(-1);
  assert.equal(f.reaction.interrupt(), true);
  exit.onEnded(); await flush();
  assert.equal(f.reaction.phase, 'idle'); assert.equal(f.reaction.held, false); assert.equal(f.idles, 0);
});

function playerFixture(t, { manualFrames = false, canvas = false, virtualClock = false, screenSize, pixelRatio = 1 } = {}) {
  const timers = new Set();
  const scheduled = new Map(); let now = 10000, nextTimer = 0;
  const classList = () => { const values = new Set(); return { add: x => values.add(x), remove: x => values.delete(x), contains: x => values.has(x) }; };
  const events = [];
  const stage = { classList: classList(), dispatchEvent(event) { events.push(event); } };
  const createCanvas = () => {
    const element = { classList: classList(), width: 0, height: 0, hasPixels: false, paintedSrc: null };
    const ctx = {
      clearRect() { element.hasPixels = false; element.paintedSrc = null; },
      drawImage(input) { element.hasPixels = input.hasPixels !== false; element.paintedSrc = input.src || input.paintedSrc; },
      getImageData() { const data = new Uint8ClampedArray(24*24*4); if (element.hasPixels) for (let i=3;i<data.length;i+=4)data[i]=255; return { data }; }
    };
    element.getContext = () => ctx;
    return element;
  };
  const surface = canvas ? createCanvas() : null;
  const videos = Array.from({ length: 2 }, () => {
    const listeners = new Map();
    const frameCallbacks = new Map(); let frameId = 0;
    return {
      classList: classList(), paused: true, ended: false, loop: false, readyState: 2, videoWidth: 96, videoHeight: 96, currentTime: 0, duration: 10, hasPixels: true,
      ...(screenSize ? { getBoundingClientRect: () => screenSize } : {}),
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      emit(name) { for (const fn of [...(listeners.get(name) || [])]) fn(); },
      pause() { this.paused = true; }, play() { this.paused = false; this.ended = false; return Promise.resolve(); },
      removeAttribute(name) { if (name === 'src') this.src = ''; }, load() {},
      ...(manualFrames ? {
        requestVideoFrameCallback(callback) { frameCallbacks.set(++frameId, callback); return frameId; },
        cancelVideoFrameCallback(id) { frameCallbacks.delete(id); },
        presentFrame() { const callbacks = [...frameCallbacks.values()]; frameCallbacks.clear(); for (const callback of callbacks) callback(); }
      } : {})
    };
  });
  const context = {
    window: { qiqiIdle: { pause() {}, resume() {} }, devicePixelRatio: pixelRatio },
    document: { getElementById(id) { return id === 'pet-stage' ? stage : id === 'pet-surface' ? surface : videos[id === 'pet-video' ? 0 : 1]; }, createElement: createCanvas },
    CustomEvent: class { constructor(name, detail) { this.type = name; this.detail = detail; } },
    Date: virtualClock ? { now: () => now } : Date,
    setTimeout(fn, ms) { if (virtualClock) { scheduled.set(++nextTimer, { at: now+ms, fn }); return nextTimer; } const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; },
    clearTimeout(id) { if (virtualClock) scheduled.delete(id); else { clearTimeout(id); timers.delete(id); } },
    requestAnimationFrame(fn) { return context.setTimeout(fn, 0); },
    cancelAnimationFrame(id) { context.clearTimeout(id); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/playback.js'), 'utf8'), context);
  t.after(() => { for (const id of timers) clearTimeout(id); scheduled.clear(); });
  async function advance(ms) {
    const until = now+ms;
    while (true) {
      const due = [...scheduled].filter(([,v]) => v.at <= until).sort((a,b) => a[1].at-b[1].at)[0];
      if (!due) break;
      now = due[1].at; scheduled.delete(due[0]); due[1].fn(); await flush();
    }
    now = until; await flush();
  }
  return { player: context.window.qiqiPlayback, videos, surface, events, stage, advance };
}

test('returning to an already visible URL cancels a different pending video', async t => {
  const { player, videos } = playerFixture(t);
  const idle = player.play('idle.webm', { loop: true, id: 'idle' }); videos[0].emit('loadeddata'); await idle;
  const stale = player.play('greeting.webm', { id: 'greeting' });
  assert.equal(await player.play('idle.webm', { loop: true, id: 'idle' }), true);
  videos[1].emit('loadeddata'); assert.equal(await stale, false);
  assert.equal(player.current.id, 'idle'); assert.equal(player.pending, false);
  assert.equal(videos[0].classList.contains('is-front'), true); assert.equal(videos[1].classList.contains('is-front'), false);
});

test('an old video ending during another load does not replace the newer request with idle', async t => {
  const { player, videos } = playerFixture(t);
  const first = player.play('first.webm', { id: 'first' }); videos[0].emit('loadeddata'); await first;
  const next = player.play('next.webm', { id: 'next' });
  videos[0].ended = true; videos[0].emit('ended');
  videos[1].emit('loadeddata'); await next;
  assert.equal(player.current.id, 'next');
});

test('the old frame stays visible until the replacement has submitted its first video frame', async t => {
  const { player, videos } = playerFixture(t, { manualFrames: true });
  const first = player.play('first.webm', { id: 'first' }); videos[0].emit('loadeddata'); await flush(); videos[0].presentFrame(); await first;
  const next = player.play('next.webm', { id: 'next' }); videos[1].emit('loadeddata'); await flush();
  assert.equal(player.pending, true); assert.equal(player.current.id, 'first');
  assert.equal(videos[0].classList.contains('is-front'), true); assert.equal(videos[1].classList.contains('is-front'), false);
  videos[1].presentFrame(); assert.equal(await next, true);
  assert.equal(player.current.id, 'next'); assert.equal(videos[0].classList.contains('is-front'), false);
});

test('returning to the current clip cancels a replacement waiting for its first presented frame', async t => {
  const { player, videos } = playerFixture(t, { manualFrames: true });
  const first = player.play('idle.webm', { id: 'idle', loop: true }); videos[0].emit('loadeddata'); await flush(); videos[0].presentFrame(); await first;
  const stale = player.play('stale.webm', { id: 'stale' }); videos[1].emit('loadeddata'); await flush();
  assert.equal(await player.play('idle.webm', { id: 'idle', loop: true }), true);
  assert.equal(await stale, false); videos[1].presentFrame(); await flush();
  assert.equal(player.current.id, 'idle'); assert.equal(player.pending, false); assert.equal(videos[1].paused, true);
});

test('transparent decoder frames never erase the visible character during a switch or loop', async t => {
  const { player, videos, surface } = playerFixture(t, { manualFrames: true, canvas: true });
  const first = player.play('idle.webm', { id: 'idle', loop: true }); videos[0].emit('loadeddata'); await flush(); videos[0].presentFrame(); await first;
  assert.equal(player.mode, 'canvas'); assert.equal(surface.paintedSrc, 'idle.webm');
  videos[1].hasPixels = false;
  const next = player.play('next.webm', { id: 'next', loop: true }); videos[1].emit('loadeddata'); await flush(); videos[1].presentFrame(); await flush();
  assert.equal(player.current.id, 'idle'); assert.equal(surface.paintedSrc, 'idle.webm'); assert.equal(player.pending, true);
  videos[1].hasPixels = true; videos[1].presentFrame(); await next;
  assert.equal(surface.paintedSrc, 'next.webm'); const frames = player.frames;
  videos[1].hasPixels = false; videos[1].presentFrame();
  assert.equal(player.frames, frames); assert.equal(surface.paintedSrc, 'next.webm'); assert.equal(surface.hasPixels, true);
  videos[1].hasPixels = true; videos[1].presentFrame(); assert.equal(player.frames, frames+1);
  assert.equal(player.skippedFrames, 2);
});

test('working canvases follow screen DPI without resizing the native video or enlarging small sources', async t => {
  const { player, videos } = playerFixture(t, { manualFrames: true, canvas: true, screenSize: { width: 150, height: 160 }, pixelRatio: 2 });
  videos[0].videoWidth = videos[0].videoHeight = 960;
  const start = player.play('large.webm'); videos[0].emit('loadeddata'); await flush(); videos[0].presentFrame(); await start;
  assert.equal(player.renderSize.width, 320); assert.equal(player.renderSize.height, 320);
  assert.equal(videos[0].videoWidth, 960);
  const small = player.play('small.webm'); videos[1].emit('loadeddata'); await flush(); videos[1].presentFrame(); await small;
  assert.equal(player.renderSize.width, 96);
  assert.equal(videos[0].paused, true, 'Previous decoder stops as soon as its retained frame is replaced');
});

test('missing first-frame callbacks cannot freeze a switch and transparent frames still retain the old picture', async t => {
  const { player, videos, surface, advance } = playerFixture(t, { manualFrames: true, canvas: true, virtualClock: true });
  const first = player.play('old.webm', { loop: true }); videos[0].emit('loadeddata'); await flush(); videos[0].presentFrame(); await first;
  videos[1].hasPixels = false;
  const next = player.play('new.webm'); videos[1].emit('loadeddata'); await flush(); await advance(150);
  assert.equal(surface.paintedSrc, 'old.webm'); assert.equal(player.pending, true);
  videos[1].hasPixels = true; await advance(100); assert.equal(await next, true);
  assert.equal(surface.paintedSrc, 'new.webm'); assert.equal(player.pending, false);
});

test('a lost compositor callback is rearmed without restarting the action when media time advances', async t => {
  const { player, videos, advance } = playerFixture(t, { manualFrames: true, canvas: true, virtualClock: true });
  const first = player.play('loop.webm', { loop: true }); videos[0].emit('loadeddata'); await flush(); videos[0].presentFrame(); await first;
  const initial = player.frames;
  for (let i = 1; i <= 6; i++) { videos[0].currentTime = i*.5; await advance(500); }
  assert.ok(player.frames > initial); assert.equal(player.recoveries, 0); assert.equal(player.pending, false);
});

test('a stopped decoder is retried once, then falls back to the portrait instead of hanging or retrying forever', async t => {
  const { player, videos, events, stage, advance } = playerFixture(t, { manualFrames: true, canvas: true, virtualClock: true });
  const first = player.play('frozen.webm', { id: 'wallet', loop: true }); videos[0].emit('loadeddata'); await flush(); videos[0].presentFrame(); await first;
  await advance(3300); assert.equal(player.recoveries, 1); assert.equal(player.pending, true);
  videos[1].emit('loadeddata'); await flush(); videos[1].presentFrame(); await flush();
  assert.equal(player.current.id, 'wallet'); await advance(3300);
  assert.equal(player.current, null); assert.equal(player.recoveries, 1); assert.equal(stage.classList.contains('playing'), false);
  assert.ok(events.some(e => e.type === 'media-error'));
});

test('a newer action cancels a pending decoder recovery without resurrecting the stalled clip', async t => {
  const { player, videos, advance } = playerFixture(t, { manualFrames: true, canvas: true, virtualClock: true });
  const first = player.play('frozen.webm', { id: 'wallet' }); videos[0].emit('loadeddata'); await flush(); videos[0].presentFrame(); await first;
  await advance(3300); assert.equal(player.pending, true);
  const newer = player.play('newer.webm', { id: 'greeting' }); videos[1].emit('loadeddata'); await flush(); videos[1].presentFrame(); await newer;
  assert.equal(player.current.id, 'greeting'); assert.equal(player.pending, false);
});

test('a transient action load failure retries once and can finish normally',async t=>{
  const {player,videos}=playerFixture(t,{canvas:true});
  const loading=player.play('working.webm',{id:'working',loop:true});videos[0].emit('error');await flush();
  assert.equal(player.recoveries,1);assert.match(videos[0].src,/reload=/);videos[0].emit('loadeddata');assert.equal(await loading,true);assert.equal(player.current.id,'working');assert.equal(player.current.url,'working.webm');
});
test('a broken replacement retains the already playing default loop',async t=>{
  const {player,videos,surface}=playerFixture(t,{canvas:true});
  const idle=player.play('idle.webm',{id:'idle',loop:true});videos[0].emit('loadeddata');await idle;
  const broken=player.play('bad.webm',{id:'working'});videos[1].emit('error');await flush();videos[1].emit('error');assert.equal(await broken,false);
  assert.equal(player.current.id,'idle');assert.equal(player.current.loop,true);assert.equal(surface.paintedSrc,'idle.webm');assert.equal(videos[0].paused,false);
});
test('an action failing without a previous frame recovers the default video instead of staying on the portrait',async t=>{
  const {player,videos}=playerFixture(t,{canvas:true});player.setDefault('idle.webm',{defer:true});
  const broken=player.play('bad.webm',{id:'working'});videos[0].emit('error');await flush();videos[0].emit('error');assert.equal(await broken,false);
  videos[0].emit('loadeddata');await flush();await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(player.current.id,'idle');assert.equal(player.current.loop,true);assert.equal(player.pending,false);
});
