'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {workspaceKey}=require('./conversation-store.cjs');
const {DEFAULT_EXECUTION,validateExecutionOptions}=require('./execution-options.cjs');
const {CROPS}=require('./garden.cjs');

const SLOT_DEFINITIONS = [
  ['greeting', '打招呼', '点击回应菜单 / 手动播放'], ['drag', '被拎起来', '拖动角色'],
  ['thinking', '想一想', '任务启动'], ['working', '认真工作', '任务进行中'],
  ['success', '做完啦', '任务完成'], ['error', '小小困惑', '任务失败'],
  ['sleep', '打个盹', '长时间安静'], ['return', '欢迎回来', '唤醒 / 手动播放'],
  ['focus', '一起加油', '专注开始'], ['celebrate', '小小庆祝', '专注结束'],
  ['pat', '摸摸头', '点击回应 / 手动播放'],
  ['wallet', '查看钱包', '查询余额 / 手动播放'],
  ['wallet-careful', '省着点用', '余量 21%–50% / 手动播放'],
  ['wallet-low', '只剩一点点', '余量 1%–20% / 手动播放'],
  ['wallet-empty', '空空的', '可用额度耗尽 / 手动播放'],
  ['wallet-wait', '等一会就好', '额度耗尽且 30 分钟内重置 / 手动播放']
];
const POMODORO_DEFINITIONS = [
  ['pomodoro-start', '就位开工', '番茄钟开始'], ['pomodoro-study', '安静学习', '学习期间循环'],
  ['pomodoro-remind', '认真一点嘛', '学习小动作'], ['pomodoro-doze', '打盹又振作', '学习小动作'],
  ['pomodoro-peek', '偷偷看你', '学习小动作'], ['pomodoro-finish', '这一轮很棒', '番茄钟完成']
];
const GARDEN_DEFINITIONS=[['garden-plant','种下种子','花园播种'],['garden-water','浇水打卡','每日浇水'],...CROPS.flatMap(crop=>[['grow','长叶'],['bloom','开花'],['ripe','成熟'],['harvest','收获']].map(([stage,label])=>[`garden-${crop.id}-${stage}`,`${crop.name} · ${label}`,'花园成长 / 手动点播']))];
const EXTENSIONS = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime' };
const DRAG_PHASES = ['enter', 'hold', 'exit'];
const safeMediaName = file => typeof file === 'string' && file.length > 0 && !/[\\/:]/.test(file) && path.basename(file) === file && Boolean(EXTENSIONS[path.extname(file).toLowerCase()]);

function freshState(workspace) {
  return {
    version: 1, character: { name: '知栖', id: 'qiqi' },
    settings: { scale: 1.65, alwaysOnTop: true, quietMode: false, randomIdle:true, workspace },
    executionProfiles: {},
    actions: SLOT_DEFINITIONS.map(([id, label, trigger]) => ({ id, label, trigger, media: null })),
    pomodoroActions: POMODORO_DEFINITIONS.map(([id, label, trigger]) => ({ id, label, trigger, media: null })),
    gardenActions:GARDEN_DEFINITIONS.map(([id,label,trigger])=>({id,label,trigger,media:null})),
    idle: { id: 'idle', label: '默认待机', media: null },
    position: null, stats: { completedTasks: 0, focusSessions: 0 }
  };
}

function validateSettings(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置格式无效');
  const result = { ...current };
  if (Object.hasOwn(patch, 'scale')) {
    if (!Number.isFinite(patch.scale) || patch.scale < 0.65 || patch.scale > 2) throw new Error('缩放范围为 65%–200%');
    result.scale = Math.round(patch.scale * 100) / 100;
  }
  for (const key of ['alwaysOnTop', 'quietMode', 'randomIdle']) {
    if (Object.hasOwn(patch, key)) {
      if (typeof patch[key] !== 'boolean') throw new Error('设置需要布尔值');
      result[key] = patch[key];
    }
  }
  if (Object.hasOwn(patch, 'workspace')) {
    if (typeof patch.workspace !== 'string' || !path.isAbsolute(patch.workspace) || !fs.statSync(patch.workspace).isDirectory()) {
      throw new Error('请选择存在的工作文件夹');
    }
    result.workspace = path.resolve(patch.workspace);
  }
  return result;
}

class PetStore {
  constructor(directory, workspace) {
    this.directory = directory;
    this.mediaDirectory = path.join(directory, 'media');
    this.file = path.join(directory, 'state.json');
    this.state = freshState(workspace);
    this.pendingStats = false;
    this.statsWarning = null;
    fs.mkdirSync(this.mediaDirectory, { recursive: true });
    if (fs.existsSync(this.file)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.state.settings = validateSettings(this.state.settings, saved.settings || {});
        for(const [key,options]of Object.entries(saved.executionProfiles||{})){
          if(!/^[a-f0-9]{64}$/.test(key))continue;
          try{this.state.executionProfiles[key]=validateExecutionOptions(DEFAULT_EXECUTION,options);}catch{/* Invalid execution preferences never widen permissions. */}
        }
        if (saved.position && Number.isFinite(saved.position.x) && Number.isFinite(saved.position.y)) this.state.position = saved.position;
        for (const slot of [...this.state.actions, ...this.state.pomodoroActions,...this.state.gardenActions, this.state.idle]) {
          const savedSlot = slot.id === 'idle' ? saved.idle : [...(saved.actions || []), ...(saved.pomodoroActions || []),...(saved.gardenActions||[])].find(a => a.id === slot.id);
          const media = savedSlot?.media;
          const loaded = this.loadManagedMedia(media);
          if (loaded) {
            slot.media = loaded;
            if (slot.id === 'drag' && media.phases && typeof media.phases === 'object') {
              const phases = Object.fromEntries(DRAG_PHASES.map(phase => [phase, this.loadManagedMedia(media.phases[phase])]));
              if (DRAG_PHASES.every(phase => phases[phase])) slot.media.phases = phases;
            }
          }
        }
        for (const key of ['completedTasks', 'focusSessions']) {
          if (Number.isSafeInteger(saved.stats?.[key]) && saved.stats[key] >= 0) this.state.stats[key] = saved.stats[key];
        }
      } catch (error) { this.loadWarning = '本地设置无法完整读取，已使用默认设置：' + error.message; }
    }
  }
  save() {
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
    this.pendingStats = false;
    this.statsWarning = null;
  }
  snapshot() {
    const state = structuredClone(this.state);
    for (const slot of [...state.actions, ...state.pomodoroActions,...state.gardenActions, state.idle]) if (slot.media) {
      const media = slot.media;
      slot.media = this.publicMedia(media, slot.id);
      if (slot.id === 'drag' && media.phases) {
        slot.media.phases = Object.fromEntries(DRAG_PHASES.map(phase => [phase, this.publicMedia(media.phases[phase], slot.id, phase)]));
      }
    }
    return state;
  }
  updateSettings(patch) { this.state.settings = validateSettings(this.state.settings, patch); this.save(); return this.snapshot(); }
  executionOptions(cwd=this.state.settings.workspace){return {...DEFAULT_EXECUTION,...this.state.executionProfiles[workspaceKey(cwd)]};}
  updateExecutionOptions(cwd,patch){
    const key=workspaceKey(cwd),previous=this.state.executionProfiles[key];
    this.state.executionProfiles[key]=validateExecutionOptions(this.executionOptions(cwd),patch);
    try{this.save();}catch(error){if(previous)this.state.executionProfiles[key]=previous;else delete this.state.executionProfiles[key];throw error;}
    return this.executionOptions(cwd);
  }
  slot(id) {
    if (id === 'idle') return this.state.idle;
    const slot = [...this.state.actions, ...this.state.pomodoroActions,...this.state.gardenActions].find(a => a.id === id);
    if (!slot) throw new Error('未知动作槽');
    return slot;
  }
  async importAction(id, source) {
    const slot = this.slot(id);
    const mime = EXTENSIONS[path.extname(source).toLowerCase()];
    if (!mime) throw new Error('请选择 WebM、MP4 或 MOV 视频');
    const stat = await fs.promises.stat(source);
    if (!stat.isFile() || stat.size === 0 || stat.size > 500 * 1024 * 1024) throw new Error('视频需为非空文件，且不超过 500 MB');
    const previous = slot.media;
    const file = `${id}-${crypto.randomUUID()}${path.extname(source).toLowerCase()}`;
    await fs.promises.copyFile(source, path.join(this.mediaDirectory, file));
    slot.media = { file, name: path.basename(source), mime };
    try { this.save(); } catch (error) { slot.media = previous; await fs.promises.unlink(path.join(this.mediaDirectory, file)).catch(() => {}); throw error; }
    await this.removeManaged(previous);
    return this.snapshot();
  }
  loadManagedMedia(media) {
    if (!media || !safeMediaName(media.file)) return null;
    const file = path.join(this.mediaDirectory, media.file);
    try {
      if (!fs.statSync(file).isFile() || path.dirname(fs.realpathSync(file)) !== fs.realpathSync(this.mediaDirectory)) return null;
    } catch { return null; }
    return { file: media.file, name: String(media.name || media.file), mime: EXTENSIONS[path.extname(media.file).toLowerCase()] };
  }
  publicMedia(media, id, phase = null) {
    return { name: media.name, mime: media.mime, url: `pet-media://action/${id}?${phase ? `phase=${phase}&` : ''}v=${encodeURIComponent(media.file)}` };
  }
  async importDragPack(sources) {
    if (!sources || typeof sources !== 'object' || Array.isArray(sources)) throw new Error('拖动素材包格式无效');
    const parts = ['preview', ...DRAG_PHASES], prepared = {};
    // Validate every part before creating any managed copy.
    for (const part of parts) {
      const source = sources[part];
      if (typeof source !== 'string' || !source) throw new Error(`缺少拖动素材：${part}`);
      const extension = path.extname(source).toLowerCase(), mime = EXTENSIONS[extension];
      if (!mime) throw new Error('请选择 WebM、MP4 或 MOV 视频');
      const stat = await fs.promises.stat(source);
      if (!stat.isFile() || stat.size === 0 || stat.size > 500 * 1024 * 1024) throw new Error('视频需为非空文件，且不超过 500 MB');
      prepared[part] = { file: `drag-${part}-${crypto.randomUUID()}${extension}`, name: path.basename(source), mime };
    }
    const slot = this.slot('drag'), previous = slot.media, created = [];
    try {
      for (const part of parts) {
        const destination = path.join(this.mediaDirectory, prepared[part].file);
        created.push(destination);
        await fs.promises.copyFile(sources[part], destination);
      }
      slot.media = { ...prepared.preview, phases: Object.fromEntries(DRAG_PHASES.map(phase => [phase, prepared[phase]])) };
      this.save();
    } catch (error) {
      slot.media = previous;
      await Promise.allSettled(created.map(file => fs.promises.unlink(file)));
      throw error;
    }
    await this.removeManaged(previous);
    return this.snapshot();
  }
  async removeManaged(media) {
    if (!media) return;
    const parts = [media, ...DRAG_PHASES.map(phase => media.phases?.[phase])];
    const files = new Set(parts.filter(part => part && safeMediaName(part.file)).map(part => part.file));
    await Promise.allSettled([...files].map(file => fs.promises.unlink(path.join(this.mediaDirectory, file))));
  }
  async clearAction(id) {
    const slot = this.slot(id), previous = slot.media;
    slot.media = null;
    try { this.save(); } catch (error) { slot.media = previous; throw error; }
    await this.removeManaged(previous);
    return this.snapshot();
  }
  mediaPath(id, phase = null) {
    if (phase !== null && phase !== undefined && (id !== 'drag' || !DRAG_PHASES.includes(phase))) return null;
    const media = this.slot(id).media;
    const selected = phase === null || phase === undefined ? media : media?.phases?.[phase];
    return this.loadManagedMedia(selected) ? path.join(this.mediaDirectory, selected.file) : null;
  }
  setPosition(position) {
    if (Number.isFinite(position.x) && Number.isFinite(position.y)) this.state.position = { x: Math.round(position.x), y: Math.round(position.y) };
    this.save();
  }
  increment(key) {
    if (!Object.hasOwn(this.state.stats, key)) return false;
    this.state.stats[key]++;
    this.pendingStats = true;
    return this.retryStats();
  }
  retryStats() {
    if (!this.pendingStats) return true;
    try {
      this.save();
      this.pendingStats = false;
      this.statsWarning = null;
      return true;
    } catch {
      this.pendingStats = true;
      this.statsWarning = '本地统计暂时未保存，稍后会自动重试。';
      return false;
    }
  }
}
module.exports = { PetStore, freshState, validateSettings, SLOT_DEFINITIONS, POMODORO_DEFINITIONS,GARDEN_DEFINITIONS };
