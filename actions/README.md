# 现用视频素材

`production/` 按动作分类保存 37 段现用视频和 11 张必需的花园阶段图。`catalog.json` 记录动作绑定，`branding-installation.json` 记录现用视频摘要，花园使用 `production/14-garden/runtime.json`。

视频不进入 Git 源码。开发时从 [同版本 Release](https://github.com/kaukoaki/zhixi-pet/releases/tag/v0.1.18) 下载 `current-media.zip`，在项目根目录运行：

```powershell
python scripts/media-assets.py restore <素材ZIP路径>
python scripts/media-assets.py check
npm run audit:assets
```

根目录 `media-assets.json` 记录每个文件的路径、大小和 SHA-256；还原工具不会覆盖内容不同的已有文件。程序打包只选取登记的现用素材。

提示词、原片、历史版本、QA 和制作记录保存在本地 `local-assets/`，不包含在公开源码或发布包中。素材许可见 [LICENSE-ASSETS.md](../LICENSE-ASSETS.md)。
