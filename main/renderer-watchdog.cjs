'use strict';

// A transparent background window does not always receive Electron's unresponsive event.
function createRendererWatchdog({ active, recover, now = Date.now, timeoutMs = 12000 }) {
  let lastBeat = now(), lastTick = lastBeat, recovering = false;
  function beat() { lastBeat = now(); recovering = false; }
  function tick() {
    const time = now(), gap = time - lastTick;
    lastTick = time;
    // Machine sleep or a blocked main loop is not proof that the renderer hung.
    if (gap > timeoutMs || gap < 0 || !active()) { beat(); return; }
    if (!recovering && time - lastBeat >= timeoutMs) { recovering = true; recover(); }
  }
  return { beat, tick, isStale: () => active() && now() - lastBeat >= timeoutMs };
}

module.exports = { createRendererWatchdog };
