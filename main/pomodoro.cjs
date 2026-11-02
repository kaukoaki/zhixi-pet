'use strict';
const crypto = require('node:crypto');

// Deadlines live in the main process; renderer timers are only presentation.
function createPomodoro({ now = Date.now, saved, onChange = () => {}, onComplete = () => {} } = {}) {
  let state = { version: 1, status: 'idle', phase: 'focus', sessionId: null, durationMs: 25*60000, remainingMs: 25*60000, deadline: null };
  if (saved?.version === 1 && ['focus','break'].includes(saved.phase) && ['running','paused'].includes(saved.status) && Number.isFinite(saved.durationMs) && saved.durationMs >= 60000 && saved.durationMs <= 180*60000) {
    const left = saved.status === 'running' && Number.isFinite(saved.deadline) ? saved.deadline-now() : saved.remainingMs;
    if (Number.isFinite(left) && left > 0 && left <= saved.durationMs) state = { ...state, status: 'paused', phase: saved.phase, sessionId: String(saved.sessionId || crypto.randomUUID()), durationMs: saved.durationMs, remainingMs: left };
  }
  const snapshot = () => {
    const remainingMs = state.status === 'running' ? Math.max(0, state.deadline-now()) : state.remainingMs;
    return { ...state, remainingMs, elapsedMs: state.durationMs-remainingMs, progress: Math.min(1, Math.max(0, 1-remainingMs/state.durationMs)) };
  };
  const emit = (event, persist = true) => { const value = snapshot(); onChange(value, { event, persist }); return value; };
  function tick() {
    if (state.status !== 'running') return snapshot();
    if (state.deadline <= now()) {
      state = { ...state, status: 'completed', remainingMs: 0, deadline: null };
      const value = emit('completed'); onComplete(value); return value;
    }
    return emit('tick', false);
  }
  function command(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('番茄钟操作无效');
    tick();
    const type = input.type;
    if (type === 'start' || type === 'break') {
      if (['running','paused'].includes(state.status)) throw new Error('请先结束当前计时');
      const minutes = input.minutes ?? (type === 'start' ? 25 : 5);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw new Error('时长需要是 1–180 分钟的整数');
      const durationMs = minutes*60000;
      state = { version: 1, status: 'running', phase: type === 'start' ? 'focus' : 'break', sessionId: crypto.randomUUID(), durationMs, remainingMs: durationMs, deadline: now()+durationMs };
      return emit('started');
    }
    if (type === 'pause' && state.status === 'running') {
      state = { ...state, remainingMs: snapshot().remainingMs, deadline: null, status: 'paused' }; return emit('paused');
    }
    if (type === 'resume' && state.status === 'paused') {
      state = { ...state, status: 'running', deadline: now()+state.remainingMs }; return emit('resumed');
    }
    if (type === 'stop') {
      state = { ...state, status: 'idle', phase: 'focus', sessionId: null, remainingMs: state.durationMs, deadline: null }; return emit('stopped');
    }
    throw new Error('当前状态不能执行这个操作');
  }
  return { snapshot, command, tick, shutdown() { if (state.status === 'running') command({ type: 'pause' }); } };
}
module.exports = { createPomodoro };
