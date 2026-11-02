'use strict';
(function expose(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.createPomodoroCompanion = factory();
})(typeof window === 'undefined' ? globalThis : window, () => {
  return function createPomodoroCompanion({ getState, setDefault, play, isBusy, random = Math.random }) {
    let previous, nextMicro = Infinity, lastMicro = null;
    const focusActive = timer => timer?.phase === 'focus' && ['running','paused'].includes(timer.status);
    const nextDelay = () => 150000+Math.floor(random()*90000);
    function sync(timer) {
      if (!timer) return;
      const state = getState(), clips = state.pomodoroActions || [];
      const media = id => [...clips, ...(state.actions || [])].find(a => a.id === id)?.media?.url;
      const busy = Boolean(isBusy()), same = previous?.sessionId === timer.sessionId;
      const entering = Boolean(previous && !same && focusActive(timer));
      const completing = Boolean(previous && same && timer.phase === 'focus' && timer.status === 'completed' && previous.status !== 'completed');
      const stopping = Boolean(previous && focusActive(previous) && timer.status === 'idle');
      const idle = !state.task || state.task.status !== 'running';
      const url = idle && focusActive(timer) ? media('pomodoro-study') || media('working') || state.idle?.media?.url : state.idle?.media?.url;
      const transition = entering ? (media('pomodoro-start') ? 'pomodoro-start' : media('focus') ? 'focus' : null) : completing ? (media('pomodoro-finish') ? 'pomodoro-finish' : media('success') ? 'success' : null) : null;
      setDefault(url, { defer: !busy && Boolean(transition) });
      if (transition && !busy) play(transition);
      else if (stopping && !busy) play('idle');
      if (!same) { nextMicro = timer.elapsedMs+nextDelay(); lastMicro = null; }
      if (focusActive(timer) && timer.status === 'running' && timer.elapsedMs >= nextMicro) {
        nextMicro = timer.elapsedMs+(busy ? 30000 : nextDelay());
        if (!busy) {
          const available = ['pomodoro-remind','pomodoro-doze','pomodoro-peek'].filter(id => media(id));
          const candidates = available.length > 1 ? available.filter(id => id !== lastMicro) : available;
          const id = candidates[Math.floor(random()*candidates.length)];
          if (id) { lastMicro = id; play(id); }
        }
      }
      previous = { ...timer };
    }
    return { sync };
  };
});
