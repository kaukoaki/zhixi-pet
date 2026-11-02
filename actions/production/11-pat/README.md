# 11 · 摸摸头 · 蹭蹭

对应新增的 `pat` /「摸摸头」槽。用户视频已完成背景、水印与投影处理，保留手摸头、脸红害羞、贴着手心蹭蹭、「嘿嘿～」漫画气泡和爱心。右键「动作 → 点击回应 → 摸摸头」可单次播放约 10.04 秒，结束回到默认待机。

## 素材与透明处理

- 原片：`<video-directory>\摸摸头.mp4`，原样副本为 `source/pat-source-01.mp4`。
- 源 SHA-256：`1e2f72095a56d910e6c1a0c37cda26bbc294f24193da9acb75de42976d51b2e9`。
- 成品：`processed/pat-v1.webm`，720×720、24 fps、241 帧、约 10.0417 秒、静音、WebM VP9 真实 alpha。
- 完整保留所有帧和原生帧率，不变速、不裁切、不交叠循环。互动手在画面边缘进出属于原片设计，处理记录中的 69 帧上边界接触包含手及手腕，不代表人物头部裁切。

互动手在第一帧与人物分离，第 228 帧退出时也会成为独立前景。保留右上到脸侧的手部区域及左侧漫画效果区域，避免按最大连通人物规则删掉手：

```powershell
& 'E:\Anaconda\python.exe' scripts/prepare-white-video.py actions/production/11-pat/source/pat-source-01.mp4 actions/production/11-pat/processed/pat-v1.webm --threshold 210 --shadow-threshold 125 --overlap 0 --keep-region 160,0,560,500 --keep-region 20,60,240,270 --seal-effect-gaps 3
```

使用 3 像素局部轮廓修补保留气泡浅色内填，区域里的空白背景仍透明。参数、来源哈希和真实解码 alpha 见成品旁 JSON；深浅背景目视检查见 `pat-v1.review.jpg`。

## 槽位与兼容

新增第 11 个非待机动作槽 `pat`，归入原有「点击回应」子菜单，与「打招呼」分别点播。动作管理支持导入、替换、预览和移除；计数使用实际动作数量，安装后为 `11 / 11`。

原十槽存档加载时保留现有媒体、设置、位置和统计，增加 `pat`；无需重导其他动作。默认待机依旧独立保存。

## 导入与验收

先退出桌宠，在项目根目录运行：

```powershell
node scripts/import-action.cjs pat actions/production/11-pat/processed/pat-v1.webm
```

真实 Electron 验收：

```powershell
npm run smoke -- --smoke-fixture=actions/production/00-idle/processed/idle-loop-v1.webm --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-pat=actions/production/11-pat/processed/pat-v1.webm
```

检查菜单点播、720×720 静音单次播放、实际画布的互动手与中文气泡、结束返回待机、管理面板按 11 槽计数，以及连续移动尺寸稳定。测试使用独立媒体库，不启动真实 Codex 任务。

对全部 241 帧检查角落水印与靴子外侧投影区域透明、人物内部探针 alpha=255；首帧的独立手、第 144 帧的手、中文气泡和爱心 alpha 均为 255。深浅背景检查覆盖手摸头、移到脸侧、蹭蹭和退出过程。

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`） 保留已装配待机首帧；共用角色定稿（仅本地制作归档：`../shared/character-design.png`） 保留人物定稿。`prompt.txt` 保存本条脸红、害羞、蹭手心版本的制作提示词，`prompt-v1.txt` 保留早期无互动手的提示词。
