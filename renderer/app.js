'use strict';
window.__qiqiErrors = [];
window.addEventListener('error', event => window.__qiqiErrors.push(event.message));
window.addEventListener('unhandledrejection', event => window.__qiqiErrors.push(String(event.reason?.message || event.reason)));
const $ = id => document.getElementById(id);
const api = window.petAPI;
const petEffects=window.qiqiEffects=window.createCompanionEffects(document.querySelector('.companion-charm'));
const idle = window.qiqiIdle;
let state;
let toastTimer;
let lastHover = false;
let playingAction = null;
let actionGeneration = 0;
let pomodoroState;
const autoIdle=window.qiqiAutoIdle=window.createIdleActions({
  getState:()=>state,
  isVisible:()=>!document.hidden,
  isBusy:()=>Boolean(gestures.held||dragReaction.phase!=='idle'||playingAction||window.qiqiPlayback.pending||window.qiqiPlayback.current&&window.qiqiPlayback.current.id!=='idle'),
  play:id=>playAction(id,{automatic:true}),
  stop:()=>stopVideo()
});
const companion = window.createPomodoroCompanion({
  getState: () => state,
  setDefault: (url, options) => window.qiqiPlayback.setDefault(url, options),
  play: id => { void playAction(id); },
  isBusy: () => state?.task?.status === 'running' || Boolean(window.qiqiDragReaction?.held)
});
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}
async function handle(method, ...args) {
  if (!api) { if (method === 'openPanel') location.href = './compact.html'; return; }
  try { return await api[method](...args); } catch (error) { const message=String(error.message||error).replace(/^Error invoking remote method '[^']+': (?:Error|TypeError): /,'');toast(/Object has been destroyed/i.test(message)?'小窗口正在恢复，请再试一次。':message); }
}
function renderState(nextState) {
  const taskWasRunning=state?.task?.status==='running';
  state = nextState;
  document.body.dataset.gardenOrnament=state.gardenAppearance?.ornament||'none';
  petEffects.set(state.gardenAppearance?.ornament||'none');
  pomodoroState = state.pomodoro || pomodoroState;
  autoIdle.sync();
  if (pomodoroState) companion.sync(pomodoroState); else window.qiqiPlayback.setDefault(state.idle?.media?.url);
  void window.qiqiMusic?.sync(state.settings);
  if (playingAction === 'working' && taskWasRunning && state.task?.status !== 'running') stopVideo();
}
function stopVideo() {
  if (window.qiqiDragReaction?.held) return;
  autoIdle.interrupt();
  window.qiqiDragReaction?.interrupt();
  actionGeneration++;
  playingAction = null;
  window.qiqiPlayback.idle();
}
const actionSlots = () => [...(state?.actions || []), ...(state?.pomodoroActions || []),...(state?.gardenActions||[])];
async function playAction(payload,{automatic=false}={}) {
  if (window.qiqiDragReaction?.held) return false;
  if(!automatic)autoIdle.interrupt();
  window.qiqiDragReaction?.interrupt();
  const id = typeof payload === 'string' ? payload : payload?.id;
  if (id === 'idle') { stopVideo(); return; }
  const media = actionSlots().find(slot => slot.id === id)?.media;
  if (!media?.url) { if (!playingAction) stopVideo(); return false; }
  playingAction = id;
  const generation = ++actionGeneration;
  const ok = await window.qiqiPlayback.play(media.url, { id, loop: id === 'idle' || id === 'working' && state?.task?.status === 'running' });
  if (!ok && generation === actionGeneration) playingAction = null;
  return ok;
}
function onHover(value) {
  if (value === lastHover || gestures.held) return;
  lastHover = value;
  api?.setPetHover(value);
}
const stage = $('pet-stage');
const dragReaction = window.qiqiDragReaction = window.createDragReaction({
  playback: window.qiqiPlayback,
  getMedia: () => state?.actions.find(slot => slot.id === 'drag')?.media,
  onPhase: reaction => { playingAction = reaction.phase === 'idle' ? null : 'drag'; },
  onError: () => {}
});
document.addEventListener('mousemove', event => {
  const bounds = stage.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  onHover(window.qiqiPlayback.current ? x > bounds.width * .12 && x < bounds.width * .88 && y > 0 && y < bounds.height : idle.hitTest(x / bounds.width, y / bounds.height));
});
document.addEventListener('mouseleave', () => onHover(false));
const gestures = window.qiqiGestures = window.createPetGestures({
  getDoubleClickMs: () => state?.interactions?.doubleClickMs,
  onDragStart() { autoIdle.interrupt();idle?.touch(); idle?.pause('drag'); stage.classList.add('dragging'); actionGeneration++; void dragReaction.start(); },
  onDragMove({ dx, dy }) { stage.style.setProperty('--drag-tilt', `${Math.max(-7, Math.min(7, dx * .5))}deg`); api?.petMoved({ dx, dy }); },
  onDragEnd() { stage.classList.remove('dragging'); idle?.resume('drag'); void dragReaction.release(); },
  onClickFeedback() { stage.classList.remove('happy'); void stage.offsetWidth; stage.classList.add('happy'); },
  onSingleClick() { handle('toggleUsage'); },
  onDoubleClick() { handle('openPanel'); }
});
const pointerData = event => ({ pointerId: event.pointerId, button: event.button, buttons: event.buttons, isPrimary: event.isPrimary, screenX: event.screenX, screenY: event.screenY });
stage.addEventListener('pointerdown', event => {
  if (!gestures.down(pointerData(event))) return;
  autoIdle.touch();
  api?.setPetHover(true); lastHover = true; stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointermove', event => gestures.move(pointerData(event)));
stage.addEventListener('pointerup', event => {
  gestures.up(pointerData(event));
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
});
stage.addEventListener('pointercancel', () => gestures.abort());
stage.addEventListener('lostpointercapture', () => { if (gestures.held) gestures.abort(); });
window.addEventListener('blur', () => gestures.abort());
document.addEventListener('visibilitychange', () => { if (document.hidden) gestures.abort();autoIdle.sync(); });
window.addEventListener('unload',()=>autoIdle.dispose(),{once:true});
stage.addEventListener('contextmenu', event => { event.preventDefault(); gestures.abort(); api?.showMenu(); });
stage.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); gestures.abort(); handle(event.ctrlKey || event.metaKey ? 'openPanel' : 'toggleUsage'); } });
stage.addEventListener('action-ended', event => { playingAction = null;autoIdle.ended(event.detail?.id); });
stage.addEventListener('playback-recovery', event => api?.reportPlayback?.({ event: 'playback-recovery', ...event.detail }));
stage.addEventListener('media-error', event => {
  const failedAction=playingAction;
  api?.reportPlayback?.({ event: 'media-error', id: playingAction, reason: event.detail });
  dragReaction.mediaError();
  if (!dragReaction.held) playingAction = null;
  autoIdle.failed(failedAction);
});
idle?.start();
if (api) { api.onState(renderState); api.onPlayAction(playAction); api.onPomodoro?.(value => { pomodoroState = value; if (state) {state.pomodoro=value;autoIdle.sync();companion.sync(value);} }); handle('getState').then(nextState => { if (nextState) renderState(nextState); }); }
