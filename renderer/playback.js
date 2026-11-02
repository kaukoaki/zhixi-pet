'use strict';
(() => {
  const stage = document.getElementById('pet-stage');
  if (!stage) return;
  const videos = [document.getElementById('pet-video'), document.getElementById('pet-video-back')];
  const surface = document.getElementById('pet-surface');
  const surfaceContext = surface?.getContext?.('2d', { alpha: true });
  const buffers = surfaceContext ? videos.map(() => document.createElement('canvas')) : [];
  const contexts = buffers.map(canvas => canvas.getContext('2d', { alpha: true, willReadFrequently: true }));
  const probe = surfaceContext ? document.createElement('canvas') : null;
  if (probe) probe.width = probe.height = 24;
  const probeContext = probe?.getContext('2d', { alpha: true, willReadFrequently: true });
  const canvasMode = Boolean(surfaceContext && probeContext && contexts.every(Boolean));
  if (!canvasMode) stage.classList.add('video-fallback');
  let front = -1, generation = 0, cancelLoad, defaultUrl = null, active = null, pending = false;
  let pumpVideo, pumpId, pumpIsVideo, healthTimer, frames = 0, skippedFrames = 0, recoveries = 0;
  let lastPresentedAt = 0;
  const retireTimers = new Map();

  function stopPump() {
    clearTimeout(healthTimer); healthTimer = undefined;
    if (pumpVideo && pumpId !== undefined) {
      if (pumpIsVideo) pumpVideo.cancelVideoFrameCallback?.(pumpId);
      else cancelAnimationFrame(pumpId);
    }
    pumpVideo = null; pumpId = undefined;
  }
  function prepare(index) {
    if (!canvasMode) return true;
    const video = videos[index], buffer = buffers[index], ctx = contexts[index];
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;
    // Validate directly on a tiny CPU canvas. Reading a full GPU-backed copy
    // every frame forces a synchronous readback on Windows transparent windows.
    probeContext.clearRect(0, 0, 24, 24);
    probeContext.drawImage(video, 0, 0, 24, 24);
    const pixels = probeContext.getImageData(0, 0, 24, 24).data;
    let occupied = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 32) occupied++;
    if (occupied < 4) { skippedFrames++; return false; }
    // Keep the source video intact; size the working copy for its actual screen
    // footprint, including zoom/DPI. Native-sized 960px buffers are wasteful for
    // a ~210px character. A 256px floor preserves small comic effects.
    const rect = video.getBoundingClientRect?.();
    const ratio = Number(window.devicePixelRatio) || 1;
    const longest = Math.max(video.videoWidth, video.videoHeight);
    const target = rect ? Math.max(256, Math.ceil(Math.max(rect.width, rect.height) * ratio)) : longest;
    const fit = Math.min(1, target / longest);
    const width = Math.max(1, Math.ceil(video.videoWidth * fit)), height = Math.max(1, Math.ceil(video.videoHeight * fit));
    if (buffer.width !== width || buffer.height !== height) { buffer.width = width; buffer.height = height; }
    ctx.clearRect(0, 0, buffer.width, buffer.height);
    ctx.drawImage(video, 0, 0, buffer.width, buffer.height);
    return true;
  }
  function present(index) {
    if (!canvasMode) return;
    const buffer = buffers[index];
    if (surface.width !== buffer.width || surface.height !== buffer.height) {
      surface.width = buffer.width; surface.height = buffer.height;
    }
    // One complete RGBA copy replaces the previous frame, including its alpha.
    surfaceContext.globalCompositeOperation = 'copy';
    surfaceContext.drawImage(buffer, 0, 0);
    frames++; lastPresentedAt = Date.now();
  }
  function startPump(index) {
    stopPump();
    if (!canvasMode) return;
    const video = pumpVideo = videos[index];
    let mediaTime = video.currentTime, progressedAt = Date.now(), resumedAt = 0;
    function schedule() {
      if (pumpVideo !== video || front !== index) return;
      pumpIsVideo = Boolean(video.requestVideoFrameCallback);
      pumpId = pumpIsVideo ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    }
    function tick() {
      if (pumpVideo !== video || front !== index) return;
      try { if (prepare(index)) present(index); } catch { /* Retain the last valid frame during decoder recovery. */ }
      schedule();
    }
    schedule();
    function health() {
      if (pumpVideo !== video || front !== index) return;
      const now = Date.now();
      if (document.hidden || pending || active?.generation !== generation) { progressedAt = now; lastPresentedAt = now; }
      else {
        if (video.ended && !video.loop) { finishAction(index); return; }
        if (video.currentTime !== mediaTime) { mediaTime = video.currentTime; progressedAt = now; }
        // Chromium can stop delivering frame callbacks after occlusion or a
        // decoder reset while currentTime still advances. Re-arm that pump.
        if (now-lastPresentedAt > 400 && video.readyState >= 2) {
          try { if (prepare(index)) present(index); } catch { /* Retry below. */ }
          if (pumpId !== undefined) {
            if (pumpIsVideo) video.cancelVideoFrameCallback?.(pumpId); else cancelAnimationFrame(pumpId);
            pumpId = undefined;
          }
          schedule();
        }
        if (video.paused && !video.ended && now-resumedAt > 1000) { resumedAt = now; Promise.resolve(video.play()).catch(() => {}); }
        if (now-progressedAt > 3000 || now-lastPresentedAt > 3000) {
          const stalled = active;
          if ((stalled.recovery || 0) < 1) {
            recoveries++;
            stage.dispatchEvent(new CustomEvent('playback-recovery', { detail: { id: stalled.id, reason: 'decoder-stalled' } }));
            void play(stalled.url, { ...stalled, recovery: 1, startTime: video.currentTime, forceReload: true });
          } else {
            fallbackVideo('视频解码停止',stalled.url);
          }
          return;
        }
      }
      healthTimer = setTimeout(health, 250);
    }
    healthTimer = setTimeout(health, 250);
  }
  function retire(video) {
    clearTimeout(retireTimers.get(video));
    retireTimers.set(video, setTimeout(() => { video.pause(); video.removeAttribute('src'); video.load(); retireTimers.delete(video); }, 220));
  }
  function portrait() {
    generation++; cancelLoad?.(); cancelLoad = null; active = null; front = -1; pending = false;
    stopPump(); surface?.classList.remove('is-visible');
    window.qiqiIdle?.resume('video');
    stage.classList.remove('playing');
    for (const video of videos) { video.classList.remove('is-front'); retire(video); }
  }
  function fallbackVideo(reason, failedUrl) {
    const owner=generation;
    stage.dispatchEvent(new CustomEvent('media-error',{detail:reason}));
    if(owner!==generation)return;
    if(defaultUrl&&defaultUrl!==failedUrl)void idle();else portrait();
  }
  function firstPresentedFrame(index) {
    const video = videos[index];
    return new Promise((resolve, reject) => {
      let timer, poll, frameId, rafId, done = false;
      const finish = error => {
        if (done) return;
        done = true; clearTimeout(timer); clearTimeout(poll);
        if (frameId !== undefined) video.cancelVideoFrameCallback?.(frameId);
        if (rafId !== undefined) cancelAnimationFrame(rafId);
        if (cancelLoad === cancel) cancelLoad = null;
        error ? reject(error) : resolve();
      };
      const cancel = () => { video.pause(); finish(new Error('superseded')); };
      function ready() {
        if (done) return;
        try { if (prepare(index)) { finish(); return; } } catch (error) { finish(error); return; }
        schedule();
      }
      function schedule() {
        if (video.requestVideoFrameCallback) {
          if (frameId === undefined) frameId = video.requestVideoFrameCallback(() => { frameId = undefined; ready(); });
        } else if (rafId === undefined) rafId = requestAnimationFrame(() => { rafId = undefined; ready(); });
      }
      cancelLoad = cancel;
      timer = setTimeout(() => finish(new Error('视频首帧显示超时')), 8000);
      schedule();
      // A valid decoded frame must not wait eight seconds solely because a
      // compositor callback was lost. Alpha validation still guards the swap.
      poll = setTimeout(function check() { ready(); if (!done) poll = setTimeout(check, 100); }, 100);
    });
  }
  async function play(url, { loop = false, id = 'action', onEnded, recovery = 0, startTime = 0, forceReload = false } = {}) {
    if (!url) { portrait(); return false; }
    const token = ++generation;
    cancelLoad?.();
    if (!forceReload && active?.url === url && active?.loop === loop && front >= 0 && !videos[front].ended && !videos[front].paused) {
      active = { url, loop, id, onEnded, recovery: active.recovery || recovery, generation: token }; pending = false;
      return true;
    }
    pending = true;
    const next = front === 0 ? 1 : 0, video = videos[next];
    clearTimeout(retireTimers.get(video)); retireTimers.delete(video);
    video.classList.remove('is-front'); video.pause();
    // A new decoder alone can reuse Chromium's failed resource entry. Keep the
    // logical URL stable, but make recovery perform an independent media read.
    video.src = forceReload ? `${url}${url.includes('?')?'&':'?'}reload=${token}` : url; video.loop = loop;
    try {
      await new Promise((resolve, reject) => {
        let timer, done = false;
        const finish = error => {
          if (done) return; done = true;
          clearTimeout(timer); video.removeEventListener('loadeddata', loaded); video.removeEventListener('error', failed);
          if (cancelLoad === cancel) cancelLoad = null;
          error ? reject(error) : resolve();
        };
        const loaded = () => finish(), failed = () => finish(new Error(`视频无法解码${video.error?.code ? ` (${video.error.code})` : ''}`));
        const cancel = () => finish(new Error('superseded'));
        cancelLoad = cancel;
        video.addEventListener('loadeddata', loaded); video.addEventListener('error', failed);
        timer = setTimeout(() => finish(new Error('视频加载超时')), 8000); video.load();
      });
      if (token !== generation) return false;
      if (Number.isFinite(startTime) && startTime > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(startTime, Math.max(0, video.duration-.1));
      await Promise.all([firstPresentedFrame(next), Promise.resolve().then(() => video.play())]);
      if (token !== generation) return false;
      const previous = front;
      present(next);
      front = next; active = { url, loop, id, onEnded, recovery, generation: token }; pending = false;
      video.classList.add('is-front'); surface?.classList.add('is-visible'); stage.classList.add('playing');
      window.qiqiIdle?.pause('video'); startPump(next);
      if (previous >= 0 && previous !== next) { videos[previous].pause(); videos[previous].classList.remove('is-front'); retire(videos[previous]); }
      return true;
    } catch (error) {
      if (token !== generation) return false;
      if(recovery<1){
        recoveries++;stage.dispatchEvent(new CustomEvent('playback-recovery',{detail:{id,reason:'load-failed'}}));
        return play(url,{loop,id,onEnded,recovery:1,startTime,forceReload:true});
      }
      if(front>=0&&active&&active.url!==url&&!videos[front].error&&!videos[front].ended&&videos[front].readyState>=2){
        active={...active,generation:token};pending=false;retire(video);startPump(front);
        stage.dispatchEvent(new CustomEvent('media-error',{detail:error.message}));
      }else fallbackVideo(error.message,url);
      return false;
    } finally {
      if (token === generation) pending = false;
    }
  }
  function idle() { return defaultUrl ? play(defaultUrl, { loop: true, id: 'idle' }) : portrait(); }
  function finishAction(index) {
    const video = videos[index];
    if (front !== index || video.loop || active?.generation !== generation) return;
    const ended = active; active = null; stopPump();
    if (ended?.onEnded) { ended.onEnded(); return; }
    stage.dispatchEvent(new CustomEvent('action-ended', { detail: { id: ended?.id } })); idle();
  }
  for (const [index, video] of videos.entries()) {
    video.addEventListener('ended', () => finishAction(index));
    video.addEventListener('error', () => {
      if (front !== index || active?.generation !== generation) return;
      const failed=active;
      if((failed.recovery||0)<1){recoveries++;stage.dispatchEvent(new CustomEvent('playback-recovery',{detail:{id:failed.id,reason:'decoder-error'}}));void play(failed.url,{...failed,recovery:1,forceReload:true,startTime:video.currentTime});}
      else fallbackVideo('视频播放中断',failed.url);
    });
  }
  window.qiqiPlayback = {
    play, idle, portrait,
    setDefault(url, { defer = false } = {}) { if (defaultUrl === (url || null)) return; defaultUrl = url || null; if (!defer && !pending && (!active || active.id === 'idle')) idle(); },
    get pending() { return pending; },
    get current() { return active; },
    get mode() { return canvasMode ? 'canvas' : 'video'; },
    get frames() { return frames; },
    get skippedFrames() { return skippedFrames; },
    get recoveries() { return recoveries; },
    get renderSize() { return { width: surface?.width || 0, height: surface?.height || 0 }; }
  };
})();
