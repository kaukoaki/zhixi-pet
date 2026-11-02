'use strict';

const GROUPS = [
  { id: 'drag', label: '拖拽', slots: ['drag'] },
  { id: 'click', label: '点击回应', slots: ['greeting', 'pat'] },
  { id: 'work', label: '工作状态', slots: ['thinking', 'working', 'success', 'error'] },
  { id: 'companion', label: '陪伴与心情', slots: ['return', 'focus', 'celebrate'] },
  { id: 'rest', label: '休息', slots: ['sleep'] },
  { id: 'balance', label: '余额', slots: ['wallet','wallet-careful','wallet-low','wallet-empty','wallet-wait'] }
];

function buildActionMenu(state, onPlay, {setRandomIdle,gardenAvailable=()=>false}={}) {
  const pomodoroActions = state.pomodoroActions || [];
  const gardenActions=state.gardenActions||[];
  const actions = new Map([...(state.actions || []), ...pomodoroActions,...gardenActions].map(slot => [slot.id, slot]));
  const groups = [...GROUPS, { id: 'pomodoro', label: '番茄钟', slots: pomodoroActions.map(slot => slot.id) },{id:'garden',label:'小花园',slots:gardenActions.map(slot=>slot.id)}];
  return [
    { id: 'pet-group-idle', label: '待机', submenu: [
      ...(setRandomIdle?[{id:'pet-random-idle',label:'随机播放普通动作',type:'checkbox',checked:state.settings?.randomIdle!==false,click:item=>setRandomIdle(item.checked)}]:[]),
      { id: 'pet-idle-loop', label: state.idle?.media ? '自然待机 · 循环' : '原画待机', click: () => onPlay('idle') }
    ] },
    ...groups.map(group => ({
      id: `pet-group-${group.id}`, label: group.label,
      submenu: group.slots.map(id => actions.get(id)).filter(Boolean).map(slot => slot.media || gardenAvailable(slot.id)
        ? { id: `pet-action-${slot.id}`, label: slot.label, click: () => onPlay(slot.id) }
        : { id: `pet-unavailable-${slot.id}`, label: `${slot.label}（待添加）`, enabled: false })
    })).filter(group => group.submenu.length),
    { type: 'separator' },
    { id: 'pet-return-idle', label: '返回默认待机', click: () => onPlay('idle') }
  ];
}

module.exports = { buildActionMenu };
