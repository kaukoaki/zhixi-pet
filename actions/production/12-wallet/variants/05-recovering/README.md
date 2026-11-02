# 等一会就好

动作 ID：`wallet-wait`；菜单「动作 → 余额 → 等一会就好」。

- 原片：`<video-directory>\等一会就好.mp4`，原样归档在 `source/`，不修改用户文件。
- 原片 SHA-256：`5ff67f8fc8d831acfdbe459c6c3d738ac120e804e953c7f2df8b7efd6f4803df`。
- 透明成品：`processed/wallet-wait-v1.webm`，640 × 640、30 fps、300 帧、10 秒、静音 VP9 alpha。
- 原始分辨率和帧率保持，未裁切、未变速、未交叠循环。气泡、问号/沙漏等有意效果保留。
- `prompt.txt` 为本动作的完整提示词；人物参考使用共用待机参考图（仅本地制作归档：`../../../shared/idle-reference.png`）与共用角色定稿（仅本地制作归档：`../../../shared/character-design.png`）。
- 同名 `.json` 记录处理参数，`.qa.json` 为全部帧透明检查及效果采样，`.alpha-review.jpg` 为深浅背景复核图。

```powershell
& 'E:/Anaconda/python.exe' scripts/prepare-white-video.py actions/production/12-wallet/variants/05-recovering/source/wallet-wait-source-01.mp4 actions/production/12-wallet/variants/05-recovering/processed/wallet-wait-v1.webm --threshold 210 --shadow-threshold 125 --overlap 0 --seal-effect-gaps 3 --keep-region 10,40,240,360
```

播放为单次，结束返回默认待机；可以手动点播。自动选择规则统一位于 `main/wallet-reactions.cjs`，查询失败/数据不完整时保留普通查看动作，不随机播放耗尽反应。
