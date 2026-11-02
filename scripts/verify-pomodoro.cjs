'use strict';
// Called only by --smoke-test --verify-pomodoro, against the isolated profile.
const fs=require('node:fs'),path=require('node:path'),{screen}=require('electron');
module.exports=async function({ROOT,store,pomodoro,petWindow,panelWindow,pause,menu,broadcast,getWindow,advance,cleanup,diagnostics}){
  const current=JSON.parse(fs.readFileSync(path.join(ROOT,'actions/catalog.json'),'utf8')).actions;
  const fixture=path.join(ROOT,current.find(action=>action.id==='idle').media);
  const actual=process.argv.includes('--verify-pomodoro-media');
  const segments=actual?current.filter(action=>action.id.startsWith('pomodoro-')):[];
  const savedStats=structuredClone(store.state.stats);
  if(actual){for(const segment of segments)await store.importAction(segment.id,path.join(ROOT,segment.media));await store.importAction('success',path.join(ROOT,current.find(action=>action.id==='success').media));}
  else for(const slot of store.state.pomodoroActions)await store.importAction(slot.id,fixture);
  await store.importAction('idle',fixture);broadcast();
  await panelWindow.webContents.executeJavaScript('document.getElementById("pomodoro-button").click()');
  await pause(100);const win=getWindow();
  if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  await pause(200);
  const js=source=>win.webContents.executeJavaScript(source);
  const screenshot=async name=>require('./save-preview.cjs')(win,path.join(ROOT,'docs',`preview-pomodoro-${name}.png`));
  const click=async id=>{await js(`document.getElementById(${JSON.stringify(id)}).click()`);await pause(120);};
  await screenshot('ready');
  await js('document.querySelector(\'[data-minutes="45"]\').click()');
  const selected45=await js('document.getElementById("countdown").textContent === "45:00"');
  await js('document.querySelector(\'[data-minutes="25"]\').click();document.getElementById("primary").click()');await pause(200);
  const started=pomodoro.snapshot();
  const waitPlayback=async(id,urlPart)=>{
    const end=Date.now()+(actual?16000:8000);
    while(Date.now()<end){const ok=await petWindow.webContents.executeJavaScript(`${JSON.stringify(Array.isArray(id)?id:[id])}.includes(window.qiqiPlayback.current?.id)&&(!${JSON.stringify(urlPart)}||window.qiqiPlayback.current?.url.includes(${JSON.stringify(urlPart)}))`);if(ok)return true;await pause(40);}return false;
  };
  const finishClip=async()=>{await petWindow.webContents.executeJavaScript('(()=>{const v=document.querySelector(".action-video.is-front");if(v)v.currentTime=v.duration-.12;})()');await pause(300);};
  const opening=await waitPlayback('pomodoro-start');
  const actualDetails=[];
  const probeActual=async(id,time,probes)=>{
    await petWindow.webContents.executeJavaScript(`(async()=>{const v=document.querySelector('.action-video.is-front'),end=Date.now()+${(time+5)*1000};while(v.currentTime<${time}&&Date.now()<end)await new Promise(r=>setTimeout(r,30));if(v.currentTime<${time-.1})throw new Error('Clip did not reach its effect frame');await new Promise(r=>setTimeout(r,80));})()`);
    const detail=await petWindow.webContents.executeJavaScript(`(()=>{const v=document.querySelector('.action-video.is-front'),s=document.getElementById('pet-surface'),c=s.getContext('2d');const alpha=(x,y)=>c.getImageData(Math.round(s.width*x/640),Math.round(s.height*y/640),1,1).data[3];return {id:${JSON.stringify(id)},width:v.videoWidth,height:v.videoHeight,duration:v.duration,currentTime:v.currentTime,oneShot:!v.loop,muted:v.muted,alpha:Object.fromEntries(Object.entries(${JSON.stringify(probes)}).map(([key,[x,y]])=>[key,alpha(x,y)])),backgroundAlpha:alpha(10,300)};})()`);
    actualDetails.push(detail);fs.writeFileSync(path.join(ROOT,'docs',`preview-${id}.png`),(await petWindow.webContents.capturePage()).toPNG());
  };
  if(actual){
    actualDetails.push(await petWindow.webContents.executeJavaScript(`(()=>{const v=document.querySelector('.action-video.is-front');return {id:window.qiqiPlayback.current?.id,width:v.videoWidth,height:v.videoHeight,duration:v.duration,oneShot:!v.loop,muted:v.muted};})()`));
  }else await finishClip();
  const studyLoop=await waitPlayback('idle','pomodoro-study');await pause(1100);
  if(actual){
    actualDetails.push(await petWindow.webContents.executeJavaScript(`(async()=>{const p=window.qiqiPlayback,v=document.querySelector('.action-video.is-front'),first=p.frames,end=Date.now()+(v.duration+.5)*1000;let previous=v.currentTime,looped=false;while(Date.now()<end){await new Promise(r=>setTimeout(r,50));if(v.currentTime<previous-.1)looped=true;previous=v.currentTime;}return {id:'pomodoro-study',width:v.videoWidth,height:v.videoHeight,duration:v.duration,loop:v.loop,looped,frames:p.frames-first,muted:v.muted};})()`));
    await screenshot('actual-study');fs.writeFileSync(path.join(ROOT,'docs/preview-pomodoro-scene.png'),(await petWindow.webContents.capturePage()).toPNG());
  }
  // The speech tail deliberately projects beyond the card. Check real content, not ::before's scroll extent.
  const layout=await js(`(()=>{const card=document.getElementById('clock-card'),rect=card.getBoundingClientRect();const contentOverflow=[...card.children].filter(el=>!el.hidden).some(el=>{const r=el.getBoundingClientRect();return r.left<rect.left||r.right>rect.right||r.top<rect.top||r.bottom>rect.bottom;});return {countdown:document.getElementById('countdown').textContent,overflow:card.scrollHeight>card.clientHeight||contentOverflow,errors:window.__qiqiErrors};})()`);await screenshot('running');
  await click('primary');const pauseValue=pomodoro.snapshot().remainingMs;await pause(1100);
  const pauseStable=pomodoro.snapshot().status==='paused'&&pomodoro.snapshot().remainingMs===pauseValue;await screenshot('paused');
  await click('primary');const resumed=pomodoro.snapshot().status==='running';
  const petBefore=petWindow.getBounds(),area=screen.getDisplayMatching(petBefore).workArea,positions=[];
  for(const x of[area.x+10,area.x+area.width-petBefore.width-10]){
    petWindow.setBounds({...petBefore,x});await pause(100);const b=win.getBounds(),side=await js('document.body.dataset.side');positions.push({side,inside:b.x>=area.x&&b.x+b.width<=area.x+area.width});
  }
  petWindow.setBounds(petBefore);await click('close');const hiddenStillRuns=!win.isVisible()&&pomodoro.snapshot().status==='running';menu().getMenuItemById('pet-pomodoro-open').click();
  const deadline=pomodoro.snapshot().deadline,reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await reloaded;await pause(120);const reloadKeepsDeadline=pomodoro.snapshot().deadline===deadline;
  advance(250000);await pause(200);
  const occasional=await waitPlayback(['pomodoro-remind','pomodoro-doze','pomodoro-peek']);
  if(actual){
    if(!await waitPlayback('idle','pomodoro-study'))throw new Error('Random study gesture did not return to study');
    for(const [id,time,probes]of[
      ['pomodoro-remind',7.833333,{bubble:[110,180],chair:[470,550],desk:[250,470]}],
      ['pomodoro-doze',5,{exclamation:[150,145],chair:[470,550]}],
      ['pomodoro-peek',6,{heart:[138,225],mouth:[298,305]}]
    ]){
      const item=menu().getMenuItemById('pet-action-'+id);if(!item?.enabled)throw new Error('Missing pomodoro menu action: '+id);item.click();
      if(!await waitPlayback(id))throw new Error('Menu preview did not play: '+id);
      await probeActual(id,time,probes);if(!await waitPlayback('idle','pomodoro-study'))throw new Error('Preview did not return to study: '+id);
    }
  }else await finishClip();
  const returnedStudy=await waitPlayback('idle','pomodoro-study');
  const finishId=actual&&!segments.some(s=>s.id==='pomodoro-finish')?'success':'pomodoro-finish';
  advance(25*60000);await pause(150);const finishing=await waitPlayback(finishId);
  if(actual&&finishId==='pomodoro-finish'){
    const verification=segments.find(segment=>segment.id===finishId).verification;
    await probeActual(finishId,verification?.time??5,verification?.alphaProbes??{bubble:[130,150],detachedDesk:[50,400],chair:[420,560]});
  }else await finishClip();
  const returnedNormal=await waitPlayback('idle','action/idle');
  const exactlyOneTomato=store.state.stats.focusSessions===savedStats.focusSessions+1;pomodoro.tick();await screenshot('completed');
  await click('secondary');const breakStarted=pomodoro.snapshot().phase==='break'&&pomodoro.snapshot().durationMs===300000;await screenshot('break');advance(300001);
  const breakNotCredited=store.state.stats.focusSessions===savedStats.focusSessions+1;pomodoro.command({type:'stop'});cleanup();store.state.stats=savedStats;
  for(const slot of store.state.pomodoroActions)await store.clearAction(slot.id);await store.clearAction('idle');if(actual)await store.clearAction('success');store.save();broadcast();
  const result={selected45,started:started.status==='running'&&started.durationMs===1500000,opening,studyLoop,layout,pauseStable,resumed,positions,hiddenStillRuns,reloadKeepsDeadline,occasional,returnedStudy,finishing,returnedNormal,exactlyOneTomato,breakStarted,breakNotCredited,actualDetails};diagnostics.push({check:'pomodoro-ui-clock-media-and-completion',...result});
  if(actual)fs.writeFileSync(path.join(ROOT,'.cache/pomodoro-media-verification.json'),JSON.stringify(result,null,2));
  if(actual){
    for(const detail of actualDetails){const segment=segments.find(segment=>segment.id===detail.id),meta=JSON.parse(fs.readFileSync(path.join(ROOT,segment.metadata),'utf8'));if(detail.width!==meta.width||detail.height!==meta.height||Math.abs(detail.duration-segment.seconds)>.05||!detail.muted)throw new Error('Actual pomodoro decoder mismatch: '+JSON.stringify(detail));}
    const study=actualDetails.find(detail=>detail.id==='pomodoro-study');
    if(actualDetails.length!==segments.length||!study.looped||study.frames<150||actualDetails.filter(detail=>detail.alpha).some(detail=>!detail.oneShot||detail.backgroundAlpha!==0||Object.values(detail.alpha).some(alpha=>alpha<240)))throw new Error('Actual pomodoro loop or alpha failed: '+JSON.stringify(actualDetails));
  }
  if(!selected45||started.status!=='running'||!opening||!studyLoop||layout.overflow||layout.errors.length||!pauseStable||!resumed||!positions.every(p=>p.inside)||positions[0].side!=='right'||positions[1].side!=='left'||!hiddenStillRuns||!reloadKeepsDeadline||!occasional||!returnedStudy||!finishing||!returnedNormal||!exactlyOneTomato||!breakStarted||!breakNotCredited)throw new Error('Pomodoro verification failed: '+JSON.stringify(result));
  console.log('Verified pomodoro clock, media handoffs, adjacent placement and completion');
};
