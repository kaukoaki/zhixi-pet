'use strict';
(function (root) {
  function createPetGestures(options = {}) {
    const now = options.now || Date.now;
    const later = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;
    const threshold = options.threshold ?? 7;
    let pointer = null, pending = null, timer = null;
    const notify = (name, ...args) => options[name]?.(...args);
    function clearPending() { if (timer !== null) cancel(timer); timer = null; pending = null; }
    function down(event) {
      if (event.button !== 0 || event.isPrimary === false || pointer) return false;
      if (timer !== null) { cancel(timer); timer = null; }
      pointer = { id: event.pointerId, startX: event.screenX, startY: event.screenY, x: event.screenX, y: event.screenY, started: now(), dragging: false };
      return true;
    }
    function move(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (event.buttons === 0) { abort(); return; }
      const p = pointer;
      if (!p.dragging && Math.hypot(event.screenX - p.startX, event.screenY - p.startY) < threshold) return;
      if (!p.dragging) { p.dragging = true; clearPending(); notify('onDragStart'); }
      const delta = { dx: event.screenX - p.x, dy: event.screenY - p.y };
      p.x = event.screenX; p.y = event.screenY;
      notify('onDragMove', delta);
    }
    function up(event) {
      if (!pointer || pointer.id !== event.pointerId) return false;
      // Some Windows drivers coalesce the final move into pointerup.
      move({ ...event, buttons: 1 });
      const p = pointer; pointer = null;
      if (p.dragging) { notify('onDragEnd'); return true; }
      if (now() - p.started > 650) { clearPending(); return true; }
      const delay = Math.max(100, Math.min(1000, options.getDoubleClickMs?.() || 500));
      if (pending && now() - pending.at <= delay && Math.hypot(p.startX - pending.x, p.startY - pending.y) <= threshold) {
        clearPending(); notify('onDoubleClick');
      } else {
        if (pending) notify('onSingleClick');
        pending = { at: now(), x: p.startX, y: p.startY };
        notify('onClickFeedback');
        timer = later(() => { timer = null; pending = null; notify('onSingleClick'); }, delay);
      }
      return true;
    }
    function abort() {
      clearPending();
      const p = pointer; pointer = null;
      if (p?.dragging) notify('onDragEnd');
    }
    return { down, move, up, abort, get held() { return Boolean(pointer); }, get dragging() { return Boolean(pointer?.dragging); } };
  }
  if (typeof module === 'object' && module.exports) module.exports = createPetGestures;
  else root.createPetGestures = createPetGestures;
})(globalThis);
