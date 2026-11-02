'use strict';
// Fault injection is called only from the app's isolated --smoke-test profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function({ROOT,store,pomodoro,pause,menu,broadcast,createUsage,createPomodoroWindow,getWindows,getTask,setTask,handleTaskEvent,play,fetch,setFailures,remainingFailures,hideTimer,diagnostics}){
  const wait=async predicate=>{const end=Date.now()+10000;while(Date.now()<end){if(await predicate())return;await pause(40);}throw new Error('Window/media recovery timed out');};
  const ready=async win=>{await wait(async()=>{if(win.isDestroyed()||win.webContents.isDestroyed())throw new Error('Recovery window was destroyed');if(win.webContents.isLoadingMainFrame())return false;try{return await win.webContents.executeJavaScript('document.readyState==="complete"');}catch{return false;}});await pause(150);};
  const pet=getWindows().pet,js=source=>pet.webContents.executeJavaScript(source),savedTask=getTask();
  const results={check:'destroyed-window-and-media-failure-recovery'};
  createUsage();await ready(getWindows().usage);getWindows().usage.destroy();
  await js('window.petAPI.openPanel()');await ready(getWindows().panel);
  results.reopenAfterUsageDestroyed=true;
  setTask({id:'window-recovery-test',status:'running',prompt:'Isolated recovery fixture',cwd:ROOT,summary:'',startedAt:new Date().toISOString()});
  const replaced=[];
  for(let i=0;i<3;i++){
    const old=getWindows().panel,id=old.id;old.destroy();
    await js('window.petAPI.openPanel()');await ready(getWindows().panel);
    const next=getWindows().panel;assert.notEqual(next.id,id);
    await wait(()=>next.webContents.executeJavaScript('document.getElementById("run-task").disabled'));
    assert.equal(getTask().id,'window-recovery-test');replaced.push(true);
  }
  results.repeatedPanelRecreation=replaced.every(Boolean);
  results.taskPreservedDuringRecreation=getTask().status==='running';
  const recoveringPanel=getWindows().panel;
  const reloaded=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Task renderer recovery timed out')),10000);recoveringPanel.webContents.once('did-finish-load',()=>{clearTimeout(timer);resolve();});});
  recoveringPanel.webContents.forcefullyCrashRenderer();await reloaded;await ready(recoveringPanel);
  await wait(()=>recoveringPanel.webContents.executeJavaScript('document.getElementById("run-task").disabled&&document.getElementById("prompt").value==="Isolated recovery fixture"'));
  results.taskRendererRecovered=true;
  results.gearRemoved=await getWindows().panel.webContents.executeJavaScript('!document.getElementById("settings-button")');
  menu().getMenuItemById('pet-preferences').click();await pause(100);
  results.preferencesStillAccessible=await getWindows().panel.webContents.executeJavaScript('!document.getElementById("settings").hidden');
  await getWindows().panel.webContents.executeJavaScript('document.getElementById("settings").hidden=true');
  pomodoro.command({type:'start',minutes:25});createPomodoroWindow();await ready(getWindows().pomodoro);const deadline=pomodoro.snapshot().deadline;
  getWindows().pomodoro.destroy();await js('window.petAPI.openPomodoro()');await ready(getWindows().pomodoro);
  results.timerPreservedDuringRecreation=pomodoro.snapshot().deadline===deadline;
  pomodoro.command({type:'stop'});hideTimer();
  createUsage();await ready(getWindows().usage);getWindows().usage.destroy();
  await js('window.petAPI.petMoved({dx:1,dy:0})');await pause(80);await js('window.petAPI.showUsage()');await ready(getWindows().usage);
  results.dragAfterUsageDestroyed=true;
  const current=JSON.parse(fs.readFileSync(path.join(ROOT,'actions/catalog.json'),'utf8')).actions;
  await store.importAction('idle',path.join(ROOT,current.find(action=>action.id==='idle').media));
  await store.importAction('working',path.join(ROOT,current.find(action=>action.id==='working').media));broadcast();
  await wait(()=>js('window.qiqiPlayback.current?.id==="idle"&&!window.qiqiPlayback.pending'));
  const source=fs.readFileSync(store.mediaPath('idle')),response=await fetch('pet-media://action/idle',{headers:{Range:'bytes=32-63'}});
  results.rangeStatus=response.status;assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),source.subarray(32,64));
  setFailures('working',2);play('working');
  try{await wait(async()=>remainingFailures('working')===0&&await js('!window.qiqiPlayback.pending&&Boolean(window.qiqiPlayback.current)'));}
  catch(error){fs.writeFileSync(path.join(ROOT,'.cache/window-media-recovery-failure.json'),JSON.stringify({remainingFailures:remainingFailures('working'),player:await js('({current:window.qiqiPlayback.current,pending:window.qiqiPlayback.pending,recoveries:window.qiqiPlayback.recoveries,videos:[...document.querySelectorAll("video")].map(v=>({src:v.src,error:v.error?.code,ready:v.readyState,paused:v.paused,ended:v.ended}))})')},null,2));throw error;}
  results.faultsConsumed=remainingFailures('working')===0;
  results.failedActionKeepsAnimation=await js('(()=>{const p=window.qiqiPlayback;return Boolean(p.current)&&document.getElementById("pet-surface").classList.contains("is-visible");})()');
  results.noTechnicalSpeech=await js('!document.getElementById("speech")&&!document.getElementById("toast").textContent.includes("Object has been destroyed")');
  setFailures('working',0);play('working');await wait(()=>js('window.qiqiPlayback.current?.id==="working"&&!window.qiqiPlayback.pending'));
  const frames=await js('window.qiqiPlayback.frames');await pause(650);results.taskVideoRecovered=await js(`window.qiqiPlayback.current?.loop&&window.qiqiPlayback.frames>${frames}+5`);
  const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{CodexTaskRunner}=require('../main/codex-bridge.cjs');
  const child=new EventEmitter();child.pid=null;child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('close',1));
  const timeoutRunner=new CodexTaskRunner({cwd:ROOT,codexPath:process.execPath,spawnImpl:()=>child,platform:'linux',connectionTimeoutMs:150,stopTimeoutMs:50});
  setTask({id:null,status:'running',prompt:'Connection timeout fixture',cwd:ROOT,summary:''});timeoutRunner.on('event',handleTaskEvent);timeoutRunner.start('Isolated fixture');
  child.stdout.write(JSON.stringify({type:'thread.started',thread_id:'local-only-fixture'})+'\n');child.stderr.write('sampling_error=request timed out retries=1\n');
  await wait(()=>getTask()?.status==='failed');await pause(100);
  results.connectionTimeoutReleasesUI=await getWindows().panel.webContents.executeJavaScript('!document.getElementById("run-task").disabled&&document.getElementById("stop-task").hidden&&document.getElementById("progress").textContent.includes("连接模型")&&!document.getElementById("progress").textContent.includes("sampling_error")');
  results.connectionTimeoutReleasesTask=timeoutRunner.getActiveTasks().length===0;
  const statsBefore=structuredClone(store.state.stats),saveBefore=store.save,quietBefore=store.state.settings.quietMode;
  try{
    store.save=()=>{throw Error('Synthetic stats save failure');};store.state.settings.quietMode=true;
    setTask({id:'stats-failure-fixture',status:'running',cwd:ROOT,summary:''});
    handleTaskEvent({type:'task-completed',taskId:'stats-failure-fixture',text:'统计写盘失败也要保留本次回复。'});
    results.statsFailureKeepsCompletion=getTask()?.status==='completed'&&getTask()?.summary.includes('保留本次回复')&&store.pendingStats===true;
    store.save=saveBefore;store.state.settings.quietMode=quietBefore;
    const completed=store.state.stats.completedTasks;results.statsRetrySavedOnce=store.retryStats()&&store.retryStats()&&store.state.stats.completedTasks===completed&&JSON.parse(fs.readFileSync(store.file,'utf8')).stats.completedTasks===completed&&!store.statsWarning;
  }finally{store.save=saveBefore;store.state.settings.quietMode=quietBefore;store.state.stats=statsBefore;store.save();}
  await require('./save-preview.cjs')(getWindows().panel,path.join(ROOT,'docs/preview-task-no-gear.png'));
  const errors=await js('window.__qiqiErrors');results.rendererErrors=errors;assert.equal(errors.length,0);
  for(const [key,value]of Object.entries(results))if(typeof value==='boolean')assert.equal(value,true,key);
  setTask(savedTask);play('idle');await store.clearAction('working');await store.clearAction('idle');broadcast();
  await js('window.petAPI.showUsage()');await ready(getWindows().usage);getWindows().panel.hide();
  fs.writeFileSync(path.join(ROOT,'.cache/window-media-recovery-verification.json'),JSON.stringify(results,null,2));diagnostics.push(results);
  console.log('Verified destroyed auxiliary windows, preserved task/timer, 206 media ranges and decoder fallback');
};
