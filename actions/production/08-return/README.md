# 08 · 欢迎回来

对应 `return` /「欢迎回来」槽。用户生成的视频已完成浅灰白背景、水印和地面投影处理，保留爱心漫画气泡及小尾巴，装配为约 10.04 秒的单次欢迎反应。右键「动作 → 陪伴与心情 → 欢迎回来」可点播，结束回到默认待机。当前不新增自动唤醒触发。

## 已装配素材

- 原片：`<video-directory>\欢迎回来.mp4`，未经修改的副本为 `source/return-source-01.mp4`。
- 源 SHA-256：`c05cd26403b3b28a481e7efafdb49121712f3dee326ab9df7a3db5f587da0ccc`。
- 成品：`processed/return-v1.webm`，720×720、24 fps、241 帧、约 10.0417 秒、静音、WebM VP9 真实 alpha。
- 保留发现主人、招手、笑眼、张开双手欢迎、单眼眨眼和微笑归位；完整人物、呆毛、发梢、手部和靴子均在画面内。

## 透明处理与验收

气泡约在第 62–160 帧出现并收起，完整独立前景的实测包围范围为 x=550–691、y=88–229。使用 `--keep-region 530,65,180,205` 保留气泡、爱心和小尾巴，避开两处水印。区域里的空白背景仍保持透明。

保留全部帧与原生帧率，不裁切、不变速、不做循环交叠：

```powershell
& 'E:\Anaconda\python.exe' scripts/prepare-white-video.py actions/production/08-return/source/return-source-01.mp4 actions/production/08-return/processed/return-v1.webm --threshold 210 --shadow-threshold 125 --overlap 0 --keep-region 530,65,180,205
```

输出旁的 JSON 记录参数、来源哈希和解码 alpha；`return-v1.review.jpg` 供深浅背景目视检查。对全部 241 帧检查水印所在的左上、右下背景区域及靴子外侧投影区域，均透明；中央头发内部 alpha=255。第 120 帧的爱心、气泡内填和小尾巴探针 alpha 均为 255，开头及结尾相同的气泡探针位置透明。

真实 Electron 验收包含陪伴子菜单点播、720×720 解码、静音单次播放、画布帧更新、实际显示画布中的粉色爱心，以及播放结束回到待机。测试使用独立媒体库，不启动真实 Codex 任务。

## 重新导入与验收

先退出桌宠，在项目根目录运行：

```powershell
node scripts/import-action.cjs return actions/production/08-return/processed/return-v1.webm
```

重启后生效，只替换欢迎动作；也可在动作管理中向「欢迎回来」槽导入此透明成品。

独立验收命令：

```powershell
npm run smoke -- --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-return=actions/production/08-return/processed/return-v1.webm
```

## 生成资料与下一动作

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`） 是已装配待机首帧的逐字节副本，共用角色定稿（仅本地制作归档：`../shared/character-design.png`） 保留人物定稿，`prompt.txt` 保留本条 10 秒、1:1 豆包提示词。

后续动作 [`focus` /「一起加油」](../09-focus/README.md) 已更新 V2：转身、跳跃、正面举臂握拳，并保留中文加油气泡。演出延续 [角色动画演出原则](../../../docs/ANIMATION-DIRECTION.md)，保持可爱、灵动与轻松陪伴感。
