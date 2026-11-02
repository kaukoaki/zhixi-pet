# 源码与独立素材包

首次上传请按[从创建空仓库到发布附件的教程](GITHUB-UPLOAD.md)操作；Release正文可直接使用[0.1.18发布说明](RELEASE-NOTES-v0.1.18.md)。普通用户安装见[Windows教程](../INSTALL-WINDOWS.md)。

发布内容分为三份，版本必须一致：

| 文件 | 用途 | 上传位置 |
| --- | --- | --- |
| `Zhixi-0.1.18-source.zip` / `repository/` | 精简源码、插件、当前人物原画、未来动画提示词与轻量索引 | 提交解压后的文件到GitHub仓库 |
| `Zhixi-0.1.18-current-media.zip` | 当前实装素材：37段修改后视频与11张花园末帧海报；不含原片或历史视频 | 同版本GitHub Release附件 |
| `Zhixi-0.1.18-win32-x64.zip` | Windows程序、已内置的当前37段视频、安装脚本和插件 | 同版本GitHub Release附件 |

运行桌宠只需Windows ZIP。原片和历史视频隔离保存在本地，不放入源码或Release；新动画使用[当前立绘与提示词](animation/README.md)。授权范围见[素材许可](../LICENSE-ASSETS.md)和[来源记录](RIGHTS.md)。

源码不带开发依赖、运行时、工作缓存、个人数据、本机交接文档或巨大的累计检查点。独立素材的逐文件大小与SHA-256记录在仓库根目录 `media-assets.json`，ZIP另附SHA-256文件。

## 从源码运行

需要Node.js 22.12+。下载同版本素材ZIP，在仓库根目录解压，得到 `actions/production/...`。安全还原和逐文件校验可使用Python 3.10+（只用标准库）：

```powershell
python scripts/media-assets.py restore <同版本素材ZIP路径>
python scripts/media-assets.py check
npm ci
npm run audit:assets
npm test
npm run check
npm start
```

还原工具先校验完整ZIP和已有文件，只补齐缺失文件；已有内容不一致时停止，保留你的修改。素材还原后大文件仍被Git忽略。新增动作时需要更新素材包、`media-assets.json`及轻量索引，不能只修改索引。

Python视频制作工具另外需要[视频依赖](../requirements-video.txt)；运行桌宠无需Python。当前安装包含23个动作入口、26个普通/番茄媒体文件、11段花园视频及11张花园末帧图，均可离线播放。

## 提交源码

整理工具建立的 `repository/` 是独立Git目录，文件已暂存，尚未提交，也没有远程地址。原工作目录及其原暂存区保持独立。先在GitHub建立空仓库，进入这个独立目录后执行：

```powershell
git status
git diff --cached --stat
npm run audit:release
git commit -m "Initial Zhixi desktop companion and Codex plugin"
git remote add origin <你的仓库地址>
git push -u origin main
```

使用自己的Git提交身份及正常认证流程。已有远程仓库时先核对 `git remote -v`，不要强推或覆盖既有内容。安装包和素材ZIP上传到同一个版本的Release，并一并上传 `.sha256` 校验文件；不要提交进Git。

`audit:release`读取暂存区，核对已知凭据模式、个人绝对路径、文件大小、文档链接和插件结构；声明在素材清单内的外部文件链接也会核对路径格式。它不检查所有未知秘密格式或二进制中的信息，发布前应查看实际提交列表。

GitHub对普通Git文件在50 MiB以上提醒，100 MiB以上阻止；大素材适合放Release附件，依据见[GitHub大文件说明](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。每个Release附件需小于2 GiB，依据见[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

## 重新制作分发包

在完整制作工作区（已还原全部素材）中运行：

```powershell
npm ci
npm run audit:assets
npm run package
python scripts/prepare-github.py --output releases/github-ready-next
```

输出目录必须不存在。工具复制当前工作文件到独立目录，扫描源码与素材中的已知凭据模式及个人路径、核对源码暂存区、生成三份ZIP及SHA-256，并检查每份ZIP的全部CRC。不会暂存原仓库、创建提交、设置远程地址或上传。

原片、历史成品、逐帧QA、本机检查点和私人备份保留在本地工作区，不打入源码或Release。公开素材包按当前实装索引只选37段视频和11张海报；公开审计核对现用文件SHA与绑定，不要求读取本地原片。
