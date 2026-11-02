'use strict';
(() => {
  const audio = document.getElementById('companion-music');
  let quiet = true, revision = 0;
  audio.volume = .16;
  async function sync(settings) {
    quiet = settings?.quietMode !== false;
    const token = ++revision;
    if (quiet) { audio.pause(); return; }
    if (!audio.paused) return;
    try {
      await audio.play();
      if (token !== revision && quiet) audio.pause();
    } catch { /* A real pointer gesture can unlock audio after browser preview restrictions. */ }
  }
  document.addEventListener('pointerdown', () => { if (!quiet && audio.paused) void sync({ quietMode: false }); });
  window.addEventListener('pagehide', () => audio.pause());
  window.qiqiMusic = { sync, get playing() { return !audio.paused; }, get volume() { return audio.volume; } };
})();
