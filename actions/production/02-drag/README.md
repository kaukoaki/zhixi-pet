# 02 · 被轻轻拎起来

对应 `drag` /「被拎起来」槽。当前使用第二版用户视频，完成背景、水印和地面投影清理，装配为快速提起 → 持续悬空 → 松开放回 → 默认待机。右键菜单提供完整单次预览。

## 当前素材 V2

源视频来自 `<video-directory>\拖动.mp4`，未经修改的副本保存在 `source/drag-source-02.mp4`。规格为 720×720、24 fps、241 帧、约 10.0417 秒，SHA-256 为 `245ef2f2a2d3fb12711f0f9755794c09ce357286f596c93158bfe009790e799a`。成品均为同画幅、24 fps 的真实透明 WebM VP9，静音。

下表源帧编号从 0 开始，区间包含两端。提起段去掉开头等待并加速，悬空段保持原速度。

| `processed/` 中的文件 | 来源及输出 | 用途 |
| --- | --- | --- |
| `drag-preview-v2.webm` | 全部 241 帧，约 10.0417 秒 | 菜单完整播放一次 |
| `drag-enter-v2.webm` | 源 12–39 帧，3.5 倍速取样为 8 帧，约 0.3333 秒 | 快速进入悬空姿势 |
| `drag-hold-v2.webm` | 源 36–185 帧，4 帧交叠后共 146 帧，约 6.0833 秒 | 保持拖动时持续循环 |
| `drag-exit-v2.webm` | 源 186–216 帧，2.6 倍速取样为 12 帧，约 0.5000 秒 | 松手后放回 |

悬空循环从源第 40 帧开始，末尾 4 帧从 182–185 混合至 36–39，接回第 40 帧；提起段也以第 39 帧结束。循环比旧版约 1.33 秒长，减少频繁重复的感觉。实际动作切分以视频内容为准，没有强行按生成提示词的时间切片。

源视频背景为浅灰白色，采用白底分离阈值 210、底部中性投影阈值 125。背景中的角落水印随背景去除，胸口 GPT 标志保留。对完整成品 241 帧检查了水印所在左上及右下背景区域、靴子外侧地面区域，以及头发内部的透明度，检查区域未发现水印/投影残留或头发内部透明孔洞。原视频保留不变。

源片悬空时的顶部发梢已部分超出画面；透明处理没有补画缺失内容。

## 替换整套拖动素材

先退出桌宠，在项目根目录运行：

```powershell
node scripts/import-action.cjs drag-pack `
  actions/production/02-drag/processed/drag-preview-v2.webm `
  actions/production/02-drag/processed/drag-enter-v2.webm `
  actions/production/02-drag/processed/drag-hold-v2.webm `
  actions/production/02-drag/processed/drag-exit-v2.webm
```

CLI 会复制四份文件到应用媒体库并保存分段对应关系，失败时回滚旧包。重启后生效，不影响待机、挥手或其他动作。面板直接导入单个拖动视频会替换分段包；要保留持续悬空效果，应使用上述 `drag-pack`。

## 重现处理

使用 `scripts/prepare-white-video.py`，四份成品均指定 `--threshold 210 --shadow-threshold 125`。预览指定 `--overlap 0`；提起指定 `--start-frame 12 --end-frame 40 --speed 3.5 --overlap 0`；悬空指定 `--start-frame 36 --end-frame 186 --overlap 4`；放回指定 `--start-frame 186 --end-frame 217 --speed 2.6 --overlap 0`。结束帧参数不包含自身。各输出旁的 JSON 保存来源哈希、处理参数、时长与真实解码 alpha 检查结果，`*.review.jpg` 供边缘和衔接目视检查。

真实播放器验收可运行：

```powershell
npm run smoke -- --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-greeting=actions/production/01-greeting/processed/greeting-v1.webm --verify-drag-dir=actions/production/02-drag/processed --verify-drag-version=v2
```

测试在独立 `.smoke-data` 中进行，不替换实际用户媒体。检查完整菜单预览、进入悬空、跨过完整原片时长仍保持拖动、至少完成一轮悬空循环、其他动作不抢占、松手放回与恢复待机。

## 生成资料和历史版本

- 共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`）：已安装待机视频首帧的逐字节副本，用于保持人物构图与大小。
- 共用角色定稿（仅本地制作归档：`../shared/character-design.png`）：原始角色定稿备份。
- `prompt-v2.txt`：10 秒快速提起、稳定悬空版提示词。
- `prompt.txt`：第一版提示词，保留追溯。
- `source/drag-source-01.mp4`：第一版黑底原片，来自 `<video-directory>\拖动反应.mp4`。
- `processed/*-v1.*`：第一版预览、提起、悬空、放回及其检查资料，保留备份。旧提起约 1.9167 秒，旧悬空约 1.3333 秒，旧放回约 1.7917 秒。

下一个动作是 [`thinking` /「想一想」](../03-thinking/README.md)，参考图和 10 秒豆包提示词已准备，收到成片后再接入。
