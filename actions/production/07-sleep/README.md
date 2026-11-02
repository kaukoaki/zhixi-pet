# 07 · 打个盹

对应 `sleep` /「打个盹」槽。用户生成的打瞌睡视频已完成浅灰白背景、水印及地面投影处理，保留独立的 `zZ` 漫画气泡、字符和小圆点尾巴。右键「动作 → 休息 → 打个盹」可单次播放，结束回到默认待机。当前不接入自动休息触发。

## 已装配素材

- 原片：`<video-directory>\打瞌睡.mp4`，未经修改的副本为 `source/sleep-source-01.mp4`。
- 源 SHA-256：`69f2db389955526801c2217ea774f37d133c3ca5a800d1cad74fe1acfb8ead47`。
- 成品：`processed/sleep-v1.webm`，720×720、24 fps、241 帧、约 10.0417 秒、静音、WebM VP9 真实 alpha。
- 完整保留眼皮渐沉、掩嘴哈欠、歪头闭眼、站立打盹、睁眼微笑与恢复站姿。气泡约在第 62–161 帧出现并收起；人物、呆毛、长发和双脚完整入画。

## 透明处理与验证

本地脚本增加可选的 `--keep-region X,Y,W,H` 参数：默认仍只保留最大连通人物；指定经过检查的区域后，额外保留完整落在该区域内、面积至少 3 像素的前景连通部分。区域里的空白背景仍透明，因此气泡内填、轮廓、字形和独立尾巴可以保留，不把周围白底一起留下。

本条实测气泡位于右上，选择 `480,20,225,240` 区域，避开左上与右下水印。保留全部 241 帧、原生帧率和完整演出，不裁切、不变速、不循环交叠：

```powershell
& 'E:\Anaconda\python.exe' scripts/prepare-white-video.py actions/production/07-sleep/source/sleep-source-01.mp4 actions/production/07-sleep/processed/sleep-v1.webm --threshold 210 --shadow-threshold 125 --overlap 0 --keep-region 480,20,225,240
```

输出旁的 JSON 记录参数、来源哈希、气泡区域和解码 alpha；`sleep-v1.review.jpg` 可供深浅背景复核。逐帧解码检查 241 帧，水印与靴子外侧投影区域透明，中央头发内部 alpha=255；对气泡显示阶段进行了深浅背景目视检查。

真实 Electron 验收包含休息子菜单点播、720×720 解码、静音单次播放、画布持续更新、实际显示画布中的气泡前景，以及播放结束回到待机。测试使用独立媒体库，不启动真实 Codex 任务。透明分离另有 4 项合成素材回归检查，覆盖保留气泡内填、字符、独立尾巴，排除水印和空白背景，以及区域边界验证。

## 重新导入与验收

先退出桌宠，再在项目根目录运行：

```powershell
node scripts/import-action.cjs sleep actions/production/07-sleep/processed/sleep-v1.webm
```

重启后生效，只替换打盹动作；也可在动作管理中向「打个盹」槽导入此透明成品。

独立验收命令：

```powershell
npm run smoke -- --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-sleep=actions/production/07-sleep/processed/sleep-v1.webm
& 'E:\Anaconda\python.exe' -m unittest discover -s test -p test_video_matte.py -v
```

## 生成资料与下一动作

共用待机参考图（仅本地制作归档：`../shared/idle-reference.png`） 是已装配待机首帧的逐字节副本，共用角色定稿（仅本地制作归档：`../shared/character-design.png`） 保留人物定稿，`prompt.txt` 保留本条 10 秒、1:1 的豆包提示词。

下一动作是 [`return` /「欢迎回来」](../08-return/README.md)：发现主人、开心招手、轻张双手欢迎、俏皮眨眼，并加入带爱心的漫画气泡。制作时延续 [角色动画演出原则](../../../docs/ANIMATION-DIRECTION.md)，允许有趣、简短的漫画表达。
