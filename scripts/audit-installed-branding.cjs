'use strict';
// Read-only verification of the build or installed runtime against production.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {extractFile,listPackage}=require('@electron/asar');
const ROOT=path.resolve(__dirname,'..');
const installed=process.argv.includes('--installed');
const value=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=f=>hash(fs.readFileSync(f));
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const archive=installed?path.join(process.env.LOCALAPPDATA,'Zhixi/app/resources/app.asar'):path.join(ROOT,'dist/QiqiCodexPet-win32-x64/resources/app.asar');
const get=f=>extractFile(archive,path.normalize(f));
const json=f=>JSON.parse(get(f).toString('utf8'));
const source=read(path.join(ROOT,'actions/catalog.json')),manifest=read(path.join(ROOT,'actions/branding-installation.json'));
const version=read(path.join(ROOT,'package.json')).version;
assert.equal(json('package.json').version,version);
assert.equal(manifest.clips.length,37);
assert.equal(manifest.actionOverrides.length,23);
const catalog=json('assets/library/catalog.json'),garden=json('assets/library/garden.json');
assert.equal(catalog.actions.length,23);assert.equal(catalog.assets.length,26);assert.equal(garden.clips.length,11);
const sourceHashes=new Map(source.assets.map(x=>[x.media,x.mediaSha256]));
for(const action of source.actions){
  const packed=catalog.actions.find(x=>x.id===action.id);assert.ok(packed);
  assert.equal(hash(get(packed.media)),sourceHashes.get(action.media));
  assert.deepEqual(packed.replacesSha256,action.replacesSha256);
  for(const [phase,file] of Object.entries(action.phases||{}))assert.equal(hash(get(packed.phases[phase])),sourceHashes.get(file));
}
const clips=[];
for(const clip of manifest.clips){
  let packedMedia;
  if(clip.id.startsWith('garden-')){
    const entry=garden.clips.find(x=>x.id===clip.id);assert.ok(entry);packedMedia=entry.media;
    assert.equal(entry.posterSha256,clip.lastFrameSha256);assert.equal(hash(get(entry.poster)),clip.lastFrameSha256);
  }else if(/^drag-(enter|hold|exit)$/.test(clip.id))packedMedia=catalog.actions.find(x=>x.id==='drag').phases[clip.id.slice(5)];
  else packedMedia=catalog.actions.find(x=>x.id===clip.id).media;
  assert.equal(hash(get(packedMedia)),clip.mediaSha256);
  assert.equal(digest(path.join(ROOT,clip.media)),clip.mediaSha256);
  clips.push({id:clip.id,sha256:clip.mediaSha256,frames:clip.frames});
}
assert.equal(hash(get(manifest.reference.path)),manifest.reference.sha256);
assert.equal(digest(path.join(ROOT,manifest.reference.path)),manifest.reference.sha256);
assert.ok(get('renderer/portrait.js').toString().includes('qiqi-chibi-v5-knot-sprout.png'));
assert.ok(!listPackage(archive).some(name=>/^[/\\](?:actions|archive|releases|reports|test|docs|scripts|\.git|\.agents|\.cache|\.smoke-data)(?:[/\\]|$)/.test(name)));
const result={status:'pass',mode:installed?'installed':'build',version,archiveSha256:digest(archive),archiveBytes:fs.statSync(archive).size,clips,frames:clips.reduce((n,c)=>n+c.frames,0),gardenPostersVerified:11};
if(installed){
  const profile=path.join(process.env.APPDATA,'QiqiCodexPet'),state=read(path.join(profile,'state.json'));
  const slot=id=>id==='idle'?state.idle:[...state.actions,...state.pomodoroActions,...state.gardenActions].find(x=>x.id===id);
  const bindings=[];
  for(const action of catalog.actions){
    const saved=slot(action.id)?.media;assert.ok(saved,'Missing managed slot: '+action.id);
    for(const part of ['media',...Object.keys(action.phases||{})]){
      const m=part==='media'?saved:saved.phases?.[part];assert.ok(m);
      assert.equal(path.basename(m.file),m.file);
      const file=path.join(profile,'media',m.file),relative=part==='media'?action.media:action.phases[part];
      const expected=catalog.assets.find(x=>x.media===relative).mediaSha256;
      assert.equal(digest(file),expected,'Managed media differs: '+action.id+'/'+part);
      bindings.push({id:action.id,part,sha256:expected});
    }
  }
  result.bindings=bindings;
  const codexRoot=process.env.CODEX_HOME||path.join(process.env.USERPROFILE,'.codex');
  const plugin=path.join(codexRoot,'plugins/cache/zhixi-local/zhixi-pet',version);
  assert.equal(read(path.join(plugin,'plugin.json')).version,version);
  assert.equal(digest(path.join(plugin,'assets/character.png')),manifest.reference.sha256);
  result.pluginVersion=version;
}
if(value('output')){
  const output=path.resolve(ROOT,value('output')),cache=path.join(ROOT,'.cache');
  assert.ok(output.startsWith(cache+path.sep));fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
}
console.log(JSON.stringify({status:result.status,mode:result.mode,version,clips:clips.length,frames:result.frames,bindings:result.bindings?.length,archiveSha256:result.archiveSha256}));
