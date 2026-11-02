'use strict';
const fs = require('node:fs');
const path = require('node:path');

function composerLink(prompt, cwd) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 24000) throw new Error('请输入 1–24000 字的任务。');
  let directory = false;
  try { directory = typeof cwd === 'string' && path.isAbsolute(cwd) && fs.statSync(cwd).isDirectory(); } catch { /* Return the same useful error for absent paths. */ }
  if(!directory)throw new Error('请选择有效的工作目录。');
  const url = new URL('codex://new');
  url.searchParams.set('prompt', prompt.trim());
  url.searchParams.set('path', path.resolve(cwd));
  if(url.href.length>28000)throw new Error('内容过长，无法通过链接带入 Codex。请缩短内容，或在桌宠中执行。');
  return url.href;
}
function threadLink(threadId) {
  if (typeof threadId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(threadId)) throw new Error('Codex 对话编号无效。');
  return `codex://threads/${threadId}`;
}
module.exports = { composerLink, threadLink };
