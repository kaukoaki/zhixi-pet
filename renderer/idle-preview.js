'use strict';
const idle = window.qiqiIdle;
const params = new URLSearchParams(location.search);
const buttons = document.getElementById('buttons');
if (params.has('bare')) document.documentElement.classList.add('bare');
for (const action of idle.actions) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = action.label;
  button.dataset.id = action.id;
  button.addEventListener('click', () => idle.play(action.id));
  buttons.append(button);
}
setInterval(() => { for (const button of buttons.children) button.classList.toggle('active', button.dataset.id === idle.current); }, 120);
document.getElementById('auto').addEventListener('change', event => event.target.checked ? idle.start() : idle.stop());
if (params.has('pose')) idle.pose(params.get('pose'), Number(params.get('t')) || 0);
else if (!params.has('bare')) idle.start();
