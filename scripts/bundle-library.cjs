'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const {containedFile}=require('../main/bundled-media.cjs');
function bundleLibrary(root, destination) {
  const source=JSON.parse(fs.readFileSync(path.join(root,'actions/catalog.json'),'utf8'));
  const hashes=new Map(source.assets.map(item=>[item.media,item.mediaSha256])),assets=[];
  const copy=(relative,id)=>{
    const input=containedFile(root,relative),sha=crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
    if(sha!==hashes.get(relative))throw new Error('Production asset checksum mismatch: '+id);
    const media=`assets/library/${id}${path.extname(relative)}`,output=path.join(destination,media);
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(input,output);assets.push({media,mediaSha256:sha});return media;
  };
  const actions=source.actions.map(item=>({
    id:item.id,label:item.label,media:copy(item.media,item.id),
    ...(item.phases?{phases:Object.fromEntries(Object.entries(item.phases).map(([phase,relative])=>[phase,copy(relative,`${item.id}-${phase}`)]))}:{}),
    // Digests identify the user's previous bundled bytes, independently of
    // the production paths that are rebased into assets/library at packaging.
    ...(Object.hasOwn(item,'replacesSha256')?{replacesSha256:structuredClone(item.replacesSha256)}:{})
  }));
  fs.writeFileSync(path.join(destination,'assets/library/catalog.json'),JSON.stringify({schemaVersion:1,actions,assets},null,2)+'\n');
  const gardenFile=path.join(root,'actions/production/14-garden/runtime.json');let gardenFiles=0;
  if(fs.existsSync(gardenFile)){
    const garden=JSON.parse(fs.readFileSync(gardenFile,'utf8'));
    const copyGarden=(relative,expected,name)=>{const input=containedFile(root,relative),sha=crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');if(sha!==expected)throw Error('Garden bundle checksum mismatch');const target=`assets/library/garden/${name}`;fs.mkdirSync(path.dirname(path.join(destination,target)),{recursive:true});fs.copyFileSync(input,path.join(destination,target));gardenFiles++;return target;};
    garden.clips=garden.clips.map(item=>({...item,media:copyGarden(item.media,item.mediaSha256,item.id+'.webm'),poster:copyGarden(item.poster,item.posterSha256,item.id+'.png')}));
    fs.writeFileSync(path.join(destination,'assets/library/garden.json'),JSON.stringify(garden,null,2)+'\n');
  }
  return {actions:actions.length,files:assets.length,gardenFiles};
}
module.exports={bundleLibrary};
