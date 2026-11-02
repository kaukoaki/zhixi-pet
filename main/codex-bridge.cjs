'use strict';

// This module uses the installed Codex CLI. It never reads auth.json or API keys.
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const {validateExecutionOptions}=require('./execution-options.cjs');

const DEFAULT_PERMISSIONS = Object.freeze({
  sandbox: 'workspace-write',
  approvalPolicy: 'on-request',
  description: 'Codex 可以修改所选工作区；需要额外权限时由你批准。',
});

function isFile(file) {
  try { return typeof file === 'string' && fs.statSync(file).isFile(); }
  catch { return false; }
}

function locateCodex(options = {}) {
  if (typeof options === 'string') options = { explicitPath: options };
  const env = options.env || process.env;
  const explicit = options.explicitPath || options.codexPath || env.CODEX_CLI_PATH;
  if (explicit) return isFile(explicit) ? path.resolve(explicit) : null;

  // Prefer the desktop application's bundled CLI, which shares its normal login.
  const candidates = [];
  const desktopBin = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
  if (desktopBin) {
    try {
      for (const entry of fs.readdirSync(desktopBin, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const file = path.join(desktopBin, entry.name, 'codex.exe');
          if (isFile(file)) candidates.push({ file, modified: fs.statSync(file).mtimeMs });
        }
      }
    } catch { /* Desktop installation is optional. */ }
  }
  candidates.sort((a, b) => b.modified - a.modified);
  if (candidates.length) return candidates[0].file;

  const names = process.platform === 'win32' ? ['codex.exe'] : ['codex'];
  for (const directory of (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = path.join(directory.replace(/^"|"$/g, ''), name);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

function validCwd(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new Error('请先选择任务工作区。');
  const resolved = path.resolve(cwd);
  try {
    if (fs.statSync(resolved).isDirectory()) return resolved;
  } catch { /* Give the same useful error for missing/inaccessible paths. */ }
  throw new Error('任务工作区不存在或无法访问。');
}

function safeText(value, limit = 64000) {
  return String(value ?? '')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [已隐藏]')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}/g, '[已隐藏的密钥]')
    .slice(-limit);
}

function taskError(value) {
  const text = safeText(value);
  if (/no session found|(?:session|thread).{0,120}(?:not found|does not exist)|could not find.{0,40}session/i.test(text)) return '找不到原来的 Codex 对话，未自动新建。请检查 Codex 登录和数据目录，或点击“新对话”开始。';
  if (/request timed out|sampling_error|stream disconnected|connection (?:reset|refused|closed)|failed to (?:connect|send request)|websocket.*(?:failed|error)/i.test(text)) return '连接模型超时或中断，请稍后重试，也可以打开 Codex 继续。';
  if (/unauthorized|not logged in|authentication failed|\b401\b/i.test(text)) return 'Codex 登录已失效，请打开 Codex 重新登录后重试。';
  if (/usage limit|quota exceeded|rate limit|\b429\b/i.test(text)) return '当前账号的用量或请求频率已达限制，请查看额度后稍后重试。';
  return text;
}

function openCodex(cwd = process.cwd(), options = {}) {
  const directory = validCwd(cwd);
  const executable = options.codexPath || locateCodex(options);
  if (!executable) return Promise.reject(new Error('未找到本机 Codex CLI，请先安装或启动 Codex。'));
  const launch = options.spawnImpl || spawn;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = launch(executable, ['app', directory], {
        cwd: directory, shell: false, windowsHide: true, detached: true, stdio: 'ignore', env: options.env || process.env,
      });
    } catch (error) { reject(error); return; }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref?.();
      resolve({ pid: child.pid, codexPath: executable, cwd: directory });
    });
  });
}

class CodexTaskRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.codexPath = options.codexPath || null;
    this.env = options.env || process.env;
    this.cwd = options.cwd || process.cwd();
    this._spawn = options.spawnImpl || spawn;
    this._execFile = options.execFileImpl || execFile;
    this._platform = options.platform || process.platform;
    this._id = options.idFactory || randomUUID;
    this.maxConcurrent = options.maxConcurrent || 1;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 90000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 300000;
    this.toolTimeoutMs = options.toolTimeoutMs ?? 900000;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 3000;
    this.tasks = new Map();
  }

  start(prompt, cwdOrOptions = {}) {
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('请先输入要交给 Codex 的任务。');
    if (prompt.length > 200000) throw new Error('任务文字过长，请分成几个任务提交。');
    if (this.tasks.size >= this.maxConcurrent) throw new Error('已有任务在执行，请等它完成或先停止。');
    const options = typeof cwdOrOptions === 'string' ? { cwd: cwdOrOptions } : (cwdOrOptions || {});
    const cwd = validCwd(options.cwd || this.cwd);
    if (options.threadId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.threadId)) throw new Error('原对话编号无效，请新建对话。');
    const executable = this.codexPath || locateCodex({ env: this.env });
    if (!executable) throw new Error('未找到本机 Codex CLI，请先安装或启动 Codex。');
    const execution=validateExecutionOptions(undefined,{sandbox:options.runtime?.sandbox||DEFAULT_PERMISSIONS.sandbox,approvalPolicy:options.runtime?.approvalPolicy||'never'});
    if(execution.approvalPolicy!=='never')throw new Error('需要审批的任务必须使用 Codex 交互通道。');
    const permissions={sandbox:execution.sandbox,approvalPolicy:execution.approvalPolicy,description:execution.approvalPolicy==='never'?'不弹出审批，超出所选执行权限的操作会被拒绝。':DEFAULT_PERMISSIONS.description};
    const task = {
      id: this._id(), cwd, threadId: options.threadId || null, child: null, buffer: '', stderr: '',
      messages: new Map(), lastMessage: '', usage: null, failure: null,
      turnCompleted: false, cancelled: false, finished: false, startedAt: Date.now(),
      responded: false, pendingTools: new Set(), timer: null, stopTimer: null,
      resumed: Boolean(options.threadId),
    };
    const args = [
      'exec', '--json', '--sandbox', permissions.sandbox,
      '-c', `approval_policy="${permissions.approvalPolicy}"`,
      '--skip-git-repo-check', '-C', cwd,
    ];
    if(options.runtime?.model)args.push('--model',options.runtime.model);
    if(options.runtime?.effort)args.push('-c',`model_reasoning_effort=${JSON.stringify(options.runtime.effort)}`);
    // Request the provider's public summary, never raw/private reasoning.
    args.push('-c','model_reasoning_summary="auto"');
    if(options.threadId)args.push('resume',options.threadId);
    args.push('-');
    let child;
    try {
      child = this._spawn(executable, args, {
        cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: this.env,
      });
    } catch (error) { throw new Error(`无法启动 Codex：${safeText(error.message)}`); }
    task.child = child;
    this.tasks.set(task.id, task);
    this._watch(task, this.connectionTimeoutMs);
    this._emit(task, 'task-started', { status: 'running', permissions, pid: child.pid, resumed: Boolean(options.threadId), runtime: options.runtime || null });

    // Preserve UTF-8 characters when a code point crosses an OS pipe chunk.
    child.stdout?.setEncoding?.('utf8');
    child.stderr?.setEncoding?.('utf8');
    child.stdout?.on('data', chunk => this._consume(task, chunk));
    child.stderr?.on('data', chunk => {
      if (task.finished) return;
      const text = safeText(chunk.toString());
      task.stderr = (task.stderr + text).slice(-16000);
      // Transport retries do not mean the model made progress and must not extend its deadline.
      if (/sampling_|request timed out|responses_retry|retrying|reconnecting|stream disconnected/i.test(task.stderr)) {
        const message = /request timed out|sampling_error|retrying|reconnecting|stream disconnected/i.test(task.stderr) ? '连接有点慢，正在重试；长时间无响应会自动停止。' : '正在连接模型…';
        if (message !== task.connectionNotice) { task.connectionNotice = message; this._emit(task, 'progress', { phase: 'connecting', message }); }
        return;
      }
      this._emit(task, 'progress', { phase: 'stderr', message: text });
    });
    child.once('error', error => {
      task.failure = safeText(error.message);
      this._finish(task, 'task-failed', { error: `无法启动 Codex：${task.failure}` });
    });
    child.once('close', (code, signal) => {
      if (task.buffer.trim()) this._line(task, task.buffer);
      task.buffer = '';
      if (task.cancelled) this._finish(task, 'task-cancelled', { message: '任务已停止。', signal });
      else if (task.failure || code !== 0) {
        this._finish(task, 'task-failed', {
          error: taskError(task.failure || task.stderr.trim() || `Codex 已退出（代码 ${code ?? signal ?? '未知'}）。`),
          exitCode: code,
        });
      } else if (!task.turnCompleted) {
        this._finish(task, 'task-failed', { error: 'Codex 进程已结束，但没有返回任务完成事件。' });
      } else {
        this._finish(task, 'task-completed', { text: task.lastMessage, usage: task.usage });
      }
    });
    child.stdin?.on('error', error => {
      if (!task.cancelled && !task.finished) task.failure = safeText(error.message);
    });
    // Prompt text never enters a shell command or a command-line argument.
    child.stdin.end(prompt);
    return task.id;
  }

  cancel(taskId = this.tasks.keys().next().value) {
    const task = this.tasks.get(taskId);
    if (!task || task.finished || task.cancelled) return false;
    task.cancelled = true;
    this._emit(task, 'progress', { phase: 'cancelling', message: '正在停止任务…' });
    this._terminate(task);
    return true;
  }

  _terminate(task) {
    clearTimeout(task.timer);
    if (task.stopping) return;
    task.stopping = true;
    const child = task.child;
    // Some crashed children never deliver close. Always release the UI after bounded cleanup.
    task.stopTimer = setTimeout(() => this._finish(task, task.cancelled ? 'task-cancelled' : 'task-failed', task.cancelled ? { message: '任务已停止。' } : { error: task.failure }), this.stopTimeoutMs);
    task.stopTimer.unref?.();
    if (this._platform === 'win32' && Number.isSafeInteger(child.pid) && child.pid > 0) {
      // Only stop the process tree created for this task, never all Codex processes.
      this._execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, error => {
        if (error && !task.finished) child.kill();
      });
    } else child.kill('SIGTERM');
  }

  _watch(task, delay) {
    clearTimeout(task.timer);
    task.timer = setTimeout(() => {
      if (task.finished || task.cancelled) return;
      task.failure = task.turnCompleted ? 'Codex 已返回结果，但进程未正常结束。已结束等待，请查看已返回的内容。' : task.responded ? '任务长时间没有新进展，已停止等待。请检查结果后重试，或打开 Codex 继续。' : '连接模型超过 90 秒仍未收到响应，已停止等待。请稍后重试，或打开 Codex 检查登录与连接。';
      this._emit(task, 'progress', { phase: 'timeout', message: task.failure });
      this._terminate(task);
    }, delay);
    task.timer.unref?.();
  }

  dispose() {
    for (const id of this.tasks.keys()) this.cancel(id);
  }

  getActiveTasks() {
    return [...this.tasks.values()].map(task => ({
      taskId: task.id, cwd: task.cwd, threadId: task.threadId,
      status: task.cancelled ? 'cancelling' : 'running', startedAt: task.startedAt,
    }));
  }

  _emit(task, type, payload = {}) {
    const event = { type, taskId: task.id, threadId: task.threadId, cwd: task.cwd, timestamp: Date.now(), ...payload };
    this.emit('event', event);
    this.emit(type, event);
  }

  _consume(task, chunk) {
    if (task.finished) return;
    task.buffer += chunk.toString();
    let end;
    while ((end = task.buffer.indexOf('\n')) >= 0) {
      const line = task.buffer.slice(0, end).replace(/\r$/, '');
      task.buffer = task.buffer.slice(end + 1);
      this._line(task, line);
    }
    if (task.buffer.length > 4 * 1024 * 1024) {
      task.failure = 'Codex 返回了过大的未分行输出。';
      this.cancel(task.id);
    }
  }

  _line(task, line) {
    if (!line.trim() || task.finished) return;
    let event;
    try { event = JSON.parse(line); }
    catch { this._emit(task, 'progress', { phase: 'output', message: safeText(line) }); return; }
    if (!event || typeof event.type !== 'string') return;
    if (event.type === 'thread.started') {
      task.threadId = event.thread_id || event.threadId || null;
      this._emit(task, 'progress', { phase: 'connecting', message: task.resumed?'已恢复上次对话，正在连接模型…':'本地会话已创建，正在连接模型…' });
    } else if (event.type === 'turn.started') {
      this._emit(task, 'progress', { phase: 'connecting', message: '正在等待模型响应…' });
    } else if (event.type === 'turn.completed') {
      task.turnCompleted = true;
      task.usage = event.usage || null;
      this._watch(task, 10000);
    } else if (event.type === 'turn.failed') {
      task.failure = safeText(event.error?.message || event.error || event.message || 'Codex 任务失败。');
    } else if (event.type === 'error') {
      // Error events can precede a successful retry. The process exit/turn.failed is authoritative.
      task.lastError = safeText(event.message || event.error?.message || 'Codex 返回错误。');
      this._emit(task, 'progress', { phase: 'error', message: task.lastError });
    } else if (event.type.startsWith('item.')) {
      this._item(task, event);
    } else {
      this._emit(task, 'progress', { phase: 'event', eventType: event.type });
    }
  }

  _item(task, event) {
    const item = event.item || {};
    const itemId = item.id || event.item_id || 'message';
    const type = item.type || '';
    if (type !== 'error' && type) {
      task.responded = true;
      const tool = ['command_execution', 'mcp_tool_call', 'web_search'].includes(type);
      if (tool && event.type !== 'item.completed') task.pendingTools.add(itemId);
      else task.pendingTools.delete(itemId);
      this._watch(task, task.pendingTools.size ? this.toolTimeoutMs : this.idleTimeoutMs);
    }
    if (type === 'agent_message') {
      const text = safeText(item.text || '');
      const previous = task.messages.get(itemId) || '';
      if (text !== previous) {
        this._emit(task, 'message-delta', {
          itemId, text, delta: text.startsWith(previous) ? text.slice(previous.length) : text,
          replace: !text.startsWith(previous),
        });
      }
      task.messages.set(itemId, text);
      if (event.type === 'item.completed') {
        task.lastMessage = text;
        this._emit(task, 'message', { itemId, text });
      }
    } else if (type === 'command_execution') {
      this._emit(task, 'progress', {
        phase: 'command', itemId, status: item.status,
        message: safeText(item.command || '执行命令'), output: safeText(item.aggregated_output || ''),
        exitCode: item.exit_code,
      });
    } else if (type === 'file_change') {
      this._emit(task, 'progress', {
        phase: 'files', itemId, status: item.status, message: '正在更新工作区文件。',
        changes: Array.isArray(item.changes) ? item.changes.map(change => ({ path: safeText(change.path), kind: change.kind })) : [],
      });
    } else if (type === 'error') {
      this._emit(task, 'progress', { phase: 'error', itemId, message: safeText(item.message) });
    } else if (type === 'reasoning') {
      const summary = typeof item.text === 'string' ? item.text : typeof item.summary === 'string' ? item.summary : Array.isArray(item.summary) ? item.summary.map(part => typeof part === 'string' ? part : part?.text || '').join('\n') : '';
      this._emit(task, 'progress', { phase: 'thinking', itemId, message: safeText(summary || '正在思考…'), isSummary: Boolean(summary) });
    } else {
      this._emit(task, 'progress', { phase: type || 'event', itemId, status: item.status, eventType: event.type });
    }
  }

  _finish(task, type, payload) {
    if (task.finished) return;
    task.finished = true;
    clearTimeout(task.timer);
    clearTimeout(task.stopTimer);
    this.tasks.delete(task.id);
    this._emit(task, type, { ...payload, durationMs: Date.now() - task.startedAt });
  }
}

module.exports = { locateCodex, openCodex, CodexTaskRunner, DEFAULT_PERMISSIONS };
