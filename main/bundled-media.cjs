'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function containedFile(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Bundled media requires a relative path');
  const file = path.resolve(root, relative), inside = path.relative(root, file);
  if (inside.startsWith('..') || path.isAbsolute(inside) || !fs.statSync(file).isFile()) throw new Error('Invalid bundled media path');
  return file;
}
function loadLibrary(root) {
  const packed = path.join(root, 'assets/library/catalog.json');
  const file = fs.existsSync(packed) ? packed : path.join(root, 'actions/catalog.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
async function seedBundledMedia(store, root, catalog = loadLibrary(root)) {
  const digests = new Map(catalog.assets.map(item => [item.media, item.mediaSha256]));
  const seen = new Set(), jobs = [];
  const verify = relative => {
    const file = containedFile(root, relative), expected = digests.get(relative);
    if (!/^[a-f0-9]{64}$/.test(expected || '') || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) throw new Error('Bundled media checksum mismatch');
    return file;
  };
  for (const item of catalog.actions) {
    if (seen.has(item.id)) throw new Error('Duplicate bundled action');
    seen.add(item.id);
    if (store.slot(item.id).media) continue;
    const file = verify(item.media);
    const phases = item.phases && Object.fromEntries(Object.entries(item.phases).map(([phase, relative]) => [phase, verify(relative)]));
    if (phases && (item.id !== 'drag' || !['enter','hold','exit'].every(phase => phases[phase]))) throw new Error('Incomplete bundled drag pack');
    jobs.push({ id: item.id, file, phases });
  }
  const before = structuredClone(store.state), raw = fs.existsSync(store.file) ? fs.readFileSync(store.file) : null;
  const existing = new Set(fs.readdirSync(store.mediaDirectory));
  try {
    for (const job of jobs) {
      if (job.phases) await store.importDragPack({ preview: job.file, ...job.phases });
      else await store.importAction(job.id, job.file);
    }
  } catch (error) {
    store.state = before;
    for (const file of fs.readdirSync(store.mediaDirectory)) if (!existing.has(file)) fs.unlinkSync(path.join(store.mediaDirectory, file));
    if (raw) fs.writeFileSync(store.file, raw); else if (fs.existsSync(store.file)) fs.unlinkSync(store.file);
    throw error;
  }
  return { installed: jobs.length, skipped: catalog.actions.length - jobs.length };
}

const SHA256 = /^[a-f0-9]{64}$/;
const PHASES = ['enter', 'hold', 'exit'];
const MEDIA_MIMES = { '.webm':'video/webm', '.mp4':'video/mp4', '.mov':'video/quicktime' };
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function profileChild(directory, relative) {
  const root = fs.realpathSync(directory), target = path.resolve(root, relative);
  let ancestor = target;
  const tail = [];
  while (!fs.existsSync(ancestor)) {
    tail.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('Invalid profile path');
    ancestor = parent;
  }
  const physical = path.resolve(fs.realpathSync(ancestor), ...tail), inside = path.relative(root, physical);
  if (inside === '..' || inside.startsWith('..'+path.sep) || path.isAbsolute(inside)) throw new Error('Upgrade path escaped profile');
  return physical;
}
function stateSlot(state, id) {
  return id === 'idle' ? state.idle : [...(state.actions||[]), ...(state.pomodoroActions||[]), ...(state.gardenActions||[])].find(slot=>slot.id===id);
}
function replacementHashes(value) {
  if (!Array.isArray(value) || value.some(hash=>typeof hash!=='string'||!SHA256.test(hash))) throw new Error('Invalid bundled replacement checksums');
  return new Set(value);
}

// Upgrades only byte-identical older bundled assets. Custom media is never
// inferred from a filename. No existing managed file is deleted by this path.
async function upgradeBundledMedia(store, root, catalog = loadLibrary(root)) {
  const digests = new Map(catalog.assets.map(item=>[item.media,item.mediaSha256]));
  const seen = new Set(), jobs = [], skippedDetails = [];
  const skip = (id, reason) => skippedDetails.push({id,reason});
  const verify = relative => {
    const file = containedFile(root,relative), physical = fs.realpathSync(file);
    const inside = path.relative(fs.realpathSync(root),physical), expected = digests.get(relative);
    if (inside==='..'||inside.startsWith('..'+path.sep)||path.isAbsolute(inside)) throw new Error('Bundled upgrade source escaped project');
    const extension=path.extname(physical).toLowerCase(), stat=fs.statSync(physical);
    if (!MEDIA_MIMES[extension]||!stat.size||stat.size>500*1024*1024||!SHA256.test(expected||'')||digest(physical)!==expected) throw new Error('Bundled upgrade checksum mismatch');
    return {source:physical,hash:expected,extension,mime:MEDIA_MIMES[extension]};
  };
  for (const item of catalog.actions) {
    if (seen.has(item.id)) throw new Error('Duplicate bundled action');
    seen.add(item.id);
    const policy=item.replacesSha256;
    if (!policy) { skip(item.id,'no-upgrade-policy'); continue; }
    if (typeof policy!=='object'||Array.isArray(policy)) throw new Error('Invalid bundled replacement policy');
    const slot=store.slot(item.id);
    if (!slot.media) { skip(item.id,'empty'); continue; }
    const parts=[{key:'media',relative:item.media,old:policy.media}];
    if (item.phases) {
      if (item.id!=='drag'||!PHASES.every(phase=>typeof item.phases[phase]==='string')) throw new Error('Incomplete bundled drag pack');
      parts.push(...PHASES.map(phase=>({key:phase,relative:item.phases[phase],old:policy.phases?.[phase]})));
    } else if (item.id==='drag') throw new Error('Bundled drag upgrade requires every phase');
    let allCurrent=true, custom=false;
    for (const part of parts) {
      const old=replacementHashes(part.old), expected=digests.get(part.relative);
      if (!SHA256.test(expected||'')) throw new Error('Missing bundled upgrade checksum');
      const managed=part.key==='media'?slot.media:slot.media.phases?.[part.key];
      const file=part.key==='media'?store.mediaPath(item.id):store.mediaPath(item.id,part.key);
      if (!managed||!file) { custom=true; break; }
      part.previous={...managed};part.previousFile=file;part.previousHash=digest(file);
      if (part.previousHash!==expected) allCurrent=false;
      if (part.previousHash!==expected&&!old.has(part.previousHash)) { custom=true; break; }
    }
    if (custom) { skip(item.id,'custom-or-incomplete'); continue; }
    if (allCurrent) { skip(item.id,'already-current'); continue; }
    for (const part of parts) Object.assign(part,verify(part.relative));
    jobs.push({id:item.id,parts});
  }
  if (!jobs.length) return {updated:0,skipped:catalog.actions.length,backupDirectory:null,details:skippedDetails};
  if (store.loadWarning) throw new Error('Profile could not be fully read; bundled upgrade refused');
  const profile=fs.realpathSync(store.directory), media=profileChild(profile,'media');
  if (media!==fs.realpathSync(store.mediaDirectory)||path.dirname(profileChild(profile,path.basename(store.file)))!==profile) throw new Error('Invalid upgrade profile layout');
  if (!fs.existsSync(store.file)) throw new Error('Existing media requires a saved profile');
  const originalRaw=fs.readFileSync(store.file), disk=JSON.parse(originalRaw.toString('utf8'));
  if (!disk||typeof disk!=='object'||Array.isArray(disk)) throw new Error('Invalid saved profile');
  const originalState=JSON.stringify(store.state), nextState=structuredClone(store.state), nextDisk=structuredClone(disk);
  for (const job of jobs) {
    const saved=stateSlot(nextDisk,job.id);
    if (!saved?.media||job.parts.some(part=>(part.key==='media'?saved.media:saved.media.phases?.[part.key])?.file!==part.previous.file)) throw new Error('Saved media changed before upgrade');
    for (const part of job.parts) {
      const previous=profileChild(profile,path.join('media',part.previous.file));
      if (previous!==fs.realpathSync(part.previousFile)) throw new Error('Managed upgrade media escaped profile');
      part.prepared={file:`${job.id}-${part.key}-bundled-${crypto.randomUUID()}${part.extension}`,name:path.basename(part.source),mime:part.mime};
    }
    const updated={...job.parts[0].prepared};
    if(job.parts.length>1)updated.phases=Object.fromEntries(job.parts.slice(1).map(part=>[part.key,part.prepared]));
    stateSlot(nextState,job.id).media=structuredClone(updated);
    saved.media=structuredClone(updated);
  }
  const backupDirectory=profileChild(profile,path.join('backups',`bundled-media-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}`));
  fs.mkdirSync(path.join(backupDirectory,'media'),{recursive:true});
  fs.mkdirSync(path.join(backupDirectory,'staging'));
  fs.writeFileSync(path.join(backupDirectory,'state.json'),originalRaw,{flag:'wx'});
  fs.writeFileSync(path.join(backupDirectory,'state.memory.json'),originalState,{flag:'wx'});
  const manifest={schemaVersion:1,status:'prepared',actions:jobs.map(job=>({id:job.id,parts:job.parts.map(part=>({part:part.key,previousFile:part.previous.file,previousSha256:part.previousHash,newFile:part.prepared.file,newSha256:part.hash}))}))};
  const saveManifest=()=>fs.writeFileSync(path.join(backupDirectory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const created=[],stateTemporary=profileChild(profile,`state.bundled-${crypto.randomUUID()}.tmp`);
  let committed=false;
  try {
    const backed=new Set();
    for(const job of jobs)for(const part of job.parts){
      if(!backed.has(part.previous.file)){
        const backup=path.join(backupDirectory,'media',part.previous.file);
        await fs.promises.copyFile(part.previousFile,backup);
        if(digest(backup)!==part.previousHash)throw new Error('Managed media changed during backup');
        backed.add(part.previous.file);
      }
      const staged=path.join(backupDirectory,'staging',part.prepared.file);
      await fs.promises.copyFile(part.source,staged);
      if(digest(staged)!==part.hash)throw new Error('Bundled upgrade copy checksum mismatch');
    }
    saveManifest();
    if(JSON.stringify(store.state)!==originalState||!fs.readFileSync(store.file).equals(originalRaw))throw new Error('Profile changed during bundled upgrade');
    for(const job of jobs)for(const part of job.parts){
      if(digest(part.previousFile)!==part.previousHash)throw new Error('Managed media changed during upgrade');
      const destination=profileChild(profile,path.join('media',part.prepared.file));
      fs.renameSync(path.join(backupDirectory,'staging',part.prepared.file),destination);created.push(destination);
    }
    fs.writeFileSync(stateTemporary,JSON.stringify(nextDisk,null,2)+'\n',{flag:'wx'});
    fs.renameSync(stateTemporary,store.file);
    committed=true;store.state=nextState;
    manifest.status='committed';
    let backupStatusWarning=null;
    try{saveManifest();}catch(error){backupStatusWarning=String(error.message);}
    return {updated:jobs.length,updatedIds:jobs.map(job=>job.id),skipped:catalog.actions.length-jobs.length,backupDirectory,retainedPreviousMedia:new Set(jobs.flatMap(job=>job.parts.map(part=>part.previous.file))).size,details:skippedDetails,...(backupStatusWarning?{backupStatusWarning}:{})};
  } catch(error) {
    if(!committed){
      for(const file of created)try{fs.unlinkSync(file);}catch{/* New orphan only; old profile/media remain usable. */}
      try{fs.unlinkSync(stateTemporary);}catch{}
      manifest.status='failed';manifest.error=String(error.message);
      try{saveManifest();}catch{}
    }
    throw error;
  }
}
module.exports = { containedFile, loadLibrary, seedBundledMedia, upgradeBundledMedia };
