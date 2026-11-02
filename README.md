# 知栖 Zhixi · Codex 桌面伙伴

知意而栖，陪你把眼前的小事慢慢做好。

<p align="center">
  <img src="assets/character/qiqi-chibi-v5-knot-sprout.png" width="300" alt="知栖：小芽抱星胸章，白结、双紫晶和流苏编发挂饰">
</p>

知栖是一款 Windows 视频桌宠，配套 Codex 本地插件。她可以陪伴工作、查看实际 Codex 额度、打开任务窗口、计时专注，也可以写陪伴手账、种植小花园。

**当前版本：0.1.18 · Windows 10/11 x64 · 37段新版动作。**

## 下载并安装

1. 在本仓库右侧点击 **Releases**，打开 `v0.1.18`。
2. 在 **Assets** 下载 **`Zhixi-0.1.18-win32-x64.zip`**。普通用户只需要这一份，约985 MiB。
3. 右键ZIP → **全部解压**，打开解压后的 `Zhixi-0.1.18-win32-x64` 文件夹。
4. 确认文件夹中有 `install.cmd`、`app/`、`scripts/`、`codex-plugin/` 和 `.agents/`。
5. 双击 **`install.cmd`**，安装桌面程序与 Codex 插件；完成后在 Codex **新建一个聊天**，发送：

```text
打开知栖桌宠
```

安装前需要在终端中能运行 `codex`，且支持 `codex plugin` 命令；额度和任务功能还需要登录 Codex。安装包无需另装 Node.js 或 Python，也无需制作素材包。完整步骤、仅安装桌宠的方法与常见问题见 **[Windows 安装教程](INSTALL-WINDOWS.md)**。

如果 Release 尚未发布或没有上述附件，请等待作者上传。GitHub自动生成的 `Source code (zip)` 是源码，不能直接双击安装。

## 可以做什么

| 功能 | 使用方式 |
| --- | --- |
| 透明视频桌宠 | 拖动移动、缩放、置顶；支持提起、悬空和放回动作 |
| Codex 额度 | 单击人物，查看本机账号实际可用的额度信息 |
| 任务窗口 | 双击人物；可带内容跳转 Codex，也可手动执行任务 |
| 番茄钟 | 右键 → 番茄钟，支持开始、暂停、继续和休息 |
| 陪伴手账 | 右键 → 知栖陪伴手账，记录专注、心情并收集纪念卡 |
| 小花园与装扮 | 浇水、收获、金币商店、场景和人物特效 |
| 动作点播 | 右键 → 动作；日常、钱包、番茄钟和花园分别管理 |

当前形象使用“小芽抱星”胸章，以及白色盘结、两颗淡紫菱形宝石、细链和浅色流苏挂饰。37段现用视频涵盖日常互动、钱包反应、番茄钟、拖动分段和花园演出。

## 在 Codex 中叫出知栖

安装完成后，在新聊天使用 `$zhixi-pet`，或直接输入：

```text
打开知栖桌宠
打开知栖的番茄钟
用知栖查看 Codex 剩余额度
打开知栖的任务窗口
打开知栖陪伴手账
退出知栖桌宠
```

插件负责打开本机桌面程序。打开任务窗口不会自动执行任务，打开番茄钟也不会自动开始计时。任务由你在窗口中点击执行，会使用实际 Codex 额度并按所选权限操作工作目录。

本项目是独立桌面程序与本地插件，不是 OpenAI 官方产品。完整安装和插件验证见[安装说明](docs/INSTALLATION.md)。

## 三种下载文件有什么区别

| 文件 | 适合谁 | 内容 |
| --- | --- | --- |
| `Zhixi-0.1.18-win32-x64.zip` | 直接使用桌宠和插件 | Windows程序、全部37段现用视频、插件和安装脚本 |
| `Zhixi-0.1.18-source.zip` / Git源码 | 阅读或修改代码 | 程序、插件、新版立绘、提示词与轻量索引 |
| `Zhixi-0.1.18-current-media.zip` | 开发打包、制作新动作 | 37段当前实装视频和11张花园末帧海报，不含原片与历史视频 |

每份发布ZIP都附有 `.sha256` 校验文件。当前源码仓库约15 MiB；大素材在 Release 中独立分发。原片、历史旧造型视频及逐帧制作QA仅保留在本地制作工作区，不上传源码或Release；新动作统一使用当前V5立绘。

## 从源码开发

需要 Node.js 22.12+。克隆或解压源码后，先下载同版本素材ZIP，在仓库根目录解压为 `actions/production/...`。可用 Python 3.10+ 校验并安全还原（保留已有不同内容的文件）：

```powershell
python scripts/media-assets.py restore "D:\Downloads\Zhixi-0.1.18-current-media.zip"
python scripts/media-assets.py check
npm ci
npm run audit:assets
npm test
npm run check
npm start
```

把示例中的ZIP路径改为实际下载位置。无需安装到系统也可开发运行；制作Windows包用 `npm run package`。详见[源码安装](docs/INSTALLATION.md#从源码运行)。

## 数据与更新

桌面程序安装到 `%LOCALAPPDATA%\Zhixi\app`，开始菜单入口为 **Zhixi**。个人设置、动作绑定、手账和花园存档位于 `%APPDATA%\QiqiCodexPet`。

更新时下载新版本Windows ZIP，解压到固定目录后再次运行 `install.cmd`。安装程序保留个人数据和自选视频，并备份旧程序。请保留用于注册本地插件源的解压目录。更多内容见[更新与移除](INSTALL-WINDOWS.md#更新与移除)、[数据与隐私](docs/PRIVACY.md)。

## 文档与制作资料

- [Windows安装教程](INSTALL-WINDOWS.md) · [安装与源码说明](docs/INSTALLATION.md)
- [首次上传GitHub教程](docs/GITHUB-UPLOAD.md) · [分发与打包](docs/RELEASING.md)
- [新版人物、固定人设与动画提示词](docs/animation/README.md) · [造型核验摘要](docs/branding/README.md)
- [动作库](actions/README.md) · [素材规范](actions/ASSET-LAYOUT.md) · [视频制作](docs/VIDEO-GUIDE.md)
- [番茄钟](docs/POMODORO.md) · [陪伴手账](docs/JOURNAL.md) · [小花园](docs/GARDEN.md) · [装扮商店](docs/SHOP.md)
- [更新记录](docs/CHANGELOG.md) · [贡献说明](CONTRIBUTING.md) · [安全反馈](SECURITY.md)

## 许可与来源

代码采用 [MIT](LICENSE)，贡献者有权授权的原创非代码素材采用 [CC BY 4.0](LICENSE-ASSETS.md)；第三方名称、商标及其他权利除外。角色和动作使用AI辅助制作，结合人工设定、筛选、修复与透明化；来源和历史素材说明见[项目声明](NOTICE.md)、[第三方通知](THIRD_PARTY_NOTICES.md)和[来源记录](docs/RIGHTS.md)。
