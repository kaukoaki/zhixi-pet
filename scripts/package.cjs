'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { bundleLibrary } = require('./bundle-library.cjs');
async function main() {
  const { packager } = await import('@electron/packager');
  const root = path.resolve(__dirname, '..');
  const outputRoot = path.resolve(root, 'dist');
  if (path.dirname(outputRoot) !== root || path.basename(outputRoot) !== 'dist' || (fs.existsSync(outputRoot) && fs.lstatSync(outputRoot).isSymbolicLink())) throw new Error('Invalid build output directory');
  const buildTarget = path.join(outputRoot, 'QiqiCodexPet-win32-x64');
  if (fs.existsSync(buildTarget) && (fs.lstatSync(buildTarget).isSymbolicLink() || fs.realpathSync(buildTarget).toLowerCase() !== buildTarget.toLowerCase())) throw new Error('Build target must remain inside this project');
  const electronVersion = require('electron/package.json').version;
  const zipName = `electron-v${electronVersion}-win32-x64.zip`;
  const zipFile = path.join(root, '.cache', zipName);
  let electronZipDir;
  if (fs.existsSync(zipFile)) {
    const expected = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/checksums.json'), 'utf8'))[zipName];
    const actual = crypto.createHash('sha256').update(fs.readFileSync(zipFile)).digest('hex');
    if (actual !== expected) throw new Error('Electron archive checksum mismatch');
    electronZipDir = path.dirname(zipFile);
  }
  const outputs = await packager({
    dir: root, out: outputRoot, name: 'QiqiCodexPet', platform: 'win32', arch: 'x64',
    asar: true, prune: true, overwrite: true, electronZipDir,
    ignore: [/^\/(?:dist|releases|reports|test|docs|actions|local-assets|archive|codex-plugin|\.agents|\.cache|\.smoke-data|\.git|scripts)(?:\/|$)/,/^\/(?:auth|state|conversations|journal|garden)\.json(?:\.bak)?$/, /\.log$/, /__pycache__/, /qiqi-(?:idle|chibi-v2)\.png$/],
    afterCopy: [async ({buildPath}) => { const result=bundleLibrary(root,buildPath); console.log(`Bundled ${result.actions} actions / ${result.files} media files / ${result.gardenFiles} garden video and poster files`); }],
    appCopyright: 'Copyright 2026 Zhixi contributors; third-party rights reserved',
    win32metadata: { ProductName: '知栖 · Codex 桌面伙伴', FileDescription: '知栖桌面伙伴' }
  });
  const asar = await import('@electron/asar');
  for (const output of outputs) {
    const archive=path.join(output,'resources/app.asar'),names=asar.listPackage(archive);
    for(const notice of ['LICENSE','LICENSES.chromium.html'])if(!fs.statSync(path.join(output,notice)).size)throw Error('Missing Electron license notice: '+notice);
    for(const notice of ['LICENSE','LICENSE-ASSETS.md','NOTICE.md','THIRD_PARTY_NOTICES.md'])if(!asar.extractFile(archive,notice).length)throw Error('Missing project license notice: '+notice);
    if(names.some(name=>/^[/\\](?:actions|local-assets|archive|releases|reports|test|docs|scripts|\.git|\.agents|\.cache|\.smoke-data)(?:[/\\]|$)/.test(name)))throw new Error('Development or build output leaked into the runtime archive');
    const library=JSON.parse(asar.extractFile(archive,path.join('assets','library','catalog.json')).toString('utf8'));
    const garden=JSON.parse(asar.extractFile(archive,path.join('assets','library','garden.json')).toString('utf8'));
    if(garden.clips.length!==11)throw Error('Incomplete packaged garden scenes');
    for(const clip of garden.clips)for(const [field,hashField]of [['media','mediaSha256'],['poster','posterSha256']])if(crypto.createHash('sha256').update(asar.extractFile(archive,path.normalize(clip[field]))).digest('hex')!==clip[hashField])throw Error('Packaged garden checksum mismatch');
    console.log(`Verified ${garden.clips.length} packaged garden videos and posters`);
    console.log(`Verified runtime isolation: ${library.actions.length} actions / ${library.assets.length} media files`);
    console.log(output);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
