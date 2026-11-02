---
name: zhixi-pet
description: 在 Windows 本机打开或退出知栖视频桌宠，打开它的 Codex 额度、任务窗口、番茄钟或陪伴手账，并检查安装状态。用于明确提到知栖桌宠的操作。
---

# 知栖桌宠

使用此技能目录向上两级的 `scripts/zhixi.ps1` 控制已安装的桌面程序。先将脚本路径解析为绝对路径，不依赖聊天的当前工作区。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<plugin-root>\scripts\zhixi.ps1" -Action open
```

按用户意图选择 `-Action`：

| 操作 | 值 |
| --- | --- |
| 打开、叫回桌宠 | `open` |
| 打开 Codex 任务输入窗口 | `task` |
| 显示实际 Codex 剩余额度 | `usage` |
| 打开番茄钟设置或当前倒计时 | `pomodoro` |
| 打开知栖陪伴手账、每日专注或纪念卡 | `journal` |
| 检查桌面程序是否安装、运行 | `status` |
| 退出桌宠 | `stop` |

程序位于 `%LOCALAPPDATA%\Zhixi\app\QiqiCodexPet.exe`。脚本返回 JSON；以其结果说明成功、缺失或失败，不能仅凭启动命令就声称窗口已打开。必要时用 `status` 检查进程。

若未安装桌面程序，说明需要运行配套发布包的 `install.cmd`，或仓库中的 `scripts/install-desktop.ps1`。插件本身不携带 Electron 运行时，也不自动从网络下载可执行文件。

`task` 只打开输入窗口；用户在窗口中点击执行才运行任务。`pomodoro` 只打开计时窗口，不擅自开始一轮专注。`usage` 由桌宠读取本机已登录 Codex 的真实额度，不填写 API Key、不读取或展示账号凭据，也不把缺失数据描述为满额。

这是配套桌面程序的 Codex 插件入口，视频和悬浮窗口仍由桌面程序播放；不要声称已替换 Codex 原生精灵图桌宠。

`journal` 只打开陪伴手账，不替用户写入小记、修改心情或导出文件；不推测过去的专注记录。
