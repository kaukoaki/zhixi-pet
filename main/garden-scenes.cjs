'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const CROPS=['tomato','strawberry','watermelon'];
const IDS=['garden-plant','garden-water',...CROPS.flatMap(crop=>['grow','bloom','ripe'].map(phase=>`garden-${crop}-${phase}`))];
const phaseFor=progress=>progress>=10?'ripe':progress>=6?'bloom':progress>=3?'leaf':'soil';
function gardenFeedback(before,after,input){
 const result=[];
 for(const prior of before.plots){
  const plot=after.plots.find(item=>item.id===prior.id);if(!plot)continue;
  if(input.type==='plant'&&prior.id===input.plotId&&!prior.plant&&plot.plant)result.push({kind:'clip',id:'garden-plant',plotId:plot.id,crop:plot.plant.crop,phase:'soil'});
  if(input.type==='water'&&prior.plant&&plot.plant&&plot.progress===prior.progress+1){
   const from=phaseFor(prior.progress),to=phaseFor(plot.progress),stage={leaf:'grow',bloom:'bloom',ripe:'ripe'}[to];
   result.push({kind:from!==to?'clip':to==='soil'?'clip':'water',id:from!==to?`garden-${plot.plant.crop}-${stage}`:to==='soil'?'garden-water':null,plotId:plot.id,crop:plot.plant.crop,phase:to});
  }
  if(input.type==='harvest'&&prior.id===input.plotId&&prior.ready&&prior.plant&&!plot.plant)result.push({kind:'harvest',id:`garden-${prior.plant.crop}-harvest`,plotId:prior.id,crop:prior.plant.crop,phase:'ripe'});
 }
 return result;
}
function loadGardenLibrary(root){
 const packed=path.join(root,'assets/library/garden.json'),source=path.join(root,'actions/production/14-garden/runtime.json');
 const file=fs.existsSync(packed)?packed:source,clips=new Map();
 if(!fs.existsSync(file))return{snapshot:()=>({clips:{},available:[]}),file:()=>null};
 const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.clips))throw Error('Invalid garden scene library');
 const verify=(relative,sha)=>{
  if(typeof relative!=='string'||path.isAbsolute(relative)||!relative.startsWith(fs.existsSync(packed)?'assets/library/garden/':'actions/production/14-garden/processed/'))throw Error('Invalid garden scene path');
  const target=path.resolve(root,relative),inside=path.relative(root,fs.realpathSync(target));
  if(inside.startsWith('..')||path.isAbsolute(inside)||!fs.statSync(target).isFile()||!/^[a-f0-9]{64}$/.test(sha||'')||crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==sha)throw Error('Garden scene checksum mismatch');
  return target;
 };
 for(const item of manifest.clips){
  if(!IDS.includes(item.id)||clips.has(item.id)||!Number.isFinite(item.seconds)||item.seconds<=0||item.seconds>60)throw Error('Invalid garden scene entry');
  clips.set(item.id,{...item,video:verify(item.media,item.mediaSha256),image:verify(item.poster,item.posterSha256)});
 }
 return{
  snapshot(){return{clips:Object.fromEntries([...clips].map(([id,item])=>[id,{id,url:`pet-media://garden/${id}`,poster:`pet-media://garden/${id}?poster=1`,seconds:item.seconds}])),available:[...clips.keys(),...CROPS.filter(crop=>clips.has(`garden-${crop}-ripe`)).map(crop=>`garden-${crop}-harvest`)],fruitCounts:manifest.fruitCounts};},
  file(id,poster=false){return clips.get(id)?.[poster?'image':'video']||null;}
 };
}
module.exports={phaseFor,gardenFeedback,loadGardenLibrary,IDS};
