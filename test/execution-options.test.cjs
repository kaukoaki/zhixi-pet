'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DEFAULT_EXECUTION,validateExecutionOptions,resolveExecutionRuntime}=require('../main/execution-options.cjs');
const {PetStore}=require('../main/store.cjs');
const runtime={status:'ready',model:'model-a',effort:'ultra',catalogStatus:'ready',models:[{id:'model-a',defaultEffort:'low',efforts:[{value:'low'},{value:'ultra'}]},{id:'model-b',defaultEffort:'medium',efforts:[{value:'low'},{value:'medium'}]}],requirements:null};
test('model selection uses that model default and rejects unsupported efforts instead of inventing capabilities',()=>{
  const chosen=resolveExecutionRuntime(runtime,{model:'model-b',effort:null,sandbox:'read-only',approvalPolicy:'never'});
  assert.equal(chosen.model,'model-b');assert.equal(chosen.effort,'medium');assert.equal(chosen.configuredModel,'model-a');assert.equal(chosen.configuredEffort,'ultra');assert.equal(chosen.sandbox,'read-only');assert.equal(chosen.approvalPolicy,'never');
  assert.equal(resolveExecutionRuntime(runtime,DEFAULT_EXECUTION).effort,'ultra');
  assert.throws(()=>resolveExecutionRuntime(runtime,{model:'model-b',effort:'ultra'}),/不支持/);
  assert.throws(()=>resolveExecutionRuntime(runtime,{model:'invented-model'}),/暂不可用/);
  assert.throws(()=>resolveExecutionRuntime({...runtime,catalogStatus:'error'},{model:'model-a'}),/刷新/);
});
test('invalid policies, argument-like model ids, unexpected fields and unmanaged permission values are rejected',()=>{
  for(const patch of [{model:'--help'},{model:'a\napproval_policy=never'},{effort:'bad value'},{sandbox:'external'},{approvalPolicy:'untrusted'},{approvalPolicy:false},{ignoreRules:true}])assert.throws(()=>validateExecutionOptions(DEFAULT_EXECUTION,patch));
  assert.deepEqual(validateExecutionOptions(),DEFAULT_EXECUTION);
  assert.equal(validateExecutionOptions(DEFAULT_EXECUTION,{sandbox:'danger-full-access',approvalPolicy:'never'}).sandbox,'danger-full-access');
});
test('admin requirements constrain selectable approval and sandbox modes',()=>{
  const constrained={...runtime,requirements:{allowedSandboxModes:['read-only'],allowedApprovalPolicies:['never']}};
  assert.throws(()=>resolveExecutionRuntime(constrained,DEFAULT_EXECUTION),/管理策略/);
  assert.equal(resolveExecutionRuntime(constrained,{sandbox:'read-only',approvalPolicy:'never'}).sandbox,'read-only');
});
test('execution preferences persist per workspace without changing conversation data or other settings',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhixi-execution-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const store=new PetStore(path.join(root,'profile'),root),before=store.snapshot(),other=path.join(root,'other');
  store.updateExecutionOptions(root,{model:'model-a',effort:'low',sandbox:'read-only',approvalPolicy:'never'});
  const reloaded=new PetStore(store.directory,root);
  assert.equal(reloaded.executionOptions(root).model,'model-a');assert.equal(reloaded.executionOptions(root).approvalPolicy,'never');assert.deepEqual(reloaded.executionOptions(other),DEFAULT_EXECUTION);
  for(const key of ['actions','pomodoroActions','settings','stats','idle'])assert.deepEqual(reloaded.state[key],before[key]);
  const saved=JSON.stringify(reloaded.state.executionProfiles);t.mock.method(reloaded,'save',()=>{throw Error('disk full');});
  assert.throws(()=>reloaded.updateExecutionOptions(root,{model:'model-b'}),/disk full/);assert.equal(JSON.stringify(reloaded.state.executionProfiles),saved);
});
