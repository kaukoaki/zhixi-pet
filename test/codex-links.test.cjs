'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { composerLink, threadLink } = require('../main/codex-links.cjs');

test('official composer links preserve Unicode, newlines, quotes and URL characters without executing prompt text', () => {
  const prompt = '你好 & path=其他目录\n"`$(只是文字)`" + # ?';
  const url = new URL(composerLink(prompt, process.cwd()));
  assert.equal(url.protocol, 'codex:'); assert.equal(url.hostname, 'new');
  assert.equal(url.searchParams.get('prompt'), prompt);
  assert.equal(url.searchParams.get('path'), process.cwd());
  assert.deepEqual([...url.searchParams.keys()], ['prompt', 'path']);
  assert.equal(url.searchParams.has('submit'), false);
});
test('composer validates missing workspaces and bounds long encoded URLs without losing the draft', () => {
  assert.throws(() => composerLink(' ', process.cwd()), /请输入/);
  assert.throws(() => composerLink('test', 'relative-directory'), /工作目录/);
  assert.throws(() => composerLink('字'.repeat(5000), process.cwd()), /内容过长/);
});
test('existing task links reject path traversal and accept a real local conversation ID', () => {
  assert.equal(threadLink('01234567-89ab-4cde-8f01-23456789abcd'), 'codex://threads/01234567-89ab-4cde-8f01-23456789abcd');
  for (const id of ['', '../settings', 'bad?prompt=x', 'codex://new', null]) assert.throws(() => threadLink(id), /对话编号/);
});
