'use strict';
const fs = require('node:fs'), path = require('node:path'), { randomUUID, createHash } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value, limit = 24000) => typeof value === 'string' ? value.slice(-limit) : '';
function workspaceKey(cwd) {
  const resolved = path.resolve(cwd), normalized = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  return createHash('sha256').update(normalized).digest('hex');
}
class ConversationStore {
  constructor(file) {
    this.file = file; this.data = { version: 1, active: {}, sessions: {} }; this.warning = null;
    if (!fs.existsSync(file)) return;
    try {
      if (fs.statSync(file).size > 32 * 1024 * 1024) throw Error('oversized');
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if(saved.version!==1)throw new Error('unsupported conversation format');
      for (const [id, record] of Object.entries(saved.sessions || {})) {
        if (!UUID.test(id) || !record || typeof record.cwd !== 'string' || !path.isAbsolute(record.cwd)) continue;
        this.data.sessions[id] = { id, cwd: record.cwd, threadId: UUID.test(record.threadId) ? record.threadId : null,
          turns: Number.isSafeInteger(record.turns) && record.turns >= 0 ? record.turns : 0,
          lastPrompt: text(record.lastPrompt), lastReply: text(record.lastReply, 64000),
          model: text(record.model, 160) || null, effort: text(record.effort, 40) || null, updatedAt: text(record.updatedAt, 40) };
      }
      for (const [key, id] of Object.entries(saved.active || {})) {
        const record = this.data.sessions[id];
        if (record && key === workspaceKey(record.cwd)) this.data.active[key] = id;
      }
    } catch { this.warning = '本地对话记录暂时无法读取；旧文件仍保留。'; }
  }
  current(cwd) {
    const record = this.data.sessions[this.data.active[workspaceKey(cwd)]];
    return record ? structuredClone(record) : null;
  }
  _change(action) {
    if (this.warning) throw new Error(this.warning);
    const next = structuredClone(this.data), result = action(next);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(this.file + '.tmp', this.file); this.data = next;
    return structuredClone(result);
  }
  _record(data, cwd, fresh = false) {
    const key = workspaceKey(cwd), old = data.sessions[data.active[key]];
    if (old && !fresh) return old;
    const id = randomUUID(), record = { id, cwd: path.resolve(cwd), threadId: null, turns: 0, lastPrompt: '', lastReply: '', model: null, effort: null, updatedAt: new Date().toISOString() };
    data.active[key] = id; data.sessions[id] = record; return record;
  }
  begin(cwd, prompt, runtime = {}) {
    return this._change(data => {
      const record = this._record(data, cwd); record.lastPrompt = text(prompt);
      record.model = text(runtime.model, 160) || null; record.effort = text(runtime.effort, 40) || null;
      record.updatedAt = new Date().toISOString(); return record;
    });
  }
  bind(cwd, threadId) {
    if (!UUID.test(threadId)) throw new Error('Codex 返回的对话编号无效。');
    if (this.current(cwd)?.threadId === threadId) return this.current(cwd);
    return this._change(data => { const record = this._record(data, cwd); record.threadId = threadId; return record; });
  }
  complete(cwd, reply) {
    return this._change(data => { const record = this._record(data, cwd); record.lastReply = text(reply, 64000); record.turns++; record.updatedAt = new Date().toISOString(); return record; });
  }
  startNew(cwd) { return this._change(data => this._record(data, cwd, true)); }
}
module.exports = { ConversationStore, workspaceKey, UUID };
