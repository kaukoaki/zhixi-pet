'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const ignored = new Set(['.git', 'node_modules', 'dist', '.cache', '.smoke-data', 'local-assets', 'archive', 'releases', 'reports', '__pycache__']);
const textFile = /\.(?:md|json|txt|js|cjs|py|ps1|cmd|html|css|toml|ya?ml)$/;
const requiredFiles = ['codex-plugin/skills/zhixi-pet/SKILL.md', 'codex-plugin/scripts/zhixi.ps1', '.agents/plugins/marketplace.json', 'scripts/install-desktop.ps1', 'scripts/install-codex-plugin.ps1'];

function git(root, args, input) {
  return spawnSync('git', args, { cwd: root, input, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

function walk(root, directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => {
    if (ignored.has(item.name) || item.name.endsWith('.log') || item.name.endsWith('.pyc') || /^preview-.*\.png$/.test(item.name) || ['smoke-result.json', 'playback-check.json'].includes(item.name)) return [];
    const file = path.join(directory, item.name);
    return item.isDirectory() ? walk(root, file) : [{ relative: path.relative(root, file).replaceAll('\\', '/'), mode: fs.lstatSync(file).isSymbolicLink() ? '120000' : '100644', size: fs.lstatSync(file).size, read: () => fs.readFileSync(file, 'utf8') }];
  });
}

function indexedFiles(root) {
  const index = git(root, ['ls-files', '--stage', '-z']);
  if (index.status !== 0 || !index.stdout) return null;
  const entries = index.stdout.split('\0').filter(Boolean).map(line => {
    const match = /^(\d+) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(line);
    if (!match) throw new Error('Cannot parse Git index for release audit');
    return { mode: match[1], hash: match[2], stage: Number(match[3]), relative: match[4] };
  });
  const hashes = [...new Set(entries.map(entry => entry.hash))];
  const metadata = git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], hashes.join('\n') + '\n');
  if (metadata.status !== 0) throw new Error('Cannot read indexed release metadata');
  const blobs = new Map(metadata.stdout.trim().split('\n').map(line => {
    const match = /^([0-9a-f]+) (\w+) (\d+)$/.exec(line.trim());
    if (!match) throw new Error('Missing Git object in release index');
    return [match[1], { type: match[2], size: Number(match[3]) }];
  }));
  // Inspect the indexed object: git archive publishes it even after a local edit.
  const contents = new Map();
  return entries.map(entry => {
    const blob = blobs.get(entry.hash);
    return { ...entry, ...blob, read() {
      if (!contents.has(entry.hash)) {
        const result = git(root, ['cat-file', 'blob', entry.hash]);
        if (result.status !== 0) throw new Error('Cannot read indexed release file: ' + entry.relative);
        contents.set(entry.hash, result.stdout);
      }
      return contents.get(entry.hash);
    } };
  });
}

function auditRelease({ root = path.resolve(__dirname, '..'), maxFileBytes = 95 * 1024 * 1024 } = {}) {
  root = path.resolve(root);
  const indexed = indexedFiles(root), files = indexed || walk(root), paths = new Set(files.map(file => file.relative));
  const errors = [], secrets = [/\bsk-[A-Za-z0-9_-]{30,}\b/g, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g];
  // The lean repository declares files delivered by the separate media ZIP.
  // Read the indexed manifest too, so local edits cannot hide broken links.
  const externalPaths = new Set();
  let currentMediaOnly = false;
  const assetManifest = files.find(file => file.relative === 'media-assets.json');
  if (assetManifest) {
    try {
      const manifest = JSON.parse(assetManifest.read());
      currentMediaOnly = manifest.scope === 'current-installed-only';
      if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw Error();
      for (const entry of manifest.files) {
        if (typeof entry.path !== 'string' || !entry.path.startsWith('actions/production/') || /[\\\x00-\x1f:]/.test(entry.path) || entry.path.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || externalPaths.has(entry.path)) throw Error();
        if(currentMediaOnly&&(!entry.path.includes('/processed/')||! /\.(?:webm|png)$/.test(entry.path)))throw Error();
        externalPaths.add(entry.path);
      }
    } catch { errors.push('Invalid external media manifest: media-assets.json'); externalPaths.clear(); }
  }
  let total = 0;
  const exists = relative => paths.has(relative) || externalPaths.has(relative) || [...paths, ...externalPaths].some(file => file.startsWith(relative.replace(/\/$/, '') + '/'));
  for (const file of files) {
    const relative = file.relative;
    if (/(?:^|\/)(?:prompts?[^/]*\.txt|prompts\/)/i.test(relative)) errors.push('Local production prompt must not enter source repository: ' + relative);
    if(currentMediaOnly&&/\.(?:mp4|webm|mov|mkv|avi|m4v)$/i.test(relative))errors.push('Video must not enter source repository: '+relative);
    total += file.size;
    if (file.stage) errors.push('Unmerged indexed file: ' + relative);
    if (!['100644', '100755'].includes(file.mode) || file.type && file.type !== 'blob' || relative.split('/').some(part => ignored.has(part)) || /(?:^|\/)(?:auth\.json|state\.json|conversations\.json|journal\.json|garden\.json(?:\.bak)?|\.env(?:\..*)?)$/.test(relative)) errors.push('Private/generated file: ' + relative);
    if (file.size > maxFileBytes) errors.push('Oversized Git file: ' + relative);
    if (!textFile.test(relative) || file.size > maxFileBytes || !['100644', '100755'].includes(file.mode)) continue;
    const text = file.read();
    if (secrets.some(pattern => { pattern.lastIndex = 0; return pattern.test(text); })) errors.push('Possible secret: ' + relative);
    if (/[A-Za-z]:[\\/](?:Users|Project|video)[\\/]/i.test(text)) errors.push('Personal absolute path: ' + relative);
    if (relative.endsWith('.md')) for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      const resolved = path.resolve(root, path.dirname(relative), target), local = path.relative(root, resolved).replaceAll('\\', '/');
      const present = indexed ? exists(local) : fs.existsSync(resolved) || externalPaths.has(local);
      if (!present || local.startsWith('../') || path.isAbsolute(local)) errors.push('Broken documentation link: ' + relative + ' -> ' + target);
    }
  }
  const manifest = files.find(file => file.relative === 'codex-plugin/plugin.json');
  let plugin;
  try { plugin = manifest && JSON.parse(manifest.read()); } catch { /* Fail without printing manifest content. */ }
  if (plugin?.name !== 'zhixi-pet' || !plugin.extensions?.['com.openai']?.requires_local_executor) errors.push('Invalid desktop plugin manifest');
  for (const file of requiredFiles) if (!paths.has(file)) errors.push('Missing install component: ' + file);
  return { errors: [...new Set(errors)], summary: { files: files.length, sourceMB: Math.round(total / 1048576 * 100) / 100, externalMediaFiles: externalPaths.size, auditSource: indexed ? 'git-index' : 'working-directory', secretPatternsChecked: true, personalPathsExcluded: true, documentationLinksValid: true, pluginStructureValid: true } };
}

if (require.main === module) {
  try {
    const result = auditRelease();
    if (result.errors.length) { for (const error of result.errors) console.error(error); process.exitCode = 1; }
    else console.log(JSON.stringify(result.summary));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { auditRelease };
