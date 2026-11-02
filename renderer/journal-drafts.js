'use strict';
(function expose(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory;
 else root.createJournalDrafts=factory;
})(globalThis,function createJournalDrafts({save,onChange=()=>{},delay=700,setTimeout:later=setTimeout,clearTimeout:cancel=clearTimeout}){
 const entries=new Map(),timers=new Map(),flights=new Map();
 const revision=value=>Number.isSafeInteger(value)&&value>=0?value:0;
 const same=(a,b)=>a.note===b.note&&a.mood===b.mood;
 const changed=date=>onChange(date);
 function clear(date){if(timers.has(date))cancel(timers.get(date));timers.delete(date);}
 function schedule(date){clear(date);timers.set(date,later(()=>{timers.delete(date);void flush(date).catch(()=>{});},delay));}
 function fromRemote(data){
  const remote=revision(data.draftRevision),draft=data.draft;
  const version=draft?revision(draft.revision):remote,highest=Math.max(remote,version);
  return{date:data.date,note:draft?.note??data.day.note,mood:draft?.mood??data.day.mood,revision:version,remoteRevision:highest,acknowledgedRevision:version,tombstone:draft?0:remote,dirty:Boolean(draft),saving:false,error:false};
 }
 function accept(data){
  const next=fromRemote(data),current=entries.get(data.date);
  if(!current){entries.set(data.date,next);changed(data.date);return get(data.date);}
  if(data.draft&&next.revision<=current.tombstone){changed(data.date);return get(data.date);}
  const pending=current.dirty&&current.revision>current.acknowledgedRevision,knownRemote=current.remoteRevision;
  current.remoteRevision=Math.max(current.remoteRevision,next.remoteRevision);
  if(pending){
   if(data.draft&&next.revision===current.revision&&same(current,next)){
    current.acknowledgedRevision=Math.max(current.acknowledgedRevision,next.revision);current.error=false;
   }else if(next.remoteRevision>=current.revision){
    if(next.remoteRevision>=Number.MAX_SAFE_INTEGER)current.error=true;
    else{current.revision=next.remoteRevision+1;current.error=false;schedule(data.date);}
   }
  }else if(next.remoteRevision>=knownRemote&&next.remoteRevision>=current.revision){
   const saving=current.saving,tombstone=Math.max(current.tombstone,next.tombstone);Object.assign(current,next,{saving,tombstone});
  }
  changed(data.date);return get(data.date);
 }
 function edit(date,patch){
  const entry=entries.get(date);if(!entry)return null;
  const highest=Math.max(entry.revision,entry.remoteRevision);
  if(highest>=Number.MAX_SAFE_INTEGER)throw Error('草稿版本异常，请重新打开手账。');
  Object.assign(entry,patch,{revision:highest+1,dirty:true,error:false});schedule(date);changed(date);return get(date);
 }
 function get(date){const entry=entries.get(date);return entry?{...entry}:null;}
 async function flush(date){
  clear(date);if(flights.has(date))return flights.get(date);
  const entry=entries.get(date);if(!entry||!entry.dirty||entry.revision<=entry.acknowledgedRevision)return get(date);
  const operation=(async()=>{
   entry.saving=true;entry.error=false;changed(date);
   try{
    while(entry.dirty&&entry.revision>entry.acknowledgedRevision){
     const input={date,note:entry.note,mood:entry.mood,revision:entry.revision};
     const result=await save(input);
     if(result?.saved){
      entry.acknowledgedRevision=Math.max(entry.acknowledgedRevision,input.revision);
      entry.remoteRevision=Math.max(entry.remoteRevision,revision(result.revision),input.revision);
     }else if(result?.stale){
      const highest=Math.max(entry.revision,entry.remoteRevision,revision(result.revision));
      if(highest>=Number.MAX_SAFE_INTEGER)throw Error('草稿版本异常，请重新打开手账。');
      entry.remoteRevision=highest;entry.revision=highest+1;
     }else throw Error('草稿没有保存成功。');
     changed(date);
    }
    entry.error=false;return get(date);
   }catch(error){entry.error=true;throw error;}
   finally{entry.saving=false;changed(date);}
  })();
  flights.set(date,operation);
  try{return await operation;}finally{if(flights.get(date)===operation)flights.delete(date);}
 }
 async function flushAll(){let saved=true;for(const date of entries.keys())try{await flush(date);}catch{saved=false;}return saved;}
 function committed(date,capture){
  const entry=entries.get(date);if(!entry)return;
  entry.remoteRevision=Math.max(entry.remoteRevision,capture.revision);
  entry.tombstone=Math.max(entry.tombstone,capture.revision);
  if(entry.revision===capture.revision&&same(entry,capture)){
   entry.dirty=false;entry.error=false;entry.acknowledgedRevision=Math.max(entry.acknowledgedRevision,capture.revision);clear(date);
  }
  changed(date);
 }
 return{accept,edit,get,flush,flushAll,committed};
});
