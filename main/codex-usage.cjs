'use strict';
// Read-only app-server RPC. Credentials remain managed by the installed Codex CLI.
const { spawn, execFile } = require('node:child_process');
const { locateCodex } = require('./codex-bridge.cjs');

const PLAN_LABELS = { plus: 'Plus', pro: 'Pro', prolite: 'Pro Lite', promax: 'Pro Max', free: 'Free', go: 'Go', team: 'Team', business: 'Business', enterprise: 'Enterprise', edu: 'Edu', edu_plus: 'Edu Plus', edu_pro: 'Edu Pro', self_serve_business_prolite: 'Business Pro Lite', self_serve_business_usage_based: 'Business', ent26: 'Enterprise', enterprise_cbp_automation: 'Enterprise', enterprise_cbp_usage_based: 'Enterprise' };
const number = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' ? value.slice(0, 120) : null;
function windowLabel(minutes, fallback) {
  if (minutes === 300) return '5 小时额度';
  if (minutes === 10080) return '每周额度';
  if (!number(minutes) || minutes <= 0) return fallback;
  if (minutes % 1440 === 0) return `${minutes / 1440} 天额度`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时额度`;
  return `${minutes} 分钟额度`;
}
function normalizeUsage(account, response = {}, now = Date.now()) {
  const entries = response.rateLimitsByLimitId && typeof response.rateLimitsByLimitId === 'object' ? Object.entries(response.rateLimitsByLimitId).filter(([, bucket]) => bucket && typeof bucket === 'object') : [];
  if (!entries.length && response.rateLimits) entries.push([response.rateLimits.limitId || 'codex', response.rateLimits]);
  const planType = text(account?.planType) || text(entries.find(([, b]) => b.planType)?.[1].planType) || null;
  const buckets = entries.map(([id, bucket]) => ({
    id, label: text(bucket.limitName) || (id === 'codex' ? 'Codex' : id),
    planType: text(bucket.planType) || planType,
    windows: ['primary', 'secondary'].flatMap((key, index) => {
      const win = bucket[key];
      if (!win || typeof win !== 'object') return [];
      return [{ id: key, label: windowLabel(win.windowDurationMins, index ? '长期额度' : '短期额度'),
        durationMins: number(win.windowDurationMins) && win.windowDurationMins > 0 ? win.windowDurationMins : null,
        remainingPercent: number(win.usedPercent) ? Math.max(0, Math.min(100, 100 - win.usedPercent)) : null,
        resetsAt: number(win.resetsAt) && win.resetsAt > 0 ? win.resetsAt : null }];
    }),
    credits: bucket.credits && typeof bucket.credits === 'object' ? { unlimited: bucket.credits.unlimited === true, hasCredits: typeof bucket.credits.hasCredits === 'boolean' ? bucket.credits.hasCredits : null, balance: text(bucket.credits.balance) } : null,
    reached: text(bucket.rateLimitReachedType),
    individualLimit: bucket.individualLimit ? { remainingPercent: number(bucket.individualLimit.remainingPercent) ? Math.max(0, Math.min(100, bucket.individualLimit.remainingPercent)) : null, resetsAt: number(bucket.individualLimit.resetsAt) ? bucket.individualLimit.resetsAt : null } : null
  }));
  return { status: 'ready', planType, planLabel: PLAN_LABELS[planType] || planType || '订阅待确认',
    fetchedAt: now, stale: false, buckets,
    ordinaryUsageAllowed: typeof response.ordinaryUsageAllowed === 'boolean' ? response.ordinaryUsageAllowed : null,
    note: buckets.some(b => b.windows.length || b.credits || b.individualLimit) ? '来自当前 Codex 登录账号 · 各窗口独立计算' : '当前账号未返回可显示的额度窗口，请刷新确认。' };
}

async function readUsage(options = {}) {
  const executable = options.codexPath || locateCodex({ env: options.env });
  if (!executable) throw new Error('未找到本机 Codex，请先安装并登录。');
  const launch = options.spawnImpl || spawn;
  if (options.signal?.aborted) throw new Error('用量查询已取消。');
  return new Promise((resolve, reject) => {
    let child, buffer = '', total = 0, done = false, account;
    const timeout = setTimeout(() => finish(new Error('读取用量超时，请稍后刷新。')), options.timeoutMs || 15000);
    const abort = () => finish(new Error('用量查询已取消。'));
    options.signal?.addEventListener('abort', abort, { once: true });
    function finish(error, value) {
      if (done) return;
      done = true; clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      child?.stdin?.end(); child?.kill();
      if (error) reject(error); else resolve(value);
    }
    function send(value) { if (!done) child.stdin.write(JSON.stringify(value) + '\n'); }
    function message(value) {
      if (value.id !== undefined && value.method) {
        // This reader never grants approvals, logs in, executes a turn, or spends reset credits.
        send({ id: value.id, error: { code: -32601, message: 'Read-only usage client' } }); return;
      }
      if (value.id === 1) {
        if (value.error) return finish(new Error('本机 Codex 初始化失败，请更新 Codex 后重试。'));
        send({ method: 'initialized' });
        send({ id: 2, method: 'account/read', params: { refreshToken: false } });
      } else if (value.id === 2) {
        if (value.error) return finish(new Error('无法读取 Codex 登录状态，请在 Codex 中重新登录。'));
        account = value.result?.account;
        if (!account) return finish(new Error('请先在本机 Codex 中登录 ChatGPT 账号。'));
        if (account.type !== 'chatgpt') return finish(null, { status: 'unsupported', planType: null, planLabel: account.type === 'apiKey' ? 'API Key' : '其他登录方式', buckets: [], fetchedAt: Date.now(), stale: false, note: '此登录方式不提供 ChatGPT Plus / Pro 订阅余量，请在 Codex 中切换到 ChatGPT 登录。' });
        send({ id: 3, method: 'account/rateLimits/read' });
      } else if (value.id === 3) {
        if (value.error) return finish(new Error('Codex 暂时未返回额度，请检查网络或稍后刷新。'));
        if (!value.result || typeof value.result !== 'object') return finish(new Error('Codex 返回的额度格式无法识别。'));
        finish(null, normalizeUsage(account, value.result));
      }
    }
    try {
      child = launch(executable, ['app-server', '--listen', 'stdio://'], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: options.env || process.env });
      child.on('error', () => finish(new Error('无法启动本机 Codex 用量查询。')));
      child.on('close', () => { if (!done) finish(new Error('Codex 用量连接已关闭，请重试。')); });
      child.stdin.on('error', () => finish(new Error('Codex 用量连接不可用。')));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        total += Buffer.byteLength(chunk); buffer += chunk;
        if (total > 4 * 1024 * 1024) return finish(new Error('Codex 用量响应过大。'));
        let end;
        while (!done && (end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let value;
          try { value = JSON.parse(line); } catch { continue; }
          if (value && typeof value === 'object') message(value);
        }
      });
      child.stderr.on('data', () => {});
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'zhixi_pet_usage', title: '知栖 · Codex 余量', version: '0.1.0' } } });
    } catch { finish(new Error('无法启动本机 Codex 用量查询。')); }
  });
}

class UsageService {
  constructor(options = {}) { this.controller = new AbortController(); this.read = options.read || (() => readUsage({ ...options, signal: this.controller.signal })); this.now = options.now || Date.now; this.cacheMs = options.cacheMs ?? 60000; this.value = { status: 'idle', planLabel: '读取订阅', buckets: [], fetchedAt: null, stale: false }; this.pending = null; this.lastAttempt = null; }
  dispose() { this.controller.abort(); }
  snapshot() { return structuredClone(this.value); }
  refresh(force = false) {
    if (this.pending) return this.pending;
    if (!force && this.lastAttempt !== null && this.now() - this.lastAttempt < (this.value.status === 'error' ? 15000 : this.cacheMs)) return Promise.resolve(this.snapshot());
    this.lastAttempt = this.now();
    this.pending = Promise.resolve().then(() => this.read()).then(value => { this.value = value; }, () => {
      // A failed refresh can follow an account switch: do not show the previous account's percentage.
      this.value = { status: 'error', planLabel: '暂未连接', buckets: [], fetchedAt: null, stale: false, note: '暂时无法读取本机 Codex 余量。请检查网络，并确认已在 Codex 中登录 ChatGPT。' };
    }).then(() => this.snapshot()).finally(() => { this.pending = null; });
    return this.pending;
  }
}

function doubleClickTime() {
  if (process.platform !== 'win32') return Promise.resolve(500);
  return new Promise(resolve => execFile('reg.exe', ['query', 'HKCU\\Control Panel\\Mouse', '/v', 'DoubleClickSpeed'], { windowsHide: true, timeout: 2000, encoding: 'utf8' }, (_error, stdout) => {
    const value = Number(/DoubleClickSpeed\s+REG_SZ\s+(\d+)/.exec(stdout || '')?.[1]);
    resolve(Number.isInteger(value) && value >= 100 && value <= 1000 ? value : 500);
  }));
}
module.exports = { normalizeUsage, readUsage, UsageService, doubleClickTime };
