# 09 · 一起加油 V2

对应 `focus` /「一起加油」槽。用户提供的新版加油已替换 V1：转身、跳起、正面举臂握拳，保留左右两枚中文加油气泡。右键「动作 → 陪伴与心情 → 一起加油」播放约 10.04 秒，结束回到默认待机。当前不新增专注计时器或自动开始逻辑。

## 已装配素材

- 最新原片：`<video-directory>\一起加油.mp4`，V2 原样副本为 `source/focus-source-02.mp4`。
- V2 源 SHA-256：`4c0925510eb10d6b8ba0b676a7837a178752386d8de6b895d3f1b6550f79e827`。
- 当前成品：`processed/focus-v2.webm`，720×720、24 fps、241 帧、约 10.0417 秒、静音、WebM VP9 真实 alpha。
- V1 的 `source/focus-source-01.mp4`、`processed/focus-v1.webm` 与 `prompt-v1.txt` 保留为制作历史；V1 源哈希为 `f12c571bcc9c76053cc5ead8b97b20d956d167f82314e0d3a173d2a6589c69c2`。
- `prompt.txt` 是 V2 的原地转圈、跳跃、举拳及中文「加油！！」制作提示词；成片实际生成两枚气泡，左侧「加油！」、右侧「加油！！」，均原样保留。

原片跳跃最高点存在呆毛轻微出框：处理记录中有 18 帧接触上边界。这是输入视频已有的构图限制，本次不缩放、裁剪或虚构缺失部分。

## 透明处理

中文气泡的实测大组件包围范围为 x=13–689、y=62–225，分别保留左侧与右侧两个区域。右侧气泡的浅色内填曾因细小轮廓缺口漏入背景分离，本次使用 3 像素局部轮廓修补，消除透明条纹，同时保留文字和空白背景。

```powershell
& 'E:\Anaconda\python.exe' scripts/prepare-white-video.py actions/production/09-focus/source/focus-source-02.mp4 actions/production/09-focus/processed/focus-v2.webm --threshold 210 --shadow-threshold 125 --overlap 0 --keep-region 5,55,220,195 --keep-region 490,55,215,195 --seal-effect-gaps 3
```

保留全部 241 帧与原生帧率，不变速、不循环交叠。输出旁的 JSON 记录来源哈希、参数、alpha 和上边界接触帧数；`focus-v2.review.jpg` 可检查深浅背景边缘。

逐帧检查背景水印与靴子外侧投影区域；人物旋转时固定的正面头发探针会落到画外背景，因此只在已确认正面姿势的第 0、120、168、240 帧检查该内部区域。另检查左右中文气泡、小尾巴、第 192 帧浅色内填，以及开始和结束的气泡消失情况。旋转、腾空与回正姿势均进行目视检查。

## 导入与应用内验收

先退出桌宠，在项目根目录运行：

```powershell
node scripts/import-action.cjs focus actions/production/09-focus/processed/focus-v2.webm
```

导入只替换专注动作的托管副本，不修改用户原片或历史制作素材。

```powershell
npm run smoke -- --smoke-fixture=actions/production/00-idle/processed/idle-loop-v1.webm --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-focus=actions/production/09-focus/processed/focus-v2.webm --verify-focus-version=v2 --verify-celebrate=actions/production/10-celebrate/processed/celebrate-v1.webm
```

V2 验收在约第 7 秒检查实际显示画布中的中文气泡，验证菜单点播、静音单次播放、画布帧更新和结束返回待机；连续拖动的尺寸检查继续保留。旧版星星动作仍可使用 `--verify-focus-version=v1` 单独验证。所有验收使用独立媒体库，不启动真实 Codex 任务。

## 后续制作

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`）保留已装配待机首帧，定稿图保留在共用角色定稿（仅本地制作归档：`../shared/character-design.png`）。庆祝动作见 [10-celebrate](../10-celebrate/README.md)；下一条扩展互动是 [摸摸头 · 蹭蹭](../11-pat/README.md)。
