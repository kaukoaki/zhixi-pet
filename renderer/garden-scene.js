'use strict';
window.createGardenScene=function({onChange=()=>{}}={}){
 const $=id=>document.getElementById(id),root=$('garden-performance'),video=$('garden-video'),still=$('garden-still'),drops=$('garden-drops'),fruit=$('garden-fruit');
 const glaze=window.qiqiGardenGlaze=window.createGardenGlaze({root,video,still,canvas:$('garden-glaze')});
 const effects=window.createCompanionEffects($('garden-effects'));
 let data,selected=null,active=null,generation=0,settle=null,timers=[],previewPending=null,holding=false;
 const phase=progress=>progress>=10?'ripe':progress>=6?'bloom':progress>=3?'leaf':'soil';
 const cropNames={tomato:'番茄',strawberry:'草莓',watermelon:'西瓜'},icons={tomato:'🍅',strawberry:'🍓',watermelon:'🍉'};
 const clips=()=>data?.sceneLibrary?.clips||{};
 function poster(crop,stage){return clips()[stage==='soil'?'garden-plant':`garden-${crop}-${stage==='leaf'?'grow':stage}`]?.poster;}
 function release(){video.pause();video.removeAttribute('src');video.load();video.onended=video.onerror=video.onplaying=null;root.classList.remove('playing','watering','harvesting');drops.hidden=true;fruit.hidden=true;for(const timer of timers){clearTimeout(timer);clearInterval(timer);}timers=[];glaze.sync();}
 function cancel(refresh=true){generation++;const done=settle;settle=null;release();active=null;holding=false;done?.(false);if(refresh)sync();}
 function setPoster(url){if(url&&still.getAttribute('src')!==url)still.src=url;still.hidden=!url;glaze.sync();}
 function sync(){
  if(!data)return;
  if(active){root.hidden=false;onChange();glaze.sync();return;}
  const plot=data.plots.find(plot=>plot.id===selected&&plot.plant)||data.plots.find(plot=>plot.plant);
  selected=plot?.id||null;const url=plot&&poster(plot.plant.crop,phase(plot.progress));root.hidden=!url;
  if(url){setPoster(url);$('garden-scene-label').textContent=`${cropNames[plot.plant.crop]} · 小田 ${data.plots.indexOf(plot)+1}`;}
  $('skip-garden-scene').hidden=true;onChange();glaze.sync();
 }
 async function present(event,ticket){
  if(ticket!==generation||document.hidden||$('garden-page').hidden)return;
  const clip=clips()[event.id],image=poster(event.crop,event.phase);if(!clip?.url&&!image)return;
  active=event;selected=event.plotId||selected;root.hidden=false;onChange();glaze.sync();
  $('garden-scene-label').textContent=event.preview?'动作预览':`${cropNames[event.crop]||'小花园'}${event.plotId?' · 小田 '+event.plotId.slice(-1):''}`;
  $('skip-garden-scene').hidden=false;
  if((event.kind!=='clip'&&!(event.kind==='harvest'&&clip?.url))||!clip?.url){
   setPoster(image);root.classList.add(event.kind==='harvest'?'harvesting':'watering');
   if(event.kind==='harvest'){fruit.textContent=icons[event.crop]||'✿';fruit.hidden=false;}else drops.hidden=false;
   await new Promise(resolve=>{settle=resolve;timers.push(setTimeout(()=>{settle=null;resolve(true);},event.kind==='harvest'?1300:1700));});
  }else{
   // Keep the current still until a decoded video frame is ready. Never flash white.
   await new Promise(resolve=>{
    let finished=false,lastTime=-1,lastAdvance=performance.now();
    const finish=ok=>{if(finished)return;finished=true;settle=null;resolve(ok);};settle=finish;
    video.muted=true;video.loop=false;video.src=clip.url;
    video.onplaying=()=>{if(ticket===generation){root.classList.add('playing');glaze.sync();}};
    video.onerror=()=>finish(false);
    video.onended=()=>{setPoster(clip.poster||image);finish(true);};
    timers.push(setTimeout(()=>finish(false),Math.min(75,(clip.seconds||30)+8)*1000));
    timers.push(setInterval(()=>{if(video.currentTime!==lastTime){lastTime=video.currentTime;lastAdvance=performance.now();}else if(performance.now()-lastAdvance>5500)finish(false);},500));
    video.play().catch(()=>finish(false));
   });
   if(ticket===generation){setPoster(image||clip.poster);root.classList.remove('playing');}
  }
  if(ticket!==generation)return;
  release();active=null;sync();
 }
 async function play(events){
  cancel(false);const ticket=generation;
  for(const event of events){if(ticket!==generation)break;await present(event,ticket);}
  if(ticket===generation){active=null;sync();}
 }
 function preview({id}){
  if(!data){previewPending={id};return;}
  $('tab-garden').click();const match=/^garden-(tomato|strawberry|watermelon)-(grow|bloom|ripe|harvest)$/.exec(id);
  const crop=match?.[1]||data.plots.find(plot=>plot.id===selected)?.plant?.crop||'tomato';
  const stage=match?.[2]==='grow'?'leaf':match?.[2]==='bloom'?'bloom':match?'ripe':'soil';
  if(!data.sceneLibrary?.available.includes(id))return;
  void play([{id,crop,phase:stage,kind:match?.[2]==='harvest'?'harvest':'clip',preview:true,plotId:null}]);
 }
 $('skip-garden-scene').addEventListener('click',cancel);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 window.addEventListener('pagehide',cancel);
 window.addEventListener('garden-tab-changed',()=>{if($('garden-page').hidden)cancel();});
 return{update(value){data=value;glaze.setStyle(data.appearance?.pot);effects.set(data.appearance?.ornament||'none');if(!holding)sync();if(previewPending){const event=previewPending;previewPending=null;preview(event);}},prepare(){holding=true;},select(id){cancel();selected=id;sync();},play,cancel,preview,get current(){return active?{...active,url:video.currentSrc}:null;},get plotId(){return active?.plotId||selected;},get playing(){return Boolean(active);}};
};
