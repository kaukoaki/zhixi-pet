'use strict';
window.__qiqiErrors = [];
window.addEventListener('error', e => window.__qiqiErrors.push(e.message));
window.addEventListener('unhandledrejection', e => window.__qiqiErrors.push(String(e.reason)));
const $ = id => document.getElementById(id), api = window.petAPI;
let timer, selected = 25, pending = false, errorTimer;
function setMinutes(value) {
  if (Number.isInteger(value) && value >= 1 && value <= 180) selected = value;
  for (const button of document.querySelectorAll('[data-minutes]')) button.classList.toggle('selected', Number(button.dataset.minutes) === selected);
  if (!timer || timer.status === 'idle') $('countdown').textContent = `${String(selected).padStart(2,'0')}:00`;
}
function render(value) {
  timer = value; if (value.side) document.body.dataset.side = value.side;
  const active = ['running','paused'].includes(timer.status), completed = timer.status === 'completed', resting = timer.phase === 'break';
  $('clock-card').dataset.phase = resting ? 'break' : 'focus';
  const seconds = Math.ceil((active ? timer.remainingMs : completed ? 0 : selected*60000)/1000);
  $('countdown').textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('heading').textContent = resting ? completed ? '休息好啦' : '休息片刻' : completed ? '这一轮很棒' : '一起专注';
  $('badge').textContent = timer.status === 'paused' ? '已暂停' : active ? resting ? '小休息' : '专注中' : '番茄钟';
  $('message').textContent = completed ? resting ? '准备好了，就再一起出发。' : '辛苦啦，让眼睛也休息一下。' : timer.status === 'paused' ? '慢慢来，准备好再继续。' : active ? resting ? '伸个懒腰，喝一口水。' : '你认真做事，我在旁边陪你。' : '留一小段时间，给眼前的事。';
  $('progress').style.width = `${timer.progress*100}%`; $('track').setAttribute('aria-valuenow', String(Math.round(timer.progress*100)));
  $('duration').hidden = active; $('secondary').hidden = !active && !completed;
  $('secondary').textContent = active ? '结束本轮' : resting ? '收起' : '休息 5 分钟';
  $('primary').textContent = timer.status === 'running' ? '暂停' : timer.status === 'paused' ? resting ? '继续休息' : '继续专注' : completed ? '再专注一轮 ↗' : '开始专注 ↗';
  $('primary').disabled = $('secondary').disabled = pending;
}
async function command(input) {
  if (pending) return; pending = true; $('error').hidden = true; if (timer) render(timer);
  try { render(await api.pomodoroCommand(input)); }
  catch (error) { $('error').textContent = error.message || String(error); $('error').hidden = false; clearTimeout(errorTimer); errorTimer = setTimeout(() => $('error').hidden = true, 3500); }
  finally { pending = false; if (timer) render(timer); }
}
for (const button of document.querySelectorAll('[data-minutes]')) button.addEventListener('click', () => { setMinutes(Number(button.dataset.minutes)); $('minutes').value = String(selected); });
$('minutes').addEventListener('input', () => setMinutes(Number($('minutes').value)));
$('primary').addEventListener('click', () => {
  if (timer?.status === 'running') return command({ type: 'pause' });
  if (timer?.status === 'paused') return command({ type: 'resume' });
  if (!Number.isInteger(Number($('minutes').value)) || Number($('minutes').value) < 1 || Number($('minutes').value) > 180) return command({ type: 'start', minutes: Number($('minutes').value) });
  command({ type: 'start', minutes: selected });
});
$('secondary').addEventListener('click', () => {
  if (timer?.status === 'completed') { if (timer.phase === 'focus') return command({ type: 'break', minutes: 5 }); return api.hidePomodoro(); }
  command({ type: 'stop' });
});
$('close').addEventListener('click', () => api.hidePomodoro());
document.addEventListener('keydown', event => { if (event.key === 'Escape') api.hidePomodoro(); });
if (api) { api.onPomodoro(render); api.onPomodoroPosition(value => { document.body.dataset.side = value.side; }); api.getPomodoro().then(value => { if (value.phase === 'focus' && value.durationMs) { selected = Math.round(value.durationMs/60000); $('minutes').value = String(selected); setMinutes(selected); } render(value); }); }
