# 10 · 小小庆祝

对应 `celebrate` /「小小庆祝」槽。用户视频已完成背景、水印和投影处理，保留音符漫画气泡及两颗金色小星星。右键「动作 → 陪伴与心情 → 小小庆祝」可播放一次，结束回到默认待机；已有的 `pet:complete-focus` 完成专注入口也会触发该槽。

## 已装配素材

- 原片：`<video-directory>\庆祝.mp4`，未经修改的副本为 `source/celebrate-source-01.mp4`。
- 源 SHA-256：`7cb70bd47ca858729cc7fd5172b3f9d51b5da77812638ba6e49c47582318c6a3`。
- 成品：`processed/celebrate-v1.webm`，720×720、24 fps、241 帧、约 10.0417 秒、静音、WebM VP9 真实 alpha。
- 保留拍手、笑眼、小幅弹动、脸侧 V 手势、单眼眨眼、点头与站姿归位。
- 原片弹动时有少量呆毛接触上边界，共 4 帧；本次保留原片构图，不生成缺失内容。

## 透明处理与检查

主气泡实测包围范围为 x=535–677、y=68–219，外侧两颗星星也纳入保留区域：

```powershell
& 'E:\Anaconda\python.exe' scripts/prepare-white-video.py actions/production/10-celebrate/source/celebrate-source-01.mp4 actions/production/10-celebrate/processed/celebrate-v1.webm --threshold 210 --shadow-threshold 125 --overlap 0 --keep-region 510,50,190,200
```

保留所有帧和原生帧率，不变速、不交叠循环。逐帧检查水印与靴子外侧投影区域透明、中央头发内部 alpha，以及第 120 帧的音符、气泡小尾巴和两颗星星；开头和结束的气泡位置透明。深浅背景检查见 `processed/celebrate-v1.review.jpg`，处理参数和哈希见旁边的 JSON。

## 导入与应用内验收

先退出桌宠，在项目根目录运行：

```powershell
node scripts/import-action.cjs celebrate actions/production/10-celebrate/processed/celebrate-v1.webm
```

独立验收：

```powershell
npm run smoke -- --smoke-fixture=actions/production/00-idle/processed/idle-loop-v1.webm --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-celebrate=actions/production/10-celebrate/processed/celebrate-v1.webm
```

真实 Electron 检查包含陪伴子菜单点播、静音单次播放、实际画布音符显示、持续帧更新、结束返回待机，以及通过完成专注 IPC 自动触发。统计模拟在独立测试媒体库中进行，恢复测试前的专注计数，不修改真实用户统计，也不运行 Codex 任务。

## 制作资料与下一动作

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`） 保留已装配待机首帧，共用角色定稿（仅本地制作归档：`../shared/character-design.png`） 保留人物定稿，`prompt.txt` 保留这条 10 秒、1:1 视频的制作提示词。

庆祝装配后，最初十个非待机动作槽全部有视频。下一条扩展互动是 [摸摸头 · 蹭蹭](../11-pat/README.md)，已准备参考图与新提示词，待成片后再增加新槽位。
