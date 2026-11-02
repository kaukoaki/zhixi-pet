'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {readRuntime,normalizeRuntime}=require('../main/codex-runtime.cjs');
const {normalizeModels,normalizeRequirements}=require('../main/codex-runtime.cjs');
test('runtime normalization exposes only configured model and local execution fields, without guessing a model or treating a marker as a shell',()=>{
  const runtime=normalizeRuntime({model:'user-selected-model',model_reasoning_effort:'ultra',model_providers:{secret:'private'}},{cwd:process.cwd(),platform:'win32',env:{CODEX_SHELL:'1'}});
  assert.equal(runtime.model,'user-selected-model');assert.equal(runtime.effort,'ultra');assert.equal(runtime.shell,null);assert.equal(runtime.platform,'Windows');assert.equal(runtime.sandbox,'workspace-write');assert.doesNotMatch(JSON.stringify(runtime),/private|model_providers/);
  assert.equal(normalizeRuntime({},{}).model,null);
});
test('runtime RPC reads effective workspace config only and never starts a turn or exposes provider credentials',async()=>{
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();let buffer='',killed=false;const requests=[];child.kill=()=>{killed=true;};
  child.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const r=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);requests.push(r);if(r.id)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:r.id,result:r.id===1?{}:r.id===2?{config:{model:'actual-model',model_reasoning_effort:'high',provider_token:'private'}}:r.id===3?{data:[{id:'actual-model',displayName:'Configured model',supportedReasoningEfforts:[{reasoningEffort:'high',description:'Deep reasoning'}],defaultReasoningEffort:'high'}],nextCursor:null}:{requirements:{allowedApprovalPolicies:['onRequest','never'],allowedSandboxModes:['readOnly','workspaceWrite']}}})+'\n'));}});
  const result=await readRuntime({cwd:process.cwd(),codexPath:'codex.exe',spawnImpl:(_exe,args,opts)=>{assert.deepEqual(args,['app-server','--listen','stdio://']);assert.equal(opts.shell,false);return child;}});
  assert.equal(result.model,'actual-model');assert.equal(killed,true);assert.deepEqual(requests.map(r=>r.method),['initialize','initialized','config/read','model/list','configRequirements/read']);assert.equal(requests.find(r=>r.method==='config/read').params.cwd,process.cwd());assert.doesNotMatch(JSON.stringify(result),/private/);
  assert.equal(result.models[0].id,'actual-model');assert.deepEqual(result.models[0].efforts.map(e=>e.value),['high']);assert.equal(result.catalogStatus,'ready');assert.deepEqual(result.requirements.allowedSandboxModes,['read-only','workspace-write']);
});
test('a stalled config connection times out and closes its owned child',async()=>{
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();let killed=false;child.kill=()=>{killed=true;};
  await assert.rejects(readRuntime({codexPath:'codex.exe',timeoutMs:10,spawnImpl:()=>child}),/超时/);assert.equal(killed,true);
});

test('catalog normalization follows returned model capabilities, filters hidden entries and drops provider data',()=>{
  const models=normalizeModels([{id:'a',displayName:'Visible',defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low',description:'Fast'}],secret:'private'},{id:'b',hidden:true},{id:'a',model:'a',supportedReasoningEfforts:[{reasoningEffort:'high'}]}]);
  assert.equal(models.length,1);assert.deepEqual(models[0].efforts.map(e=>e.value),['high']);assert.doesNotMatch(JSON.stringify(models),/private|secret/);
  assert.deepEqual(normalizeRequirements({allowedApprovalPolicies:['onRequest','never'],allowedSandboxModes:['readOnly','workspaceWrite'],secret:'private'}),{allowedApprovalPolicies:['on-request','never'],allowedSandboxModes:['read-only','workspace-write']});
});

test('catalog pagination preserves all pages and optional requirements failures do not erase known configuration',async()=>{
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};let buffer='';const cursors=[];
  child.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const r=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);if(!r.id)continue;let reply={id:r.id,result:{}};
    if(r.id===2)reply.result={config:{model:'a',model_reasoning_effort:'high'}};
    if(r.id===3){cursors.push(r.params.cursor||null);reply.result={data:[{id:r.params.cursor?'b':'a'}],nextCursor:r.params.cursor?null:'page-two'};}
    if(r.id===4)reply={id:r.id,error:{code:-32601,message:'unavailable'}};
    queueMicrotask(()=>child.stdout.write(JSON.stringify(reply)+'\n'));
  }});
  const result=await readRuntime({codexPath:'codex.exe',spawnImpl:()=>child});assert.deepEqual(cursors,[null,'page-two']);assert.deepEqual(result.models.map(m=>m.id),['a','b']);assert.equal(result.catalogStatus,'ready');assert.equal(result.model,'a');assert.equal(result.requirementsStatus,'unavailable');
});
