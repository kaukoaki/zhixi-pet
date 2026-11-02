# 安装、验证与源码运行

普通用户先看 **[Windows安装教程](../INSTALL-WINDOWS.md)**：从Release下载 `Zhixi-0.1.18-win32-x64.zip`、完整解压、检查Codex CLI、运行安装入口、验证插件，然后新建聊天。

## 插件与桌面程序的关系

桌面程序负责透明视频、计时与本机存档；Codex插件提供聊天中的启动入口。只下载仓库里的插件文件夹不会同时得到桌面程序。Windows安装ZIP已经包含全部37段现用视频，普通用户无需下载制作素材。

完整安装入口为 `install.cmd`。桌面程序已安装时可仅安装插件：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-codex-plugin.ps1" -SkipDesktop
codex plugin list --marketplace zhixi-local --json
```

插件名称是 `zhixi-pet`，插件源名称是 `zhixi-local`，完整选择器是 `zhixi-pet@zhixi-local`。插件清单位于 `codex-plugin/plugin.json`，本地源清单位于 `.agents/plugins/marketplace.json`。

安装脚本先备份Codex配置，然后执行这些命令：

```powershell
codex plugin marketplace add "<解压后的Windows包根目录>" --json
codex plugin add zhixi-pet@zhixi-local --json
codex plugin list --marketplace zhixi-local --json
```

上面的目录需要换成实际绝对路径。已经通过安装脚本完成安装时，无需重复执行。这套本地源命令可在[官方CLI参考](https://learn.chatgpt.com/docs/cli/reference#codex-plugin-marketplace)核对。它不会把插件提交到官方公共目录，也不会自动下载桌面程序。

## 从源码运行

适合修改代码或制作新动作。需要：

- Node.js 22.12+ 和 npm；
- Git（选择克隆源码时）；
- 同版本 `Zhixi-0.1.18-current-media.zip`；
- Python 3.10+（使用安全素材还原工具时；仅运行桌宠不需要）。

先克隆仓库，或者解压源码ZIP，然后在源码根目录打开PowerShell。确认这里有 `package.json`、`main/`、`renderer/` 和 `media-assets.json`。

先还原素材，示例路径按实际位置修改：

```powershell
python scripts/media-assets.py restore "D:\Downloads\Zhixi-0.1.18-current-media.zip"
python scripts/media-assets.py check
```

也可用资源管理器把素材ZIP解压到源码根目录，得到 `actions/production/...`；使用还原工具会额外核对全部大小和SHA，并拒绝覆盖内容不同的文件。不要把素材多套一层文件夹。GitHub自动生成的源码ZIP也需要同版本独立素材。

然后运行：

```powershell
npm ci
npm run audit:assets
npm test
npm run check
npm start
```

若Electron下载未完成，按照终端错误检查网络。可使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-runtime.ps1"` 下载并按官方校验值准备运行时。

制作Windows程序并安装：

```powershell
npm run package
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-codex-plugin.ps1"
```

`npm start`用于开发运行，`npm run package`生成 `dist/QiqiCodexPet-win32-x64/`；安装脚本把它复制到本机安装位置。Python视频制作依赖另见 [requirements-video.txt](../requirements-video.txt)。

## 任务与登录

额度和任务沿用本机Codex登录，不在知栖中单独填写API Key。单击人物查看实际额度，双击打开任务窗口。缺失或不支持的额度会明确显示不可用。

“去Codex发送”只将输入内容和工作目录带入Codex，需你在Codex按Enter发送。“桌宠执行”由你点击后启动，沿用所选模型、思考强度、执行权限及审批方式，可能使用额度并修改选定工作目录。

任务窗口的“配置”可调整后续任务使用的模型和权限；当前运行中的任务不会因切换设置而自动重启。公开思考摘要、命令与工具输出按实际返回展示，不补写不存在的摘要。

## 安装位置和备份

| 位置 | 内容 |
| --- | --- |
| `%LOCALAPPDATA%\Zhixi\app` | 桌面程序 |
| `%LOCALAPPDATA%\Zhixi\backups` | 安装升级保存的旧程序 |
| `%APPDATA%\QiqiCodexPet` | 个人设置、动作绑定、素材副本、手账、花园等 |
| Codex配置目录中的 `backups/zhixi-install-*.toml` | 安装前的Codex配置备份 |

本地插件源指向安装时使用的目录，请保留该目录供刷新。若自定义 `CODEX_HOME`，插件和配置位于自定义位置。数据说明见[隐私说明](PRIVACY.md)，更新与移除见[Windows教程](../INSTALL-WINDOWS.md#更新与移除)。
