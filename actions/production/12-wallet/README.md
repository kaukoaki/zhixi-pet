# 12 · 余额 / 查看钱包

已装配用户更新的“查看余额.mp4”和四种钱包反应。菜单「动作 → 余额」可分别点播五个动作。单击查看额度、菜单查看或刷新额度、任务弹窗额度按钮、用量气泡右下角 ↻ 都会在查询返回后按实际额度选择一次反应，结束回到默认待机。后台刷新不播放；执行任务和拖动时保留现有优先规则。

## 钱包反应

| 实际剩余比例 | 动作 | ID |
| --- | --- | --- |
| >50% | 查看钱包 | `wallet` |
| >20% 且 ≤50% | 省着点用 | `wallet-careful` |
| >0% 且 ≤20% | 只剩一点点 | `wallet-low` |
| 0% | 空空的 | `wallet-empty` |
| 0%，且所有耗尽窗口均在未来 30 分钟内重置 | 等一会就好 | `wallet-wait` |

采用页面显示的 Codex 总额度窗口：Plus 同时考虑五小时和周额度，取较低余量；Pro 系列只考虑周额度。这是本项目的默认情绪阈值，可在 `main/wallet-reactions.cjs` 修改，并非订阅服务规定。查询失败、数据过期或缺失、多个模型分桶没有总额度时使用普通查看，不推断账号已用尽。未安装所选动作则回退普通查看；关闭额度窗口、拖动或发起新查询时取消旧查询的待播放结果。

四个新版本的原片、成品、提示词及检查记录见 [variants](variants/README.md)。原文件 `<video-directory>/` 中的四段视频保持不变。

## 当前素材

- 原片：`<video-directory>/查看余额.mp4`，保留不变。
- 原样副本：`source/wallet-source-01.mp4`。
- SHA-256：`0251328199c13df66bade7fb4b284af2f3cf60dd603bdee03b4445d47f1357b1`。
- 透明成品：`processed/wallet-v1.webm`，960 × 960、30 fps、300 帧、10 秒、静音、VP9 真实 alpha，4,898,507 字节。
- 完整保留原帧序列，不裁切、不变速、不做循环交叠。清理灰白背景、背景水印与投影，保留墨蓝钱包、金币、星形效果和“让我看看～”气泡。

```powershell
& 'E:\Anaconda\python.exe' scripts/prepare-white-video.py actions/production/12-wallet/source/wallet-source-01.mp4 actions/production/12-wallet/processed/wallet-v1.webm --threshold 210 --shadow-threshold 125 --overlap 0 --keep-region 20,350,360,250 --keep-region 330,430,320,240 --seal-effect-gaps 3
```

左侧保留区域用于气泡，胸前区域用于短暂分离的金币与星形效果。仅保留区域内前景连通块，不保留矩形背景。小轮廓修补防止气泡浅色内填泄漏变透明。全部 300 帧检查头发内部 alpha=255、角落背景与靴子外投影采样区透明；第 180 帧的钱包、金币、星星、气泡及浅色内填 alpha 均为 255，首尾气泡位置透明。

参数、来源哈希、透明检查及关键帧预览见成品旁 JSON / PNG / review.jpg；完整解码复核记录在 `.cache/wallet-inspect/alpha-verification.json`。

## 导入与验收

先退出桌宠，在项目根目录运行：

```powershell
node scripts/import-action.cjs wallet actions/production/12-wallet/processed/wallet-v1.webm
npm run smoke -- --smoke-fixture=actions/production/00-idle/processed/idle-loop-v1.webm --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-wallet=actions/production/12-wallet/processed/wallet-v1.webm
```

真实 Electron 验收检查查询时单次播放、960 方形静音解码、实际画布的钱包与气泡、连续帧输出、自然播放结束回到默认待机、菜单点播和显式刷新触发；自动后台刷新不触发。烟雾测试使用独立媒体库和测试账号数据。

四个新版本可按 `variants/manifest.json` 中的 ID 与 media 路径使用同一导入命令装配。完整钱包验收在上述烟雾测试命令后追加 `--verify-wallet-variants=actions/production/12-wallet/variants/manifest.json`，使用隔离数据分别检查四种额度、菜单点播、原生解码、气泡和沙漏、播完回待机，以及后台刷新不播放。

动作库现有 16 个非待机槽全部装配，独立待机与其他动作、个人设置保持兼容。

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`） 与 共用角色定稿（仅本地制作归档：`../shared/character-design.png`） 保留原参考素材；`prompt.txt` 为基础版制作提示词。`variants/` 内四个版本已生成并绑定；`01-abundant/` 目前只保留提示词，没有对应视频和动作槽。
