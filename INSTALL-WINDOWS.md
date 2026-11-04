# Windows 安装知栖

**简体中文** | [English](INSTALL-WINDOWS.en.md)

适用版本：0.1.18。支持 Windows 10/11 x64。完整安装包括桌面程序与 Codex 本地插件。

## 1. 检查 Codex

打开 PowerShell，分别运行：

```powershell
codex --version
codex plugin --help
```

两条命令都能显示版本或帮助后继续。若提示找不到 `codex`，请按[官方 Codex CLI 安装指南](https://learn.chatgpt.com/docs/codex/cli)安装，随后关闭并重新打开 PowerShell。若没有 `plugin` 子命令，请按官方指南更新CLI。

额度和任务功能需要登录；尚未登录时运行 `codex login`，按浏览器提示完成登录。不需要把账号密码、登录文件或API Key交给本项目。

只是使用桌宠、动作和番茄钟，可以先跳到下面“仅安装桌面程序”。

## 2. 下载并完整解压

在项目 GitHub 页点击 **Releases → v0.1.18 → Assets**，下载：

```text
Zhixi-0.1.18-win32-x64.zip
```

约985 MiB。运行桌宠不需要源码包、current-media素材包、Node.js或Python。

对下载的ZIP点击右键 → **全部解压**。打开解压后的文件夹，应该看到：

```text
Zhixi-0.1.18-win32-x64/
  install.cmd
  INSTALL-WINDOWS.md
  app/
    QiqiCodexPet.exe
    resources/
  scripts/
    install-desktop.ps1
    install-codex-plugin.ps1
  codex-plugin/
  .agents/
```

资源管理器可能隐藏 `.cmd` 扩展名，因此入口也可能显示为“install”，类型为“Windows命令脚本”。不要在ZIP预览窗口中直接运行，不要只复制exe或只解压 `codex-plugin/`。

建议解压到以后会保留的固定目录。本地插件源指向这个目录，后续刷新还会使用它。

## 3. 安装

双击 `install.cmd`。脚本会依次复制桌面程序、核对关键文件、创建开始菜单入口，再注册并安装插件。复制接近1GB的程序需要等待；窗口报错时请保留错误文本。

完成后，桌面程序位于：

```text
%LOCALAPPDATA%\Zhixi\app\QiqiCodexPet.exe
```

可从开始菜单搜索 **Zhixi** 打开。

如果窗口没有显示结果，可打开解压目录，在资源管理器地址栏输入 `powershell` 并按Enter，再运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-codex-plugin.ps1"
```

该命令仅为本次启动的PowerShell指定脚本策略，不要求修改系统的全局执行策略。

## 4. 验证插件

在PowerShell运行：

```powershell
codex plugin list --marketplace zhixi-local --json
```

在返回的 `installed` 列表里，找到 `zhixi-pet@zhixi-local` 对应条目，应有：

```json
{ "installed": true, "enabled": true }
```

这是需要关注的字段示例，不是完整输出。如果没有条目或显示禁用，在当前Codex的插件管理界面检查安装与启用状态。

随后在Codex新建一个聊天，输入：

```text
打开知栖桌宠
```

也可输入 `$zhixi-pet`、`打开知栖的番茄钟`、`用知栖查看 Codex 剩余额度`。旧聊天没刷新插件时，重新打开Codex后再新建聊天。

插件命令形式已对照[官方CLI参考](https://learn.chatgpt.com/docs/cli/reference#codex-plugin)及本机CLI帮助核对；当前机器核验版本为 `codex-cli 0.165.0-alpha.1.2`。不要求用户安装这一特定预览版，以自己的CLI是否支持上面的命令为准。

## 仅安装桌面程序

若当前没有Codex CLI，可先在解压目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-desktop.ps1"
```

桌宠会安装并启动；额度、Codex任务和聊天调用需要之后补齐CLI与插件。

之后安装插件时保留桌面程序，只运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-codex-plugin.ps1" -SkipDesktop
```

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 下载后找不到 `install.cmd` | 核对文件名，必须是 `win32-x64.zip`；GitHub的 `Source code (zip)` 不能直接安装 |
| 双击后窗口关闭或报错 | 在同一目录打开PowerShell，运行上面第3步的命令，查看完整错误 |
| 提示找不到Codex | 先在新开的PowerShell确认 `codex --version` 能运行，再重试安装 |
| 提示不支持plugin命令 | 按官方CLI指南更新，再核对 `codex plugin --help` |
| 桌宠能启动，但聊天叫不出来 | 验证插件已安装并启用，重新打开Codex并新建聊天 |
| 额度缺失或登录错误 | 在终端完成 `codex login`；部分账号或登录方式不提供订阅额度，程序不会虚构数值 |
| 更新提示先关闭桌宠 | 从桌宠右键菜单退出后再安装 |
| Windows提示下载文件的发布者未知 | 从本项目Release核对文件和SHA；只在确认来源后决定是否运行，不必关闭系统防护 |

## 可选：校验下载文件

同时下载该ZIP旁的 `.sha256` 文件，在下载目录运行：

```powershell
Get-FileHash -LiteralPath ".\Zhixi-0.1.18-win32-x64.zip" -Algorithm SHA256
Get-Content -LiteralPath ".\Zhixi-0.1.18-win32-x64.zip.sha256"
```

第一条的哈希值应与第二条显示的64位十六进制值相同，大小写不影响比较。

## 更新与移除

更新：下载新版本Windows ZIP，完整解压到保留的安装源目录并运行 `install.cmd`。旧程序会备份在 `%LOCALAPPDATA%\Zhixi\backups`；用户设置、自选素材、金币、花园和手账保留在 `%APPDATA%\QiqiCodexPet`。已知旧内置视频会按SHA迁移，自选视频保持原样。

移除Codex插件：

```powershell
codex plugin remove zhixi-pet@zhixi-local
```

若不再使用这个插件源，再运行 `codex plugin marketplace remove zhixi-local`。移除插件不会删除桌面程序或个人数据。退出桌宠后可自行移除应用安装目录与开始菜单入口；保留个人数据目录即可保留手账、花园和自制动作。

本项目是独立桌面程序与Codex插件，非OpenAI官方产品。许可范围见随包附带的 [LICENSE](LICENSE)、[素材许可](LICENSE-ASSETS.md)与[项目声明](NOTICE.md)。
