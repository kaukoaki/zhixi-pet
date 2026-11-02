'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {mediaResponse,parseRange}=require('../main/media-response.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhixi-media-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'video.webm'),bytes=Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');fs.writeFileSync(file,bytes);return{file,bytes};}
test('media GET, HEAD and byte ranges preserve exact bytes and CORS headers',async t=>{
  const {file,bytes}=fixture(t);const full=await mediaResponse(new Request('pet-media://action/idle'),file);
  assert.equal(full.status,200);assert.equal(full.headers.get('content-type'),'video/webm');assert.equal(full.headers.get('access-control-allow-origin'),'*');assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);
  const part=await mediaResponse(new Request('pet-media://action/idle',{headers:{Range:'bytes=5-12'}}),file);
  assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),'bytes 5-12/36');assert.equal(part.headers.get('content-length'),'8');assert.equal(await part.text(),'56789abc');
  const head=await mediaResponse(new Request('pet-media://action/idle',{method:'HEAD',headers:{Range:'bytes=-4'}}),file);assert.equal(head.status,206);assert.equal(head.headers.get('content-length'),'4');assert.equal(await head.text(),'');
});
test('invalid ranges return 416 and missing media returns a bounded 404',async t=>{
  const {file}=fixture(t);for(const range of ['bytes=36-','bytes=8-3','bytes=-0','bytes=1-2,5-8','garbage']){const response=await mediaResponse(new Request('pet-media://action/idle',{headers:{Range:range}}),file);assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),'bytes */36');}
  assert.deepEqual(parseRange('bytes=30-999',36),{start:30,end:35,partial:true});
  const errors=[];const response=await mediaResponse(new Request('pet-media://action/idle'),file+'.missing',reason=>errors.push(reason));assert.equal(response.status,404);assert.deepEqual(errors,['file-missing']);
});
test('an aborted video request does not break the next decoder range request',async t=>{
  const {file}=fixture(t),controller=new AbortController();const first=await mediaResponse(new Request('pet-media://action/idle',{signal:controller.signal}),file);controller.abort();await first.arrayBuffer().catch(()=>{});
  const next=await mediaResponse(new Request('pet-media://action/idle',{headers:{Range:'bytes=0-3'}}),file);assert.equal(next.status,206);assert.equal(await next.text(),'0123');
});
