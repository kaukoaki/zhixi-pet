# 播放稳定性

2026-10-24 用户反馈整个桌宠无响应或消失。检查时应用进程已不在运行，旧 stdout/stderr 和 Windows 应用事件中没有可用的退出原因；原版本连续切换与四段钱包完整播放没有复现崩溃，因此没有将退出原因归咎于某一段视频。

检查发现原播放器每帧将原生 960 方形视频绘制到完整工作画布，再复制到小画布读取 alpha，容易触发同步 GPU 回读。调整后直接在 24 方形 CPU 画布检查 alpha，工作画布按实际窗口大小及 DPI 绘制，最低 256、最高原生分辨率，不改动源视频、成品视频及帧率。切换完成后立即暂停旧解码器，延迟释放资源；无效帧仍保留上一次人物画面。

## 恢复路径

- 首帧合成回调丢失：100ms 检查已解码的有效帧，保持透明内容校验。
- 正在播放但回调中断：400ms 后尝试绘制有效帧并重新挂接回调。
- 媒体时间停止超过 3 秒：从当前位置重新加载一次；仍然停住则恢复人物原画，避免无限重试。暂停、遮挡和新动作取消另作处理。
- 未收到 ended 事件但媒体确已结束：播放监测完成回待机或拖动阶段交接。
- 人物绘制进程崩溃：保留主进程、动作绑定和设置，重新加载人物窗口。
- 人物窗口持续无响应：等待响应 5 秒后终止故障绘制进程，再重新加载。短时间反复故障采用退避，最多间隔 30 秒，避免立即重复崩溃循环。

这些恢复针对渲染与媒体进程。操作系统终止整个应用、断电或原生主进程致命崩溃，仍需重新启动应用；本次没有擅自添加开机服务或常驻外部看门狗。

## 本地诊断

0.1.1 修复了辅助窗口销毁后残留引用的问题：关闭时按实例清理引用，延迟回调只作用于原实例，任务窗口、额度和番茄钟可重新创建；重建不重启任务或计时。任务标题栏不再放置设置齿轮，动作管理仍由右键菜单打开。

媒体改用本地文件流响应，支持 GET、HEAD、206 单段 Range 和请求取消；旧视频的取消不影响下一段加载。新动作加载失败先重新加载一次，仍失败时保留有效旧画面或恢复默认视频；默认视频也无法恢复时才使用原画兜底。不再弹出大段视频故障台词。故障会记录到本地诊断，界面不直接展示内部 IPC 错误前缀。

附加复现检查使用独立测试数据：

```powershell
npm run smoke -- --verify-launch --verify-window-lifecycle --verify-pomodoro-media --smoke-fixture=actions/production/00-idle/processed/idle-loop-v1.webm --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm
```

测试主动销毁并重建辅助窗口，验证任务和计时保留、设置右键入口、Range 字节内容，以及两次媒体请求失败后的画面恢复；不会在真实用户库注入这些故障。

`%APPDATA%\QiqiCodexPet\logs\runtime.jsonl` 记录启动、退出、绘制进程结束原因、无响应和播放恢复。日志超过 1MB 轮转，保留一份上一版。不记录账号额度、任务请求或任务输出。

## 验收

```powershell
npm test
npm run check
node_modules/electron/dist/electron.exe scripts/stress-playback.cjs --label=after --rounds=3
npm run smoke -- --smoke-fixture=actions/production/00-idle/processed/idle-loop-v1.webm --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-wallet=actions/production/12-wallet/processed/wallet-v1.webm --verify-wallet-variants=actions/production/12-wallet/variants/manifest.json --verify-renderer-recovery
```

压力测试使用 `.cache/playback-stress-profile` 独立数据，依次验证全动作、连续快速切换、四段钱包自然结束回待机及反复拖动。烟雾测试使用 `.smoke-data`，还主动制造绘制进程崩溃和 JavaScript 死循环，检查人物窗口恢复。不要对正在执行真实任务的应用手工注入这些故障；测试命令已经隔离用户媒体库。

当前本机记录：`.cache/playback-stress-before.json`、`.cache/playback-stress-after.json`、`docs/smoke-result.json`。原版一次 120 次快速切换、调整后三轮共 360 次均完成；四段钱包每段约 300 帧正常呈现。压力测试 alpha 读取平均耗时从约 2.60ms 降至 0.05ms；GPU 进程工作集峰值原约 918MB，调整后约 182MB。两次运行轮数不同，这些数字用于说明本机绘制开销变化，不能视为所有设备的固定性能保证。
