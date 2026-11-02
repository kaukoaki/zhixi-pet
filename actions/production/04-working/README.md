# 04 · 认真工作

对应 `working` /「认真工作」槽。用户的编程视频已完成浅灰白背景、水印和投影清理，并从稳定工作中段制作约 6.21 秒的透明循环。右键「动作 → 工作状态 → 认真工作」手动播放一次后回到待机，真实任务进行中自动循环，任务结束或取消时退出。

## 已装配素材

- 原片：`<video-directory>\编程.mp4`，未经修改的副本保存在 `source/working-source-01.mp4`。
- 源 SHA-256：`745c5c51f59ab7b5aa600e5921c2b51bcc4a1dc5eed35e2f2b101c805bd87eef`。
- 原始规格：720×720、24 fps、241 帧、约 10.0417 秒。
- 成品：`processed/working-loop-v1.webm`，720×720、24 fps、149 帧、约 6.2083 秒、静音、WebM VP9 真实 alpha。
- 人物与薄荷青键盘保留，胸口 GPT 标志清楚可见，完整呆毛、长发与靴子均在画面内。

选取源第 45–197 帧（编号从 0 开始），保留原生速度，末尾做 4 帧交叠。循环从第 49 帧开始，连续播放到第 193 帧，末尾 194–197 帧混合至 45–48，再接回 49。这样每轮都维持工作姿势，键盘不会反复出现、消失。原片的进入与恢复部分仍保留在源视频中，未覆盖原件。

## 处理与验证

使用 `scripts/prepare-white-video.py`，参数为：

```text
--threshold 210 --shadow-threshold 125 --start-frame 45 --end-frame 198 --overlap 4
```

结束帧参数不包含自身。输出旁的 JSON 记录参数、源视频哈希和真实解码 alpha；`working-loop-v1.review.jpg` 可查看深浅背景上的代表帧。

逐帧检查了全部 149 帧：水印所在左上及右下背景区域、靴子外侧地面区域未发现残留，头发内部检查区域 alpha 为 255。另进行了人物、手指、键盘、胸标与首尾衔接目视检查。

真实 Electron 验收覆盖菜单单次点播、播放结束回待机、模拟运行状态下跨一轮持续循环、画布帧持续更新，以及任务状态结束时停止工作循环。验收只使用测试状态，没有启动真实 Codex 任务。

## 重新导入与验收

先退出桌宠，在项目根目录执行：

```powershell
node scripts/import-action.cjs working actions/production/04-working/processed/working-loop-v1.webm
```

重新启动后生效，只替换工作动作，不影响其他媒体或设置。也可在动作管理中向「认真工作」槽导入此透明成品。

独立测试媒体库的验收命令：

```powershell
npm run smoke -- --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-working=actions/production/04-working/processed/working-loop-v1.webm
```

## 生成资料

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`） 逐字节复制自已安装待机首帧 `00-idle/processed/idle-loop-v1.first-frame.png`，共用角色定稿（仅本地制作归档：`../shared/character-design.png`） 是原始定稿备份。`prompt.txt` 保留本次 10 秒、1:1 豆包图生视频提示词。原片的动作时序以实际内容为准，循环不是按提示词时间机械截取。

下一个动作是 [`success` /「完成啦」](../05-success/README.md)，参考图和 10 秒提示词已准备。
