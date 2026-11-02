'use strict';
// Portable asset index. Reads production media; writes only catalog.json with --write.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {SLOT_DEFINITIONS,POMODORO_DEFINITIONS,GARDEN_DEFINITIONS}=require('../main/store.cjs');
const {resolvePomodoroSegments}=require('./pomodoro-library.cjs');
const ROOT=path.resolve(__dirname,'..'),production=path.join(ROOT,'actions','production');
const relative=file=>path.relative(ROOT,file).split(path.sep).join('/');
function local(relativePath){const file=path.resolve(ROOT,relativePath);if(!relative(file).startsWith('actions/production/'))throw new Error('Asset outside production: '+relativePath);return file;}
const hashes=new Map();
function hash(file){if(!hashes.has(file))hashes.set(file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));return hashes.get(file);}
function walk(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(path.join(folder,item.name)):[path.join(folder,item.name)]);}
function main(){
  const externalManifest=path.join(ROOT,'media-assets.json');
  if(fs.existsSync(externalManifest)&&JSON.parse(fs.readFileSync(externalManifest,'utf8')).scope==='current-installed-only'){
    if(process.argv.includes('--write'))throw Error('Current-media catalog is release-managed; update the reviewed catalog and media-assets.json together');
    console.log(JSON.stringify(require('./audit-current-assets.cjs').auditCurrentAssets(ROOT)));return;
  }
  const paths={idle:'00-idle/processed/idle-loop-v1.webm',greeting:'01-greeting/processed/greeting-v1.webm',drag:'02-drag/processed/drag-preview-v2.webm',thinking:'03-thinking/processed/thinking-v1.webm',working:'04-working/processed/working-loop-v1.webm',success:'05-success/processed/success-v1.webm',error:'06-error/processed/error-v1.webm',sleep:'07-sleep/processed/sleep-v1.webm',return:'08-return/processed/return-v1.webm',focus:'09-focus/processed/focus-v2.webm',celebrate:'10-celebrate/processed/celebrate-v1.webm',pat:'11-pat/processed/pat-v1.webm',wallet:'12-wallet/processed/wallet-v1.webm'};
  const variants=JSON.parse(fs.readFileSync(path.join(production,'12-wallet/variants/manifest.json'),'utf8'));
  for(const item of variants.actions){assert.ok(fs.existsSync(local(item.prompt)));paths[item.id]=item.media.replace(/^actions\/production\//,'');}
  const active=[{id:'idle',label:'默认待机'},...SLOT_DEFINITIONS.map(([id,label])=>({id,label}))].map(item=>{
    assert.ok(paths[item.id],'Missing registry entry '+item.id);
    const media='actions/production/'+paths[item.id];assert.ok(fs.existsSync(local(media)),media);
    return {...item,media,...(item.id==='drag'?{phases:Object.fromEntries(['enter','hold','exit'].map(phase=>[phase,`actions/production/02-drag/processed/drag-${phase}-v2.webm`]))}:{})};
  });
  assert.equal(Object.keys(paths).length,active.length,'Every active asset must have a registered action');
  const plannedManifest='actions/production/13-pomodoro/manifest.json',planned=JSON.parse(fs.readFileSync(local(plannedManifest),'utf8'));
  const packSegments=resolvePomodoroSegments(planned),readyClips=packSegments.filter(segment=>segment.media);
  for(const segment of readyClips){
    const definition=POMODORO_DEFINITIONS.find(([id])=>id===segment.id);assert.ok(definition,'Unknown pomodoro clip '+segment.id);
    assert.ok(fs.existsSync(local(segment.media)));active.push({id:segment.id,label:definition[1],media:segment.media});
  }
  const brandingFile=path.join(ROOT,'actions/branding-installation.json');
  if(fs.existsSync(brandingFile)){
    const branding=JSON.parse(fs.readFileSync(brandingFile,'utf8'));
    assert.equal(branding.schemaVersion,1);assert.ok(Array.isArray(branding.actionOverrides));
    const seen=new Set();
    for(const patch of branding.actionOverrides){
      assert.ok(!seen.has(patch.id),'Duplicate branding override');seen.add(patch.id);
      const item=active.find(v=>v.id===patch.id);assert.ok(item,'Unknown branding action '+patch.id);
      assert.ok(patch.replacesSha256?.media?.includes(hash(local(item.media))),'Old bundled identity missing '+patch.id);
      assert.ok(branding.clips.some(c=>c.id===patch.id&&c.media===patch.media&&c.mediaSha256===hash(local(patch.media))),'Unreviewed branding output '+patch.id);
      if(item.phases){
        for(const phase of ['enter','hold','exit']){
          assert.ok(patch.phases?.[phase]&&patch.replacesSha256?.phases?.[phase]?.includes(hash(local(item.phases[phase]))),'Old drag phase identity missing');
          assert.ok(branding.clips.some(c=>c.id==='drag-'+phase&&c.media===patch.phases[phase]&&c.mediaSha256===hash(local(patch.phases[phase]))),'Unreviewed drag phase');
        }
        item.phases=patch.phases;
      }else assert.ok(!patch.phases,'Unexpected phased branding action');
      item.media=patch.media;item.replacesSha256=patch.replacesSha256;
    }
  }
  const activeMedia=new Set(active.flatMap(item=>[item.media,...Object.values(item.phases||{})]));
  const gardenRuntime='actions/production/14-garden/runtime.json',gardenScenes=fs.existsSync(local(gardenRuntime))?JSON.parse(fs.readFileSync(local(gardenRuntime),'utf8')):null;
  if(gardenScenes)for(const item of gardenScenes.clips){assert.equal(hash(local(item.media)),item.mediaSha256);assert.equal(hash(local(item.poster)),item.posterSha256);activeMedia.add(item.media);}
  const assets=walk(production).filter(file=>file.endsWith('.webm')).sort().map(file=>{
    const reportFile=file.replace(/\.webm$/,'.json'),meta=JSON.parse(fs.readFileSync(reportFile,'utf8'));
    const normalized=String(meta.source).replaceAll('\\','/'),marker=normalized.indexOf('/actions/production/');
    assert.ok(normalized.startsWith('actions/production/')||marker>=0,'Source is not archived inside production: '+meta.source);
    const source=normalized.startsWith('actions/production/')?normalized:normalized.slice(marker+1),sourceFile=local(source);assert.ok(fs.existsSync(sourceFile),source);
    assert.equal(hash(sourceFile),meta.source_sha256,'Source checksum '+source);
    assert.equal(fs.statSync(file).size,meta.file_bytes,'Output byte count '+file);
    assert.ok(meta.fps>0&&meta.frames>0&&Math.abs(meta.frames/meta.fps-meta.seconds)<.001,'Duration '+file);
    assert.equal(meta.decoded_alpha_min,0);assert.equal(meta.decoded_alpha_max,255);
    const qa=file.replace(/\.webm$/,'.qa.json');
    return {media:relative(file),source,metadata:relative(reportFile),...(fs.existsSync(qa)?{qa:relative(qa)}:{}),status:activeMedia.has(relative(file))?'active':'history',width:meta.width,height:meta.height,fps:meta.fps,frames:meta.frames,seconds:meta.seconds,bytes:meta.file_bytes,sourceSha256:hash(sourceFile),mediaSha256:hash(file)};
  });
  for(const media of activeMedia)assert.ok(assets.some(item=>item.media===media),'Active media missing report: '+media);
  const plannedIds=planned.batches.flatMap(batch=>batch.segments.map(segment=>segment.id));
  assert.deepEqual(plannedIds,[...POMODORO_DEFINITIONS.map(([id])=>id)]);
  assert.ok(fs.existsSync(local(planned.reference)));for(const batch of planned.batches)if(batch.prompt)assert.ok(fs.existsSync(local(batch.prompt)));
  const plannedPacks=[{family:planned.family,manifest:plannedManifest,status:planned.status,actions:packSegments.filter(segment=>!segment.media).map(segment=>segment.id),readyActions:readyClips.map(segment=>segment.id)}];
  const gardenManifest='actions/production/14-garden/manifest.json',garden=JSON.parse(fs.readFileSync(local(gardenManifest),'utf8'));
  const gardenIds=garden.batches.flatMap(batch=>batch.segments.map(segment=>segment.id));assert.deepEqual(gardenIds,GARDEN_DEFINITIONS.map(([id])=>id));assert.ok(fs.existsSync(path.join(ROOT,garden.reference)));
  for(const batch of garden.batches)assert.ok(fs.existsSync(local(batch.prompt)));
  const readyGarden=gardenScenes?[...gardenScenes.clips.map(item=>item.id),...['tomato','strawberry','watermelon'].map(crop=>`garden-${crop}-harvest`)]:[];
  plannedPacks.push({family:garden.family,manifest:gardenManifest,status:garden.status,actions:gardenIds.filter(id=>!readyGarden.includes(id)),readyActions:readyGarden});
  const catalog={schemaVersion:1,convention:'Each motion keeps source/, processed/, prompt/reference and versioned metadata together; wallet reactions are grouped under 12-wallet/variants/.',actions:active,assets,plannedPacks,...(gardenScenes?{gardenScenes:{manifest:gardenRuntime,clips:gardenScenes.clips.map(item=>item.id)}}:{})};
  const target=path.join(ROOT,'actions/catalog.json');
  if(process.argv.includes('--write'))fs.writeFileSync(target,JSON.stringify(catalog,null,2)+'\n','utf8');
  else assert.deepEqual(JSON.parse(fs.readFileSync(target,'utf8')),catalog,'Catalog is stale; run node scripts/audit-action-library.cjs --write');
  console.log(JSON.stringify({registeredActions:active.length,nonIdleActions:active.length-1,ordinaryActions:SLOT_DEFINITIONS.length,pomodoroClipsReady:readyClips.length,productionVideos:assets.length,historyVersions:assets.filter(item=>item.status==='history').length,sourceChecksumsVerified:true,catalog:relative(target)}));
}
try{main();}catch(error){console.error(error.message);process.exitCode=1;}
