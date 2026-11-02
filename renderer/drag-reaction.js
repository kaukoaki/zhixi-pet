'use strict';
(function expose(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.createDragReaction = factory();
})(typeof window === 'undefined' ? globalThis : window, () => {
  return function createDragReaction({ playback, getMedia, onPhase = () => {}, onError = () => {} }) {
    let held = false, phase = 'idle', loading = false, epoch = 0, request = 0;
    const notify = () => onPhase({ held, phase, loading });
    const isCurrent = (owner, ticket) => owner === epoch && ticket === request;
    function idle() {
      request++; phase = 'idle'; loading = false; notify();
      try { Promise.resolve(playback.idle()).catch(() => {}); } catch { /* The player has its own static fallback. */ }
    }
    function failed(owner, ticket, error) {
      if (!isCurrent(owner, ticket)) return;
      request++; phase = held ? 'fallback' : 'idle'; loading = false; notify();
      try { Promise.resolve(playback.idle()).catch(() => {}); } catch { /* Keep the static portrait. */ }
      onError(error || new Error('拖动视频暂时无法播放'));
    }
    async function run(kind, url, loop, owner, ended) {
      const ticket = ++request;
      phase = kind; loading = true; notify();
      try {
        const ok = await playback.play(url, {
          id: `drag:${kind}`, loop,
          onEnded: () => { if (isCurrent(owner, ticket)) ended?.(); }
        });
        if (!isCurrent(owner, ticket)) return false;
        loading = false; notify();
        if (!ok) failed(owner, ticket);
        return Boolean(ok);
      } catch (error) { failed(owner, ticket, error); return false; }
    }
    function start() {
      if (held) return Promise.resolve(true);
      held = true; const owner = ++epoch;
      const media = getMedia();
      const holdUrl = media?.phases?.hold?.url;
      if (media?.phases?.enter?.url && holdUrl) {
        return run('enter', media.phases.enter.url, false, owner, () => {
          if (held) void run('hold', holdUrl, true, owner);
        });
      }
      if (holdUrl || media?.url) return run('hold', holdUrl || media.url, true, owner);
      request++; phase = 'fallback'; loading = false; notify();
      try { Promise.resolve(playback.idle()).catch(() => {}); } catch { /* No drag video configured. */ }
      return Promise.resolve(false);
    }
    function release() {
      if (!held) return Promise.resolve(false);
      held = false; const owner = ++epoch;
      const exitUrl = getMedia()?.phases?.exit?.url;
      if (exitUrl && phase !== 'fallback') return run('exit', exitUrl, false, owner, idle);
      idle(); return Promise.resolve(true);
    }
    function interrupt() {
      // Menus and task events cannot replace a reaction while the mouse is held.
      if (held) return false;
      epoch++; request++; phase = 'idle'; loading = false; notify();
      return true;
    }
    function mediaError(error) {
      if (phase === 'idle' || phase === 'fallback') return;
      failed(epoch, request, error);
    }
    return {
      start, release, interrupt, mediaError,
      get held() { return held; },
      get phase() { return phase; },
      get state() { return { held, phase, loading, generation: epoch }; }
    };
  };
});
