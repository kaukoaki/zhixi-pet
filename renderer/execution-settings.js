'use strict';
window.createExecutionSettings=function({getState,call,notice,api}){
  const $=id=>document.getElementById(id),defaults={model:null,effort:null,sandbox:'workspace-write',approvalPolicy:'on-request'};
  const effortLabels={none:'无额外推理',minimal:'极低',low:'低',medium:'中',high:'高',xhigh:'更高',max:'极高',ultra:'最高'};
  let draft=null,busy=false,refreshing=false;
  function option(value,label,description='',disabled=false){const el=document.createElement('option');el.value=value;el.textContent=label;el.title=description;el.disabled=disabled;return el;}
  function select(id,items,value){
    const field=$(id);field.replaceChildren(...items);
    if(value&&!items.some(item=>item.value===value))field.append(option(value,value+'（暂不可用）','',true));
    field.value=value||'';
  }
  function render(){
    const state=getState();if(!state)return;
    const running=state.task?.status==='running';$('execution-settings-button').disabled=running;
    if($('execution-settings').hidden||!draft)return;
    const runtime=state.codex?.runtime||{},models=runtime.models||[],configured=runtime.configuredModel||runtime.model;
    select('execution-model',[option('',configured?'跟随 Codex 配置 · '+configured:'跟随 Codex 配置'),...models.map(model=>option(model.id,model.label,model.id))],draft.model);
    const model=models.find(model=>model.id===(draft.model||configured));
    const inherited=draft.model?model?.defaultEffort:runtime.configuredEffort||runtime.effort;
    select('execution-effort',[option('',(draft.model?'模型默认':'跟随 Codex')+(inherited?' · '+inherited:'')),...(model?.efforts||[]).map(e=>option(e.value,(effortLabels[e.value]||e.value)+' · '+e.value,e.description))],draft.effort);
    for(const [id,key,requirement]of[['execution-sandbox','sandbox','allowedSandboxModes'],['execution-approval','approvalPolicy','allowedApprovalPolicies']]){
      const allowed=runtime.requirements?.[requirement];
      for(const item of $(id).options)item.disabled=Array.isArray(allowed)&&!allowed.includes(item.value);
      $(id).value=draft[key];
    }
    const note=[];
    if(runtime.catalogStatus!=='ready')note.push('模型列表暂未确认，可刷新后再选。');
    if(draft.sandbox==='danger-full-access')note.push('完全访问允许工作目录外读写。');
    note.push(draft.approvalPolicy==='never'?'不弹审批；超出所选权限的操作会被拒绝。':'需要额外权限时，在任务窗口选择允许或拒绝。');
    $('execution-description').textContent=note.join(' ');
    for(const id of ['execution-model','execution-effort','execution-sandbox','execution-approval','apply-execution','reset-execution','close-execution-settings'])$(id).disabled=busy||running;
    $('refresh-models').disabled=refreshing||busy||running;
  }
  function close(){if(busy)return;$('execution-settings').hidden=true;draft=null;}
  async function refresh(){refreshing=true;render();await call('getRuntime');await call('getState');refreshing=false;render();}
  async function open(){
    if(!getState())await call('getState');const state=getState();if(!state)return;
    if(state.task?.status==='running'){notice('请先完成或停止当前任务。');return;}
    draft={...defaults,...state.execution};$('settings').hidden=true;$('execution-settings').hidden=false;render();$('execution-model').focus();void refresh();
  }
  $('execution-settings-button').addEventListener('click',()=>void open());
  $('close-execution-settings').addEventListener('click',close);
  $('refresh-models').addEventListener('click',()=>void refresh());
  $('execution-model').addEventListener('change',()=>{draft.model=$('execution-model').value||null;draft.effort=null;render();});
  for(const [id,key]of[['execution-effort','effort'],['execution-sandbox','sandbox'],['execution-approval','approvalPolicy']])$(id).addEventListener('change',()=>{draft[key]=$(id).value||null;render();});
  $('reset-execution').addEventListener('click',()=>{draft={...defaults};render();});
  $('apply-execution').addEventListener('click',async()=>{
    if(busy||!draft)return;busy=true;render();
    const result=await call('setExecution',{...draft});busy=false;
    if(result){close();notice('已保存，下次桌宠执行使用这些设置。');}else render();
  });
  api?.onOpenExecutionSettings?.(()=>void open());
  return {render,open,close,get isOpen(){return !$('execution-settings').hidden;}};
};
