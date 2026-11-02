'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const { auditRelease } = require('../scripts/audit-release.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixi-release-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (args, input) => { const result = spawnSync('git', args, { cwd: root, input, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  const write = (file, content) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), content); };
  git(['init', '--quiet']);
  write('codex-plugin/plugin.json', JSON.stringify({ name: 'zhixi-pet', extensions: { 'com.openai': { requires_local_executor: true } } }));
  for (const file of ['codex-plugin/skills/zhixi-pet/SKILL.md', 'codex-plugin/scripts/zhixi.ps1', '.agents/plugins/marketplace.json', 'scripts/install-desktop.ps1', 'scripts/install-codex-plugin.ps1']) write(file, 'fixture');
  git(['add', '.']);
  return { root, git, write };
}

test('release audit catches a staged secret even when the working copy is clean', t => {
  const f = fixture(t), secret = 'sk-' + 'A'.repeat(36);
  f.write('config.txt', secret); f.git(['add', 'config.txt']); f.write('config.txt', 'clean local edit');
  const result = auditRelease({ root: f.root });
  assert.ok(result.errors.includes('Possible secret: config.txt'));
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(result.summary.auditSource, 'git-index');
});

test('documentation links resolve against the index, not local-only files', t => {
  const f = fixture(t);
  f.write('README.md', '[guide](docs/local.md)'); f.git(['add', 'README.md']); f.write('docs/local.md', 'only on this computer');
  assert.ok(auditRelease({ root: f.root }).errors.includes('Broken documentation link: README.md -> docs/local.md'));
  f.git(['add', 'docs/local.md']);
  fs.unlinkSync(path.join(f.root, 'docs/local.md'));
  assert.deepEqual(auditRelease({ root: f.root }).errors, []);
});

test('private directories, oversized index blobs and fine-grained tokens are rejected', t => {
  const f = fixture(t);
  f.write('.cache/private.txt', 'fixture'); f.write('garden.json', '{}'); f.write('large.dat', 'A'.repeat(2048));
  f.write('credential.txt', 'github_pat_' + 'B'.repeat(42)); f.git(['add', '.']);
  f.write('large.dat', 'small');
  const errors = auditRelease({ root: f.root, maxFileBytes: 1024 }).errors;
  assert.ok(errors.includes('Private/generated file: .cache/private.txt'));
  assert.ok(errors.includes('Private/generated file: garden.json'));
  assert.ok(errors.includes('Oversized Git file: large.dat'));
  assert.ok(errors.includes('Possible secret: credential.txt'));
});

test('indexed symbolic links cannot conceal a release dependency', t => {
  const f = fixture(t), hash = f.git(['hash-object', '-w', '--stdin'], 'outside-target');
  f.git(['update-index', '--add', '--cacheinfo', '120000,' + hash + ',docs/linked.md']);
  assert.ok(auditRelease({ root: f.root }).errors.includes('Private/generated file: docs/linked.md'));
});

test('indexed external media manifest permits only declared production links', t => {
  const f = fixture(t);
  f.write('README.md', '[motion](actions/production/example/source/clip.mp4)');
  const entry = { path: 'actions/production/example/source/clip.mp4', bytes: 123, sha256: 'a'.repeat(64) };
  f.write('media-assets.json', JSON.stringify({ schemaVersion: 1, files: [entry] }));
  f.git(['add', '.']);
  assert.deepEqual(auditRelease({ root: f.root }).errors, []);
  f.write('media-assets.json', JSON.stringify({ schemaVersion: 1, files: [{ ...entry, path: 'actions/production/../../outside.txt' }] }));
  f.git(['add', 'media-assets.json']);
  const errors = auditRelease({ root: f.root }).errors;
  assert.ok(errors.includes('Invalid external media manifest: media-assets.json'));
  assert.ok(errors.some(error => error.startsWith('Broken documentation link:')));
});

test('current-media source exports reject every tracked video and any original-video declaration', t => {
  const f=fixture(t),entry={path:'actions/production/example/processed/current.webm',bytes:1,sha256:'a'.repeat(64)};
  f.write('media-assets.json',JSON.stringify({schemaVersion:1,scope:'current-installed-only',files:[entry]}));
  f.write('actions/production/example/source/original.mp4','original');f.git(['add','.']);
  assert.ok(auditRelease({root:f.root}).errors.includes('Video must not enter source repository: actions/production/example/source/original.mp4'));
  f.write('media-assets.json',JSON.stringify({schemaVersion:1,scope:'current-installed-only',files:[{...entry,path:'actions/production/example/source/original.mp4'}]}));
  f.git(['add','media-assets.json']);
  assert.ok(auditRelease({root:f.root}).errors.includes('Invalid external media manifest: media-assets.json'));
});
