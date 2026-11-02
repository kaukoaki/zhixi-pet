'use strict';
(function expose(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.createIdleActions=factory();
})(globalThis,()=>function createIdleActions(options){
  const {getState,isBusy,play,stop}=options;
  const now=options.now||Date.now,later=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
  const random=()=>Math.max(0,Math.min(1-Number.EPSILON,(options.random||Math.random)()));
  const isVisible=options.isVisible||(()=>true);
  let timer=null,due=null,current=null,last=null,bag=[],signature='',epoch=0,disposed=false,started=0;
  const failedUntil=new Map();
  function clear(){if(timer!==null)cancel(timer);timer=null;}
  function arm(delay){clear();timer=later(()=>{timer=null;sync();},delay);}
  function slots(state){
    const excluded=new Set((state?.pomodoroActions||[]).map(slot=>slot.id));
    return [...new Map((state?.actions||[]).filter(slot=>typeof slot.id==='string'&&slot.id!=='idle'&&!slot.id.startsWith('pomodoro-')&&!excluded.has(slot.id)&&slot.media?.url&&(failedUntil.get(slot.id)||0)<=now()).map(slot=>[slot.id,slot])).values()];
  }
  function blocked(state){
    const clock=state?.pomodoro;
    return !state||state.settings?.randomIdle===false||!isVisible()||state.task?.status==='running'||clock?.phase==='focus'&&['running','paused'].includes(clock.status);
  }
  function choose(available){
    const nextSignature=JSON.stringify(available.map(slot=>[slot.id,slot.media.url]));
    if(signature!==nextSignature){signature=nextSignature;bag=[];}
    if(!bag.length){
      bag=available.map(slot=>slot.id);
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      if(bag.length>1&&bag[0]===last)[bag[0],bag[1]]=[bag[1],bag[0]];
    }
    return bag.shift();
  }
  function abandon(){epoch++;current=null;due=null;clear();}
  function sync(){
    clear();if(disposed)return;
    const state=getState(),available=slots(state);
    if(blocked(state)){
      const owned=Boolean(current);abandon();if(owned)stop();return;
    }
    if(current){
      if(!available.some(slot=>slot.id===current.id&&slot.media.url===current.url)){
        abandon();stop();arm(700);
      }
      return;
    }
    if(isBusy()){due=null;arm(700);return;}
    if(!available.length){due=null;if(failedUntil.size)arm(5000);return;}
    if(due===null)due=now()+(started?3000+Math.floor(random()*4000):2500+Math.floor(random()*2000));
    if(now()<due){arm(due-now());return;}
    const id=choose(available),slot=available.find(slot=>slot.id===id),ticket=++epoch;
    current={id,url:slot.media.url};last=id;due=null;started++;
    Promise.resolve().then(()=>{
      if(ticket!==epoch||disposed)return false;
      return play(id);
    }).then(ok=>{
      if(ticket!==epoch||disposed||ok!==false)return;
      failedUntil.set(id,now()+60000);abandon();arm(700);
    }).catch(()=>{
      if(ticket!==epoch||disposed)return;
      failedUntil.set(id,now()+60000);abandon();arm(700);
    });
  }
  function interrupt(){abandon();if(!disposed)arm(700);}
  function touch(){due=null;if(!current)sync();}
  function ended(id){if(current?.id!==id)return;abandon();sync();}
  function failed(id){if(current?.id!==id)return;failedUntil.set(id,now()+60000);abandon();arm(700);}
  function dispose(){abandon();disposed=true;}
  return {sync,interrupt,touch,ended,failed,dispose,get current(){return current?.id||null;},get snapshot(){return{current:current?.id||null,started,nextAt:due,enabled:getState()?.settings?.randomIdle!==false};}};
});
