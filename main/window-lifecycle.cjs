'use strict';
function isWindowAlive(win) {
  try { return Boolean(win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()); }
  catch { return false; }
}
function useWindow(win, action) {
  if (!isWindowAlive(win)) return false;
  try { action(win); return true; }
  catch (error) { if (!isWindowAlive(win) || /Object has been destroyed|Render frame was disposed|WebFrameMain.*(?:disposed|destroyed)/i.test(error?.message || '')) return false; throw error; }
}
const hideWindow = win => useWindow(win, current => current.hide());
const sendWindow = (win, channel, value) => useWindow(win, current => current.webContents.send(channel, value));
module.exports = { isWindowAlive, useWindow, hideWindow, sendWindow };
