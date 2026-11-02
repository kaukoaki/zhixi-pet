'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {loadCandidates,inside}=require('../scripts/audit-branding-playback.cjs');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'branding-media-audit-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const name of ['source.webm','output.webm','reference.png'])fs.writeFileSync(path.join(root,name),name);
  const report={id:'idle',source:'source.webm',output:'output.webm',reference:'reference.png',frames:12,fps:24,
    width:720,height:720,sourceAlphaPreservedBeforeEncoding:true,encodedAlpha:{verifiedFrames:12,maxError:1}};
  for(const key of ['source','output','reference'])report[key+'Sha256']=sha(path.join(root,report[key]));
  const write=()=>{fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report));return {reports:[{path:'report.json',sha256:sha(path.join(root,'report.json'))}]};};
  return {root,report,write};
}
test('playback audit binds media identity to alpha evidence and timing',t=>{
  const f=fixture(t),manifest=f.write(),clips=loadCandidates(f.root,manifest);
  assert.equal(clips[0].frames,12);assert.equal(clips[0].width,720);
  fs.appendFileSync(path.join(f.root,'output.webm'),'changed');
  assert.throws(()=>loadCandidates(f.root,manifest),/media changed/);
});
test('missing, stale or failed alpha audits cannot enter playback candidates',t=>{
  const f=fixture(t);
  for(const alpha of [undefined,{verifiedFrames:12},{verifiedFrames:11,maxError:1},{verifiedFrames:12,maxError:2}]){
    f.report.encodedAlpha=alpha;
    assert.throws(()=>loadCandidates(f.root,f.write()),/alpha audit failed/);
  }
});
test('changed reports and duplicate ids are rejected before renderer launch',t=>{
  const f=fixture(t),m=f.write();
  fs.appendFileSync(path.join(f.root,'report.json'),' ');
  assert.throws(()=>loadCandidates(f.root,m),/report changed/);
  const fresh=f.write();fresh.reports.push(fresh.reports[0]);
  assert.throws(()=>loadCandidates(f.root,fresh),/Duplicate/);
});
test('paths stay inside the project',t=>{
  const f=fixture(t);
  assert.throws(()=>inside(f.root,'../other.webm'),/escapes/);
  assert.throws(()=>inside(f.root,path.resolve(f.root,'source.webm')),/relative path/);
});
test('candidate dimensions and timing are required',t=>{
  const f=fixture(t);
  f.report.width=undefined;
  assert.throws(()=>loadCandidates(f.root,f.write()),/dimensions/);
  f.report.width=720;f.report.fps=0;
  assert.throws(()=>loadCandidates(f.root,f.write()),/timing/);
});
test('a junction cannot redirect media reads or a new audit output outside the project',t=>{
  const f=fixture(t),outside=fs.mkdtempSync(path.join(os.tmpdir(),'branding-audit-outside-'));
  t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
  fs.writeFileSync(path.join(outside,'media.webm'),'external test fixture');
  fs.symlinkSync(outside,path.join(f.root,'bridge'),process.platform==='win32'?'junction':'dir');
  assert.throws(()=>inside(f.root,'bridge/media.webm'),/through a link/);
  assert.throws(()=>inside(f.root,'bridge/new-output/profile'),/through a link/);
  assert.equal(inside(f.root,'new-output/profile'),path.join(fs.realpathSync(f.root),'new-output/profile'));
});
