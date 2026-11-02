'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function auditCurrentAssets(root){
  const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
  const manifest=read('media-assets.json'),catalog=read('actions/catalog.json');
  const branding=read('actions/branding-installation.json'),garden=read('actions/production/14-garden/runtime.json');
  assert.equal(manifest.scope,'current-installed-only');
  const expected=new Map(),clipMedia=new Map(branding.clips.map(c=>[c.media,c.mediaSha256]));
  const assetHashes=new Map(catalog.assets.map(a=>[a.media,a.mediaSha256]));
  const add=(relative,hash)=>{
    assert.ok(typeof relative==='string'&&relative.startsWith('actions/production/')&&relative.includes('/processed/'));
    assert.ok(!relative.includes('\\')&&!relative.includes(':')&&!relative.split('/').some(p=>!p||p==='.'||p==='..'));
    assert.match(hash,/^[a-f0-9]{64}$/);assert.ok(!expected.has(relative),'Duplicate current asset');expected.set(relative,hash);
  };
  for(const action of catalog.actions)for(const media of [action.media,...Object.values(action.phases||{})]){
    assert.equal(clipMedia.get(media),assetHashes.get(media),'Unreviewed current action');add(media,assetHashes.get(media));
  }
  for(const clip of garden.clips){assert.equal(clipMedia.get(clip.media),clip.mediaSha256);add(clip.media,clip.mediaSha256);add(clip.poster,clip.posterSha256);}
  assert.equal(clipMedia.size,branding.clips.length,'Duplicate reviewed clip');
  assert.equal([...expected].filter(([name])=>name.endsWith('.webm')).length,branding.clips.length);
  const seen=new Set();
  for(const entry of manifest.files){
    assert.ok(expected.has(entry.path),'Non-current file declared in current-media manifest');
    assert.ok(!seen.has(entry.path),'Duplicate declared asset');seen.add(entry.path);
    assert.equal(entry.sha256,expected.get(entry.path));
    const file=path.resolve(root,entry.path),physical=fs.realpathSync(file),inside=path.relative(fs.realpathSync(root),physical);
    assert.ok(inside&&!inside.startsWith('..')&&!path.isAbsolute(inside),'Asset escaped repository');
    assert.equal(fs.statSync(file).size,entry.bytes);assert.equal(sha(file),entry.sha256);
  }
  assert.equal(seen.size,expected.size,'Missing current media declaration');
  assert.equal(sha(path.join(root,branding.reference.path)),branding.reference.sha256);
  return {scope:manifest.scope,registeredActions:catalog.actions.length,productionVideos:branding.clips.length,historyVersions:0,originalVideos:0,gardenPosters:garden.clips.length,verifiedFiles:seen.size,currentChecksumsVerified:true};
}
if(require.main===module){try{console.log(JSON.stringify(auditCurrentAssets(path.resolve(__dirname,'..'))));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={auditCurrentAssets};
