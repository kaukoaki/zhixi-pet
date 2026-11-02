'use strict';
function pomodoroBounds(pet, area, height = 214) {
  const width = 248, gap = 8;
  const side = pet.x+pet.width+gap+width <= area.x+area.width-6 ? 'right' : 'left';
  const targetX = side === 'right' ? pet.x+pet.width+gap : pet.x-width-gap;
  const x = Math.round(Math.max(area.x+6, Math.min(targetX, area.x+area.width-width-6)));
  const y = Math.round(Math.max(area.y+6, Math.min(pet.y+pet.height*.57-height/2, area.y+area.height-height-6)));
  return { bounds: { x, y, width, height }, side };
}
function buildPomodoroMenu(timer, callbacks) {
  const active = ['running','paused'].includes(timer.status);
  return { id: 'pet-pomodoro', label: active ? `番茄钟 · ${timer.status === 'paused' ? '已暂停' : timer.phase === 'break' ? '休息中' : '专注中'}` : '番茄钟', submenu: [
    { id: 'pet-pomodoro-open', label: '打开倒计时', click: callbacks.open },
    ...[25,45,60].map(minutes => ({ id: `pet-pomodoro-start-${minutes}`, label: `${minutes} 分钟专注`, enabled: !active, click: () => callbacks.command({ type: 'start', minutes }) })),
    { id: 'pet-pomodoro-pause', label: timer.status === 'paused' ? '继续计时' : '暂停计时', enabled: active, click: () => callbacks.command({ type: timer.status === 'paused' ? 'resume' : 'pause' }) },
    { id: 'pet-pomodoro-stop', label: '结束本轮', enabled: active, click: () => callbacks.command({ type: 'stop' }) }
  ] };
}
module.exports = { pomodoroBounds, buildPomodoroMenu };
