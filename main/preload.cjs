'use strict';
const { contextBridge, ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', () => {
  if (!window.location.pathname.endsWith('/index.html')) return;
  ipcRenderer.send('pet:heartbeat');
  const timer = setInterval(() => ipcRenderer.send('pet:heartbeat'), 1000);
  window.addEventListener('unload', () => clearInterval(timer), { once: true });
}, { once: true });
function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('Expected a callback');
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
contextBridge.exposeInMainWorld('petAPI', Object.freeze({
  openJournal:()=>ipcRenderer.invoke('pet:open-journal'),
  getJournal:date=>ipcRenderer.invoke('pet:get-journal',date),
  saveJournalDay:input=>ipcRenderer.invoke('pet:save-journal-day',input),
  saveJournalDraft:input=>ipcRenderer.invoke('pet:save-journal-draft',input),
  saveJournalCard:input=>ipcRenderer.invoke('pet:save-journal-card',input),
  revealJournalCard:id=>ipcRenderer.invoke('pet:reveal-journal-card',id),
  gardenCommand:input=>ipcRenderer.invoke('pet:garden-command',input),
  onGardenPreview:callback=>subscribe('pet:garden-preview',callback),
  onJournalChanged:callback=>subscribe('pet:journal-changed',callback),
  getState: () => ipcRenderer.invoke('pet:get-state'),
  getRuntime: () => ipcRenderer.invoke('pet:get-runtime'),
  setExecution: patch => ipcRenderer.invoke('pet:set-execution',patch),
  respondApproval: input => ipcRenderer.invoke('pet:respond-approval',input),
  onOpenExecutionSettings: callback => subscribe('pet:open-execution-settings',callback),
  newConversation: () => ipcRenderer.invoke('pet:new-conversation'),
  getPomodoro: () => ipcRenderer.invoke('pet:get-pomodoro'),
  pomodoroCommand: input => ipcRenderer.invoke('pet:pomodoro-command', input),
  openPomodoro: () => ipcRenderer.invoke('pet:open-pomodoro'),
  hidePomodoro: () => ipcRenderer.invoke('pet:hide-pomodoro'),
  onPomodoro: callback => subscribe('pet:pomodoro', callback),
  onPomodoroPosition: callback => subscribe('pet:pomodoro-position', callback),
  getUsage: (force, animate) => ipcRenderer.invoke('pet:get-usage', force === true, animate === true),
  showUsage: () => ipcRenderer.invoke('pet:show-usage'),
  toggleUsage: () => ipcRenderer.invoke('pet:toggle-usage'),
  resizeUsage: height => ipcRenderer.invoke('pet:resize-usage', height),
  onUsage: callback => subscribe('pet:usage', callback),
  onOpenSettings: callback => subscribe('pet:open-settings', callback),
  updateSettings: patch => ipcRenderer.invoke('pet:update-settings', patch),
  chooseWorkspace: () => ipcRenderer.invoke('pet:choose-workspace'),
  importAction: id => ipcRenderer.invoke('pet:import-action', id),
  clearAction: id => ipcRenderer.invoke('pet:clear-action', id),
  playAction: id => ipcRenderer.invoke('pet:play-action', id),
  runTask: input => ipcRenderer.invoke('pet:run-task', input),
  handoffTask: input => ipcRenderer.invoke('pet:handoff-task', input),
  cancelTask: () => ipcRenderer.invoke('pet:cancel-task'),
  openCodex: () => ipcRenderer.invoke('pet:open-codex'),
  openPanel: () => ipcRenderer.invoke('pet:open-panel'),
  minimizePanel: () => ipcRenderer.invoke('pet:minimize-panel'),
  quit: () => ipcRenderer.invoke('pet:quit'),
  petMoved: delta => ipcRenderer.send('pet:move', delta),
  setPetHover: hovering => ipcRenderer.send('pet:hover', hovering),
  showMenu: () => ipcRenderer.send('pet:menu'),
  reportPlayback: detail => ipcRenderer.send('pet:diagnostic', detail),
  completeFocus: () => ipcRenderer.invoke('pet:complete-focus'),
  onState: callback => subscribe('pet:state', callback),
  onTaskEvent: callback => subscribe('pet:task-event', callback),
  onPlayAction: callback => subscribe('pet:play-action', callback)
}));
