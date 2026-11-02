# 空空的

动作 ID：`wallet-empty`；菜单「动作 → 余额 → 空空的」。

- 原片：`<video-directory>\空空的.mp4`，原样归档在 `source/`，不修改用户文件。
- 原片 SHA-256：`d59830f02f66ddd78f07f8762a78d735e7fb94ede36889caff7ed58a46be2817`。
- 透明成品：`processed/wallet-empty-v1.webm`，640 × 640、30 fps、300 帧、10 秒、静音 VP9 alpha。
- 原始分辨率和帧率保持，未裁切、未变速、未交叠循环。气泡、问号/沙漏等有意效果保留。
- `prompt.txt` 为本动作的完整提示词；人物参考使用共用待机参考图（仅本地制作归档：`../../../shared/idle-reference.png`）与共用角色定稿（仅本地制作归档：`../../../shared/character-design.png`）。
- 同名 `.json` 记录处理参数，`.qa.json` 为全部帧透明检查及效果采样，`.alpha-review.jpg` 为深浅背景复核图。

```powershell
& 'E:/Anaconda/python.exe' scripts/prepare-white-video.py actions/production/12-wallet/variants/04-empty/source/wallet-empty-source-01.mp4 actions/production/12-wallet/variants/04-empty/processed/wallet-empty-v1.webm --threshold 210 --shadow-threshold 125 --overlap 0 --seal-effect-gaps 3 --keep-region 435,30,200,280
```

播放为单次，结束返回默认待机；可以手动点播。自动选择规则统一位于 `main/wallet-reactions.cjs`，查询失败/数据不完整时保留普通查看动作，不随机播放耗尽反应。
