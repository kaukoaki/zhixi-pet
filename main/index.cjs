'use strict';
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, dialog, protocol, net, Notification, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { PetStore } = require('./store.cjs');
const { seedBundledMedia, upgradeBundledMedia } = require('./bundled-media.cjs');
const { dispatchLaunch } = require('./launch-options.cjs');
const { isWindowAlive, useWindow, hideWindow, sendWindow } = require('./window-lifecycle.cjs');
const { mediaResponse } = require('./media-response.cjs');
const { createRendererWatchdog } = require('./renderer-watchdog.cjs');
const { resolveCodexEnvironment } = require('./codex-environment.cjs');
const { composerLink, threadLink } = require('./codex-links.cjs');
const { readRuntime } = require('./codex-runtime.cjs');
const { ConversationStore, workspaceKey } = require('./conversation-store.cjs');
const {validateExecutionOptions,resolveExecutionRuntime}=require('./execution-options.cjs');
const { buildActionMenu } = require('./action-menu.cjs');
const { locateCodex, openCodex } = require('./codex-bridge.cjs');
const {TaskRunner}=require('./task-runner.cjs');
const { UsageService, doubleClickTime } = require('./codex-usage.cjs');
const { buildUsageMenu } = require('./usage-menu.cjs');
const { createWalletReactions, WALLET_ACTION_IDS } = require('./wallet-reactions.cjs');
const { createRuntimeLog } = require('./runtime-log.cjs');
const { createPomodoro } = require('./pomodoro.cjs');
const { pomodoroBounds, buildPomodoroMenu } = require('./pomodoro-window.cjs');
const {JournalStore,decodeCardImage}=require('./journal.cjs');
const {GardenStore}=require('./garden.cjs');
const {loadGardenLibrary,gardenFeedback}=require('./garden-scenes.cjs');
const {createJournalHeartbeat}=require('./journal-heartbeat.cjs');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'renderer', 'index.html');
const COMPACT_ENTRY = path.join(ROOT, 'renderer', 'compact.html');
const USAGE_ENTRY = path.join(ROOT, 'renderer', 'usage.html');
const POMODORO_ENTRY = path.join(ROOT, 'renderer', 'pomodoro.html');
const JOURNAL_ENTRY=path.join(ROOT,'renderer','journal.html');
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', path.join(ROOT, '.smoke-data'));
else app.setPath('userData', path.join(app.getPath('appData'), 'QiqiCodexPet'));
app.setName('QiqiCodexPet');
const runtimeLog = createRuntimeLog(app.getPath('userData'));
process.on('uncaughtExceptionMonitor', error => runtimeLog('main-exception', { name: error.name, message: String(error.message).slice(0, 400), stack: String(error.stack || '').split('\n').slice(0,7).join('\n').replaceAll(ROOT,'<app>').slice(0,1800) }));
app.on('child-process-gone', (_event, detail) => runtimeLog('child-process-gone', { type: detail.type, reason: detail.reason, exitCode: detail.exitCode }));
protocol.registerSchemesAsPrivileged([{ scheme: 'pet-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
let petWindow, panelWindow, usageWindow, pomodoroWindow, pomodoro, pomodoroTick, pomodoroWanted = false, tray, store, runner, usageService, walletReactions, codexPath, activeTask = null, quitting = false, moveTimer;
let doubleClickMs = 500;
let petWatchdog;
let codexChildEnv = process.env;
let usageWanted = false;
const externalLinks = [];
const openCodexLink = url => smoke ? Promise.resolve(externalLinks.push(url)) : shell.openExternal(url);
let pomodoroTestOffset = 0;
let taskEvents = [];
let conversations;
let journal,journalWindow,lastJournalPush=0,garden,gardenLibrary,journalHeartbeat,lastStatsRetry=0,lastJournalSignature='',quitPreparing=false,quitPrepared=false;
const runtimeValues = new Map(), runtimeReads = new Map();
const mediaTestFailures = new Map();
const windows = () => [petWindow, panelWindow, usageWindow, pomodoroWindow,journalWindow].filter(isWindowAlive);
const selectedRuntime=(cwd=store.state.settings.workspace)=>resolveExecutionRuntime(runtimeValues.get(workspaceKey(cwd))||{status:'loading'},store.executionOptions(cwd),false);
const gardenLibrarySnapshot=()=>{const data=gardenLibrary?.snapshot()||{clips:{},available:[]};for(const slot of store.snapshot().gardenActions||[])if(slot.media){data.clips[slot.id]={...(data.clips[slot.id]||{}),id:slot.id,url:slot.media.url,seconds:60};if(!data.available.includes(slot.id))data.available.push(slot.id);}return data;};
const gardenSnapshot=()=>({...garden.snapshot(),sceneLibrary:gardenLibrarySnapshot()});
const publicState = () => ({ ...store.snapshot(),gardenAvailable:gardenLibrary?.snapshot().available||[],gardenAppearance:garden?.appearance(), execution:store.executionOptions(),pomodoro: pomodoro?.snapshot(), task: activeTask, taskEvents, conversation: conversations?.current(store.state.settings.workspace), codex: { available: Boolean(codexPath), path: codexPath || null, runtime: selectedRuntime() }, interactions: { doubleClickMs }, warning: store.loadWarning || store.statsWarning || conversations?.warning || null });
const journalSnapshot=date=>{journal.syncGarden(garden.memories());const data=journal.snapshot(date);return{...data,warning:data.warning||store.statsWarning||null,garden:gardenSnapshot()};};
function broadcast() { const state=publicState();for (const win of windows()) sendWindow(win,'pet:state',state); }
function refreshRuntime(cwd=store.state.settings.workspace) {
  const key=workspaceKey(cwd);
  if(runtimeReads.has(key))return runtimeReads.get(key);
  const request=(smoke?Promise.resolve({status:'ready',cwd,model:'fixture-model',effort:'medium',platform:'Windows',shell:null,sandbox:'workspace-write',approvalPolicy:'on-request',catalogStatus:'ready',requirements:null,models:[{id:'fixture-model',label:'Fixture model',defaultEffort:'medium',efforts:[{value:'low',description:''},{value:'medium',description:''}]},{id:'fixture-alternate',label:'Fixture alternate',defaultEffort:'low',efforts:[{value:'low',description:''}]}]}):readRuntime({cwd,codexPath,env:codexChildEnv}))
    .catch(()=>({status:'error',cwd,model:null,effort:null,note:'模型配置暂未确认'}))
    .then(value=>{runtimeValues.set(key,value);broadcast();return value;})
    .finally(()=>runtimeReads.delete(key));
  runtimeReads.set(key,request);return request;
}
function playAction(id) {
  store.slot(id);
  if(id.startsWith('garden-')){const win=createJournalWindow(),send=()=>sendWindow(win,'pet:garden-preview',{id});if(isWindowAlive(win)&&win.webContents.isLoadingMainFrame())win.webContents.once('did-finish-load',send);else send();return;}
  for (const win of windows()) sendWindow(win,'pet:play-action',{ id });
}
function trustedSender(event) {
  try { return !event.sender.isDestroyed() && windows().some(win => win.webContents === event.sender) && event.senderFrame === event.sender.mainFrame; }
  catch { return false; }
}
function assertSender(event) {
  if (!trustedSender(event)) throw new Error('不允许的调用来源');
}
function handler(channel, action) { ipcMain.handle(channel, async (event, ...args) => { assertSender(event); return action(event, ...args); }); }
function safeWindow(win) {
  if (smoke) win.webContents.on('console-message', details => { if (details.level === 'error') console.error('Renderer:', details.message); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (![ENTRY, COMPACT_ENTRY, USAGE_ENTRY, POMODORO_ENTRY,JOURNAL_ENTRY].some(file => url.split('?')[0] === pathToFileURL(file).href)) event.preventDefault(); });
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}
function watchAuxiliaryWindow(win, kind) {
  let timer;
  win.once('closed', () => {
    clearTimeout(timer);
    if(kind==='panel'&&panelWindow===win)panelWindow=null;
    if(kind==='usage'&&usageWindow===win){usageWindow=null;usageWanted=false;}
    if(kind==='pomodoro'&&pomodoroWindow===win)pomodoroWindow=null;
    if(kind==='journal'&&journalWindow===win)journalWindow=null;
  });
  win.webContents.on('render-process-gone', (_event, detail) => {
    runtimeLog(`${kind}-renderer-gone`,{reason:detail.reason});
    if(!quitting)timer=setTimeout(()=>useWindow(win,current=>current.reload()),500);
  });
}
function trayImage() {
  const size = 32, rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, radius = Math.hypot(x - 15.5, y - 15.5);
    if (radius > 15) continue;
    const bracket = ((x >= 8 && x <= 10) || (x >= 21 && x <= 23)) && y >= 9 && y <= 23 || y >= 9 && y <= 11 && (x >= 8 && x <= 13 || x >= 18 && x <= 23) || y >= 21 && y <= 23 && (x >= 8 && x <= 13 || x >= 18 && x <= 23);
    rgba[i] = bracket ? 39 : 171; rgba[i + 1] = bracket ? 54 : 237; rgba[i + 2] = bracket ? 52 : 215; rgba[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(rgba, { width: size, height: size, scaleFactor: 1 });
}
function petSize() {
  const scale = store.state.settings.scale;
  return { width: Math.round(160 * scale), height: Math.round(210 * scale) };
}
function restoreBounds() {
  const { width, height } = petSize();
  const saved = store.state.position;
  const display = saved ? screen.getDisplayNearestPoint(saved) : screen.getPrimaryDisplay();
  const area = display.workArea;
  return { width, height, x: Math.round(Math.max(area.x, Math.min(saved?.x ?? area.x + area.width - width - 30, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(saved?.y ?? area.y + area.height - height - 24, area.y + area.height - height))) };
}
function createPet() {
  petWindow = new BrowserWindow({ ...restoreBounds(), title: '知栖 · Codex 桌宠', frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, hasShadow: false, skipTaskbar: true, alwaysOnTop: store.state.settings.alwaysOnTop, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', zoomFactor: store.state.settings.scale } });
  safeWindow(petWindow);
  if(smoke)petWindow.webContents.setAudioMuted(true);
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  petWindow.loadFile(ENTRY);
  petWindow.webContents.on('did-finish-load', () => petWindow.webContents.setZoomFactor(store.state.settings.scale));
  petWindow.once('ready-to-show', () => petWindow.showInactive());
  petWindow.on('move', positionPomodoro); petWindow.on('resize', positionPomodoro);
  petWindow.on('hide', () => hideWindow(pomodoroWindow));
  petWindow.on('show', () => { if (pomodoroWanted) useWindow(pomodoroWindow,win=>win.showInactive()); });
  petWindow.on('close', event => { if (!quitting) { event.preventDefault(); petWindow.hide(); } });
  let recoveryTimer, slowTimer, lastFailure = 0, failures = 0;
  const reloadPet = reason => {
    if (quitting || petWindow.isDestroyed() || recoveryTimer) return;
    failures = Date.now()-lastFailure < 60000 ? failures+1 : 1; lastFailure = Date.now();
    const delay = Math.min(30000, 500 * 2 ** Math.min(failures-1, 6));
    runtimeLog('pet-reload-scheduled', { reason, delay });
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      if (quitting || petWindow.isDestroyed()) return;
      if (reason === 'heartbeat-timeout' && !petWatchdog.isStale()) return;
      if (reason === 'unresponsive' || reason === 'heartbeat-timeout') { petWindow.webContents.forcefullyCrashRenderer(); return; }
      petWindow.reload(); petWindow.showInactive();
    }, delay);
  };
  petWindow.webContents.on('render-process-gone', (_event, detail) => {
    runtimeLog('pet-renderer-gone', { reason: detail.reason, exitCode: detail.exitCode }); reloadPet('renderer-gone');
  });
  petWindow.on('unresponsive', () => {
    runtimeLog('pet-unresponsive'); clearTimeout(slowTimer);
    slowTimer = setTimeout(() => reloadPet('unresponsive'), 5000);
  });
  petWindow.on('responsive', () => { clearTimeout(slowTimer); runtimeLog('pet-responsive'); });
  petWatchdog = createRendererWatchdog({ active: () => !quitting && isWindowAlive(petWindow) && petWindow.isVisible(), recover: () => reloadPet('heartbeat-timeout') });
  const heartbeatTimer = setInterval(() => petWatchdog.tick(), 1000);
  petWindow.webContents.on('did-finish-load', () => petWatchdog.beat());
  petWindow.once('closed', () => { clearInterval(heartbeatTimer); clearTimeout(slowTimer); clearTimeout(recoveryTimer); });
}
function createPanel() {
  hideUsage();
  if (useWindow(panelWindow,win=>{win.show();win.focus();})) return panelWindow;
  const area = screen.getDisplayMatching(petWindow.getBounds()).workArea;
  const petBounds = petWindow.getBounds();
  const popupWidth = 352, popupHeight = 432;
  panelWindow = new BrowserWindow({ width: popupWidth, height: popupHeight, x: Math.round(Math.max(area.x + 8, Math.min(petBounds.x - popupWidth + petBounds.width, area.x + area.width - popupWidth - 8))), y: Math.round(Math.max(area.y + 8, Math.min(petBounds.y - popupHeight - 8, area.y + area.height - popupHeight - 8))), resizable: false, title: '知栖 · 小任务', frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'qiqi-panel', zoomFactor: 1 } });
  const win=panelWindow;
  safeWindow(win);watchAuxiliaryWindow(win,'panel');
  void win.loadFile(COMPACT_ENTRY).catch(error=>{if(isWindowAlive(win)&&error.code!=='ERR_ABORTED')runtimeLog('panel-load-failed',{reason:String(error.message).slice(0,200)});});
  win.once('ready-to-show', () => useWindow(win,current=>current.show()));
  win.on('close', event => { if (!quitting) { event.preventDefault(); hideWindow(win); } });
  return win;
}
async function refreshUsage(force = false) {
  const usage = await usageService.refresh(force);
  for (const win of windows()) sendWindow(win,'pet:usage',usage);
  return usage;
}
function usageBounds(height = 282) {
  const pet = petWindow.getBounds(), area = screen.getDisplayMatching(pet).workArea;
  const width = 288;
  return { width, height, x: Math.round(Math.max(area.x + 6, Math.min(pet.x + pet.width / 2 - width / 2, area.x + area.width - width - 6))), y: Math.round(Math.max(area.y + 6, Math.min(pet.y - height + 30, area.y + area.height - height - 6))) };
}
function createUsage(force = false) {
  usageWanted = true;
  if (!isWindowAlive(usageWindow)) {
    usageWindow = new BrowserWindow({ ...usageBounds(), title: '知栖 · Codex 余量', frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, hasShadow: false, alwaysOnTop: store.state.settings.alwaysOnTop, skipTaskbar: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, partition: 'zhixi-usage', zoomFactor: 1 } });
    const win=usageWindow;
    safeWindow(win);watchAuxiliaryWindow(win,'usage');
    void win.loadFile(USAGE_ENTRY).catch(error=>{if(isWindowAlive(win)&&error.code!=='ERR_ABORTED')runtimeLog('usage-load-failed',{reason:String(error.message).slice(0,200)});});
    win.once('ready-to-show', () => { if(usageWanted&&usageWindow===win)useWindow(win,current=>current.show()); });
    win.on('close', event => { if (!quitting) { event.preventDefault(); hideUsage(); } });
    win.on('blur', () => {
      if(smoke||quitting||usageWindow!==win||!isWindowAlive(petWindow))return;
      const point=screen.getCursorScreenPoint(),pet=petWindow.getBounds();
      // Clicking the pet must reach its toggle before an automatic blur hide changes the state.
      if(point.x>=pet.x&&point.x<pet.x+pet.width&&point.y>=pet.y&&point.y<pet.y+pet.height)return;
      hideUsage();
    });
    win.on('hide', () => { if(usageWindow===win)usageWanted=false;walletReactions?.cancel(); });
  } else { usageWindow.setBounds(usageBounds()); usageWindow.show(); usageWindow.focus(); }
  void walletReactions.query(force).catch(() => {});
}
function hideUsage() {
  usageWanted=false;
  hideWindow(usageWindow);
  walletReactions?.cancel();
}
function toggleUsage() {
  if(usageWanted||isWindowAlive(usageWindow)&&usageWindow.isVisible()){hideUsage();return false;}
  createUsage();return true;
}
function applySettings(patch) {
  if(patch.workspace&&activeTask?.status==='running')throw new Error('任务执行中，请先停止任务再更换工作目录。');
  store.updateSettings(patch);
  if(patch.workspace){activeTask=null;taskEvents=[];void refreshRuntime();}
  petWindow.setAlwaysOnTop(store.state.settings.alwaysOnTop);
  useWindow(usageWindow,win=>win.setAlwaysOnTop(store.state.settings.alwaysOnTop));
  useWindow(pomodoroWindow,win=>win.setAlwaysOnTop(store.state.settings.alwaysOnTop));
  petWindow.webContents.setZoomFactor(store.state.settings.scale);
  petWindow.setBounds(restoreBounds());
  broadcast(); return publicState();
}
function positionPomodoro() {
  if (!isWindowAlive(pomodoroWindow) || !isWindowAlive(petWindow)) return;
  const pet = petWindow.getBounds(), area = screen.getDisplayMatching(pet).workArea;
  const active = ['running','paused'].includes(pomodoro.snapshot().status);
  const { bounds, side } = pomodoroBounds(pet, area, active ? 182 : 214);
  pomodoroWindow.setBounds(bounds);
  pomodoroWindow.webContents.send('pet:pomodoro-position', { side });
}
function createPomodoroWindow() {
  pomodoroWanted = true;
  if (isWindowAlive(pomodoroWindow)) { positionPomodoro(); pomodoroWindow.show(); return pomodoroWindow; }
  const pet = petWindow.getBounds(), area = screen.getDisplayMatching(pet).workArea;
  const { bounds } = pomodoroBounds(pet, area);
  pomodoroWindow = new BrowserWindow({ ...bounds, title: '知栖 · 番茄钟', frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, skipTaskbar: true, alwaysOnTop: store.state.settings.alwaysOnTop, resizable: false, show: false,
    webPreferences: { preload: path.join(__dirname,'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, partition: 'zhixi-pomodoro', zoomFactor: 1 } });
  const win=pomodoroWindow;
  safeWindow(win);watchAuxiliaryWindow(win,'pomodoro');void win.loadFile(POMODORO_ENTRY).catch(error=>{if(isWindowAlive(win)&&error.code!=='ERR_ABORTED')runtimeLog('pomodoro-load-failed',{reason:String(error.message).slice(0,200)});});
  win.once('ready-to-show', () => { if(pomodoroWindow===win)positionPomodoro();if(pomodoroWanted)useWindow(win,current=>current.showInactive()); });
  win.on('close', event => { if (!quitting) { event.preventDefault(); pomodoroWanted = false; hideWindow(win); } });
  return win;
}
function pomodoroCommand(input) {
  const result = pomodoro.command(input);
  if (['start','break'].includes(input.type)) createPomodoroWindow();
  return result;
}
function pushJournal(force=false){
  if(!isWindowAlive(journalWindow)||!journalWindow.isVisible()||!force&&Date.now()-lastJournalPush<1000)return;
  lastJournalPush=Date.now();
  const summary=journal.summary(),minute=Math.floor(summary.focusMs/60000),signature=JSON.stringify([summary.today,summary.focusMs>0,minute,summary.sessions,summary.streak,summary.companionDays,journal.warning,store.statsWarning]);
  if(!force&&signature===lastJournalSignature)return;lastJournalSignature=signature;
  sendWindow(journalWindow,'pet:journal-changed',{today:summary.today});
}
function createJournalWindow(){
  if(quitting)return null;
  if(useWindow(journalWindow,win=>{win.show();win.focus();pushJournal(true);}))return journalWindow;
  const area=screen.getDisplayMatching(petWindow.getBounds()).workArea,pet=petWindow.getBounds();
  const width=Math.min(432,area.width-20),height=Math.min(646,area.height-20);
  journalWindow=new BrowserWindow({width,height,x:Math.round(Math.max(area.x+10,Math.min(pet.x-width+pet.width,area.x+area.width-width-10))),y:Math.round(Math.max(area.y+10,Math.min(pet.y-80,area.y+area.height-height-10))),resizable:false,title:'知栖 · 陪伴手账',frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'zhixi-journal',zoomFactor:1}});
  const win=journalWindow;safeWindow(win);watchAuxiliaryWindow(win,'journal');
  void win.loadFile(JOURNAL_ENTRY).catch(error=>{if(isWindowAlive(win)&&error.code!=='ERR_ABORTED')runtimeLog('journal-load-failed',{reason:String(error.message).slice(0,200)});});
  win.once('ready-to-show',()=>useWindow(win,current=>current.show()));
  win.on('close',event=>{if(!quitting){event.preventDefault();hideWindow(win);}});return win;
}
function assertJournalSender(event){if(!isWindowAlive(journalWindow)||event.sender!==journalWindow.webContents)throw Error('请在陪伴手账窗口操作。');}
function openPreferences() {
  const win=createPanel();
  const reveal = () => sendWindow(win,'pet:open-settings');
  if (isWindowAlive(win)&&win.webContents.isLoadingMainFrame()) win.webContents.once('did-finish-load', reveal); else reveal();
}
function openExecutionSettings(){
  const win=createPanel(),reveal=()=>sendWindow(win,'pet:open-execution-settings');
  if(isWindowAlive(win)&&win.webContents.isLoadingMainFrame())win.webContents.once('did-finish-load',reveal);else reveal();
}
function menu() {
  const actions = buildActionMenu(store.state, playAction,{gardenAvailable:id=>gardenLibrary?.snapshot().available.includes(id),setRandomIdle:value=>{store.updateSettings({randomIdle:value});broadcast();}});
  return Menu.buildFromTemplate([
    { id: 'pet-menu-heading', label: '知栖 · Codex 小精灵', enabled: false }, { type: 'separator' },
    buildUsageMenu(usageService.snapshot(), () => createUsage(), () => createUsage(true)),
    { id: 'pet-task', label: '交给知栖一个小任务', click: createPanel },
    buildPomodoroMenu(pomodoro.snapshot(), { open: createPomodoroWindow, command: input => { try { pomodoroCommand(input); } catch { createPomodoroWindow(); } } }),
    {id:'pet-journal',label:'知栖陪伴手账',click:createJournalWindow},
    { id: 'pet-open-codex', label: '打开 Codex', click: () => openCodex(store.state.settings.workspace).catch(error => dialog.showErrorBox('无法打开 Codex', error.message)) },
    { id: 'pet-actions', label: '动作', submenu: actions },
    { id: 'pet-execution-settings', label: '模型与运行设置', click: openExecutionSettings },
    { id: 'pet-preferences', label: '偏好与动作管理', click: openPreferences },
    { id: 'pet-size', label: '人物大小', submenu: [
      { label: '小巧 · 120%', scale: 1.2 }, { label: '标准 · 145%', scale: 1.45 },
      { label: '大一点 · 165%', scale: 1.65 }, { label: '更大 · 185%', scale: 1.85 }
    ].map(item => ({ id: `pet-size-${Math.round(item.scale * 100)}`, label: item.label, type: 'radio', checked: Math.abs(store.state.settings.scale - item.scale) < .005, click: () => applySettings({ scale: item.scale }) })) },
    { id: 'pet-quiet', label: '安静陪伴', type: 'checkbox', checked: store.state.settings.quietMode, click: item => { store.updateSettings({ quietMode: item.checked }); broadcast(); } },
    { id: 'pet-top', label: '窗口置顶', type: 'checkbox', checked: store.state.settings.alwaysOnTop, click: item => applySettings({ alwaysOnTop: item.checked }) },
    { id: 'pet-visibility', label: petWindow.isVisible() ? '暂时收起知栖' : '叫回知栖', click: () => petWindow.isVisible() ? petWindow.hide() : petWindow.showInactive() },
    { type: 'separator' }, { id: 'pet-quit', label: '退出知栖', click: () => app.quit() }
  ]);
}
function installIPC() {
  handler('pet:open-journal',()=>{if(quitting)return{ok:false};createJournalWindow();return{ok:true};});
  handler('pet:get-journal',(event,date)=>{assertJournalSender(event);journal.visit();return journalSnapshot(date);});
  handler('pet:save-journal-day',(event,input)=>{assertJournalSender(event);journal.saveDay(input);pushJournal(true);return journalSnapshot(input.date);});
  handler('pet:save-journal-draft',(event,input)=>{assertJournalSender(event);return journal.saveDraft(input);});
  handler('pet:garden-command',(event,input)=>{
    assertJournalSender(event);const before=garden.snapshot(),result=garden.command(input),after=garden.snapshot(),feedback=gardenFeedback(before,after,input);journal.syncGarden(garden.memories());pushJournal(true);broadcast();
    if(feedback.some(item=>item.kind==='harvest')&&activeTask?.status!=='running'&&!(pomodoro.snapshot().phase==='focus'&&['running','paused'].includes(pomodoro.snapshot().status))){const reaction=['celebrate','success'].find(id=>store.slot(id).media);if(reaction)playAction(reaction);}
    return{...result,feedback,garden:gardenSnapshot()};
  });
  handler('pet:reveal-journal-card',(event,id)=>{assertJournalSender(event);journal.syncGarden(garden.memories());const card=journal.revealCard(id);pushJournal(true);return card;});
  handler('pet:save-journal-card',async(event,input)=>{
    assertJournalSender(event);const card=journal.cardDetail(input?.cardId);
    const bytes=decodeCardImage(input.png),result=await dialog.showSaveDialog(journalWindow,{title:'保存知栖纪念卡',defaultPath:`知栖-${card.title}-${card.earnedOn}.png`,filters:[{name:'PNG 纪念卡',extensions:['png']}]});
    if(result.canceled||!result.filePath)return{saved:false};await fs.promises.writeFile(result.filePath,bytes);return{saved:true};
  });
  handler('pet:get-state', () => publicState());
  handler('pet:get-runtime', () => refreshRuntime());
  handler('pet:set-execution',async(_event,patch)=>{
    if(activeTask?.status==='running')throw new Error('任务执行中，设置会在停止后才能修改。');
    const cwd=store.state.settings.workspace,choices=validateExecutionOptions(store.executionOptions(cwd),patch);
    const runtime=await refreshRuntime(cwd);
    if(activeTask?.status==='running'||cwd!==store.state.settings.workspace)throw new Error('任务或工作目录已变化，请重新打开设置。');
    resolveExecutionRuntime(runtime,choices,true);store.updateExecutionOptions(cwd,choices);broadcast();return publicState();
  });
  handler('pet:new-conversation', () => {
    if(activeTask?.status==='running')throw new Error('请先完成或停止当前任务。');
    conversations.startNew(store.state.settings.workspace);activeTask=null;taskEvents=[];broadcast();return publicState();
  });
  handler('pet:respond-approval',(_event,input)=>{
    if(activeTask?.status!=='running'||typeof input?.approvalId!=='string')throw new Error('没有可处理的审批请求。');
    runner.respondApproval(activeTask.id,input.approvalId,input.decision);return{ok:true};
  });
  handler('pet:get-pomodoro', () => ({ ...pomodoro.snapshot(), side: pomodoroBounds(petWindow.getBounds(), screen.getDisplayMatching(petWindow.getBounds()).workArea).side }));
  handler('pet:pomodoro-command', (_event, input) => pomodoroCommand(input));
  handler('pet:open-pomodoro', () => { createPomodoroWindow(); return pomodoro.snapshot(); });
  handler('pet:hide-pomodoro', () => { pomodoroWanted = false; hideWindow(pomodoroWindow); return { ok: true }; });
  handler('pet:get-usage', (_event, force, animate) => animate === true ? walletReactions.query(force === true) : refreshUsage(force === true));
  handler('pet:show-usage', () => { createUsage(); return { ok: true }; });
  handler('pet:toggle-usage', () => ({ visible: toggleUsage() }));
  handler('pet:resize-usage', (event, height) => { if(!isWindowAlive(usageWindow)||event.sender!==usageWindow.webContents || !Number.isFinite(height)) throw new Error('不允许的额度窗口调用'); const maxHeight=Math.min(380,screen.getDisplayMatching(petWindow.getBounds()).workArea.height-16);usageWindow.setBounds(usageBounds(Math.round(Math.max(160,Math.min(maxHeight,height)))));return {ok:true}; });
  handler('pet:update-settings', (_event, patch) => applySettings(patch));
  handler('pet:choose-workspace', async event => {
    if(activeTask?.status==='running')throw new Error('任务执行中，请先停止任务再更换工作目录。');
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: '知栖要在哪个文件夹陪你工作？', defaultPath: store.state.settings.workspace, properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths[0]) {store.updateSettings({ workspace: result.filePaths[0] });activeTask=null;taskEvents=[];void refreshRuntime();}
    broadcast(); return publicState();
  });
  handler('pet:import-action', async (event, id) => {
    store.slot(id);
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: '导入这个动作的视频', filters: [{ name: '动作视频', extensions: ['webm', 'mp4', 'mov'] }], properties: ['openFile'] });
    if (!result.canceled && result.filePaths[0]) await store.importAction(id, result.filePaths[0]);
    broadcast(); return publicState();
  });
  handler('pet:clear-action', async (_event, id) => { await store.clearAction(id); broadcast(); return publicState(); });
  handler('pet:play-action', (_event, id) => { playAction(id); return { ok: true }; });
  handler('pet:open-panel', () => { createPanel(); return { ok: true }; });
  handler('pet:minimize-panel', () => { hideWindow(panelWindow); return { ok: true }; });
  handler('pet:open-codex', async () => {
    const id=activeTask?.threadId||conversations.current(store.state.settings.workspace)?.threadId;
    if(id)await openCodexLink(threadLink(id));
    else await openCodex(store.state.settings.workspace, { codexPath, env: codexChildEnv });
    return { ok: true };
  });
  handler('pet:handoff-task', async (_event, input) => {
    const url=composerLink(input?.prompt,input?.cwd||store.state.settings.workspace);
    try { await openCodexLink(url); }
    catch { throw new Error('无法打开 Codex 对话，请确认已安装桌面版 Codex。输入内容仍保留在这里。'); }
    return { opened:true, sent:false };
  });
  handler('pet:quit', () => { app.quit(); return { ok: true }; });
  handler('pet:complete-focus', () => { store.increment('focusSessions'); playAction('celebrate'); broadcast(); return publicState(); });
  handler('pet:run-task', async (_event, input) => {
    if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 24000) throw new Error('请输入 1–24000 字的任务');
    if (activeTask?.status === 'running') throw new Error('知栖正在处理一个任务，请完成或取消后再开始');
    if (!codexPath) throw new Error('未找到本地 Codex CLI。请先安装并登录 Codex，再重启知栖。');
    const cwd = input.cwd || store.state.settings.workspace;
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('工作文件夹无效');
    taskEvents = [];
    const task=activeTask = { id: null, status: 'running', prompt: input.prompt.trim(), cwd, startedAt: new Date().toISOString(), summary: '', threadId: null, persistConversation:true };
    broadcast();
    try {
      const baseRuntime=await refreshRuntime(cwd);
      if(activeTask!==task||task.status!=='running')return publicState();
      task.runtime=resolveExecutionRuntime(baseRuntime,store.executionOptions(cwd),true);
      const record=conversations.begin(cwd,task.prompt,task.runtime);
      task.conversationId=record.id;task.threadId=record.threadId;task.resumed=Boolean(record.threadId);
      task.id=runner.start(task.prompt,{cwd,threadId:record.threadId,runtime:task.runtime});
    }
    catch (error) { task.status = 'failed'; task.summary = error.message; broadcast(); throw error; }
    playAction('thinking'); broadcast(); return publicState();
  });
  handler('pet:cancel-task', () => {
    if(activeTask?.status==='running'&&!activeTask.id){activeTask.status='cancelled';activeTask.summary='准备已停止。';broadcast();}
    else runner.cancel(activeTask?.id);
    return { ok: true };
  });
  ipcMain.on('pet:hover', (event, hovering) => { if (!trustedSender(event)||smoke) return; if (event.sender === petWindow.webContents && typeof hovering === 'boolean') petWindow.setIgnoreMouseEvents(!hovering, { forward: true }); });
  ipcMain.on('pet:heartbeat', event => { if (trustedSender(event) && event.sender === petWindow.webContents) petWatchdog?.beat(); });
  ipcMain.on('pet:diagnostic', (event, detail) => {
    if (!trustedSender(event)) return;
    if (event.sender !== petWindow.webContents || !['media-error','playback-recovery'].includes(detail?.event)) return;
    runtimeLog(detail.event, { id: String(detail.id || '').slice(0, 60), reason: String(detail.reason || '').slice(0, 200) });
  });
  ipcMain.on('pet:menu', event => { if(!trustedSender(event))return;void refreshUsage();menu().popup({window:BrowserWindow.fromWebContents(event.sender)}); });
  ipcMain.on('pet:move', (event, delta) => {
    if (!trustedSender(event)) return;
    if (event.sender !== petWindow.webContents || !Number.isFinite(delta?.dx) || !Number.isFinite(delta?.dy)) return;
    const bounds = petWindow.getBounds();
    hideUsage();
    const { width, height } = petSize();
    const point = { x: bounds.x + Math.max(-200, Math.min(200, delta.dx)), y: bounds.y + Math.max(-200, Math.min(200, delta.dy)) };
    const area = screen.getDisplayNearestPoint({ x: Math.round(point.x + width / 2), y: Math.round(point.y + height / 2) }).workArea;
    const x = Math.round(Math.max(area.x - width + 100, Math.min(point.x, area.x + area.width - 100)));
    const y = Math.round(Math.max(area.y - 30, Math.min(point.y, area.y + area.height - 100)));
    // At fractional Windows DPI, setPosition reuses rounded native bounds and
    // can grow the window on every move. Always supply the configured DIP size.
    petWindow.setBounds({ x, y, width, height });
    clearTimeout(moveTimer); moveTimer = setTimeout(() => store.setPosition({ x, y }), 400);
  });
}
function handleTaskEvent(event) {
  if(activeTask?.persistConversation&&activeTask.id&&event.taskId&&event.taskId!==activeTask.id)return;
  event = { ...event };
  for (const key of ['message', 'output']) if (typeof event[key] === 'string') event[key] = event[key].slice(-2400);
  if (typeof event.text === 'string') event.text = event.text.slice(-16000);
  taskEvents.push(event); taskEvents = taskEvents.slice(-150);
  if (activeTask) {
    if (event.taskId) activeTask.id = event.taskId;
    if (event.threadId) activeTask.threadId = event.threadId;
    if(event.runtime)activeTask.runtime=event.runtime;
    if(event.type==='approval-requested')activeTask.approvals=[...(activeTask.approvals||[]),event.approval];
    if(event.type==='approval-resolved')activeTask.approvals=(activeTask.approvals||[]).filter(item=>item.id!==event.approvalId);
    if(['task-completed','task-failed','task-cancelled'].includes(event.type))activeTask.approvals=[];
    if(activeTask.persistConversation){
      try {
        if(event.threadId)conversations.bind(activeTask.cwd,event.threadId);
        if(event.type==='task-completed')conversations.complete(activeTask.cwd,event.text||activeTask.summary);
      } catch {activeTask.memoryWarning='这次对话记录未能保存，请检查本地磁盘。';runtimeLog('conversation-save-failed');}
    }
    if (event.type === 'message' && event.text) activeTask.summary = event.text;
    if (event.type === 'message-delta' && event.text) activeTask.summary = event.text.slice(-12000);
    if (event.type === 'progress' && activeTask.status === 'running' && activeTask.animationPhase !== 'working') { activeTask.animationPhase = 'working'; playAction('working'); }
    if (event.type === 'task-completed') { activeTask.status = 'completed'; if (event.text) activeTask.summary = event.text; store.increment('completedTasks'); playAction('success');pushJournal(true); }
    if (event.type === 'task-failed') { activeTask.status = 'failed'; activeTask.summary = event.message || event.error || '任务未完成'; playAction('error'); }
    if (event.type === 'task-cancelled') activeTask.status = 'cancelled';
  }
  for (const win of windows()) sendWindow(win,'pet:task-event',event);
  broadcast();
  if(event.type==='approval-requested'&&!quitting)createPanel();
  if (event.type === 'task-completed' && !store.state.settings.quietMode && Notification.isSupported()) new Notification({ title: '知栖：任务完成啦', body: '双击桌宠，查看 Codex 的执行结果。', silent: true }).show();
}
async function runSmokeTest() {
  const savePreview=require('../scripts/save-preview.cjs');
  store.updateSettings({randomIdle:false});broadcast();
  menu().getMenuItemById('pet-size-165').click();
  createPanel();
  await Promise.all(windows().map(win => win.webContents.isLoading() ? new Promise(resolve => win.webContents.once('did-finish-load', resolve)) : Promise.resolve()));
  await new Promise(resolve => setTimeout(resolve, 1800));
  const diagnostics = [];
  const actionGroups = menu().getMenuItemById('pet-actions').submenu.items.filter(item => item.submenu).map(item => item.label);
  const sizeBounds = petWindow.getBounds();
  // Windows can round frameless window bounds by one DIP at fractional DPI.
  const displayScale = screen.getDisplayMatching(sizeBounds).scaleFactor;
  const groupedMenuAndSize = actionGroups.length === 9 && actionGroups.includes('余额') && actionGroups.includes('番茄钟') && actionGroups.includes('小花园') && Math.abs(sizeBounds.width-264)<=1 && Math.abs(sizeBounds.height-347)<=1 && Math.abs(petWindow.webContents.getZoomFactor()-1.65)<.01;
  diagnostics.push({check:'grouped-action-menu-and-size',groups:actionGroups,width:sizeBounds.width,height:sizeBounds.height,displayScale,zoom:petWindow.webContents.getZoomFactor(),ok:groupedMenuAndSize});
  await petWindow.webContents.executeJavaScript('window.petAPI.showUsage()');
  if (usageWindow.webContents.isLoading()) await new Promise(resolve => usageWindow.webContents.once('did-finish-load', resolve));
  await new Promise(resolve => setTimeout(resolve, 350));
  const usageView = await usageWindow.webContents.executeJavaScript(`({plan:document.getElementById('plan').textContent,quotas:[...document.querySelectorAll('.quota-title')].map(e=>e.textContent),noHorizontalOverflow:document.querySelector('.usage-bubble').scrollWidth<=document.querySelector('.usage-bubble').clientWidth,errors:window.__qiqiErrors||[]})`);
  usageView.zoom = usageWindow.webContents.getZoomFactor();
  usageView.menuPresent = Boolean(menu().getMenuItemById('pet-usage-details'));
  await savePreview(usageWindow,path.join(ROOT,'docs','preview-usage.png'));
  if (usageView.plan !== 'Plus' || usageView.quotas.length !== 2 || usageView.zoom !== 1 || !usageView.noHorizontalOverflow || !usageView.menuPresent || usageView.errors.length) throw new Error('Usage bubble/menu rendering failed: '+JSON.stringify(usageView));
  diagnostics.push({check:'codex-usage-bubble-and-menu',...usageView});
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (process.argv.includes('--verify-launch')) {
    panelWindow.hide(); usageWindow.hide();
    app.emit('second-instance', {}, [process.execPath, '--panel']); await pause(120);
    const taskOpened = panelWindow.isVisible(); panelWindow.hide();
    app.emit('second-instance', {}, [process.execPath, '--usage']); await pause(120);
    const usageOpened = usageWindow.isVisible(); usageWindow.hide();
    app.emit('second-instance', {}, [process.execPath, '--pomodoro']);
    if (pomodoroWindow.webContents.isLoading()) await new Promise(resolve => pomodoroWindow.webContents.once('did-finish-load', resolve));
    await pause(150);
    const timerOpened = pomodoroWindow.isVisible(), timerNotStarted = pomodoro.snapshot().status === 'idle';
    pomodoroWanted = false; pomodoroWindow.hide();
    diagnostics.push({check:'incoming-plugin-launch-options',taskOpened,usageOpened,timerOpened,timerNotStarted});
    if (!taskOpened || !usageOpened || !timerOpened || !timerNotStarted) throw new Error('Plugin window routing failed');
  }
  const stagePoint = await petWindow.webContents.executeJavaScript(`(()=>{const b=document.getElementById('pet-stage').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
  const zoom = petWindow.webContents.getZoomFactor();
  const input = (type, dx = 0, dy = 0) => { const b=petWindow.getBounds(),x=Math.round(stagePoint.x*zoom+dx),y=Math.round(stagePoint.y*zoom+dy);petWindow.webContents.sendInputEvent({type,x,y,globalX:b.x+x,globalY:b.y+y,...(type==='mouseMove'?{modifiers:['leftButtonDown']}:{button:'left',clickCount:1})}); };
  const prepareInput = async () => { panelWindow.hide(); usageWindow.hide(); petWindow.show(); petWindow.focus(); await pause(50); };
  await prepareInput();
  const beforeJitter = petWindow.getBounds();
  input('mouseDown'); for(let i=0;i<20;i++) input('mouseMove',i%2?2:-2); input('mouseUp');
  await pause(doubleClickMs+120);
  const jitterClicked = usageWindow.isVisible() && !panelWindow.isVisible() && petWindow.getBounds().x === beforeJitter.x;
  input('mouseDown');input('mouseUp');await pause(doubleClickMs+120);
  const secondClickHid=!usageWindow.isVisible();
  await prepareInput();
  input('mouseDown');input('mouseUp');await pause(Math.min(70,doubleClickMs/3));input('mouseDown');input('mouseUp');await pause(doubleClickMs+120);
  const doubleOpenedTaskOnly = panelWindow.isVisible() && !usageWindow.isVisible();
  await prepareInput();
  const beforeInputDrag=petWindow.getBounds();
  await petWindow.webContents.executeJavaScript(`window.__gestureTrace=[];for(const type of ['pointerdown','pointermove','pointerup'])document.getElementById('pet-stage').addEventListener(type,e=>window.__gestureTrace.push({type:e.type,x:e.screenX,y:e.screenY,buttons:e.buttons,held:window.qiqiGestures.held,dragging:window.qiqiGestures.dragging}));`);
  input('mouseDown');await pause(20);input('mouseMove',15,4);await pause(60);input('mouseUp');await pause(doubleClickMs+120);
  const afterInputDrag=petWindow.getBounds();
  const dragDidNotClick = !usageWindow.isVisible() && !panelWindow.isVisible() && (afterInputDrag.x!==beforeInputDrag.x||afterInputDrag.y!==beforeInputDrag.y) && Math.abs(afterInputDrag.width-beforeInputDrag.width)<=1 && Math.abs(afterInputDrag.height-beforeInputDrag.height)<=1 && Math.abs(petWindow.webContents.getZoomFactor()-zoom)<.001;
  diagnostics.push({check:'native-click-double-and-drag',jitterClicked,secondClickHid,doubleOpenedTaskOnly,dragDidNotClick,doubleClickMs,beforeInputDrag,afterInputDrag,usageVisible:usageWindow.isVisible(),panelVisible:panelWindow.isVisible(),trace:await petWindow.webContents.executeJavaScript('window.__gestureTrace')});
  if (!jitterClicked || !secondClickHid || !doubleOpenedTaskOnly || !dragDidNotClick) throw new Error('Native gesture test failed: '+JSON.stringify(diagnostics.at(-1)));
  const noSpeech=await petWindow.webContents.executeJavaScript('!document.getElementById("speech")');
  const savedQuiet=store.state.settings.quietMode;
  applySettings({quietMode:false});await pause(600);
  const musicStart=await petWindow.webContents.executeJavaScript('({playing:window.qiqiMusic.playing,time:document.getElementById("companion-music").currentTime,duration:document.getElementById("companion-music").duration,volume:window.qiqiMusic.volume,loop:document.getElementById("companion-music").loop})');
  await pause(400);
  const musicAdvanced=await petWindow.webContents.executeJavaScript(`document.getElementById('companion-music').currentTime>${musicStart.time}+.1`);
  applySettings({quietMode:true});await pause(100);
  const musicStopped=await petWindow.webContents.executeJavaScript('!window.qiqiMusic.playing');
  applySettings({quietMode:savedQuiet});
  const draft='你好 & 测试\n请在 Codex 对话中回复。';
  const activeBefore=activeTask,taskCount=runner.tasks.size,linkCount=externalLinks.length;
  await panelWindow.webContents.executeJavaScript(`document.getElementById('prompt').value=${JSON.stringify(draft)};document.getElementById('task-form').requestSubmit()`);await pause(120);
  const link=externalLinks.length>linkCount?new URL(externalLinks.at(-1)):null;
  const handoffToCodex=link?.protocol==='codex:'&&link.hostname==='new'&&link.searchParams.get('prompt')===draft&&link.searchParams.get('path')===store.state.settings.workspace&&activeTask===activeBefore&&runner.tasks.size===taskCount;
  await panelWindow.webContents.executeJavaScript('document.getElementById("prompt").value=""');
  diagnostics.push({check:'silent-pet-music-toggle-and-codex-composer',noSpeech,musicStart,musicAdvanced,musicStopped,handoffToCodex});
  if(!noSpeech||!musicStart.playing||!musicStart.loop||musicStart.volume>.2||!musicAdvanced||!musicStopped||!handoffToCodex)throw new Error('Music, speech or Codex composer handoff failed: '+JSON.stringify(diagnostics.at(-1)));
  const fixtureThread='01234567-89ab-4cde-8f01-23456789abcd';
  conversations.startNew(store.state.settings.workspace);
  conversations.begin(store.state.settings.workspace,'记住测试暗号',{model:'fixture-model',effort:'medium'});conversations.bind(store.state.settings.workspace,fixtureThread);conversations.complete(store.state.settings.workspace,'记住了，后续可以继续聊。');
  activeTask={id:'conversation-ui-fixture',status:'completed',cwd:store.state.settings.workspace,summary:'记住了，后续可以继续聊。',threadId:fixtureThread,runtime:runtimeValues.get(workspaceKey(store.state.settings.workspace))};
  taskEvents=[{type:'progress',taskId:activeTask.id,phase:'thinking',isSummary:true,message:'核对当前目录和依赖。'},{type:'progress',taskId:activeTask.id,phase:'command',message:'node --version',output:'v24.0.0'},{type:'message',taskId:activeTask.id,itemId:'reply',text:activeTask.summary},{type:'task-completed',taskId:activeTask.id,text:activeTask.summary}];broadcast();await pause(100);
  const conversationUI=await panelWindow.webContents.executeJavaScript(`({shortcutRemoved:!document.getElementById('task-shortcut'),model:document.getElementById('runtime-model').textContent,environment:document.getElementById('runtime-environment').textContent,thought:document.getElementById('thinking-summary').textContent,activity:document.getElementById('activity-log').textContent,reply:document.getElementById('progress').textContent,memory:document.getElementById('conversation-status').textContent})`);
  const panelReload=new Promise(resolve=>panelWindow.webContents.once('did-finish-load',resolve));panelWindow.reload();await panelReload;await pause(150);
  conversationUI.restoredAfterReload=await panelWindow.webContents.executeJavaScript(`document.getElementById('progress').textContent==='记住了，后续可以继续聊。'&&document.getElementById('conversation-status').textContent.includes('1')`);
  await savePreview(panelWindow,path.join(ROOT,'docs/preview-task-model-memory.png'));
  await panelWindow.webContents.executeJavaScript('document.getElementById("new-conversation").click()');await pause(100);
  conversationUI.newConversation=conversations.current(store.state.settings.workspace).threadId===null&&await panelWindow.webContents.executeJavaScript('!document.getElementById("progress").textContent.includes("记住了")');
  if(!conversationUI.shortcutRemoved||conversationUI.model!=='fixture-model'||!conversationUI.environment.includes('Windows')||!conversationUI.thought.includes('核对')||!conversationUI.activity.includes('v24.0.0')||conversationUI.reply!=='记住了，后续可以继续聊。'||!conversationUI.restoredAfterReload||!conversationUI.newConversation)throw new Error('Conversation UI failed: '+JSON.stringify(conversationUI));
  diagnostics.push({check:'conversation-runtime-summary-and-reload',...conversationUI});
  const previousExecution=store.executionOptions(),recordBeforeSelection=conversations.current(store.state.settings.workspace).id;
  menu().getMenuItemById('pet-execution-settings').click();await pause(150);
  const executionOpened=await panelWindow.webContents.executeJavaScript('!document.getElementById("execution-settings").hidden');
  await panelWindow.webContents.executeJavaScript(`(()=>{const field=document.getElementById('execution-model');field.value='fixture-alternate';field.dispatchEvent(new Event('change'));})()`);
  const supportedEfforts=await panelWindow.webContents.executeJavaScript('[...document.getElementById("execution-effort").options].map(option=>option.value)');
  await panelWindow.webContents.executeJavaScript(`(()=>{for(const[id,value]of[['execution-effort','low'],['execution-sandbox','read-only'],['execution-approval','never']]){const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('change'));}document.getElementById('apply-execution').click();})()`);await pause(150);
  const selection=store.executionOptions(),selectedUI=await panelWindow.webContents.executeJavaScript(`({model:document.getElementById('runtime-model').textContent,effort:document.getElementById('runtime-effort').textContent,environment:document.getElementById('runtime-environment').textContent,closed:document.getElementById('execution-settings').hidden})`);
  const reloadedSelection=new PetStore(store.directory,ROOT).executionOptions(store.state.settings.workspace);
  const selectionKeepsMemory=conversations.current(store.state.settings.workspace).id===recordBeforeSelection;
  activeTask={id:'execution-settings-running-fixture',status:'running',cwd:store.state.settings.workspace};broadcast();await pause(80);
  const editingBlocked=await panelWindow.webContents.executeJavaScript(`(async()=>{try{await window.petAPI.setExecution({sandbox:'danger-full-access'});return false;}catch(error){return document.getElementById('execution-settings-button').disabled&&error.message.includes('任务执行中');}})()`);
  activeTask=null;broadcast();await panelWindow.webContents.executeJavaScript(`window.petAPI.setExecution(${JSON.stringify(previousExecution)})`);await pause(100);
  const executionChoices={opened:executionOpened,supportedEfforts,selection,selectedUI,persisted:JSON.stringify(selection)===JSON.stringify(reloadedSelection),selectionKeepsMemory,editingBlocked};
  if(!executionOpened||supportedEfforts.includes('medium')||!supportedEfforts.includes('low')||selection.model!=='fixture-alternate'||selection.effort!=='low'||selection.sandbox!=='read-only'||selection.approvalPolicy!=='never'||selectedUI.model!=='fixture-alternate'||!selectedUI.environment.includes('不弹审批')||!selectedUI.closed||!executionChoices.persisted||!selectionKeepsMemory||!editingBlocked)throw new Error('Execution selectors failed: '+JSON.stringify(executionChoices));
  diagnostics.push({check:'model-effort-permissions-selection-and-persistence',...executionChoices});
  await require('../scripts/verify-approvals.cjs')({runner,panel:panelWindow,pause,setTask:value=>{activeTask=value;broadcast();},diagnostics});
  menu().getMenuItemById('pet-preferences').click();await pause(100);
  if (!await panelWindow.webContents.executeJavaScript('!document.getElementById("settings").hidden')) throw new Error('Preferences menu did not open settings');
  await panelWindow.webContents.executeJavaScript('document.getElementById("settings").hidden=true');
  const nativeMenu=menu();
  const menuRoot={label:nativeMenu.getMenuItemById('pet-usage').label};
  const walletUnavailable=nativeMenu.getMenuItemById('pet-unavailable-wallet')?.enabled===false;
  if(!menuRoot.label.includes('Plus')||!walletUnavailable)throw new Error('Native menu or balance placeholder failed');
  // Changing the source snapshot must update all three surfaces, without a Plus-only note.
  const fixtureRead=usageService.read;
  usageWindow.show();panelWindow.showInactive();
  const {normalizeUsage}=require('./codex-usage.cjs');
  usageService.read=async()=>normalizeUsage({type:'chatgpt',planType:'pro'},{rateLimits:{primary:{usedPercent:15,windowDurationMins:300},secondary:{usedPercent:37,windowDurationMins:10080,resetsAt:Date.now()/1000+86400}}});
  await refreshUsage(true);await pause(120);
  console.log('Smoke: subscription snapshot switched');
  const proViews={usage:await usageWindow.webContents.executeJavaScript(`({plan:document.getElementById('plan').textContent,labels:[...document.querySelectorAll('.quota-title')].map(e=>e.textContent),note:document.getElementById('note').textContent})`),task:await panelWindow.webContents.executeJavaScript(`document.getElementById('task-plan').textContent`),menu:menu().getMenuItemById('pet-usage').label};
  if (proViews.usage.plan!=='Pro'||proViews.task!=='Pro'||!proViews.menu.includes('Pro')||proViews.usage.labels.length!==1||/Plus|5 小时/.test(JSON.stringify(proViews))) throw new Error('Subscription UI retained old Plus data');
  console.log('Smoke: subscription views checked');
  await savePreview(usageWindow,path.join(ROOT,'docs','preview-usage-pro.png'));
  usageService.read=fixtureRead;await refreshUsage(true);await pause(100);
  if(process.argv.includes('--verify-window-lifecycle')){
    await require('../scripts/verify-window-lifecycle.cjs')({ROOT,store,pomodoro,pause,menu,broadcast,createUsage,createPomodoroWindow,getWindows:()=>({pet:petWindow,panel:panelWindow,usage:usageWindow,pomodoro:pomodoroWindow}),getTask:()=>activeTask,setTask:value=>{activeTask=value;broadcast();},handleTaskEvent,play:playAction,fetch:net.fetch,setFailures:(id,count)=>mediaTestFailures.set(id,count),remainingFailures:id=>mediaTestFailures.get(id)||0,hideTimer:()=>{pomodoroWanted=false;hideWindow(pomodoroWindow);},diagnostics});
  }
  if (process.argv.includes('--verify-pomodoro') || process.argv.includes('--verify-pomodoro-media')) {
    await require('../scripts/verify-pomodoro.cjs')({ROOT,store,pomodoro,petWindow,panelWindow,pause,menu,broadcast,getWindow:()=>pomodoroWindow,advance:ms=>{pomodoroTestOffset+=ms;pomodoro.tick();},cleanup:()=>{pomodoroTestOffset=0;pomodoroWanted=false;pomodoroWindow.hide();},diagnostics});
  }
  await require('../scripts/verify-journal.cjs')({ROOT,journal,pomodoro,store,pause,menu,getWindow:()=>journalWindow,panel:panelWindow,advance:ms=>{pomodoroTestOffset+=ms;pomodoro.tick();},cleanup:()=>{pomodoroTestOffset=0;},push:pushJournal,diagnostics});
  await require('../scripts/verify-garden.cjs')({ROOT,store,pause,menu,getWindow:()=>journalWindow,petWindow,getGarden:()=>garden,setGarden:value=>{garden=value;},getJournal:()=>journal,setJournal:value=>{journal=value;},push:pushJournal,broadcast,playAction,diagnostics});
  await require('../scripts/verify-shop.cjs')({ROOT,store,pause,menu,getWindow:()=>journalWindow,petWindow,getGarden:()=>garden,setGarden:value=>{garden=value;},getJournal:()=>journal,setJournal:value=>{journal=value;},push:pushJournal,broadcast,diagnostics});
  const verifyWallet=process.argv.find(arg=>arg.startsWith('--verify-wallet='))?.slice('--verify-wallet='.length);
  const walletFixture=verifyWallet || process.argv.find(arg=>arg.startsWith('--smoke-fixture='))?.slice('--smoke-fixture='.length);
  let walletTriggers=false;
  if(walletFixture){
    await store.importAction('wallet',path.resolve(walletFixture));broadcast();await pause(50);
    await petWindow.webContents.executeJavaScript(`window.petAPI.showUsage()`);
    walletTriggers=await petWindow.webContents.executeJavaScript(`(async()=>{const end=Date.now()+5000;while(Date.now()<end){if(window.qiqiPlayback.current?.id==='wallet')return true;await new Promise(r=>setTimeout(r,30));}return false;})()`);
    if(verifyWallet){
      const installedWallet=await petWindow.webContents.executeJavaScript(`(async()=>{
        const start=Date.now(),firstFrame=window.qiqiPlayback.frames;
        let video;
        while(Date.now()-start<9000){video=document.querySelector('.action-video.is-front');if(window.qiqiPlayback.current?.id==='wallet'&&video?.currentTime>=6)break;await new Promise(r=>setTimeout(r,30));}
        if(!video||window.qiqiPlayback.current?.id!=='wallet'||video.currentTime<6)throw new Error('Wallet query did not advance to the comic bubble');
        const surface=document.getElementById('pet-surface'),ctx=surface.getContext('2d');
        const bubble=ctx.getImageData(Math.round(surface.width*125/960),Math.round(surface.height*485/960),1,1).data;
        const wallet=ctx.getImageData(Math.round(surface.width*450/960),Math.round(surface.height*620/960),1,1).data;
        return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,muted:video.muted,canvasAdvanced:window.qiqiPlayback.frames>firstFrame+60,comicBubbleVisible:bubble[3]>=250,walletVisible:wallet[3]>=250};
      })()`);
      fs.writeFileSync(path.join(ROOT,'docs','preview-wallet-video.png'),(await petWindow.webContents.capturePage()).toPNG());
      installedWallet.returnedDefault=await petWindow.webContents.executeJavaScript(`(async()=>{const end=Date.now()+6000;while(Date.now()<end){if(window.qiqiPlayback.current?.id==='idle'||!window.qiqiPlayback.current)return true;await new Promise(r=>setTimeout(r,40));}return false;})()`);
      const walletMenu=menu().getMenuItemById('pet-action-wallet');
      installedWallet.menuPresent=Boolean(walletMenu);walletMenu?.click();
      installedWallet.menuPlayed=await petWindow.webContents.executeJavaScript(`(async()=>{const end=Date.now()+5000;while(Date.now()<end){if(window.qiqiPlayback.current?.id==='wallet')return true;await new Promise(r=>setTimeout(r,30));}return false;})()`);
      diagnostics.push({check:'installed-wallet-query-menu-and-idle',...installedWallet});
      if(installedWallet.width!==960||installedWallet.height!==960||Math.abs(installedWallet.duration-10)>.05||['oneShot','playing','muted','canvasAdvanced','comicBubbleVisible','walletVisible','returnedDefault','menuPresent','menuPlayed'].some(key=>!installedWallet[key]))throw new Error('Installed wallet video failed verification: '+JSON.stringify(installedWallet));
    }
    playAction('idle');await pause(120);await refreshUsage(true);await pause(80);
    const noBackgroundReaction=await petWindow.webContents.executeJavaScript(`window.qiqiPlayback.current?.id!=='wallet'`);
    await usageWindow.webContents.executeJavaScript(`window.petAPI.getUsage(true,true)`);await pause(250);
    const refreshReaction=await petWindow.webContents.executeJavaScript(`window.qiqiPlayback.current?.id==='wallet'`);
    walletTriggers=walletTriggers&&noBackgroundReaction&&refreshReaction;
    playAction('idle');await store.clearAction('wallet');broadcast();
    if(!walletTriggers)throw new Error('Wallet query/background trigger distinction failed');
  }
  const verifyWalletVariants=process.argv.find(arg=>arg.startsWith('--verify-wallet-variants='))?.slice('--verify-wallet-variants='.length);
  if(verifyWalletVariants){
    const variants=JSON.parse(fs.readFileSync(path.resolve(verifyWalletVariants),'utf8')).actions;
    const quotaFixtures=require('../test/fixtures/wallet-usage.cjs');
    for(const item of variants){if(!WALLET_ACTION_IDS.includes(item.id))throw new Error('Unexpected wallet action in fixture');await store.importAction(item.id,path.resolve(item.media));}
    if(walletFixture)await store.importAction('wallet',path.resolve(walletFixture));
    broadcast();usageWindow.show();await pause(100);
    const results=[];
    for(const item of variants){
      const quota=quotaFixtures[item.id];if(!quota)throw new Error('Missing quota fixture');
      usageService.read=async()=>normalizeUsage({planType:'plus'},{rateLimits:{limitId:'codex',primary:{usedPercent:100-quota.remaining,windowDurationMins:300,resetsAt:Date.now()/1000+quota.resetMinutes*60},secondary:{usedPercent:11,windowDurationMins:10080,resetsAt:Date.now()/1000+86400}}});
      await usageWindow.webContents.executeJavaScript('window.petAPI.getUsage(true,true)');
      const metadata=JSON.parse(fs.readFileSync(path.resolve(item.metadata),'utf8'));
      const probe=item.qa.native;
      const result=await petWindow.webContents.executeJavaScript(`(async()=>{
        const id=${JSON.stringify(item.id)},probe=${JSON.stringify(probe)},start=Date.now(),first=window.qiqiPlayback.frames;
        let video;
        while(Date.now()-start<12000){video=document.querySelector('.action-video.is-front');if(window.qiqiPlayback.current?.id===id&&video?.currentTime>=probe.frame/30)break;await new Promise(r=>setTimeout(r,30));}
        if(!video||window.qiqiPlayback.current?.id!==id||video.currentTime<probe.frame/30)throw new Error('Quota did not select '+id);
        const surface=document.getElementById('pet-surface'),ctx=surface.getContext('2d');
        const effects=probe.probes.map(p=>({label:p.label,alpha:ctx.getImageData(Math.round(surface.width*p.x/video.videoWidth),Math.round(surface.height*p.y/video.videoHeight),1,1).data[3]}));
        return {id,width:video.videoWidth,height:video.videoHeight,duration:video.duration,muted:video.muted,oneShot:!video.loop,playing:!video.paused,advanced:window.qiqiPlayback.frames>first+50,effects};
      })()`);
      fs.writeFileSync(path.join(ROOT,'docs',`preview-${item.id}.png`),(await petWindow.webContents.capturePage()).toPNG());
      result.returnedDefault=await petWindow.webContents.executeJavaScript(`(async()=>{const end=Date.now()+7500;while(Date.now()<end){if(window.qiqiPlayback.current?.id==='idle'||!window.qiqiPlayback.current)return true;await new Promise(r=>setTimeout(r,40));}return false;})()`);
      await refreshUsage(true);await pause(80);
      result.backgroundSilent=await petWindow.webContents.executeJavaScript(`!${JSON.stringify(WALLET_ACTION_IDS)}.includes(window.qiqiPlayback.current?.id)`);
      const itemMenu=menu().getMenuItemById('pet-action-'+item.id);result.menuPresent=Boolean(itemMenu);itemMenu?.click();
      result.menuPlayed=await petWindow.webContents.executeJavaScript(`(async()=>{const end=Date.now()+5000;while(Date.now()<end){if(window.qiqiPlayback.current?.id===${JSON.stringify(item.id)})return true;await new Promise(r=>setTimeout(r,30));}return false;})()`);
      playAction('idle');await pause(150);
      if(result.width!==metadata.width||result.height!==metadata.height||Math.abs(result.duration-metadata.seconds)>.05||['muted','oneShot','playing','advanced','returnedDefault','backgroundSilent','menuPresent','menuPlayed'].some(key=>!result[key])||result.effects.some(effect=>effect.alpha<250))throw new Error('Wallet variant failed: '+JSON.stringify(result));
      results.push(result);console.log('Verified wallet variant: '+item.id);
    }
    usageService.read=fixtureRead;await refreshUsage(true);
    for(const id of WALLET_ACTION_IDS)await store.clearAction(id);
    broadcast();diagnostics.push({check:'wallet-variants-actual-quota-and-playback',results,ok:results.length===4});
  }
  const lightLayout=await panelWindow.webContents.executeJavaScript(`({background:getComputedStyle(document.querySelector('.little-window')).backgroundColor,overflow:document.querySelector('.little-window').scrollHeight>document.querySelector('.little-window').clientHeight,errors:window.__qiqiErrors})`);
  if(lightLayout.overflow||lightLayout.errors.length)throw new Error('Task panel has clipped content or renderer errors');
  diagnostics.push({check:'native-menu-plan-switch-and-wallet',menuRoot,walletUnavailable,proViews,walletTriggers,lightLayout});
  usageWindow.destroy();usageWindow=null;
  for (const win of windows()) {
    const result = await win.webContents.executeJavaScript(`({title:document.title,ready:document.readyState,nativeBridge:!!window.petAPI,errors:window.__qiqiErrors||[],bodyText:document.body.innerText.slice(0,600),loadedArt:[...document.querySelectorAll('[data-qiqi-art]')].every(host=>host.querySelector('img')?.naturalWidth>0&&window.qiqiIdle?.ready),idleMode:window.qiqiIdle?.mode,idleFrames:window.qiqiIdle?.frames})`);
    diagnostics.push(result);
    if (win.isVisible()) {
      await savePreview(win,path.join(ROOT, 'docs', win === petWindow ? 'preview-pet.png' : win === pomodoroWindow ? 'preview-pomodoro.png' : 'preview-panel.png'));
    }
  }
  const referenceWindow = new BrowserWindow({ width: 640, height: 840, transparent: true, frame: false, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, partition: 'qiqi-reference' } });
  await referenceWindow.loadFile(path.join(ROOT, 'renderer', 'idle-preview.html'), { query: { bare: '1', pose: 'base' } });
  await referenceWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const start=Date.now();const check=()=>window.qiqiIdle?.ready?resolve():Date.now()-start>5000?reject(new Error('Portrait failed to load')):setTimeout(check,30);check()})`);
  await new Promise(resolve => setTimeout(resolve, 150));
  await savePreview(referenceWindow,path.join(ROOT, 'docs', 'character-reference.png'));
  referenceWindow.destroy();
  const smokeFixture = process.argv.find(arg => arg.startsWith('--smoke-fixture='))?.slice('--smoke-fixture='.length);
  // A local fixture keeps media checks deterministic when desktop occlusion
  // prevents canvas MediaRecorder from producing frames in the test panel.
  const sampleBytes = smokeFixture ? fs.readFileSync(path.resolve(smokeFixture)) : await panelWindow.webContents.executeJavaScript(`(async () => {
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;canvas.style.cssText='position:fixed;left:0;top:0;z-index:99999';
    const ctx=canvas.getContext('2d'),chunks=[];document.body.append(canvas);ctx.fillStyle='#7cdec0';ctx.fillRect(0,0,96,96);
    const stream=canvas.captureStream(0),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
    const complete=new Promise(resolve=>recorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()))));
    recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    for(let n=0;n<24;n++){ctx.clearRect(0,0,96,96);ctx.fillStyle='#7cdec0';ctx.beginPath();ctx.arc(25+n*2,48,16,0,Math.PI*2);ctx.fill();stream.getVideoTracks()[0].requestFrame();await new Promise(r=>setTimeout(r,50));}
    recorder.stop();const bytes=await complete;stream.getTracks().forEach(t=>t.stop());canvas.remove();return bytes;
  })()`);
  const samplePath = path.join(app.getPath('userData'), 'smoke-only.webm');
  fs.writeFileSync(samplePath, Buffer.from(sampleBytes));
  await store.importAction('greeting', samplePath);
  const sampleUrl = store.snapshot().actions.find(slot => slot.id === 'greeting').media.url;
  const mediaResponse = await net.fetch(sampleUrl);
  console.log('Media transport:', mediaResponse.status, mediaResponse.headers.get('content-type'), (await mediaResponse.arrayBuffer()).byteLength, sampleBytes.length);
  const playback = await panelWindow.webContents.executeJavaScript(`(async () => {
    const video=document.createElement('video');video.muted=true;document.body.append(video);video.src=${JSON.stringify(sampleUrl)};
    const result=await new Promise(resolve=>{const timer=setTimeout(()=>resolve({ok:false,error:'timeout'}),6000);video.onloadeddata=()=>{clearTimeout(timer);resolve({ok:true,width:video.videoWidth,height:video.videoHeight})};video.onerror=()=>{clearTimeout(timer);resolve({ok:false,error:video.error?.message,errorCode:video.error?.code,networkState:video.networkState})};video.load();});video.remove();return result;
  })()`);
  diagnostics.push({ check: 'video-import-and-decode', ...playback, persisted: Boolean(new PetStore(app.getPath('userData'), ROOT).slot('greeting').media) });
  const transition = await petWindow.webContents.executeJavaScript(`(async()=>{
    const player=window.qiqiPlayback;
    const first=await player.play(${JSON.stringify(sampleUrl)},{loop:true,id:'smoke'});
    const firstFront=document.querySelectorAll('.action-video.is-front').length;
    const portraitRect=document.querySelector('.portrait-poster').getBoundingClientRect(), videoRect=document.querySelector('.action-video.is-front').getBoundingClientRect(), surfaceRect=document.getElementById('pet-surface').getBoundingClientRect();
    const consistentMediaFrame=Math.abs(portraitRect.width-videoRect.width)<.1&&Math.abs(portraitRect.height-videoRect.height)<.1&&Math.abs(surfaceRect.width-videoRect.width)<.1&&Math.abs(surfaceRect.height-videoRect.height)<.1;
    const second=await player.play(${JSON.stringify(sampleUrl)}+'&test=2',{loop:true,id:'smoke-two'});
    const secondFront=document.querySelectorAll('.action-video.is-front').length;
    player.portrait();await new Promise(r=>setTimeout(r,260));
    const restored=!document.getElementById('pet-stage').classList.contains('playing')&&window.qiqiIdle.ready;
    const frameStart=window.qiqiIdle.frames;await new Promise(r=>setTimeout(r,250));
    const instantSwap=[...document.querySelectorAll('.action-video')].every(video=>getComputedStyle(video).transitionDuration.split(',').every(value=>parseFloat(value)===0));
    return {first,second,firstFront,secondFront,consistentMediaFrame,restored,instantSwap,canvasOutput:player.mode==='canvas'&&player.frames>0,animated:window.qiqiIdle.frames>frameStart};
  })()`);
  diagnostics.push({check:'double-buffer-and-idle-return',...transition});
  await store.clearAction('greeting');
  const verifyIdle = process.argv.find(arg => arg.startsWith('--verify-idle='))?.slice('--verify-idle='.length);
  const verifyGreeting = process.argv.find(arg => arg.startsWith('--verify-greeting='))?.slice('--verify-greeting='.length);
  const verifyThinking = process.argv.find(arg => arg.startsWith('--verify-thinking='))?.slice('--verify-thinking='.length);
  const verifySuccess = process.argv.find(arg => arg.startsWith('--verify-success='))?.slice('--verify-success='.length);
  const verifyError = process.argv.find(arg => arg.startsWith('--verify-error='))?.slice('--verify-error='.length);
  const verifySleep = process.argv.find(arg => arg.startsWith('--verify-sleep='))?.slice('--verify-sleep='.length);
  const verifyReturn = process.argv.find(arg => arg.startsWith('--verify-return='))?.slice('--verify-return='.length);
  const verifyFocus = process.argv.find(arg => arg.startsWith('--verify-focus='))?.slice('--verify-focus='.length);
  const verifyFocusVersion = process.argv.find(arg => arg.startsWith('--verify-focus-version='))?.slice('--verify-focus-version='.length) || 'v1';
  const verifyCelebrate = process.argv.find(arg => arg.startsWith('--verify-celebrate='))?.slice('--verify-celebrate='.length);
  const verifyPat = process.argv.find(arg => arg.startsWith('--verify-pat='))?.slice('--verify-pat='.length);
  const verifyWorking = process.argv.find(arg => arg.startsWith('--verify-working='))?.slice('--verify-working='.length);
  const verifyDragDir = process.argv.find(arg => arg.startsWith('--verify-drag-dir='))?.slice('--verify-drag-dir='.length);
  const verifyDragVersion = process.argv.find(arg => arg.startsWith('--verify-drag-version='))?.slice('--verify-drag-version='.length) || 'v1';
  let installedIdle = null;
  if (verifyIdle) {
    await store.importAction('idle', path.resolve(verifyIdle));
    broadcast();
    const idleMenuItem = menu().getMenuItemById('pet-idle-loop');
    idleMenuItem.click();
    const idleBytesBase64 = fs.readFileSync(path.resolve(verifyIdle)).toString('base64');
    installedIdle = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='idle')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||video.readyState<2)throw new Error('Installed idle did not become visible');
      const binary=atob(${JSON.stringify(idleBytesBase64)}), bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const probe=document.createElement('video');probe.muted=true;const probeUrl=URL.createObjectURL(new Blob([bytes],{type:'video/webm'}));probe.src=probeUrl;
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Alpha probe timeout')),6000);probe.onloadeddata=()=>{clearTimeout(timer);resolve()};probe.onerror=()=>{clearTimeout(timer);reject(new Error('Alpha probe decode failed'))};probe.load()});
      await probe.play();await new Promise(resolve=>setTimeout(resolve,200));
      const canvas=document.createElement('canvas');canvas.width=probe.videoWidth;canvas.height=probe.videoHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(probe,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      probe.pause();probe.removeAttribute('src');probe.load();URL.revokeObjectURL(probeUrl);
      let transparent=0,opaque=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]===255)opaque++;}
      const playing=!video.paused, loop=video.loop;video.currentTime=video.duration-.15;
      await new Promise(r=>setTimeout(r,500));
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,playing,loop,looped:video.currentTime<1,transparentFraction:transparent/(pixels.length/4),opaqueFraction:opaque/(pixels.length/4),menuPresent:true};
    })()`);
    diagnostics.push({check:'installed-idle-alpha-and-menu',...installedIdle});
    fs.writeFileSync(path.join(ROOT,'docs','preview-idle-video.png'),(await petWindow.webContents.capturePage()).toPNG());
  }
  let installedGreeting = null;
  if (verifyGreeting) {
    await store.importAction('greeting', path.resolve(verifyGreeting));
    broadcast();
    const greetingMenuItem = menu().getMenuItemById('pet-action-greeting');
    if (!greetingMenuItem) throw new Error('Installed greeting is missing from the action menu');
    greetingMenuItem.click();
    installedGreeting = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='greeting')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='greeting')throw new Error('Greeting menu did not start the installed video');
      await new Promise(r=>setTimeout(r,1600));
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-greeting-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedGreeting.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<8000){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,50));}return false;
    })()`);
    diagnostics.push({check:'installed-greeting-menu-and-return',...installedGreeting});
    await store.clearAction('greeting');
  }
  let installedThinking = null;
  if (verifyThinking) {
    await store.importAction('thinking', path.resolve(verifyThinking));
    broadcast();
    const thinkingMenuItem = menu().getMenuItemById('pet-action-thinking');
    if (!thinkingMenuItem) throw new Error('Installed thinking is missing from the action menu');
    thinkingMenuItem.click();
    installedThinking = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='thinking')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='thinking')throw new Error('Thinking menu did not start the installed video');
      const firstTime=video.currentTime;await new Promise(r=>setTimeout(r,2000));
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,advanced:video.currentTime>firstTime+1,muted:video.muted,menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-thinking-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedThinking.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<${JSON.stringify(Math.ceil(installedThinking.duration*1000+2000))}){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,50));}return false;
    })()`);
    diagnostics.push({check:'installed-thinking-menu-and-return',...installedThinking});
    await store.clearAction('thinking');
  }
  let installedSuccess = null;
  if (verifySuccess) {
    await store.importAction('success', path.resolve(verifySuccess));
    broadcast();
    const successMenuItem = menu().getMenuItemById('pet-action-success');
    if (!successMenuItem) throw new Error('Installed success is missing from the action menu');
    successMenuItem.click();
    installedSuccess = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='success')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='success')throw new Error('Success menu did not start the installed video');
      const firstTime=video.currentTime,firstFrame=window.qiqiPlayback.frames;await new Promise(r=>setTimeout(r,2000));
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,advanced:video.currentTime>firstTime+1,muted:video.muted,canvasAdvanced:window.qiqiPlayback.mode==='canvas'&&window.qiqiPlayback.frames>firstFrame+12,menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-success-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedSuccess.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<${JSON.stringify(Math.ceil(installedSuccess.duration*1000+2000))}){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    // Validate completion routing locally, with no CLI task or desktop notification.
    const previousQuietMode = store.state.settings.quietMode;
    store.updateSettings({ quietMode: true });
    activeTask = { id: 'smoke-complete-only', status: 'running', summary: '' };
    handleTaskEvent({ type: 'task-completed', taskId: activeTask.id, text: 'Animation routing check only' });
    installedSuccess.taskCompletedTriggered = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<8000){const p=window.qiqiPlayback.current;if(p?.id==='success'&&!p.loop&&!window.qiqiPlayback.pending)return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    playAction('idle');
    installedSuccess.autoIdleRestored = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<8000){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    diagnostics.push({check:'installed-success-menu-completion-and-return',...installedSuccess});
    activeTask = null; taskEvents = []; store.updateSettings({ quietMode: previousQuietMode }); await store.clearAction('success'); broadcast();
  }

  let installedError = null;
  if (verifyError) {
    await store.importAction('error', path.resolve(verifyError));
    broadcast();
    const errorMenuItem = menu().getMenuItemById('pet-action-error');
    if (!errorMenuItem) throw new Error('Installed error is missing from the action menu');
    errorMenuItem.click();
    installedError = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='error')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='error')throw new Error('Error menu did not start the installed video');
      const firstTime=video.currentTime,firstFrame=window.qiqiPlayback.frames;await new Promise(r=>setTimeout(r,2000));
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,advanced:video.currentTime>firstTime+1,muted:video.muted,canvasAdvanced:window.qiqiPlayback.mode==='canvas'&&window.qiqiPlayback.frames>firstFrame+12,menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-error-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedError.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<${JSON.stringify(Math.ceil(installedError.duration*1000+2000))}){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    // Validate failure routing locally without launching a CLI task.
    activeTask = { id: 'smoke-failure-only', status: 'running', summary: '' };
    handleTaskEvent({ type: 'task-failed', taskId: activeTask.id, message: 'Animation routing check only' });
    installedError.taskFailedTriggered = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<8000){const p=window.qiqiPlayback.current;if(p?.id==='error'&&!p.loop&&!window.qiqiPlayback.pending)return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    playAction('idle');
    installedError.autoIdleRestored = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<8000){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    diagnostics.push({check:'installed-error-menu-failure-and-return',...installedError});
    activeTask = null; taskEvents = []; await store.clearAction('error'); broadcast();
  }
  let installedSleep = null;
  if (verifySleep) {
    await store.importAction('sleep', path.resolve(verifySleep));
    broadcast();
    const sleepMenuItem = menu().getMenuItemById('pet-group-rest')?.submenu.getMenuItemById('pet-action-sleep');
    if (!sleepMenuItem) throw new Error('Installed sleep is missing from the rest menu');
    sleepMenuItem.click();
    installedSleep = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='sleep')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='sleep')throw new Error('Sleep menu did not start the installed video');
      const firstTime=video.currentTime,firstFrame=window.qiqiPlayback.frames,until=Date.now()+8000;
      while(video.currentTime<4.6&&Date.now()<until)await new Promise(r=>setTimeout(r,40));
      const surface=document.getElementById('pet-surface'),ctx=surface.getContext('2d');
      const bubble=ctx.getImageData(Math.floor(surface.width*600/720),Math.floor(surface.height*110/720),1,1).data;
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,advanced:video.currentTime>firstTime+3,muted:video.muted,canvasAdvanced:window.qiqiPlayback.mode==='canvas'&&window.qiqiPlayback.frames>firstFrame+40,comicBubbleVisible:bubble[3]>=250,menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-sleep-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedSleep.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<${JSON.stringify(Math.ceil(installedSleep.duration*1000+2000))}){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    diagnostics.push({check:'installed-sleep-menu-comic-bubble-and-return',...installedSleep});
    await store.clearAction('sleep'); broadcast();
  }
  let installedReturn = null;
  if (verifyReturn) {
    await store.importAction('return', path.resolve(verifyReturn));
    broadcast();
    const returnMenuItem = menu().getMenuItemById('pet-group-companion')?.submenu.getMenuItemById('pet-action-return');
    if (!returnMenuItem) throw new Error('Installed return is missing from the companion menu');
    returnMenuItem.click();
    installedReturn = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='return')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='return')throw new Error('Return menu did not start the installed video');
      const firstTime=video.currentTime,firstFrame=window.qiqiPlayback.frames,until=Date.now()+8000;
      while(video.currentTime<5.0&&Date.now()<until)await new Promise(r=>setTimeout(r,40));
      const surface=document.getElementById('pet-surface'),ctx=surface.getContext('2d');
      const bubble=ctx.getImageData(Math.floor(surface.width*620/720),Math.floor(surface.height*160/720),1,1).data;
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,advanced:video.currentTime>firstTime+3,muted:video.muted,canvasAdvanced:window.qiqiPlayback.mode==='canvas'&&window.qiqiPlayback.frames>firstFrame+40,comicHeartVisible:bubble[3]>=250&&bubble[0]>bubble[1]+10,menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-return-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedReturn.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<${JSON.stringify(Math.ceil(installedReturn.duration*1000+2000))}){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    diagnostics.push({check:'installed-return-menu-heart-and-idle',...installedReturn});
    await store.clearAction('return'); broadcast();
  }
  let installedFocus = null;
  if (verifyFocus) {
    if (!['v1', 'v2'].includes(verifyFocusVersion)) throw new Error('Invalid focus verification version');
    const focusProbe = verifyFocusVersion === 'v2' ? { time: 7, x: 115, y: 145 } : { time: 5, x: 620, y: 135 };
    await store.importAction('focus', path.resolve(verifyFocus));
    broadcast();
    const focusMenuItem = menu().getMenuItemById('pet-group-companion')?.submenu.getMenuItemById('pet-action-focus');
    if (!focusMenuItem) throw new Error('Installed focus is missing from the companion menu');
    focusMenuItem.click();
    installedFocus = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='focus')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='focus')throw new Error('Focus menu did not start the installed video');
      const firstTime=video.currentTime,firstFrame=window.qiqiPlayback.frames,until=Date.now()+8000;
      while(video.currentTime<${JSON.stringify(focusProbe.time)}&&Date.now()<until)await new Promise(r=>setTimeout(r,40));
      const surface=document.getElementById('pet-surface'),ctx=surface.getContext('2d');
      const bubble=ctx.getImageData(Math.floor(surface.width*${JSON.stringify(focusProbe.x)}/720),Math.floor(surface.height*${JSON.stringify(focusProbe.y)}/720),1,1).data;
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,advanced:video.currentTime>firstTime+3,muted:video.muted,canvasAdvanced:window.qiqiPlayback.mode==='canvas'&&window.qiqiPlayback.frames>firstFrame+40,version:${JSON.stringify(verifyFocusVersion)},comicEffectVisible:bubble[3]>=250&&(${JSON.stringify(verifyFocusVersion)}==='v2'||bubble[0]>bubble[2]+20&&bubble[1]>bubble[2]+10),menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-focus-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedFocus.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<${JSON.stringify(Math.ceil(installedFocus.duration*1000+2000))}){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    diagnostics.push({check:'installed-focus-menu-effect-and-idle',...installedFocus});
    await store.clearAction('focus'); broadcast();
  }
  let installedCelebrate = null;
  if (verifyCelebrate) {
    await store.importAction('celebrate', path.resolve(verifyCelebrate));
    broadcast();
    const celebrateMenuItem = menu().getMenuItemById('pet-group-companion')?.submenu.getMenuItemById('pet-action-celebrate');
    if (!celebrateMenuItem) throw new Error('Installed celebrate is missing from the companion menu');
    celebrateMenuItem.click();
    installedCelebrate = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='celebrate')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='celebrate')throw new Error('Celebrate menu did not start the installed video');
      const firstTime=video.currentTime,firstFrame=window.qiqiPlayback.frames,until=Date.now()+8000;
      while(video.currentTime<5.0&&Date.now()<until)await new Promise(r=>setTimeout(r,40));
      const surface=document.getElementById('pet-surface'),ctx=surface.getContext('2d');
      const bubble=ctx.getImageData(Math.floor(surface.width*593/720),Math.floor(surface.height*145/720),1,1).data;
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,advanced:video.currentTime>firstTime+3,muted:video.muted,canvasAdvanced:window.qiqiPlayback.mode==='canvas'&&window.qiqiPlayback.frames>firstFrame+40,comicMusicVisible:bubble[3]>=250&&bubble[0]>bubble[1]+10,menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-celebrate-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedCelebrate.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<${JSON.stringify(Math.ceil(installedCelebrate.duration*1000+2000))}){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    const previousFocusSessions = store.state.stats.focusSessions;
    await petWindow.webContents.executeJavaScript('window.petAPI.completeFocus()');
    installedCelebrate.focusCompletionTriggered = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<8000){const p=window.qiqiPlayback.current;if(p?.id==='celebrate'&&!p.loop&&!window.qiqiPlayback.pending)return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    playAction('idle');
    store.state.stats.focusSessions = previousFocusSessions; store.save();
    diagnostics.push({check:'installed-celebrate-menu-music-and-idle',...installedCelebrate});
    await store.clearAction('celebrate'); broadcast();
  }
  let installedPat = null;
  if (verifyPat) {
    await store.importAction('pat', path.resolve(verifyPat));
    broadcast();
    const patMenuItem = menu().getMenuItemById('pet-group-click')?.submenu.getMenuItemById('pet-action-pat');
    if (!patMenuItem) throw new Error('Installed pat is missing from the click-response menu');
    patMenuItem.click();
    installedPat = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='pat')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='pat')throw new Error('Pat menu did not start the installed video');
      const firstTime=video.currentTime,firstFrame=window.qiqiPlayback.frames,until=Date.now()+8000;
      while(video.currentTime<6.0&&Date.now()<until)await new Promise(r=>setTimeout(r,40));
      const surface=document.getElementById('pet-surface'),ctx=surface.getContext('2d');
      const bubble=ctx.getImageData(Math.floor(surface.width*140/720),Math.floor(surface.height*170/720),1,1).data;
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,oneShot:!video.loop,playing:!video.paused,advanced:video.currentTime>firstTime+3,muted:video.muted,canvasAdvanced:window.qiqiPlayback.mode==='canvas'&&window.qiqiPlayback.frames>firstFrame+40,comicBubbleVisible:bubble[3]>=250,handVisible:ctx.getImageData(Math.floor(surface.width*650/720),Math.floor(surface.height*340/720),1,1).data[3]>=250,menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-pat-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedPat.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<${JSON.stringify(Math.ceil(installedPat.duration*1000+2000))}){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    const expectedCount = `${store.state.actions.filter(slot => slot.media).length} / ${store.state.actions.length}`;
    installedPat.managementCount = await panelWindow.webContents.executeJavaScript("document.getElementById('action-count').textContent");
    installedPat.managementCountMatches = installedPat.managementCount === expectedCount;
    diagnostics.push({check:'installed-pat-menu-hand-and-idle',...installedPat});
    await store.clearAction('pat'); broadcast();
  }
  let installedWorking = null;
  if (verifyWorking) {
    await store.importAction('working', path.resolve(verifyWorking));
    broadcast();
    const workingMenuItem = menu().getMenuItemById('pet-action-working');
    if (!workingMenuItem) throw new Error('Installed working is missing from the action menu');
    workingMenuItem.click();
    installedWorking = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(video?.readyState>=2&&window.qiqiPlayback.current?.id==='working')break;await new Promise(r=>setTimeout(r,40));}
      if(!video||window.qiqiPlayback.current?.id!=='working')throw new Error('Working menu did not start the installed video');
      await new Promise(r=>setTimeout(r,800));
      return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,manualOneShot:!video.loop,playing:!video.paused,muted:video.muted,menuPresent:true};
    })()`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-working-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    installedWorking.returnedDefault = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<${JSON.stringify(Math.ceil(installedWorking.duration*1000+2000))}){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    // Exercise the real state/IPC playback path without spawning a Codex task.
    activeTask = { id: 'smoke-playback-only', status: 'running', summary: '' };
    broadcast(); playAction('working');
    const taskLoop = await petWindow.webContents.executeJavaScript(`(async()=>{
      const player=window.qiqiPlayback,start=Date.now();let video;
      while(Date.now()-start<8000){video=document.querySelector('.action-video.is-front');if(player.current?.id==='working'&&player.current.loop&&!player.pending)break;await new Promise(r=>setTimeout(r,40));}
      if(player.current?.id!=='working'||!player.current.loop)throw new Error('Running task did not loop the working action');
      let previous=video.currentTime,looped=false;const firstFrame=player.frames,until=Date.now()+(video.duration+.5)*1000;
      while(Date.now()<until){await new Promise(r=>setTimeout(r,40));if(video.currentTime<previous-.1)looped=true;previous=video.currentTime;}
      return {taskLoop:player.current?.id==='working'&&player.current.loop&&!video.paused,looped,canvasAdvanced:player.mode==='canvas'&&player.frames>firstFrame+12};
    })()`);
    Object.assign(installedWorking,taskLoop);
    activeTask.status = 'cancelled'; broadcast();
    installedWorking.stoppedOnTaskEnd = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<8000){const p=window.qiqiPlayback.current;if(p?.id==='idle'&&p.loop)return true;if(!p&&!document.getElementById('pet-stage').classList.contains('playing'))return true;await new Promise(r=>setTimeout(r,40));}return false;
    })()`);
    diagnostics.push({check:'installed-working-menu-task-loop-and-stop',...installedWorking});
    activeTask = null; await store.clearAction('working'); broadcast();
  }
  let installedDrag = null;
  if (verifyDragDir) {
    if (!/^v\d+$/.test(verifyDragVersion)) throw new Error('Invalid drag verification version');
    const dragFile = kind => path.resolve(verifyDragDir, `drag-${kind}-${verifyDragVersion}.webm`);
    await store.importDragPack({ preview: dragFile('preview'), enter: dragFile('enter'), hold: dragFile('hold'), exit: dragFile('exit') });
    broadcast();
    const dragMenuItem = menu().getMenuItemById('pet-action-drag');
    if (!dragMenuItem) throw new Error('Installed drag is missing from the action menu');
    dragMenuItem.click();
    const previewInfo = await petWindow.webContents.executeJavaScript(`(async()=>{
      const start=Date.now();while(Date.now()-start<8000){const p=window.qiqiPlayback.current;if(p?.id==='drag')return {oneShot:!p.loop,duration:document.querySelector('.action-video.is-front').duration};await new Promise(r=>setTimeout(r,40));}throw new Error('Drag menu preview did not start');
    })()`);
    installedDrag = await petWindow.webContents.executeJavaScript(`(async()=>{
      const reaction=window.qiqiDragReaction, player=window.qiqiPlayback, started=Date.now();
      const waitFor=async(predicate,timeout=8000)=>{const start=Date.now();while(Date.now()-start<timeout){if(predicate())return true;await new Promise(r=>setTimeout(r,40));}return false;};
      await reaction.start();
      const entered=player.current?.id==='drag:enter'&&!player.current.loop;
      const enterDuration=document.querySelector('.action-video.is-front')?.duration;
      const loadMs=Date.now()-started;
      const reachedHold=await waitFor(()=>reaction.phase==='hold'&&player.current?.id==='drag:hold'&&!player.pending);
      if(!reachedHold)throw new Error('Drag did not reach the sustained hold phase');
      const video=document.querySelector('.action-video.is-front');
      const sourceDuration=${JSON.stringify(previewInfo.duration)};
      const waitMs=Math.max(sourceDuration*1000+250-(Date.now()-started),(video.duration+.25)*1000);
      const until=Date.now()+waitMs;let previous=video.currentTime,loopedWhileHeld=false;
      while(Date.now()<until){await new Promise(r=>setTimeout(r,40));if(video.currentTime<previous-.1)loopedWhileHeld=true;previous=video.currentTime;}
      const heldPastSourceDuration=Date.now()-started>sourceDuration*1000&&reaction.held&&reaction.phase==='hold'&&player.current?.id==='drag:hold'&&video.loop&&!video.paused;
      return {entered,reachedHold,heldPastSourceDuration,loopedWhileHeld,width:video.videoWidth,height:video.videoHeight,enterDuration,loadMs,holdDuration:video.duration,elapsedMs:Date.now()-started,reactionState:reaction.state,currentId:player.current?.id,menuPreview:${JSON.stringify(previewInfo.oneShot)}};
    })()`);
    // A task/menu event must not replace the animation while the pointer is held.
    playAction('greeting');
    await new Promise(resolve => setTimeout(resolve, 100));
    installedDrag.heldIgnoresOtherActions = await petWindow.webContents.executeJavaScript(`window.qiqiDragReaction.held&&window.qiqiPlayback.current?.id==='drag:hold'`);
    fs.writeFileSync(path.join(ROOT,'docs','preview-drag-video.png'),(await petWindow.webContents.capturePage()).toPNG());
    const released = await petWindow.webContents.executeJavaScript(`(async()=>{
      const reaction=window.qiqiDragReaction,player=window.qiqiPlayback;
      await reaction.release();
      const playedExit=!reaction.held&&reaction.phase==='exit'&&player.current?.id==='drag:exit'&&!player.current.loop;
      const start=Date.now();while(Date.now()-start<8000){if(reaction.phase==='idle'&&(player.current?.id==='idle'||!player.current))return {playedExit,returnedDefault:true};await new Promise(r=>setTimeout(r,40));}
      return {playedExit,returnedDefault:false};
    })()`);
    Object.assign(installedDrag,released);
    diagnostics.push({check:'installed-drag-hold-release-and-menu',...installedDrag});
    await store.clearAction('drag');
  }
  if (verifyIdle) await store.clearAction('idle');
  await require('../scripts/verify-idle-actions.cjs')({ROOT,store,petWindow,pause,menu,broadcast,setTask:value=>{activeTask=value;broadcast();},playAction,diagnostics});
  const before = petWindow.getBounds();
  await petWindow.webContents.executeJavaScript('window.petAPI.petMoved({dx:-24,dy:-12})');
  await new Promise(resolve => setTimeout(resolve, 80));
  const after = petWindow.getBounds();
  diagnostics.push({ check: 'pet-drag-ipc', moved: before.x !== after.x || before.y !== after.y, emptySlots: store.snapshot().actions.filter(slot => slot.media === null).length });
  const movementScales = [];
  for (const scale of [1.2, 1.45, 1.65, 1.85]) {
    applySettings({ scale });
    const expected = petSize(), samples = [];
    for (let step = 0; step < 80; step++) {
      await petWindow.webContents.executeJavaScript(`window.petAPI.petMoved({dx:${step % 2 ? -7 : 7},dy:${step % 2 ? -5 : 5}})`);
      await new Promise(resolve => setTimeout(resolve, 8));
      samples.push({ ...petWindow.getBounds(), zoom: petWindow.webContents.getZoomFactor() });
    }
    const minWidth = Math.min(...samples.map(sample => sample.width)), maxWidth = Math.max(...samples.map(sample => sample.width));
    const minHeight = Math.min(...samples.map(sample => sample.height)), maxHeight = Math.max(...samples.map(sample => sample.height));
    // Both window edges are converted between DIP and physical pixels. Allow
    // their bounded quantization, but never cumulative growth across moves.
    const edgeRounding = Math.ceil(2 / displayScale);
    movementScales.push({ scale, moves: samples.length, expected, minWidth, maxWidth, minHeight, maxHeight,
      stable: maxWidth-minWidth<=1 && maxHeight-minHeight<=1 && samples.every(sample => Math.abs(sample.width-expected.width)<=edgeRounding && Math.abs(sample.height-expected.height)<=edgeRounding && Math.abs(sample.zoom-scale)<.01) });
  }
  applySettings({ scale: 1.65 });
  const dragSizeStable = movementScales.every(result => result.stable);
  diagnostics.push({ check: 'continuous-drag-keeps-configured-size', displayScale, scales: movementScales, ok: dragSizeStable });
  if (process.argv.includes('--verify-renderer-recovery')) {
    const loadedAgain = () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { petWindow.webContents.removeListener('did-finish-load', loaded); reject(new Error('Pet renderer recovery timed out')); }, 40000);
      const loaded = () => { clearTimeout(timer); resolve(); };
      petWindow.webContents.once('did-finish-load', loaded);
    });
    const inspect = async () => {
      const until = Date.now()+8000;
      while (Date.now()<until) {
        const result = await petWindow.webContents.executeJavaScript(`({ready:!!window.qiqiIdle?.ready,slots:state?.actions?.length,errors:window.__qiqiErrors||[]})`);
        if (result.ready && result.slots === 16 && !result.errors.length) return result;
        await pause(100);
      }
      throw new Error('Recovered renderer did not restore the pet');
    };
    const beforeCrash = petWindow.webContents.getOSProcessId(), afterCrashLoad = loadedAgain();
    petWindow.webContents.forcefullyCrashRenderer(); await afterCrashLoad; await inspect();
    const afterCrash = petWindow.webContents.getOSProcessId();
    if (beforeCrash === afterCrash || !petWindow.isVisible()) throw new Error('Crashed renderer did not restart visibly');
    console.log('Verified renderer crash recovery');
    const hangStart = Date.now(), afterHangLoad = loadedAgain();
    void petWindow.webContents.executeJavaScript('while (true) {}').catch(() => {});
    await afterHangLoad; await inspect();
    const afterHang = petWindow.webContents.getOSProcessId();
    const restored = beforeCrash !== afterCrash && afterCrash !== afterHang && petWindow.isVisible();
    diagnostics.push({check:'renderer-crash-and-unresponsive-recovery',beforeCrash,afterCrash,afterHang,hangRecoveryMs:Date.now()-hangStart,ok:restored});
    if (!restored) throw new Error('Unresponsive pet renderer did not restart');
    console.log('Verified unresponsive renderer recovery');
  }
  fs.writeFileSync(path.join(ROOT, 'docs', 'smoke-result.json'), JSON.stringify(diagnostics, null, 2));
  console.log(JSON.stringify(diagnostics));
  if (!dragSizeStable || !groupedMenuAndSize || !playback.ok || !transition.first || !transition.second || transition.firstFront!==1 || transition.secondFront!==1 || !transition.consistentMediaFrame || !transition.restored || !transition.instantSwap || !transition.canvasOutput || !transition.animated || installedIdle&&(!installedIdle.playing||!installedIdle.loop||!installedIdle.looped||installedIdle.transparentFraction<.1||installedIdle.opaqueFraction<.1) || installedGreeting&&(!installedGreeting.oneShot||!installedGreeting.playing||!installedGreeting.returnedDefault) || installedThinking&&(!installedThinking.oneShot||!installedThinking.playing||!installedThinking.advanced||!installedThinking.muted||!installedThinking.returnedDefault) || installedSuccess&&(!installedSuccess.oneShot||!installedSuccess.playing||!installedSuccess.advanced||!installedSuccess.muted||!installedSuccess.canvasAdvanced||!installedSuccess.returnedDefault||!installedSuccess.taskCompletedTriggered||!installedSuccess.autoIdleRestored) || installedError&&(!installedError.oneShot||!installedError.playing||!installedError.advanced||!installedError.muted||!installedError.canvasAdvanced||!installedError.returnedDefault||!installedError.taskFailedTriggered||!installedError.autoIdleRestored) || installedSleep&&(!installedSleep.oneShot||!installedSleep.playing||!installedSleep.advanced||!installedSleep.muted||!installedSleep.canvasAdvanced||!installedSleep.comicBubbleVisible||!installedSleep.returnedDefault) || installedReturn&&(!installedReturn.oneShot||!installedReturn.playing||!installedReturn.advanced||!installedReturn.muted||!installedReturn.canvasAdvanced||!installedReturn.comicHeartVisible||!installedReturn.returnedDefault) || installedFocus&&(!installedFocus.oneShot||!installedFocus.playing||!installedFocus.advanced||!installedFocus.muted||!installedFocus.canvasAdvanced||!installedFocus.comicEffectVisible||!installedFocus.returnedDefault) || installedCelebrate&&(!installedCelebrate.oneShot||!installedCelebrate.playing||!installedCelebrate.advanced||!installedCelebrate.muted||!installedCelebrate.canvasAdvanced||!installedCelebrate.comicMusicVisible||!installedCelebrate.returnedDefault||!installedCelebrate.focusCompletionTriggered) || installedPat&&(!installedPat.oneShot||!installedPat.playing||!installedPat.advanced||!installedPat.muted||!installedPat.canvasAdvanced||!installedPat.comicBubbleVisible||!installedPat.handVisible||!installedPat.returnedDefault||!installedPat.managementCountMatches) || installedWorking&&(!installedWorking.manualOneShot||!installedWorking.playing||!installedWorking.muted||!installedWorking.returnedDefault||!installedWorking.taskLoop||!installedWorking.looped||!installedWorking.canvasAdvanced||!installedWorking.stoppedOnTaskEnd) || installedDrag&&(!installedDrag.entered||!installedDrag.reachedHold||!installedDrag.heldPastSourceDuration||!installedDrag.loopedWhileHeld||!installedDrag.menuPreview||!installedDrag.heldIgnoresOtherActions||!installedDrag.playedExit||!installedDrag.returnedDefault) || !(before.x !== after.x || before.y !== after.y) || diagnostics.some(item => item.errors?.length || item.ready && (item.ready !== 'complete' || !item.nativeBridge || !item.loadedArt))) app.exit(1);
  else app.quit();
}

const pendingLaunches = [];
function handleLaunch(argv) {
  if (argv.includes('--quit')) { app.quit(); return; }
  if (!petWindow) { pendingLaunches.push(argv); return; }
  dispatchLaunch(argv, { quit: () => app.quit(), show: () => petWindow.showInactive(), panel: createPanel, pomodoro: createPomodoroWindow, usage: createUsage,journal:createJournalWindow });
}
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', (_event, argv) => handleLaunch(argv));
  app.whenReady().then(async () => {
    if (process.argv.includes('--quit')) { app.quit(); return; }
    const firstLaunch = !fs.existsSync(path.join(app.getPath('userData'), 'state.json'));
    store = new PetStore(app.getPath('userData'), app.isPackaged ? app.getPath('documents') : ROOT);
    conversations = new ConversationStore(path.join(app.getPath('userData'),'conversations.json'));
    journal=new JournalStore(path.join(app.getPath('userData'),'journal.json'),{now:()=>Date.now()+(smoke?pomodoroTestOffset:0)});
    garden=new GardenStore(path.join(app.getPath('userData'),'garden.json'),{timeZone:journal.data.timeZone,now:()=>Date.now()+(smoke?pomodoroTestOffset:0)});
    try{gardenLibrary=loadGardenLibrary(ROOT);}catch(error){runtimeLog('garden-library-unavailable',{reason:String(error.message).slice(0,160)});}
    journal.syncGarden(garden.memories());
    if (!smoke && firstLaunch) runtimeLog('bundled-media-installed', await seedBundledMedia(store, ROOT));
    if (!smoke && !firstLaunch) {
      try { runtimeLog('bundled-media-upgraded', await upgradeBundledMedia(store, ROOT)); }
      catch(error) { runtimeLog('bundled-media-upgrade-failed',{reason:String(error.message).slice(0,200)}); }
    }
    const clockFile = path.join(app.getPath('userData'), 'pomodoro.json');
    let savedClock;
    try { if (fs.existsSync(clockFile)) savedClock = JSON.parse(fs.readFileSync(clockFile,'utf8')); } catch { runtimeLog('pomodoro-state-invalid'); }
    pomodoro = createPomodoro({ saved: smoke ? undefined : savedClock, now: () => Date.now()+(smoke ? pomodoroTestOffset : 0),
      onChange(value, { persist }) {
        journal.observe(value,{persist});pushJournal(persist);
        if (persist) { try { fs.writeFileSync(clockFile+'.tmp', JSON.stringify(value,null,2)); fs.renameSync(clockFile+'.tmp',clockFile); } catch { runtimeLog('pomodoro-save-failed'); } }
        for (const win of windows()) { try { win.webContents.send('pet:pomodoro', value); } catch { /* A restarting renderer obtains the current deadline after loading. */ } }
        if (persist) positionPomodoro();
      },
      onComplete(value) {
        if (value.phase === 'focus') { store.increment('focusSessions'); broadcast();pushJournal(true); }
        if (!smoke && !store.state.settings.quietMode && Notification.isSupported()) new Notification({ title: value.phase === 'focus' ? '知栖：这一轮很棒！' : '知栖：休息好啦', body: value.phase === 'focus' ? '专注完成，休息一下吧。' : '准备好后，再一起专注。', silent: true }).show();
      }
    });
    journal.observe(pomodoro.snapshot(),{initial:true,persist:true});
    journalHeartbeat=createJournalHeartbeat({getJournal:()=>journal,onChange:()=>pushJournal(true)});
    pomodoroTick = setInterval(() => {
      pomodoro.tick();journalHeartbeat.tick();
      const now=Date.now();if(store.pendingStats&&(now-lastStatsRetry>=15000||now<lastStatsRetry)){lastStatsRetry=now;if(store.retryStats()){broadcast();pushJournal(true);}}
    }, 250);
    const codexEnvironment = smoke ? { env: process.env, proxySource: 'test' } : await resolveCodexEnvironment();
    codexChildEnv = codexEnvironment.env;
    runtimeLog('codex-network-configured', { proxySource: codexEnvironment.proxySource });
    codexPath = await locateCodex({ env: codexChildEnv });
    doubleClickMs = await doubleClickTime();
    usageService = new UsageService({ codexPath, env: codexChildEnv, ...(smoke ? { read: async () => require('../test/fixtures/usage.cjs')() } : {}) });
    walletReactions = createWalletReactions({ refresh: refreshUsage, hasMedia: id => Boolean(store.state.actions.find(a => a.id === id)?.media), play: playAction, isBusy: () => quitting || activeTask?.status === 'running' || pomodoro.snapshot().phase === 'focus' && ['running','paused'].includes(pomodoro.snapshot().status) });
    runner = new TaskRunner({ cwd: store.state.settings.workspace, codexPath, env: codexChildEnv });
    runner.on('event', handleTaskEvent);
    void refreshRuntime();
    const serveMedia = request => {
      try {
        const url = new URL(request.url);
        if(url.hostname==='garden'){const file=gardenLibrary?.file(url.pathname.slice(1),url.searchParams.get('poster')==='1');return file?mediaResponse(request,file,reason=>runtimeLog('garden-media-error',{reason})):new Response(null,{status:404});}
        if (url.hostname !== 'action') return new Response('Not found', { status: 404 });
        const file = store.mediaPath(url.pathname.slice(1), url.searchParams.get('phase'));
        if (!file) return new Response('Not found', { status: 404 });
        const id=url.pathname.slice(1);
        if(smoke&&(mediaTestFailures.get(id)||0)>0){mediaTestFailures.set(id,mediaTestFailures.get(id)-1);return new Response(null,{status:503,headers:{'Access-Control-Allow-Origin':'*'}});}
        return mediaResponse(request,file,reason=>runtimeLog('media-transport-error',{id:url.pathname.slice(1),reason}));
      } catch (error) { console.error('Media request failed:', error.message); return new Response('Not found', { status: 404 }); }
    };
    protocol.handle('pet-media', serveMedia);
    session.fromPartition('qiqi-panel').protocol.handle('pet-media', serveMedia);
    session.fromPartition('zhixi-journal').protocol.handle('pet-media', serveMedia);
    installIPC(); createPet();
    runtimeLog('started', { version: app.getVersion(), electron: process.versions.electron, pid: process.pid });
    tray = new Tray(trayImage()); tray.setToolTip('知栖 · 你的 Codex 小精灵');
    tray.on('click', () => createUsage()); tray.on('double-click', () => petWindow.showInactive()); tray.on('right-click', () => { void refreshUsage();tray.popUpContextMenu(menu()); });
    screen.on('display-removed', () => petWindow.setBounds(restoreBounds()));
    if(smoke&&process.argv.includes('--verify-quit-draft'))await require('../scripts/verify-exit-draft.cjs')({ROOT,app,createJournalWindow,journal});
    else if(smoke&&process.argv.includes('--verify-shop')){const diagnostics=[];await require('../scripts/verify-shop.cjs')({ROOT,pause:ms=>new Promise(resolve=>setTimeout(resolve,ms)),menu,getWindow:()=>journalWindow,petWindow,getGarden:()=>garden,setGarden:value=>{garden=value;},getJournal:()=>journal,setJournal:value=>{journal=value;},push:pushJournal,broadcast,diagnostics});console.log(JSON.stringify(diagnostics));app.quit();}
    else if(smoke&&process.argv.includes('--preview-shop'))await require('../scripts/verify-shop.cjs')({ROOT,pause:ms=>new Promise(resolve=>setTimeout(resolve,ms)),menu,getWindow:()=>journalWindow,petWindow,getGarden:()=>garden,setGarden:value=>{garden=value;},getJournal:()=>journal,setJournal:value=>{journal=value;},push:pushJournal,broadcast,diagnostics:[],keepOpen:true,previewOnly:true});
    else if (smoke) await runSmokeTest();
    else { handleLaunch(process.argv); for (const argv of pendingLaunches.splice(0)) handleLaunch(argv); }
    if (!smoke) void refreshUsage();
  }).catch(error => { console.error(error?.stack || error?.message || String(error)); if (!smoke) dialog.showErrorBox('知栖暂时无法启动', error.message); app.exit(1); });
  app.on('before-quit', event => {
    if(quitPreparing){event.preventDefault();return;}
    if(!quitPrepared&&isWindowAlive(journalWindow)){
      event.preventDefault();quitting=true;quitPreparing=true;let timeout;
      const flush=Promise.resolve().then(()=>journalWindow.webContents.executeJavaScript(`window.qiqiJournalDrafts?.flushAll?.() ?? true`)).then(ok=>{if(ok===false)runtimeLog('journal-draft-quit-save-failed');});
      Promise.race([flush,new Promise(resolve=>{timeout=setTimeout(()=>{runtimeLog('journal-draft-quit-timeout');resolve();},3000);})]).catch(()=>runtimeLog('journal-draft-quit-unavailable')).finally(()=>{clearTimeout(timeout);quitPreparing=false;quitPrepared=true;app.quit();});return;
    }
    quitting = true; pomodoro?.shutdown();journalHeartbeat?.tick(true);journal?.flush();store?.retryStats(); clearInterval(pomodoroTick); runtimeLog('quitting'); clearTimeout(moveTimer); usageService?.dispose();
    if (store && petWindow && !petWindow.isDestroyed()) { const { x, y } = petWindow.getBounds();try{store.setPosition({ x, y });}catch{runtimeLog('position-save-failed');} }runner?.cancel(activeTask?.id);
  });
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
}
