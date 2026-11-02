'use strict';
const DEFAULT_EXECUTION=Object.freeze({model:null,effort:null,sandbox:'workspace-write',approvalPolicy:'on-request'});
const SANDBOX_MODES=Object.freeze(['read-only','workspace-write','danger-full-access']);
const APPROVAL_POLICIES=Object.freeze(['on-request','never']);
function validateExecutionOptions(current=DEFAULT_EXECUTION,patch={}) {
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('执行设置格式无效。');
  const next={...DEFAULT_EXECUTION,...current};
  for(const key of Object.keys(patch)) {
    if(!Object.hasOwn(DEFAULT_EXECUTION,key))throw new Error('未知的执行设置。');
    const value=patch[key];
    if(key==='model'&&value!==null&&(typeof value!=='string'||value.length>160||!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value)))throw new Error('模型编号格式无效。');
    if(key==='effort'&&value!==null&&(typeof value!=='string'||!/^[a-z][a-z0-9_-]{0,39}$/.test(value)))throw new Error('思考强度格式无效。');
    if(key==='sandbox'&&!SANDBOX_MODES.includes(value))throw new Error('不支持此执行权限。');
    if(key==='approvalPolicy'&&!APPROVAL_POLICIES.includes(value))throw new Error('不支持此审批方式。');
    next[key]=value;
  }
  return next;
}
function resolveExecutionRuntime(runtime,choices,strict=true) {
  const settings=validateExecutionOptions(DEFAULT_EXECUTION,choices||{});
  const model=settings.model||runtime.model||null;
  const descriptor=(runtime.models||[]).find(item=>item.id===model);
  if(strict&&settings.model&&(!descriptor||runtime.catalogStatus!=='ready'))throw new Error('所选模型暂不可用，请刷新模型列表或选择跟随 Codex 配置。');
  if(strict&&settings.effort&&(!descriptor||!descriptor.efforts.some(item=>item.value===settings.effort)))throw new Error('此模型不支持所选思考强度，请重新选择。');
  for(const [key,allowedKey]of[['sandbox','allowedSandboxModes'],['approvalPolicy','allowedApprovalPolicies']]) {
    const allowed=runtime.requirements?.[allowedKey];
    if(strict&&Array.isArray(allowed)&&!allowed.includes(settings[key]))throw new Error('此执行选项不符合当前 Codex 管理策略。');
  }
  const effort=settings.effort||(settings.model?descriptor?.defaultEffort||null:runtime.effort||descriptor?.defaultEffort||null);
  return {...runtime,configuredModel:runtime.model||null,configuredEffort:runtime.effort||null,model,effort,sandbox:settings.sandbox,approvalPolicy:settings.approvalPolicy};
}
module.exports={DEFAULT_EXECUTION,SANDBOX_MODES,APPROVAL_POLICIES,validateExecutionOptions,resolveExecutionRuntime};
