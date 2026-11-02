'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {PetStore}=require('../main/store.cjs');
const {upgradeBundledMedia}=require('../main/bundled-media.cjs');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhixi-upgrade-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const store=new PetStore(path.join(root,'profile'),root),old=path.join(root,'old.webm'),next=path.join(root,'new.webm');
 fs.writeFileSync(old,'old bundled bytes');fs.writeFileSync(next,'new bundled bytes');await store.importAction('idle',old);
 const catalog={actions:[{id:'idle',media:'new.webm',replacesSha256:{media:[hash(old)]}}],assets:[{media:'new.webm',mediaSha256:hash(next)}]};
 return {root,store,old,next,catalog};
}
function nonMedia(state){const s=structuredClone(state);for(const slot of [s.idle,...s.actions,...s.pomodoroActions,...s.gardenActions])delete slot.media;return s;}
test('upgrades known bytes once, backs up raw profile, and preserves personal/unknown fields',async t=>{
 const f=await fixture(t),{store}=f;store.updateSettings({quietMode:true});
 const saved=JSON.parse(fs.readFileSync(store.file));saved.extraUserPreference={keep:true};fs.writeFileSync(store.file,JSON.stringify(saved));
 for(const name of ['garden','journal','pomodoro','conversations'])fs.writeFileSync(path.join(store.directory,name+'.json'),JSON.stringify({keep:name,coins:123}));
 const raw=fs.readFileSync(store.file),oldFile=store.mediaPath('idle'),others=Object.fromEntries(['garden','journal','pomodoro','conversations'].map(n=>[n,hash(path.join(store.directory,n+'.json'))]));
 const result=await upgradeBundledMedia(store,f.root,f.catalog);
 assert.equal(result.updated,1);assert.equal(hash(store.mediaPath('idle')),hash(f.next));assert.ok(fs.existsSync(oldFile));
 assert.deepEqual(fs.readFileSync(path.join(result.backupDirectory,'state.json')),raw);
 assert.deepEqual(nonMedia(JSON.parse(fs.readFileSync(store.file))),nonMedia(saved));
 for(const [name,digest]of Object.entries(others))assert.equal(hash(path.join(store.directory,name+'.json')),digest);
 assert.equal((await upgradeBundledMedia(store,f.root,f.catalog)).updated,0);
 assert.equal(fs.readdirSync(path.join(store.directory,'backups')).length,1);
});
test('unknown custom bytes are retained even under an old bundled filename',async t=>{
 const f=await fixture(t);fs.writeFileSync(f.store.mediaPath('idle'),'custom video');const raw=fs.readFileSync(f.store.file);
 const result=await upgradeBundledMedia(f.store,f.root,f.catalog);assert.equal(result.updated,0);
 assert.equal(fs.readFileSync(f.store.mediaPath('idle'),'utf8'),'custom video');assert.deepEqual(fs.readFileSync(f.store.file),raw);
});
test('checksum failure occurs before state or old media change',async t=>{
 const f=await fixture(t),raw=fs.readFileSync(f.store.file),old=f.store.mediaPath('idle');fs.writeFileSync(f.next,'changed after catalog');
 await assert.rejects(upgradeBundledMedia(f.store,f.root,f.catalog),/checksum/);
 assert.deepEqual(fs.readFileSync(f.store.file),raw);assert.ok(fs.existsSync(old));
});
test('state commit failure rolls back every new file while retaining old profile and bytes',async t=>{
 const f=await fixture(t),raw=fs.readFileSync(f.store.file),before=structuredClone(f.store.state),files=fs.readdirSync(f.store.mediaDirectory),rename=fs.renameSync;
 fs.renameSync=(a,b)=>{if(b===f.store.file)throw Error('simulated commit failure');return rename(a,b);};
 try{await assert.rejects(upgradeBundledMedia(f.store,f.root,f.catalog),/commit failure/);}finally{fs.renameSync=rename;}
 assert.deepEqual(fs.readFileSync(f.store.file),raw);assert.deepEqual(f.store.state,before);assert.deepEqual(fs.readdirSync(f.store.mediaDirectory),files);
});
test('one custom drag phase preserves the entire pack; a fully known pack upgrades together',async t=>{
 const f=await fixture(t),old={},next={};
 for(const part of ['preview','enter','hold','exit']){old[part]=path.join(f.root,'old-'+part+'.webm');next[part]=path.join(f.root,'new-'+part+'.webm');fs.writeFileSync(old[part],'old '+part);fs.writeFileSync(next[part],'new '+part);}
 await f.store.importDragPack(old);
 const phases=Object.fromEntries(['enter','hold','exit'].map(p=>[p,path.basename(next[p])]));
 const catalog={actions:[{id:'drag',media:path.basename(next.preview),phases,replacesSha256:{media:[hash(old.preview)],phases:Object.fromEntries(['enter','hold','exit'].map(p=>[p,[hash(old[p])]]))}}],assets:Object.values(next).map(file=>({media:path.basename(file),mediaSha256:hash(file)}))};
 fs.writeFileSync(f.store.mediaPath('drag','hold'),'custom hold');const raw=fs.readFileSync(f.store.file);
 assert.equal((await upgradeBundledMedia(f.store,f.root,catalog)).updated,0);assert.deepEqual(fs.readFileSync(f.store.file),raw);
 fs.copyFileSync(old.hold,f.store.mediaPath('drag','hold'));assert.equal((await upgradeBundledMedia(f.store,f.root,catalog)).updated,1);
 assert.equal(hash(f.store.mediaPath('drag')),hash(next.preview));for(const p of ['enter','hold','exit'])assert.equal(hash(f.store.mediaPath('drag',p)),hash(next[p]));
});
