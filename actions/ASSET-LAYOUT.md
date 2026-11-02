# 素材目录规范

## 正式素材与本地制作资料

```text
actions/
  catalog.json                     当前动作绑定与视频哈希
  branding-installation.json       当前视频验收摘要
  production/
    00-idle/processed/             仅现用待机视频
    01-greeting/processed/         仅现用打招呼视频
    ...
    12-wallet/variants/.../processed/  仅现用钱包视频
    13-pomodoro/processed/         仅现用番茄钟视频
    14-garden/processed/           现用花园视频及必需阶段图
    14-garden/runtime.json         花园运行清单
local-assets/                      仅本地保存，Git 与程序打包均排除
  prompts/                         动作提示词，保留动作分类和版本
  sources/                         未改动的原片
  history/                         V1 等被替换的视频、历史场景视频
  reviews/                         编码参数、QA、首末帧、预览与日志
  references/                      共用角色图、场景参考
  notes/                           制作说明与历史制作清单
  workshop/                        人设及动作模板、品牌制作过程
  metadata/                        完整制作索引与迁移前索引
  relocations.json                 每个迁移文件的新旧路径、大小及 SHA-256
```

正式目录共有37段视频及11张必需的花园阶段图。第一版和其他被替换版本放在 `local-assets/history/`；按实际使用状态区分现用与历史，不仅凭文件名版本号判断。迁移不改变视频内容和现用路径。制作文件保留原始字节，旧文档内部路径可通过 `relocations.json` 查找；已更新路径的完整动作对照清单位于 `local-assets/metadata/branding-installation.json`。

## 校验与发布

```powershell
npm run audit:assets
python scripts/organize-assets.py --check
python scripts/media-assets.py check
```

第一条核对当前48个素材的哈希、动作绑定，并拒绝正式目录混入未登记文件。第二条核对859个本地归档文件的原始哈希和正式目录的允许清单。第三条核对独立素材包清单。整理脚本仅首次执行不带参数的迁移，日常使用 `--check`。

新增动作时，制作过程先放 `local-assets/`；验收后只将现用视频及程序必需图片放入 `production/`，同时更新动作清单、现用验收摘要和 `media-assets.json` 中的路径、大小、哈希。被替换的成品移入 `local-assets/history/`。Git源码通过 `scripts/prepare-github.py` 的明确清单导出；视频和花园阶段图通过现用素材ZIP分发。提示词、原片、旧版及逐帧QA不提交Git，也不放进Release素材包。

`.gitignore` 已排除 `local-assets/` 和正式库中的二进制素材。迁移时仅从原工作区Git索引移除了被迁移的文件，迁移前索引另存于 `local-assets/git-index-before-organization`。已存在于远端历史中的资料需要另行处理；本次本地整理不会改写远端历史。

## 运行与备份

实际安装副本仍在 `%APPDATA%\QiqiCodexPet\media/`，绑定记录在同目录 `state.json`。不要手动改这些随机文件名。整理工作区不会改变正在运行的桌宠设置。

备份制作成果时同时保存 `actions/`、`media-assets.json` 和 `local-assets/`。`local-assets/` 不上传GitHub，需自行备份。备份运行设置时另外保存 `%APPDATA%\QiqiCodexPet`。
