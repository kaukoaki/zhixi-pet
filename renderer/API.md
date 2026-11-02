# 知栖前端接口

默认桌面仅展示透明小宠：`index.html` + `style.css` + `app.js`，160 × 210 基础逻辑窗口，默认 165% 缩放。单击切换独立用量窗口；拖动移动；双击打开任务弹窗；右键展示用量、任务、动作和设置菜单。`gestures.js` 负责位移阈值、Windows 双击间隔和取消处理。人物不再显示程序额外生成的文字气泡；视频自带效果保留。

`compact.html` + `compact.css` + `compact.js` 是 352 × 432 任务弹窗。主按钮将文字与工作目录带入 Codex 新对话，用户在 Codex 按 Enter 发送，回复显示在 Codex。“桌宠执行”使用本机 CLI，支持停止、按工作目录续聊和查看本次对话。右键“偏好与动作管理”打开设置弹层，计数按实际槽位数量显示。

`task-view.js` 分开维护回复、过程日志与公开思考摘要，按消息编号更新流式片段，完成时不重复追加同一段回复。窗口重载会重放当前任务事件或显示已保存的最近回复。未提供的模型信息和摘要保持待确认或未返回状态。

`companion-music.js` 播放原创循环《窗边的栖光》，音量 16%。`quietMode=true` 立即暂停音乐，false 恢复；仅人物窗口拥有音频播放器，辅助窗口不重复播放。作品源算法位于 `scripts/compose-companion.py`，不使用外部录音或采样。

`portrait.js` + `portrait.css` 将当前角色原画注入 `[data-qiqi-art]`，提供轻微网格呼吸及透明命中检测。它维护 `window.qiqiIdle` 的暂停原因、开始/停止和截图定格接口；WebGL 不可用时保留原画。旧版 SVG 角色及 CSS 动作库已移除，当前页面从未依赖它们。

`idle-actions.js` 从实际可用的普通视频里随机选择待机片段，排除番茄钟和花园；视频播放由 `playback.js` 管理。新增动作通过主进程槽位、媒体目录和相应制作清单接入，不再向旧 CSS 库添加动作。

前端通过 preload 的 `window.petAPI` 调用：

- `getState()` 返回完整状态；`onState(callback)` 订阅状态。
- `getRuntime()` 只读查询当前目录生效的 Codex 模型与思考强度，结果也位于 `codex.runtime`。执行权限为实际传入 CLI 的工作区写入与按需审批。
- `newConversation()` 另建该目录的桌宠上下文，当前任务运行时禁用；`conversation` 包含当前会话引用、最近问答和已完成轮数。CLI 仅恢复这个明确的会话编号，不使用全局 `--last`。
- `openPomodoro()` 打开人物旁倒计时，`hidePomodoro()` 仅收起窗口。`getPomodoro()` 读取主进程计时状态，`onPomodoro(callback)` 订阅剩余时间、状态和阶段；`onPomodoroPosition(callback)` 更新小尾巴方向。
- `pomodoroCommand({type,minutes})` 的 type 为 `start`、`pause`、`resume`、`stop`、`break`；开始与休息接受 1–180 整数分钟，前端不提交自定义截止时间。绝对截止时间由主进程维护，窗口重载不重置，完成只记一次专注，取消和休息不增加专注次数。
- `getUsage(force=false, animate=false)` 返回实际登录账号的订阅和额度；一分钟内复用结果，并合并并发刷新。`showUsage()` 始终打开独立用量窗口，`toggleUsage()` 供人物单击切换开关；关闭后取消未完成的钱包反应。`onUsage(callback)` 订阅结果。缺失比例为 `null`，不会冒充 100%。
- `animate=true` 仅用于主动查询：等待额度结果后由 `main/wallet-reactions.cjs` 选择钱包反应；定时刷新保持 false。关闭额度窗口、拖动或新查询取消过时反应，任务期间不打断工作动画。
- `onOpenSettings(callback)` 接收右键「偏好与动作管理」的打开请求。
- `updateSettings(patch)`、`chooseWorkspace()`、`importAction(id)`、`clearAction(id)` 返回更新后的完整状态。
- `handoffTask({prompt,cwd})` 使用官方 `codex://new` 链接带入输入框，返回 `{opened:true,sent:false}`，不宣称已自动执行。特殊字符通过 URLSearchParams 编码。
- `runTask({prompt,cwd})`、`cancelTask()`、`onTaskEvent(callback)` 负责桌宠内的真实 CLI 任务。
- `openCodex()` 优先打开当前本地任务的对话；没有对话编号时打开工作区。`openPanel()`、`quit()` 打开任务窗口或退出。
- `petMoved({dx,dy})` 接受屏幕坐标差值，拖动时前端保持鼠标捕获。
- `setPetHover(bool)` 只在小角色可视区域内拦截鼠标，透明边缘穿透。
- `showMenu()` 展示原生右键菜单。
- `playAction(id)`、`onPlayAction(callback)`，事件参数 `{id}`。`media.url` 为 `pet-media://action/{id}`。工作视频在运行中循环，任务状态结束后回到待机；其他视频播放完回到待机。
- `reportPlayback({event,id,reason})` 仅用于人物窗口的 `media-error` / `playback-recovery` 本地诊断；主进程限制类型和字段长度，不记录账号或任务内容。

动作槽为 `greeting`, `drag`, `thinking`, `working`, `success`, `error`, `sleep`, `return`, `focus`, `celebrate`, `pat`, `wallet`, `wallet-careful`, `wallet-low`, `wallet-empty`, `wallet-wait`，全新存档初始为空。旧存档加载时保留原媒体并补齐新增空槽；当前本机已导入全部 16 槽。设置里支持导入、替换、移除、在桌宠上预览；`pat` 位于右键「动作 → 点击回应 → 摸摸头」。空槽触发时保持连续待机。

`pomodoroActions` 是独立六槽：`pomodoro-start` / `study` / `remind` / `doze` / `peek` / `finish`（后五个同样有 `pomodoro-` 前缀）。它们使用相同的安全导入、清理和媒体协议，但不改变普通动作的计数。初始均为空；制作包状态保存在 `actions/production/13-pomodoro/manifest.json`。

`pomodoro-companion.js` 选择学习默认循环和开始/结束衔接，约每 2.5–4 分钟择一已装配小动作，不连续重复同一种。暂停时不触发小动作；任务或拖动优先，窗口重载仅恢复当前循环，不重新播放开始。未装配新包时使用已有工作/鼓劲/成功素材。`setDefault(url,{defer:true})` 先更新返回目标，不在开始/结束动作之前插入一帧普通待机。

缺少 preload 时仅允许外观预览，不模拟任务成功。真实任务、文件选择和 Codex 调用必须通过 Electron。所有任务输出和文件名使用 `textContent` 呈现，CSP 只允许本地资源。

界面共享 `theme.css` 的颜色与字体变量。右键和托盘恢复主进程原生 `Menu`；额外窗口分区隔离人物缩放。五个 `wallet` 系列动作属于「余额」分类，未导入视频时禁用，主动查询按实际余量选择反应后单次返回待机。阈值和异常数据回退见钱包制作包。

`usage-view.js` 统一页面和原生菜单的展示规则：Pro 系列仅保留 `durationMins=10080` 的实际窗口；Plus 及其他套餐保留实际返回的窗口。原始服务数据不修改。`resizeUsage(height)` 仅允许额度窗口调用，主进程限制尺寸并保持气泡靠近桌宠。

`qiqiPlayback.renderSize` 返回屏幕工作画布尺寸；`recoveries` 统计解码器自动重新载入次数。原生视频分辨率仍从 `videoWidth` / `videoHeight` 获取。无效透明帧继续保留旧画面；无合成回调时检查有效解码帧并重新挂接回调，媒体时间 3 秒不前进则仅重试一次。新动作仍通过 generation 取消旧加载或恢复，避免旧动作重新出现。

## 花园场景（0.1.11）

`getJournal()`的`garden.sceneLibrary`提供11段内置视频、阶段图地址和14个可用入口；`getState().gardenAvailable`用于菜单与管理计数，用户自选媒体仍保存在原`gardenActions`。`pet-media://garden/{id}`和`?poster=1`分别提供校验后的内置视频及PNG，日记分区注册相同资源协议。

`gardenCommand(input)`只在主进程保存成功后返回`feedback`与新的`garden`。前端按三个小田分别播放阶段变化；已有叶花期的普通浇水仅返回程序水滴，不回播空土。收获反馈使用真实已保存的一批收获，重复预览不提交交易。

`playAction('garden-…')`打开手账并发送`onGardenPreview({id})`，不在人物窗口播放完整花盆场景。`garden-scene.js`维护单个解码器、阶段静态图、跳过与停滞回退；切页和隐藏时取消队列并释放资源。自选花园视频优先，移除后恢复内置场景。

## 程序特效与商店试穿（0.1.12）

`companion-effects.js`提供`createCompanionEffects(host)`，通过`set(style)`切换none/star/firefly/twinkle/petals/hearts/moonring。相同样式不重建节点，效果不接收鼠标，页面隐藏或系统要求减少动画时暂停或静态显示。人物、花园和商店预览各持有一个实例。

商店试穿仅保留在渲染器局部`previewId`，不调用交易IPC；兑换和装备继续走原`gardenCommand`。金币流水增加gift种类，维护方法`GardenStore.grantCoins`只供显式本地脚本使用，不在preload和交易命令白名单中。赠送按reference去重，不改变收获、出售、浇水或纪念卡条件。

## 花园主题与陶盆调色（0.1.13）

`garden-themes.js`统一三套场景的SVG、CSS变量、纸纹与盆色。`createGardenTheme()`仅将商店局部试穿应用到面板，切页恢复实际装备；主场景始终使用已装备值。SVG渐变引用按宿主分配唯一编号，相同场景不重建节点。

`garden-glaze.js`在640×640内置素材的审核区域做陶盆暖色筛选与釉色映射，保留土壤、红果、人物、绿植及所有alpha。仅处理`pet-media://garden/`素材，自选视频不调色；默认陶盆直接使用原播放器。视频逐解码帧绘制，静态图按URL和盆色缓存，隐藏、切页、取消或关闭时撤销回调；失败恢复原画面。`window.qiqiGardenGlaze`提供只读帧数、运行状态与错误名用于本地验证。
