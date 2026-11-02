'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {bundleLibrary}=require('../scripts/bundle-library.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

function fixture(t){
  const parent=fs.realpathSync(os.tmpdir());
  const directory=fs.mkdtempSync(path.join(parent,'zhixi-branding-bundle-'));
  t.after(()=>{
    const resolved=fs.realpathSync(directory);
    assert.equal(path.dirname(resolved),parent);
    assert.ok(path.basename(resolved).startsWith('zhixi-branding-bundle-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  const root=path.join(directory,'source'),destination=path.join(directory,'packed');
  const write=(relative,content)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);return file;};
  const assets=[];
  const media=(relative,content)=>{write(relative,content);assets.push({media:relative,mediaSha256:hash(content)});return relative;};
  const oldIdle=media('actions/production/history/old-idle.webm','old idle bytes');
  media('actions/production/history/unused.webm','unreferenced history bytes');
  const idle=media('actions/production/00-idle/processed/idle-branding-v2.webm','new idle bytes');
  const greeting=media('actions/production/01-greeting/processed/greeting-v1.webm','unchanged greeting bytes');
  const drag=media('actions/production/02-drag/processed/drag-preview-branding-v2.webm','new drag preview bytes');
  const phases=Object.fromEntries(['enter','hold','exit'].map(phase=>[phase,media(`actions/production/02-drag/processed/drag-${phase}-branding-v2.webm`,`new drag ${phase} bytes`)]));
  const replaces={media:[hash('old drag preview bytes')],phases:Object.fromEntries(['enter','hold','exit'].map(phase=>[phase,[hash(`old drag ${phase} bytes`)]]))};
  const catalog={schemaVersion:1,actions:[
    {id:'idle',label:'待机',media:idle,replacesSha256:{media:[hash('old idle bytes')]}},
    {id:'greeting',label:'问候',media:greeting},
    {id:'drag',label:'拖动',media:drag,phases,replacesSha256:replaces}
  ],assets};
  write('actions/catalog.json',JSON.stringify(catalog));
  const gardenMedia='actions/production/14-garden/processed/plant-branding-v2.webm';
  const gardenPoster='actions/production/14-garden/processed/plant-branding-v2.last-frame.png';
  write(gardenMedia,'new garden video bytes');write(gardenPoster,'new garden end poster bytes');
  write('actions/production/14-garden/processed/plant-old.png','old poster bytes');
  const garden={schemaVersion:1,fruitCounts:{tomato:3},clips:[{
    id:'garden-plant',seconds:2,media:gardenMedia,mediaSha256:hash('new garden video bytes'),
    poster:gardenPoster,posterSha256:hash('new garden end poster bytes')
  }]};
  write('actions/production/14-garden/runtime.json',JSON.stringify(garden));
  return {root,destination,write,catalog,garden,replaces,oldIdle};
}

test('packaging rebases active media paths while retaining old bundled byte identities',t=>{
  const f=fixture(t),before=fs.readFileSync(path.join(f.root,'actions/catalog.json'));
  assert.deepEqual(bundleLibrary(f.root,f.destination),{actions:3,files:6,gardenFiles:2});
  const packed=JSON.parse(fs.readFileSync(path.join(f.destination,'assets/library/catalog.json'),'utf8'));
  const idle=packed.actions.find(action=>action.id==='idle'),drag=packed.actions.find(action=>action.id==='drag');
  assert.equal(idle.media,'assets/library/idle.webm');
  assert.deepEqual(idle.replacesSha256,{media:[hash('old idle bytes')]});
  assert.equal(drag.media,'assets/library/drag.webm');
  assert.deepEqual(drag.phases,{enter:'assets/library/drag-enter.webm',hold:'assets/library/drag-hold.webm',exit:'assets/library/drag-exit.webm'});
  assert.deepEqual(drag.replacesSha256,f.replaces);
  assert.equal(Object.hasOwn(packed.actions.find(action=>action.id==='greeting'),'replacesSha256'),false);
  for(const asset of packed.assets){
    assert.equal(hash(fs.readFileSync(path.join(f.destination,asset.media))),asset.mediaSha256);
  }
  assert.deepEqual(fs.readFileSync(path.join(f.root,'actions/catalog.json')),before);
});

test('only active media and the paired garden end poster enter the runtime library',t=>{
  const f=fixture(t);bundleLibrary(f.root,f.destination);
  const packed=JSON.parse(fs.readFileSync(path.join(f.destination,'assets/library/catalog.json'),'utf8'));
  assert.equal(packed.assets.length,6);
  assert.ok(!packed.assets.some(asset=>asset.mediaSha256===hash('old idle bytes')));
  assert.equal(fs.existsSync(path.join(f.destination,'actions')),false);
  assert.equal(fs.existsSync(path.join(f.destination,'assets/library/old-idle.webm')),false);
  const garden=JSON.parse(fs.readFileSync(path.join(f.destination,'assets/library/garden.json'),'utf8'));
  assert.equal(garden.clips[0].media,'assets/library/garden/garden-plant.webm');
  assert.equal(garden.clips[0].poster,'assets/library/garden/garden-plant.png');
  assert.equal(hash(fs.readFileSync(path.join(f.destination,garden.clips[0].poster))),f.garden.clips[0].posterSha256);
  assert.equal(hash(fs.readFileSync(path.join(f.destination,garden.clips[0].media))),f.garden.clips[0].mediaSha256);
  assert.deepEqual(garden.fruitCounts,f.garden.fruitCounts);
});

test('a changed active video or stale garden poster checksum rejects the bundle',t=>{
  const first=fixture(t);
  first.write(first.catalog.actions[0].media,'changed active idle bytes');
  assert.throws(()=>bundleLibrary(first.root,first.destination),/Production asset checksum mismatch: idle/);
  const second=fixture(t);
  second.write(second.garden.clips[0].poster,'changed garden poster bytes');
  assert.throws(()=>bundleLibrary(second.root,second.destination),/Garden bundle checksum mismatch/);
});
