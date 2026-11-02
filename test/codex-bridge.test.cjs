'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { CodexTaskRunner, locateCodex, openCodex } = require('../main/codex-bridge.cjs');

function fixture(options = {}) {
  const child = new EventEmitter();
  child.pid = 42123;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = signal => { child.killedWith = signal; };
  child.unref = () => { child.unreferenced = true; };
  let input = '';
  child.stdin.on('data', chunk => { input += chunk; });
  const calls = [];
  const runner = new CodexTaskRunner({
    codexPath: 'C:\\Program Files\\Codex\\codex.exe', cwd: process.cwd(),
    idFactory: () => 'task-1', platform: 'linux',
    spawnImpl: (...args) => { calls.push(args); return child; }, ...options,
  });
  const events = [];
  runner.on('event', event => events.push(event));
  return { runner, child, calls, events, input: () => input,
    line: object => child.stdout.write(JSON.stringify(object) + '\n') };
}

test('starts the CLI with scoped permissions and prompt on stdin, without a shell', () => {
  const f = fixture();
  const prompt = '检查目录；文字 `$(Get-Secret)` 只是提示内容。';
  assert.equal(f.runner.start(prompt), 'task-1');
  const [executable, args, options] = f.calls[0];
  assert.match(executable, /codex\.exe$/);
  assert.deepEqual(args.slice(0, 6), ['exec', '--json', '--sandbox', 'workspace-write', '-c', 'approval_policy="never"']);
  assert.equal(args.at(-1), '-');
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.equal(args.includes(prompt), false);
  assert.equal(f.input(), prompt);
  assert.equal(f.events[0].type, 'task-started');
  assert.throws(() => f.runner.start('second'), /已有任务/);
});

test('resume targets exactly the saved conversation, keeps scoped permissions and follows current model configuration',()=>{
  const f=fixture(),threadId='01234567-89ab-4cde-8f01-23456789abcd';
  f.runner.start('上一句话是什么',{threadId,runtime:{model:'current-model',effort:'ultra'}});
  const args=f.calls[0][1];assert.deepEqual(args.slice(-3),['resume',threadId,'-']);assert.equal(args.includes('--last'),false);
  assert.equal(args[args.indexOf('--model')+1],'current-model');assert.ok(args.includes('model_reasoning_effort="ultra"'));assert.ok(args.includes('model_reasoning_summary="auto"'));assert.ok(args.includes('workspace-write'));assert.equal(f.events[0].resumed,true);
  f.child.emit('close',1);
  assert.throws(()=>fixture().runner.start('test',{threadId:'--last'}),/编号/);
});

test('manual sandbox and approval options are passed to new and resumed tasks and match the reported permissions',()=>{
  for(const threadId of [null,'01234567-89ab-4cde-8f01-23456789abcd']){
    const f=fixture();f.runner.start('test',{threadId,runtime:{model:'selected-model',effort:'low',sandbox:'read-only',approvalPolicy:'never'}});
    const args=f.calls[0][1];assert.equal(args[args.indexOf('--sandbox')+1],'read-only');assert.ok(args.includes('approval_policy="never"'));assert.equal(args[args.indexOf('--model')+1],'selected-model');assert.ok(args.includes('model_reasoning_effort="low"'));assert.equal(f.events[0].permissions.sandbox,'read-only');assert.equal(f.events[0].permissions.approvalPolicy,'never');f.child.emit('close',1);
  }
  const f=fixture();assert.throws(()=>f.runner.start('test',{runtime:{sandbox:'unsupported',approvalPolicy:'never'}}),/执行权限/);assert.equal(f.calls.length,0);
});

test('reasoning summaries are read from public summary text without falling back to raw reasoning',()=>{
  const f=fixture();f.runner.start('test');f.line({type:'item.completed',item:{id:'r',type:'reasoning',summary:[{type:'summary_text',text:'核对依赖'}],raw_content:'private reasoning'}});
  const event=f.events.find(e=>e.isSummary);assert.equal(event.message,'核对依赖');assert.doesNotMatch(JSON.stringify(f.events),/private reasoning/);f.child.emit('close',1);
});

test('task and app children receive the resolved network environment without shell interpolation', async () => {
  const env = { HTTPS_PROXY: 'http://localhost:8765', NO_PROXY: 'localhost' };
  const f = fixture({ env }); f.runner.start('test');
  assert.deepEqual(f.calls[0][2].env, env);
  let options;
  const opened = openCodex(process.cwd(), { env, codexPath: 'codex.exe', spawnImpl: (_exe, _args, supplied) => { options = supplied; return f.child; } });
  f.child.emit('spawn'); await opened;
  assert.deepEqual(options.env, env);
  f.child.emit('close', 1);
});

test('handles chunked JSONL, command progress, final text, usage, and closes once', () => {
  const f = fixture();
  f.runner.start('test');
  f.child.stdout.write('{"type":"thread.started","thread_');
  f.child.stdout.write('id":"thread-1"}\n');
  f.line({ type: 'turn.started' });
  f.line({ type: 'item.started', item: { id: 'cmd-1', type: 'command_execution', command: 'node --test', status: 'in_progress' } });
  f.line({ type: 'item.updated', item: { id: 'answer-1', type: 'agent_message', text: '完成' } });
  f.line({ type: 'item.completed', item: { id: 'answer-1', type: 'agent_message', text: '完成测试' } });
  f.child.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 2, output_tokens: 3 } }));
  f.child.emit('close', 0, null);
  const completed = f.events.filter(event => event.type === 'task-completed');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].threadId, 'thread-1');
  assert.equal(completed[0].text, '完成测试');
  assert.deepEqual(completed[0].usage, { input_tokens: 2, output_tokens: 3 });
  assert.ok(f.events.some(event => event.phase === 'command' && event.message === 'node --test'));
  assert.equal(f.events.filter(event => event.type === 'message-delta').at(-1).delta, '测试');
  assert.deepEqual(f.runner.getActiveTasks(), []);
  f.child.emit('close', 0, null);
  assert.equal(f.events.filter(event => event.type === 'task-completed').length, 1);
});

test('does not falsely report success after an interrupted stream', () => {
  const f = fixture();
  f.runner.start('test');
  f.line({ type: 'item.completed', item: { type: 'agent_message', text: 'some text' } });
  f.child.emit('close', 0, null);
  assert.equal(f.events.at(-1).type, 'task-failed');
  assert.match(f.events.at(-1).error, /没有返回任务完成事件/);
});

test('preserves Chinese characters split across pipe chunks', () => {
  const f = fixture();
  f.runner.start('test');
  const encoded = Buffer.from(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '栖栖已完成' } }) + '\n');
  for (const byte of encoded) f.child.stdout.write(Buffer.from([byte]));
  f.line({ type: 'turn.completed' });
  f.child.emit('close', 0, null);
  assert.equal(f.events.at(-1).text, '栖栖已完成');
});

test('reports stderr failures while redacting bearer tokens', () => {
  const f = fixture();
  f.runner.start('test');
  f.child.stderr.write('Authentication failed Bearer example-credential\n');
  f.child.emit('close', 1, null);
  assert.equal(f.events.at(-1).type, 'task-failed');
  assert.match(f.events.at(-1).error, /重新登录/);
  assert.doesNotMatch(JSON.stringify(f.events), /example-credential/);
});

test('local session and repeated transport retries do not hide a model connection timeout', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ connectionTimeoutMs: 100, stopTimeoutMs: 10 });
  f.runner.start('test');
  f.line({ type: 'thread.started', thread_id: 'local-only' });
  f.line({ type: 'turn.started' });
  t.mock.timers.tick(80);
  f.child.stderr.write('sampling_error=request timed out retries=1 max_retries=5\n');
  t.mock.timers.tick(20);
  assert.equal(f.child.killedWith, 'SIGTERM');
  t.mock.timers.tick(10);
  assert.equal(f.events.at(-1).type, 'task-failed');
  assert.match(f.events.at(-1).error, /连接模型/);
  assert.deepEqual(f.runner.getActiveTasks(), []);
  f.child.emit('close', 1);
  assert.equal(f.events.filter(e => e.type === 'task-failed').length, 1);
  assert.doesNotMatch(f.events.find(e => e.phase === 'connecting' && e.message.includes('重试')).message, /sampling_error/);
});

test('real model and tool progress extend deadlines without a short total task limit', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ connectionTimeoutMs: 100, idleTimeoutMs: 200, toolTimeoutMs: 600, stopTimeoutMs: 10 });
  f.runner.start('test');
  t.mock.timers.tick(90);
  f.line({ type: 'item.started', item: { id: 'cmd', type: 'command_execution', status: 'in_progress' } });
  t.mock.timers.tick(500);
  assert.equal(f.child.killedWith, undefined);
  f.line({ type: 'item.completed', item: { id: 'cmd', type: 'command_execution', status: 'completed' } });
  t.mock.timers.tick(180);
  f.line({ type: 'item.updated', item: { id: 'msg', type: 'agent_message', text: '完成中' } });
  t.mock.timers.tick(180);
  assert.equal(f.child.killedWith, undefined);
  t.mock.timers.tick(20);
  f.child.emit('close', 1);
  assert.match(f.events.at(-1).error, /没有新进展/);
});

test('cancel releases a hung child and a successful close clears all deadlines', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ connectionTimeoutMs: 100, stopTimeoutMs: 10 });
  f.runner.start('test');
  f.runner.cancel();
  t.mock.timers.tick(10);
  assert.equal(f.events.at(-1).type, 'task-cancelled');
  assert.deepEqual(f.runner.getActiveTasks(), []);
  const g = fixture({ connectionTimeoutMs: 100 });
  g.runner.start('test');
  g.line({ type: 'turn.completed' });
  g.child.emit('close', 0);
  t.mock.timers.tick(1000000);
  assert.equal(g.events.at(-1).type, 'task-completed');
  assert.equal(g.child.killedWith, undefined);
});

test('turn.failed wins over a zero exit code', () => {
  const f = fixture();
  f.runner.start('test');
  f.line({ type: 'turn.failed', error: { message: 'Approval required' } });
  f.child.emit('close', 0, null);
  assert.equal(f.events.at(-1).type, 'task-failed');
  assert.equal(f.events.at(-1).error, 'Approval required');
});

test('cancellation targets only this task process tree on Windows', () => {
  const calls = [];
  const f = fixture({ platform: 'win32', execFileImpl: (...args) => calls.push(args) });
  f.runner.start('test');
  assert.equal(f.runner.cancel('missing'), false);
  assert.equal(f.runner.cancel('task-1'), true);
  assert.deepEqual(calls[0].slice(0, 3), ['taskkill.exe', ['/PID', '42123', '/T', '/F'], { windowsHide: true }]);
  assert.equal(f.runner.cancel('task-1'), false);
  f.child.emit('close', 1, null);
  assert.equal(f.events.at(-1).type, 'task-cancelled');
  assert.equal(f.runner.cancel('task-1'), false);
});

test('cancel without an id stops the active task and permits the next task after close', () => {
  const f = fixture();
  f.runner.start('test');
  assert.equal(f.runner.cancel(), true);
  assert.equal(f.child.killedWith, 'SIGTERM');
  assert.equal(f.runner.getActiveTasks()[0].status, 'cancelling');
  f.child.emit('close', null, 'SIGTERM');
  assert.equal(f.events.at(-1).type, 'task-cancelled');
  assert.equal(f.runner.cancel(), false);
  assert.doesNotThrow(() => f.runner.start('next task'));
});

test('a missing executable reports a single failed task and releases the active slot', () => {
  const f = fixture();
  f.runner.start('test');
  f.child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
  f.child.emit('close', -4058, null);
  assert.equal(f.events.filter(event => event.type === 'task-failed').length, 1);
  assert.match(f.events.at(-1).error, /ENOENT/);
  assert.deepEqual(f.runner.getActiveTasks(), []);
});

test('invalid input and an invalid explicit CLI path fail without launching', () => {
  const f = fixture();
  assert.throws(() => f.runner.start(' '), /输入/);
  assert.throws(() => f.runner.start('test', { cwd: 'Z:\\certainly-missing-qiqi-workspace-907321' }), /不存在/);
  assert.equal(f.calls.length, 0);
  assert.equal(locateCodex({ explicitPath: 'Z:\\certainly-missing-codex-907321.exe' }), null);
});

test('opens the actual Codex application using a detached process and cwd argument', async () => {
  const f = fixture();
  let captured;
  const result = openCodex(process.cwd(), {
    codexPath: 'codex.exe', spawnImpl: (...args) => { captured = args; return f.child; },
  });
  f.child.emit('spawn');
  const info = await result;
  assert.deepEqual(captured[1], ['app', process.cwd()]);
  assert.equal(captured[2].detached, true);
  assert.equal(captured[2].shell, false);
  assert.equal(info.pid, 42123);
  assert.equal(f.child.unreferenced, true);
});
