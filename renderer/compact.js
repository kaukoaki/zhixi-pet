'use strict';
window.__qiqiErrors = [];
window.addEventListener('error', event => window.__qiqiErrors.push(event.message));
window.addEventListener('unhandledrejection', event => window.__qiqiErrors.push(String(event.reason?.message || event.reason)));
const $ = id => document.getElementById(id);
const api = window.petAPI;
const labels = { greeting: '打个招呼', drag: '被你拎起来', thinking: '想一想', working: '认真工作', success: '完成啦', error: '有点小状况', sleep: '偷偷打个盹', return: '你回来啦', focus: '一起加油', celebrate: '值得庆祝', pat: '摸摸头', wallet: '查看钱包' };
let state;
let noticeTimer;
let lastStorageWarning=null;
let taskId;
let logs = [];
let handingOff = false;
const taskView=window.createTaskView();
let conversationId, runtimeCwd;
let handoffMessage='';
const executionSettings=window.createExecutionSettings({getState:()=>state,call:(...args)=>call(...args),notice,api});
let approvalBusy=false;
function renderApproval(){
  const approval=state?.task?.approvals?.[0];$('approval-dialog').hidden=!approval;
  if(!approval)return;
  $('execution-settings').hidden=true;
  $('approval-title').textContent={command:'命令执行审批',files:'文件变更审批',permissions:'额外权限审批'}[approval.kind]||'需要你批准';
  $('approval-detail').textContent=approval.detail;
  $('approval-accept').textContent=approval.acceptLabel||'允许本次';
  $('approval-accept').disabled=approvalBusy||!approval.canAccept;
  $('approval-decline').disabled=approvalBusy;$('approval-stop').disabled=approvalBusy;
}
for(const[id,decision]of[['approval-accept','accept'],['approval-decline','decline']])$(id).addEventListener('click',async()=>{
  const approval=state?.task?.approvals?.[0];if(!approval||approvalBusy)return;
  approvalBusy=true;renderApproval();await call('respondApproval',{approvalId:approval.id,decision});approvalBusy=false;renderApproval();
});
$('approval-stop').addEventListener('click',()=>call('cancelTask'));

function notice(text) { $('notice').textContent = text; $('notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 4200); }
async function call(name, ...args) {
  try {
    if (!api) throw new Error('这是外观预览。请通过桌宠启动入口使用任务与本地文件功能。');
    const result = await api[name](...args);
    if (result?.version === 1 && result.settings) render(result);
    return result;
  } catch (error) { const message=String(error.message||error).replace(/^Error invoking remote method '[^']+': (?:Error|TypeError): /,'');notice(/Object has been destroyed/i.test(message)?'小窗口正在恢复，请再试一次。':message);return null; }
}
function render(nextState) {
  state = nextState;
  if(state.warning&&state.warning!==lastStorageWarning)notice(state.warning);
  lastStorageWarning=state.warning||null;
  $('workspace-path').textContent = state.settings.workspace || '选择工作目录';
  $('workspace').title = state.settings.workspace || '选择工作目录';
  $('connection').classList.toggle('ready', Boolean(state.codex?.available));
  $('connection').title = state.codex?.available ? '本机 Codex 已就绪' : '尚未找到本机 Codex';
  $('connection-label').textContent = state.codex?.available ? 'CLI 已就绪' : '未找到 CLI';
  $('scale').value = state.settings.scale;
  $('scale-value').textContent = `${Math.round(state.settings.scale * 100)}%`;
  $('always-on-top').checked = state.settings.alwaysOnTop;
  $('quiet-mode').checked = state.settings.quietMode;
  $('random-idle').checked = state.settings.randomIdle!==false;
  const running = state.task?.status === 'running';
  $('workspace').disabled=running;
  $('new-conversation').disabled=running;
  $('run-task').disabled = running || handingOff;
  $('run-local-task').hidden = running;
  $('stop-task').hidden = !running;
  $('open-codex').textContent = state.task?.threadId||state.conversation?.threadId ? '查看对话 ↗' : '打开 Codex ↗';
  const runtime=(running?state.task?.runtime:null)||state.codex?.runtime||{};
  $('runtime-model').textContent=runtime.model||'模型待确认';
  $('runtime-model').title='桌宠执行所用的配置模型；在 Codex 中发送时，以该对话的模型选择为准。';
  $('runtime-effort').textContent=runtime.effort?`思考 ${runtime.effort}`:'';
  const sandboxLabel={'read-only':'只读','workspace-write':'工作区可写','danger-full-access':'完全访问'}[runtime.sandbox]||runtime.sandbox;
  $('runtime-environment').textContent=runtime.status==='ready'?[`本地 ${runtime.platform}`,runtime.shell,sandboxLabel,runtime.approvalPolicy==='on-request'?'需要时审批':runtime.approvalPolicy==='never'?'不弹审批':runtime.approvalPolicy].filter(Boolean).join(' · '):'运行配置暂未确认';
  $('runtime-environment').title=runtime.cwd||state.settings.workspace;
  $('conversation-status').textContent=state.conversation?.threadId?`已聊 ${state.conversation.turns} 轮`:'新的对话';
  if(runtimeCwd!==state.settings.workspace){runtimeCwd=state.settings.workspace;handoffMessage='';logs=[];taskId=undefined;taskView.reset(state.conversation?.lastReply||'');void call('getRuntime');}
  $('status-dot').classList.toggle('running', running);
  $('task-status').textContent = running ? '知栖正在做事…' : ({ completed: '做好啦', failed: '需要你看一眼', cancelled: '已停止' }[state.task?.status] || '等你的小任务');
  const nextTaskId=state.task?.id||state.task?.startedAt;
  if (nextTaskId && nextTaskId !== taskId) {
    handoffMessage='';
    taskId = nextTaskId;
    if (!$('prompt').value && state.task.prompt) $('prompt').value = state.task.prompt;
    taskView.reset();
    const replay=(state.taskEvents||[]).filter(event=>event.taskId===state.task.id);
    for(const event of replay)taskView.apply(event);
    if(!replay.length&&state.task.summary)taskView.reset(state.task.summary);
  } else if(!state.task&&(taskId!==undefined||conversationId!==state.conversation?.id)){
    taskId=undefined;taskView.reset(state.conversation?.lastReply||'');
  }
  conversationId=state.conversation?.id;showLogs();
  executionSettings.render();
  renderApproval();
  const actions = state.actions || [];
  $('action-count').textContent = `${actions.filter(action => action.media).length} / ${actions.length}`;
  $('action-slots').replaceChildren();
  $('idle-slot').replaceChildren();
  $('pomodoro-slots').replaceChildren();
  $('garden-action-slots').replaceChildren();
  const gardenActions=state.gardenActions||[];
  $('garden-action-count').textContent=`${gardenActions.filter(action=>action.media||state.gardenAvailable?.includes(action.id)).length} / ${gardenActions.length}`;
  const pomodoroActions = state.pomodoroActions || [];
  $('pomodoro-count').textContent = `${pomodoroActions.filter(action => action.media).length} / ${pomodoroActions.length}`;
  for (const action of [state.idle, ...actions, ...pomodoroActions,...gardenActions].filter(Boolean)) {
    const row = document.createElement('div'); row.className = 'action-row';
    const label = document.createElement('strong'); label.textContent = labels[action.id] || action.label;
    const file = document.createElement('small'); file.textContent = action.media?.name || (state.gardenAvailable?.includes(action.id)?'花园内置演出':action.id === 'idle' ? '原画轻呼吸' : '空'); file.title = action.media?.name || (state.gardenAvailable?.includes(action.id)?'花园内置演出':'尚未导入');
    const add = document.createElement('button'); add.textContent = action.media ? '替换' : '＋ 导入'; add.addEventListener('click', () => call('importAction', action.id));
    row.append(label, file, add);
    if (action.media || state.gardenAvailable?.includes(action.id)) {
      const play = document.createElement('button'); play.textContent = '▷'; play.title = action.id.startsWith('garden-')?'在小花园预览':'在桌宠上预览'; play.addEventListener('click', () => call('playAction', action.id));
      const remove = document.createElement('button'); remove.textContent = '×'; remove.className = 'remove'; remove.title = '移除动作视频'; remove.addEventListener('click', () => call('clearAction', action.id));
      row.append(play);if(action.media)row.append(remove);
    }
    $(action.id === 'idle' ? 'idle-slot' : action.id.startsWith('pomodoro-') ? 'pomodoro-slots' : action.id.startsWith('garden-')?'garden-action-slots':'action-slots').append(row);
  }
}
function showLogs() {
  const view=taskView.snapshot(),running=state?.task?.status==='running';
  $('progress').textContent=handoffMessage||view.reply||view.failure||(state?.task?view.display:logs.at(-1)||'我在这里，随时可以开始。');
  $('progress').classList.toggle('error',Boolean(view.failure));
  $('progress').scrollTop=$('progress').scrollHeight;
  $('activity-log').textContent=view.activity;
  $('activity-summary').textContent=view.latest?'执行过程 · '+view.latest.split('\n')[0].slice(0,45):'执行过程';
  $('thinking-summary').hidden=Boolean(handoffMessage)||!view.thought&&!state?.task;
  $('thinking-summary').textContent=view.thought?'思考摘要 · '+view.thought:running?'思考摘要 · 等待 Codex 返回':state?.task?.status==='completed'?'本轮未返回思考摘要':'';
  if(!$('thinking-summary').textContent)$('thinking-summary').hidden=true;
}
function taskEvent(event) {
  taskView.apply(event);
  showLogs();
}
$('new-conversation').addEventListener('click',async()=>{logs=[];handoffMessage='';const result=await call('newConversation');if(result)notice('已开始新的桌宠对话。');});
$('close-button').addEventListener('click', () => window.close());
$('close-settings').addEventListener('click', () => { $('settings').hidden = true; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { if(executionSettings.isOpen)executionSettings.close();else if (!$('settings').hidden) $('settings').hidden = true; else window.close(); } });
$('workspace').addEventListener('click', () => call('chooseWorkspace'));
$('open-codex').addEventListener('click', () => call('openCodex'));
$('usage-button').addEventListener('click', () => call('showUsage'));
$('pomodoro-button').addEventListener('click', () => call('openPomodoro'));
$('journal-button').addEventListener('click',()=>call('openJournal'));
$('stop-task').addEventListener('click', () => call('cancelTask'));
$('scale').addEventListener('input', event => { $('scale-value').textContent = `${Math.round(event.target.value * 100)}%`; });
$('scale').addEventListener('change', event => call('updateSettings', { scale: Number(event.target.value) }));
$('always-on-top').addEventListener('change', event => call('updateSettings', { alwaysOnTop: event.target.checked }));
$('quiet-mode').addEventListener('change', event => call('updateSettings', { quietMode: event.target.checked }));
$('random-idle').addEventListener('change',event=>call('updateSettings',{randomIdle:event.target.checked}));
$('prompt').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); $('task-form').requestSubmit(); } });
$('task-form').addEventListener('submit', async event => {
  event.preventDefault();
  if(handingOff)return;
  if(state?.task?.status==='running'){notice('请先完成或停止当前桌宠任务。');return;}
  const prompt = $('prompt').value.trim();
  if (!prompt) { $('prompt').focus(); return; }
  if (!state?.settings.workspace) { notice('先选择一个工作目录。'); return; }
  $('progress').classList.remove('error');
  handingOff=true;$('run-task').disabled=true;
  const result=await call('handoffTask', { prompt, cwd: state.settings.workspace });
  handingOff=false;$('run-task').disabled=state?.task?.status==='running';
  if(result?.opened){handoffMessage='内容已带到 Codex，按 Enter 发送，在对话里查看回复。';taskView.reset();showLogs();$('task-status').textContent='去 Codex 继续';}
});
$('run-local-task').addEventListener('click', async () => {
  const prompt=$('prompt').value.trim();
  if(!prompt){$('prompt').focus();return;}
  if(!state?.settings.workspace){notice('先选择一个工作目录。');return;}
  $('progress').classList.remove('error');
  await call('runTask',{prompt,cwd:state.settings.workspace});
});
function renderPlan(usage) { $('task-plan').textContent = usage?.planLabel || '订阅待确认'; $('task-plan').dataset.status = usage?.status || 'idle'; }
if (api) { api.onState(render); api.onTaskEvent(taskEvent); api.onUsage(renderPlan); api.getUsage().then(renderPlan).catch(() => renderPlan(null)); api.onOpenSettings(() => { $('settings').hidden = false; }); call('getState'); }
else { $('workspace-path').textContent = '外观预览 · 本地功能未连接'; $('connection').title = '外观预览'; }
