'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'idle');
const PREVIEW = path.join(ROOT, 'renderer', 'idle-preview.html');
app.setPath('userData', path.join(ROOT, '.smoke-data', 'capture'));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 320, height: 420, show: false, transparent: true, frame: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  await win.loadFile(PREVIEW, { query: { bare: '1' } });
  await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const start=Date.now();const check=()=>window.qiqiIdle?.ready?resolve():Date.now()-start>5000?reject(new Error('Portrait failed to load')):setTimeout(check,30);check()})`);
  const actions = await win.webContents.executeJavaScript('window.qiqiIdle.actions');
  const frames = [{ id: 'base', label: '基础待机', peak: 0 }, ...actions];
  const images = [];
  for (const action of frames) {
    await win.webContents.executeJavaScript(`window.qiqiIdle.pose(${JSON.stringify(action.id)}, ${Number(action.peak)})`);
    await new Promise(resolve => setTimeout(resolve, 150));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${action.id}.png`), image.toPNG());
    images.push({ label: action.label, url: image.toDataURL() });
  }
  const sheet = new BrowserWindow({ width: 1300, height: 900, show: false, frame: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true } });
  await sheet.loadURL('about:blank');
  const sheetUrl = await sheet.webContents.executeJavaScript(`(async () => {
    const items = ${JSON.stringify(images)}, cols = 5, cell = { w: 240, h: 330 };
    const canvas = document.createElement('canvas');
    canvas.width = cols * cell.w; canvas.height = Math.ceil(items.length / cols) * cell.h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '18px "Microsoft YaHei UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#3d3750';
    for (const [index, item] of items.entries()) {
      const img = new Image(); img.src = item.url; await img.decode();
      const x = (index % cols) * cell.w, y = Math.floor(index / cols) * cell.h;
      ctx.drawImage(img, x, y, cell.w, cell.w * 420 / 320);
      ctx.fillText(item.label, x + cell.w / 2, y + cell.h - 10);
    }
    return canvas.toDataURL('image/png');
  })()`);
  fs.writeFileSync(path.join(ROOT, 'docs', 'idle-library.png'), Buffer.from(sheetUrl.split(',')[1], 'base64'));
  console.log(`Captured ${frames.length} poses to ${OUT}`);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
