'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let count = 0;
function check(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'releases', 'archive', 'reports', '.git', '.cache', '.smoke-data', 'protocol-temp'].includes(item.name)) continue;
    const file = path.join(directory, item.name);
    if (item.isDirectory()) check(file);
    else if (/\.(?:cjs|js|mjs)$/.test(item.name)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
      if (result.status !== 0) { process.stderr.write(result.stderr || result.error?.message || 'Syntax check failed'); process.exit(1); }
      count++;
    }
  }
}
check(root);
for (const file of ['main/codex-usage.cjs', 'main/wallet-reactions.cjs', 'main/usage-menu.cjs', 'renderer/usage.html', 'renderer/usage.css', 'renderer/usage.js', 'renderer/gestures.js', 'renderer/theme.css', 'renderer/usage-view.js']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing usage/gesture asset: ${file}`);
}
for (const file of ['main/pomodoro.cjs','main/pomodoro-window.cjs','renderer/pomodoro.html','renderer/pomodoro.css','renderer/pomodoro.js','renderer/pomodoro-companion.js']) {
  if (!fs.existsSync(path.join(root,file))) throw new Error(`Missing pomodoro asset: ${file}`);
}
for (const file of ['renderer/index.html', 'renderer/style.css', 'renderer/app.js', 'renderer/idle-preview.html', 'renderer/idle-preview.js', 'renderer/idle-preview.css', 'renderer/compact.html', 'renderer/compact.js', 'renderer/compact.css']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing asset: ${file}`);
}
console.log(`Checked ${count} JavaScript files and required local assets.`);
for(const file of ['main/journal.cjs','renderer/journal.html','renderer/journal.css','renderer/journal.js']){
 if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing journal asset: ${file}`);
}
for(const file of ['renderer/card-collection.js','renderer/cards.css'])if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing card collection asset: ${file}`);
for(const file of ['main/journal-heartbeat.cjs','renderer/journal-drafts.js'])if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing journal recovery asset: ${file}`);
for(const file of ['main/garden.cjs','renderer/garden.js','renderer/garden.css','renderer/garden-art.js'])if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing garden asset: ${file}`);
for(const file of ['main/execution-options.cjs','main/codex-interactive.cjs','main/task-runner.cjs','renderer/execution-settings.js','renderer/idle-actions.js']){
  if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing execution settings asset: ${file}`);
}
for (const file of ['renderer/portrait.js', 'renderer/portrait.css', 'renderer/playback.js', 'renderer/drag-reaction.js', 'renderer/companion-music.js', 'renderer/task-view.js', 'main/conversation-store.cjs', 'main/codex-runtime.cjs', 'assets/audio/window-light.wav', 'assets/audio/music.json', 'assets/character/qiqi-chibi-v5-knot-sprout.png']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing portrait asset: ${file}`);
}

for(const file of ['renderer/companion-effects.js','renderer/companion-effects.css','renderer/shop.css'])if(!fs.existsSync(path.join(root,file)))throw Error('Missing companion effect asset: '+file);

for(const file of ['renderer/garden-themes.js','renderer/garden-themes.css','renderer/garden-glaze.js'])if(!fs.existsSync(path.join(root,file)))throw Error('Missing garden theme asset: '+file);
