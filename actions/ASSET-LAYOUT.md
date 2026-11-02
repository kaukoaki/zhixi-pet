# 素材目录规范

这是本项目统一采用的目录约定，并非外部通用行业标准。工作区保存制作资料与可重建的成品，应用用户目录保存实际安装副本。

## 工作区制作库

```text
actions/
  catalog.json                     全动作路径、版本、参数与 SHA-256 索引
  production/
    shared/                        字节相同的共用参考图
      character-design.png         原始角色定稿
      idle-reference.png           已装配待机首帧
      relocations.json             旧路径、来源哈希与共享映射
    00-idle/                       独立默认待机
    01-greeting/ … 11-pat/         各主题动作
    12-wallet/                     钱包主题
      prompt.txt                   普通查看提示词
      source/                      普通查看原片副本
      processed/                   普通查看透明成品与处理记录
      variants/
        manifest.json              钱包变体 ID、路径与验收索引
        01-abundant/prompt.txt     仅提示词，暂未制作
        02-careful/                省着点用
        03-low/                    只剩一点点
        04-empty/                  空空的
        05-recovering/             等一会就好
          prompt.txt
          README.md
          source/                  未改动的 MP4 原片副本
          processed/
            wallet-wait-v1.webm    VP9 透明成品
            wallet-wait-v1.json    来源哈希、编码参数、透明检查
            wallet-wait-v1.qa.json 逐帧采样检查记录
            *.png / *.jpg         关键帧和透明边缘预览
```

四个新版本均完整保留 300 帧、30 fps、10 秒；省着点用和只剩一点点为 960 方形，空空的和等一会就好为 640 方形。保持原生分辨率，运行时按同一桌宠窗口显示。`<video-directory>` 中用户原文件未改动；`source/` 是原样归档副本，不覆盖成品。

其他主题同样使用 `source/`、`processed/`、提示词和说明。00–13主题的重复人物定稿与待机参考统一放在 `production/shared/`，各主题说明和清单指向同一文件；`relocations.json`保留原别名路径、字节数与SHA-256，图像内容未重绘。分段拖动的 preview / enter / hold / exit 分开命名。成品用动作英文 ID 和 `v1`、`v2` 标识版本，已有拖动 V1、加油 V1 等历史成品保留，索引标记为 `history`；当前绑定标记为 `active`。共用人物参考图统一放在`production/shared/`，连续场景的独立参考仍留在所属制作包。

## 索引维护

项目根目录运行：

```powershell
npm run audit:assets
```

命令只检查，不修改媒体：核对全部成品、来源原片、处理报告中的 SHA-256、文件字节数、帧率与时长、透明范围记录，以及索引和当前动作定义的一致性。目前共 23 个已有媒体入口（独立待机 + 16 个普通动作 + 6 个番茄钟动作），81 个成品视频文件，其中37个现用分段、44个历史版本文件。

新增成品并更新槽位/路径后运行 `node scripts/audit-action-library.cjs --write` 重建总索引，再执行检查。新增钱包版本还需更新 `variants/manifest.json`。索引与制作文件可以一起迁移，不依赖本机媒体库的随机文件名。检测命令核查保存的透明检查记录；完整解码验收需另运行视频处理或 Electron 烟雾测试。

## 应用安装库与备份

番茄钟制作包位于 `production/13-pomodoro/`，含两批连续表演、独立学习 V2、独立收工 V2、`manifest.json`、`reference/`、`source/`、`processed/`。六个当前媒体入口列入 active 索引，`plannedPacks` 记录六个 readyActions、无待制作段。清单 batches 保留原始六段，enhancements 记录两个 ready 的修订；索引与媒体验收用 `scripts/pomodoro-library.cjs` 绑定到原学习和收工槽，两个 V1 自动列为 history。场景参考继续使用 `reference/continuity-part-01.png`。

实际运行读取 `%APPDATA%\QiqiCodexPet\state.json` 里的槽位映射，视频副本位于同目录的 `media/`；番茄钟计时会话另存于 `pomodoro.json`。安装库采用随机文件名避免冲突，分类由槽位和菜单控制；不要手动重命名这些文件，否则映射会失效。仅将成品放入工作区不会自动安装，需通过动作管理或 `scripts/import-action.cjs` 导入。

备份制作成果请保存整个 `actions/`；备份正在使用的动作绑定、人物大小与其他设置，请同时保存整个 `%APPDATA%\QiqiCodexPet`。`.cache/` 是临时处理与测试资料，`dist/` 是可重新打包生成的程序，均不作为唯一素材归档。

## 花园场景库

`production/14-garden/runtime.json`记录11段透明视频、11张阶段图及哈希。场景与普通桌宠视频分开打包，通过固定的花园资源地址读取；14个菜单入口还包含3种程序收获反馈。原片、历史30秒提示词和带背景的`.scene.mp4`继续保留。后续新生成每条最多15秒，当前无需补片。

## 源码与独立素材包

精简源码仓库保留提示词、说明、处理参数与索引，视频、图片和较大的逐帧QA另放独立素材ZIP。下载同版本素材包并在仓库根目录解压，或运行 `python scripts/media-assets.py restore <素材ZIP路径>`；`python scripts/media-assets.py check`核对所有素材的字节数与SHA-256。还原工具拒绝覆盖内容不同的已有文件。详细流程见[发布说明](../docs/RELEASING.md)。
