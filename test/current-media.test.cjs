'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {auditCurrentAssets}=require('../scripts/audit-current-assets.cjs');
const {bundleLibrary}=require('../scripts/bundle-library.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhixi-current-media-'));
  t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});});
  const write=(name,content)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);};
  const files=[['actions/production/idle/processed/new.webm','new idle'],['actions/production/14-garden/processed/new.webm','new garden'],['actions/production/14-garden/processed/end.png','new poster']];
  for(const [name,content] of files)write(name,content);
  write('assets/character/current.png','current character');
  const manifest={schemaVersion:1,scope:'current-installed-only',files:files.map(([name,content])=>({path:name,bytes:Buffer.byteLength(content),sha256:hash(content)}))};
  const catalog={schemaVersion:1,actions:[{id:'idle',label:'idle',media:files[0][0]}],assets:[{media:files[0][0],mediaSha256:hash(files[0][1])}]};
  const branding={reference:{path:'assets/character/current.png',sha256:hash('current character')},clips:files.slice(0,2).map(([media,content])=>({media,mediaSha256:hash(content)}))};
  const garden={schemaVersion:1,clips:[{id:'garden-plant',seconds:2,media:files[1][0],mediaSha256:hash(files[1][1]),poster:files[2][0],posterSha256:hash(files[2][1])}]};
  const save=(name,value)=>write(name,JSON.stringify(value));
  save('media-assets.json',manifest);save('actions/catalog.json',catalog);save('actions/branding-installation.json',branding);save('actions/production/14-garden/runtime.json',garden);
  return {root,manifest,catalog,files,write,save};
}
test('current media verifies and packages without any original or historical video',t=>{
  const f=fixture(t);assert.equal(auditCurrentAssets(f.root).verifiedFiles,3);
  const result=bundleLibrary(f.root,path.join(f.root,'packed'));assert.equal(result.files,1);assert.equal(result.gardenFiles,2);
});
test('an existing original or historical video cannot enter the current-media declaration',t=>{
  const f=fixture(t),name='actions/production/idle/source/original.mp4';f.write(name,'original');
  f.manifest.files.push({path:name,bytes:8,sha256:hash('original')});f.save('media-assets.json',f.manifest);
  assert.throws(()=>auditCurrentAssets(f.root),/Non-current file/);
});
test('a catalog cannot replace the reviewed current video with a historical version',t=>{
  const f=fixture(t),media='actions/production/idle/processed/old.webm';f.write(media,'old');
  f.catalog.actions[0].media=media;f.catalog.assets.push({media,mediaSha256:hash('old')});f.save('actions/catalog.json',f.catalog);
  assert.throws(()=>auditCurrentAssets(f.root),/Unreviewed current action/);
});
test('changed current media or a duplicate declaration fails verification',t=>{
  const f=fixture(t);f.write(f.files[2][0],'changed');assert.throws(()=>auditCurrentAssets(f.root));
  f.write(f.files[2][0],f.files[2][1]);f.manifest.files.push(f.manifest.files[0]);f.save('media-assets.json',f.manifest);
  assert.throws(()=>auditCurrentAssets(f.root),/Duplicate declared asset/);
});

test('undeclared old versions and prompts cannot hide in the production folder',t=>{
  for(const name of ['actions/production/idle/processed/old.webm','actions/production/idle/prompt.txt']){
    const f=fixture(t);f.write(name,'private production material');
    assert.throws(()=>auditCurrentAssets(f.root),/Non-current file in production/);
  }
});
