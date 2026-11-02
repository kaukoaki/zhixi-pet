# 06 · 小小困惑

对应 `error` /「小小困惑」槽。用户生成的视频已完成浅灰白背景、水印和地面投影清理，装配为约 10.04 秒的单次反应。右键「动作 → 工作状态 → 小小困惑」可点播，任务失败时自动触发，播放结束回到默认待机。

## 已装配素材

- 原片：`<video-directory>\小小困惑.mp4`，未经修改的副本为 `source/error-source-01.mp4`。
- 源 SHA-256：`9d1943c00ec034fae4b492c2bd777dd9a054ac990af02c17644eb1edeb6a6ffd`。
- 成品：`processed/error-v1.webm`，720×720、24 fps、241 帧、约 10.0417 秒、静音、WebM VP9 真实 alpha。
- 保留完整小惊讶、歪头、摊手、小抿嘴和鼓劲微笑，结束恢复正面站姿；胸口 GPT 标志可见，呆毛、头发、手部与靴子均完整入画。

## 处理与验证

使用 `scripts/prepare-white-video.py`，指定 `--threshold 210 --shadow-threshold 125 --overlap 0`。保留全部帧和原生帧率，不裁切、不变速、不进行循环交叠；原片保持不变。输出旁的 JSON 记录参数、来源哈希和解码 alpha，`error-v1.review.jpg` 可供深浅背景复核。

逐帧解码检查 241 帧：左上与右下水印区域、靴子外侧投影区域均透明；人物头发内部探针全程 alpha=255。困惑歪头会移动上方轮廓并使右侧发梢低至 y=656，因此内部探针使用 y=130–189、x=290–359 的中央头发区域，右下水印探针使用 y=670–714、x=540–714 的实际背景区域，避免把真实发梢和轮廓当成残留或透明孔洞。

真实 Electron 验收检查菜单点播、720×720 解码、静音单次播放、画布帧更新、结束返回待机，并用独立测试媒体库中的模拟任务失败事件检查自动触发。未启动真实 Codex 任务。

## 重新导入与验收

先退出桌宠，在项目根目录运行：

```powershell
node scripts/import-action.cjs error actions/production/06-error/processed/error-v1.webm
```

重启后生效，只替换困惑动作。也可在动作管理中向「小小困惑」槽导入此透明成品。

独立验收命令：

```powershell
npm run smoke -- --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-error=actions/production/06-error/processed/error-v1.webm
```

## 生成资料与下一动作

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`） 保留已安装待机首帧，共用角色定稿（仅本地制作归档：`../shared/character-design.png`） 保留人物定稿，`prompt.txt` 保留本条视频的原始制作提示词。

下一动作是 [`sleep` /「打个盹」](../07-sleep/README.md)：掩嘴哈欠、站立打盹、迷糊醒来，加入带小尾巴的 `zZ` 漫画气泡。根据用户新的创意偏好，后续允许问号、感叹号、爱心、小星星及简短对话气泡，并在透明处理中保留这些设计元素。详见 [角色动画演出原则](../../../docs/ANIMATION-DIRECTION.md)。
