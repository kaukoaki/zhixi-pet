# 省着点用

动作 ID：`wallet-careful`；菜单「动作 → 余额 → 省着点用」。

- 原片：`<video-directory>\省着点用.mp4`，原样归档在 `source/`，不修改用户文件。
- 原片 SHA-256：`d56e197f1d6876766efd9e60f4d49cf01e3cfd3c75c82665bafefdd2cf5c51b0`。
- 透明成品：`processed/wallet-careful-v1.webm`，960 × 960、30 fps、300 帧、10 秒、静音 VP9 alpha。
- 原始分辨率和帧率保持，未裁切、未变速、未交叠循环。气泡、问号/沙漏等有意效果保留。
- `prompt.txt` 为本动作的完整提示词；人物参考使用共用待机参考图（仅本地制作归档：`../../../shared/idle-reference.png`）与共用角色定稿（仅本地制作归档：`../../../shared/character-design.png`）。
- 同名 `.json` 记录处理参数，`.qa.json` 为全部帧透明检查及效果采样，`.alpha-review.jpg` 为深浅背景复核图。

```powershell
& 'E:/Anaconda/python.exe' scripts/prepare-white-video.py actions/production/12-wallet/variants/02-careful/source/wallet-careful-source-01.mp4 actions/production/12-wallet/variants/02-careful/processed/wallet-careful-v1.webm --threshold 210 --shadow-threshold 125 --overlap 0 --seal-effect-gaps 3 --keep-region 650,50,300,350
```

播放为单次，结束返回默认待机；可以手动点播。自动选择规则统一位于 `main/wallet-reactions.cjs`，查询失败/数据不完整时保留普通查看动作，不随机播放耗尽反应。
