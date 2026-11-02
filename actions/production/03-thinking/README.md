# 03 · 想一想

对应 `thinking` /「想一想」槽。用户生成的视频已完成浅灰白背景、水印与地面投影分离，并装配为约 10.04 秒的单次思考动作。右键「动作 → 工作状态 → 想一想」可预览，播放结束自动回到默认待机；任务启动也会调用该槽，后续任务进度可以切换到 `working`。

## 已装配素材

- 原始视频：`<video-directory>\思考.mp4`，未经修改的副本为 `source/thinking-source-01.mp4`。
- 来源 SHA-256：`c7285bdffddc2653645c14107d6807bae0dcbbaae7c8e8d9e7066ffc2f79c5b2`。
- 透明成品：`processed/thinking-v1.webm`，720×720、24 fps、241 帧、约 10.0417 秒、静音、WebM VP9 alpha。
- 完整保留抬手托腮、轻微歪头、眨眼思考和收手恢复站姿；不加速、不做循环重叠。人物完整入画，顶部未接触画面边缘。
- 透明检查逐帧覆盖全部 241 帧：左上/右下水印所在背景区域和靴子外侧地面区域未发现残留，头发内部检查区域的 alpha 为 255。另有深浅背景目视检查及 Electron 实际菜单播放、时间前进、静音与结束回待机验证。

输出旁的 `thinking-v1.json` 记录处理参数、源视频哈希和解码 alpha，`thinking-v1.review.jpg` 可查看代表帧。使用 `scripts/prepare-white-video.py`，参数为 `--threshold 210 --shadow-threshold 125 --overlap 0`。原始 MP4 未修改。

## 重新导入

先退出桌宠，在项目根目录运行：

```powershell
node scripts/import-action.cjs thinking actions/production/03-thinking/processed/thinking-v1.webm
```

重新启动后生效，只替换思考动作，不影响待机、挥手和拖动分段包。也可在桌宠动作管理中向「想一想」槽导入该透明成品。

真实播放器验收在独立测试媒体库中运行：

```powershell
npm run smoke -- --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-thinking=actions/production/03-thinking/processed/thinking-v1.webm
```

## 生成资料

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`） 是已装配待机首帧的逐字节副本，来自 `00-idle/processed/idle-loop-v1.first-frame.png`；共用角色定稿（仅本地制作归档：`../shared/character-design.png`） 是原始定稿备份。`prompt.txt` 保留本次 10 秒、1:1 豆包提示词，可用于重生成。视频实际抬手、保持与收手时序以成片为准。

下一个动作是 [`working` /「认真工作」](../04-working/README.md)：参考图与 10 秒提示词已准备，收到成片后再进行透明处理与循环提取。
