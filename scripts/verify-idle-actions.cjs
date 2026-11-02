'use strict';
const path=require('node:path');
module.exports=async function({ROOT,store,petWindow,pause,menu,broadcast,setTask,playAction,diagnostics}){
 const fixture=path.join(ROOT,'actions/production/00-idle/processed/idle-loop-v1.webm');
 const js=source=>petWindow.webContents.executeJavaScript(source);
 try{
  for(const id of ['greeting','pat','pomodoro-start'])await store.importAction(id,fixture);
  store.updateSettings({randomIdle:true});petWindow.show();broadcast();
  const played=[],until=Date.now()+30000;
  while(Date.now()<until&&played.length<2){
   const snapshot=await js(`(()=>{const auto=window.qiqiAutoIdle,player=window.qiqiPlayback,video=document.querySelector('.action-video.is-front');const actual=auto.current&&player.current?.id===auto.current;if(actual&&video)video.playbackRate=${played.length===0?8:1};return{auto:auto.current,id:actual?player.current.id:null,loop:player.current?.loop,frames:player.frames};})()`);
   if(snapshot.id&&snapshot.id!==played.at(-1)?.id)played.push(snapshot);
   await pause(60);
  }
  if(played.length!==2||played.some(value=>!['greeting','pat'].includes(value.id)||value.loop)||played[0].id===played[1].id)throw new Error('Random idle did not complete distinct ordinary clips: '+JSON.stringify(played));
  setTask({id:'idle-task-priority-fixture',status:'running',cwd:store.state.settings.workspace});await pause(200);
  const taskTookPriority=await js(`window.qiqiAutoIdle.current===null&&(!window.qiqiPlayback.current||window.qiqiPlayback.current.id==='idle')`);
  setTask(null);await store.importAction('working',fixture);broadcast();playAction('working');await pause(350);broadcast();await pause(120);
  const manualTookPriority=await js(`window.qiqiAutoIdle.current===null&&window.qiqiPlayback.current?.id==='working'&&!window.qiqiPlayback.current.loop`);
  const item=menu().getMenuItemById('pet-random-idle'),menuWasEnabled=item.checked;item.click();await pause(150);
  const preferenceSaved=!store.state.settings.randomIdle&&await js(`!window.qiqiAutoIdle.snapshot.enabled`);
  const result={played,excludedPomodoro:true,taskTookPriority,manualTookPriority,menuWasEnabled,preferenceSaved};
  if(!taskTookPriority||!manualTookPriority||!menuWasEnabled||!preferenceSaved)throw new Error('Random idle priority/toggle failed: '+JSON.stringify(result));
  diagnostics.push({check:'random-idle-real-video-priority-and-preference',...result});
 }finally{
  setTask(null);store.updateSettings({randomIdle:false});
  await js(`document.querySelectorAll('.action-video').forEach(video=>video.playbackRate=1)`);
  playAction('idle');for(const id of ['greeting','pat','working','pomodoro-start'])await store.clearAction(id);broadcast();
 }
};
