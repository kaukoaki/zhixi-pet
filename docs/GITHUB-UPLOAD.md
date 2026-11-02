# 第一次上传知栖到GitHub

流程是：创建空仓库 → 推送精简源码 → 上传Release附件 → 检查别人能否安装。

使用整理工具生成的 `repository/` 作为上传目录。原制作工作区含大量缓存和历史检查点，不要将整个工作目录拖进GitHub。源码中的README、安装教程、许可证和忽略规则已经准备好。

## 第1步：创建空仓库

登录GitHub，打开[创建仓库](https://github.com/new)。填写：

| 选项 | 怎么填 |
| --- | --- |
| Owner | 你的账号 |
| Repository name | 建议 `zhixi-pet`，也可选自己喜欢的英文名称 |
| Description | `知栖 Zhixi：Windows 视频桌宠与 Codex 本地插件，支持额度、任务、番茄钟、手账和小花园。` |
| Visibility | 对外分享选Public；先备份选Private |
| Add README | 不勾选 |
| Add .gitignore | 不选择模板 |
| Choose a license | 不选择模板 |

点击 **Create repository**。创建后复制页面上的HTTPS仓库地址，形式为 `https://github.com/你的账号/zhixi-pet.git`。

GitHub建议导入已有本地项目时先创建空仓库，避免自动生成文件造成首次推送冲突。依据：[创建仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)。

## 第2步：打开准备好的源码目录

在资源管理器进入整理输出目录中的 `repository/`。确认其中有 `README.md`、`INSTALL-WINDOWS.md`、`package.json`、`.git/`、`.agents/` 和 `codex-plugin/`。

在资源管理器地址栏输入 `powershell`，按Enter。在打开的窗口运行：

```powershell
git status
git diff --cached --stat
node scripts/audit-release.cjs
```

整理目录已经初始化Git并暂存源码，不用重新初始化。若你使用的是解压后的源码ZIP，它不含`.git/`，应先运行 `git init -b main` 与 `git add .`。

## 第3步：首次提交并推送

先创建本地提交：

```powershell
git commit -m "Initial Zhixi desktop companion and Codex plugin"
```

若提示缺少提交身份，使用你自己的Git提交名和邮箱，在当前目录设置后再重试；需要隐私时使用GitHub账号提供的noreply邮箱：

```powershell
git config user.name "你的提交名"
git config user.email "你的Git提交邮箱"
```

然后把下面地址替换为第1步复制的真实地址：

```powershell
git remote add origin https://github.com/你的账号/zhixi-pet.git
git remote -v
git push -u origin main
```

按Git认证界面的提示完成登录。不要把密码、Token或验证码写进仓库地址或发到聊天中。若提示已经存在origin，先核对已有地址，不要直接覆盖。若远端已经有提交，先处理两边内容，不能用强推跳过。

推送成功后刷新GitHub页面，应该能看到README、安装教程、源码以及隐藏目录中的插件源。参考：[将本地代码上传到GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)。

## 第4步：建立v0.1.18 Release

仓库首页 → **Releases** → **Draft a new release**。

1. Tag填 `v0.1.18`，创建新标签，Target选 `main`。
2. Title填 `知栖 Zhixi v0.1.18 · Windows 桌宠与 Codex 插件`。
3. Description复制[现成的Release正文](RELEASE-NOTES-v0.1.18.md)。
4. 在附件区域上传整理目录中的以下6个文件。

| ZIP | 对应校验文件 |
| --- | --- |
| `Zhixi-0.1.18-win32-x64.zip` | `Zhixi-0.1.18-win32-x64.zip.sha256` |
| `Zhixi-0.1.18-current-media.zip` | `Zhixi-0.1.18-current-media.zip.sha256` |
| `Zhixi-0.1.18-source.zip` | `Zhixi-0.1.18-source.zip.sha256` |

确认6个附件全部上传完成后发布，也可先保存草稿。ZIP只放Release附件，不提交进代码目录。GitHub自动生成的Source code压缩包不含独立视频素材。界面操作依据：[管理Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。

## 第5步：检查安装入口

刷新仓库README，点开安装教程确认能显示。再从Release下载Windows ZIP，确认其中有 `install.cmd`、`INSTALL-WINDOWS.md`、`app/`、`scripts/`、`codex-plugin/` 和 `.agents/`。

普通用户只下载Windows ZIP即可安装，不应被要求先下载素材包或安装Node.js。完整的读者安装流程已经写在[Windows教程](../INSTALL-WINDOWS.md)。

仓库创建好后，可把网址交给协作者补上README中的直接下载链接；尚未创建仓库时，README通过“右侧Releases”引导，不使用虚构账号或无法工作的占位下载按钮。
