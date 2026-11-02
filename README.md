# 知栖 Zhixi · Codex 桌面伙伴

**简体中文** | [English](README.en.md)

知意而栖，陪你把眼前的小事慢慢做好。

<p align="center">
  <img src="assets/character/qiqi-chibi-v5-knot-sprout.png" width="280" alt="知栖桌面伙伴">
</p>

知栖是一款 Windows 视频桌宠，支持 Codex 额度查看、任务窗口、番茄钟、陪伴手账、小花园和装扮，并提供 Codex 本地插件。

**版本：0.1.18 · Windows 10/11 x64 · 37 段内置动作。**

## 下载与安装

1. 从 [GitHub Release](https://github.com/kaukoaki/zhixi-pet/releases/tag/v0.1.18) 下载 **`Zhixi-0.1.18-win32-x64.zip`**。
2. 完整解压后运行 `install.cmd`，安装桌宠与 Codex 插件。
3. 在 Codex 新聊天中输入“打开知栖桌宠”，或从开始菜单打开 **Zhixi**。

普通用户只需 Windows 包，无需另装 Node.js、Python 或视频素材包。Codex 集成功能需要本机可运行的 Codex CLI。详细步骤、单独安装桌宠、更新与移除见 [Windows 安装教程](INSTALL-WINDOWS.md)。

## 日常使用

| 操作 | 功能 |
| --- | --- |
| 单击人物 | 查看本机 Codex 实际额度 |
| 双击人物 | 打开任务窗口 |
| 拖动人物 | 移动桌宠 |
| 右键人物 | 打开番茄钟、陪伴手账、动作菜单和设置 |
| 陪伴手账 | 写小记、收集纪念卡、种植花园和兑换装扮 |

在 Codex 中也可以说“打开知栖的番茄钟”“打开知栖陪伴手账”或“退出知栖桌宠”。任务仅在你确认执行后启动，可能消耗实际额度并修改选定目录。操作与备份见 [使用指南](docs/USER-GUIDE.md)和[隐私说明](docs/PRIVACY.md)。

## 下载文件

| 文件 | 用途 |
| --- | --- |
| `Zhixi-0.1.18-win32-x64.zip` | 直接安装，内置现用视频与插件 |
| `Zhixi-0.1.18-source.zip` | 阅读和修改源码 |
| `Zhixi-0.1.18-current-media.zip` | 从源码运行或打包时还原 37 段视频及 11 张花园阶段图 |

每个 ZIP 均附 `.sha256` 校验文件。Git 源码不含视频；提示词、原片、旧版素材及开发过程记录不随公开仓库和发布包分发。

## 从源码运行

需要 Node.js 22.12+；素材还原工具需要 Python 3.10+。下载源码与同版本素材 ZIP，在源码根目录运行：

```powershell
python scripts/media-assets.py restore "D:\Downloads\Zhixi-0.1.18-current-media.zip"
python scripts/media-assets.py check
npm ci
npm run audit:assets
npm start
```

将 ZIP 路径替换为实际位置。代码检查与打包命令见 [贡献说明](CONTRIBUTING.md)。

## 文档与许可

- [Windows 安装](INSTALL-WINDOWS.md) · [使用指南](docs/USER-GUIDE.md) · [隐私与本地数据](docs/PRIVACY.md)
- [贡献说明](CONTRIBUTING.md) · [安全反馈](SECURITY.md) · [现用素材说明](actions/README.md)
- [代码许可](LICENSE) · [素材许可](LICENSE-ASSETS.md) · [项目声明](NOTICE.md) · [第三方通知](THIRD_PARTY_NOTICES.md) · [素材来源](docs/RIGHTS.md)

本项目是独立桌面程序与本地插件，非 OpenAI 官方产品。角色与动作使用 AI 辅助制作；第三方权利不包含在项目授权范围内。
