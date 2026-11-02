'use strict';
(function(root, factory) {
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.createTaskView=factory;
})(typeof window==='object'?window:globalThis, function createTaskView() {
  const messages=new Map(); let activity=[],thought='',failure='',finished=false;
  const push=value=>{const text=String(value||'').trim();if(text&&activity.at(-1)!==text)activity.push(text);activity=activity.slice(-80);};
  function reset(reply='') {messages.clear();activity=[];thought='';failure='';finished=false;if(reply)messages.set('saved',reply);}
  function apply(event) {
    const id=event.itemId||'answer';
    if(event.type==='message-delta')messages.set(id,typeof event.text==='string'?event.text:(event.replace?'':messages.get(id)||'')+(event.delta||''));
    else if(event.type==='message')messages.set(id,event.text||'');
    else if(event.type==='task-completed'){
      finished=true;
      if(event.text&&[...messages.values()].at(-1)!==event.text)messages.set('final',event.text);
    }else if(event.type==='task-failed'){failure=event.error||event.message||'任务未完成';finished=true;push(failure);}
    else if(event.type==='task-cancelled'){failure='任务已停止。';finished=true;push(failure);}
    else if(event.type==='task-started')push(event.resumed?'正在继续上次对话…':'正在创建新的桌宠对话…');
    else if(event.type==='progress'){
      if(event.phase==='thinking'&&event.isSummary)thought=event.message||'';
      push([event.message,event.output].filter(Boolean).join('\n'));
    }
  }
  function snapshot() {
    const reply=[...messages.values()].filter(Boolean).join('\n\n');
    return {reply,thought,failure,finished,activity:activity.join('\n'),latest:activity.at(-1)||'',display:reply||failure||(finished?'任务已结束。':'等待 Codex 回复…')};
  }
  return {reset,apply,snapshot};
});
