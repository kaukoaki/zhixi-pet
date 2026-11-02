'use strict';
module.exports=async function({runner,panel,pause,setTask,diagnostics}){
  const threadId='01234567-89ab-4cde-8f01-23456789abcd',sent=[];
  const task={id:'approval-ui-fixture',cwd:process.cwd(),threadId,turnId:'fixture-turn',runtime:{approvalPolicy:'on-request'},items:new Map(),approvals:new Map(),child:{stdin:{write:value=>sent.push(JSON.parse(value))}}};
  runner.interactive.tasks.set(task.id,task);setTask({id:task.id,cwd:task.cwd,threadId,status:'running',approvals:[],runtime:null});
  try{
    const request=id=>runner.interactive._request(task,{id,method:'item/commandExecution/requestApproval',params:{threadId,turnId:task.turnId,itemId:'fixture-command',command:'echo smoke-only',reason:'Synthetic UI test; no command is executed.'}});
    request(401);await pause(120);
    const visible=await panel.webContents.executeJavaScript(`!document.getElementById('approval-dialog').hidden&&document.getElementById('approval-detail').textContent.includes('smoke-only')`);
    const waitingForUser=sent.length===0;
    await panel.webContents.executeJavaScript(`document.getElementById('approval-accept').click()`);await pause(120);
    const accepted=sent.length===1&&sent[0].id===401&&sent[0].result.decision==='accept';
    const closedAfterAccept=await panel.webContents.executeJavaScript(`document.getElementById('approval-dialog').hidden`);
    request(402);await pause(100);await panel.webContents.executeJavaScript(`document.getElementById('approval-decline').click()`);await pause(120);
    const declined=sent.length===2&&sent[1].id===402&&sent[1].result.decision==='decline';
    const closedAfterDecline=await panel.webContents.executeJavaScript(`document.getElementById('approval-dialog').hidden`);
    const result={visible,waitingForUser,accepted,closedAfterAccept,declined,closedAfterDecline};
    if(Object.values(result).some(value=>!value))throw new Error('Approval UI/IPC failed: '+JSON.stringify(result));
    diagnostics.push({check:'approval-buttons-and-request-roundtrip',...result});
  }finally{clearTimeout(task.timer);runner.interactive.tasks.delete(task.id);setTask(null);}
};
