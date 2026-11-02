# 05 · 完成啦

对应 `success` /「做完啦」槽。用户生成的视频已完成浅灰白背景、水印和地面投影清理，装配为约 10.04 秒的单次成功反应。右键「动作 → 工作状态 → 做完啦」可预览，任务完成时自动触发，播放结束回到默认待机。

## 已装配素材

- 原片：`<video-directory>\完成啦.mp4`，未经修改的副本为 `source/success-source-01.mp4`。
- 源 SHA-256：`fafc6bb4353050d7965d7d71e05802a795f6c388d1ca8a11be539ec51960d7b5`。
- 成品：`processed/success-v1.webm`，720×720、24 fps、241 帧、约 10.0417 秒、静音、WebM VP9 真实 alpha。
- 保留完整握拳、开心张嘴、闭眼笑、重新睁眼和收手回站姿。胸口 GPT 标志可见，完整呆毛、长发、双手及靴子均在画面内。

## 处理与验证

使用 `scripts/prepare-white-video.py`，指定 `--threshold 210 --shadow-threshold 125 --overlap 0`，保留原生帧率和全部帧，不做循环交叠或变速。源文件未修改。输出旁的 JSON 记录处理参数、来源哈希和解码 alpha；`success-v1.review.jpg` 供深浅背景目视检查。

对全部 241 帧检查了水印所在的左上和右下背景区域、靴子外侧地面区域，以及头发内部 alpha，检查区域未发现水印/投影残留或内部透明孔洞。握拳时发梢会轻微摆动，右下背景检查区域从 y=650 开始，避免把 y=630 附近的真实发梢当作水印。

真实 Electron 验证包括菜单点播、单次播放、画布持续更新、结束返回待机，以及通过本地模拟的任务完成事件自动触发成功动作。模拟在独立测试媒体库中进行，关闭了测试通知，没有启动真实 Codex 任务，也未修改实际用户的任务统计。

## 重新导入与验收

先退出桌宠，在项目根目录运行：

```powershell
node scripts/import-action.cjs success actions/production/05-success/processed/success-v1.webm
```

重启后生效，只替换成功动作。也可在桌宠动作管理中向「做完啦」槽导入此透明成品。

独立验收命令：

```powershell
npm run smoke -- --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-success=actions/production/05-success/processed/success-v1.webm
```

## 生成资料与下一动作

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`） 是已装配待机首帧的逐字节副本，来自 `00-idle/processed/idle-loop-v1.first-frame.png`；共用角色定稿（仅本地制作归档：`../shared/character-design.png`） 是原始定稿备份，`prompt.txt` 保留本次 10 秒、1:1 豆包提示词。

下一动作是 [`error` /「小小困惑」](../06-error/README.md)。新提示词加强眼神、眉眼嘴角、手势、柔软起落与发梢跟随，使用连续的情绪递进表现日系 Q 版角色的可爱与灵动。后续制作延续 [角色动画演出原则](../../../docs/ANIMATION-DIRECTION.md)。
