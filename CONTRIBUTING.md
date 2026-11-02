# 参与知栖

先阅读 [README](README.md)、[素材说明](actions/README.md)和[授权范围](docs/RIGHTS.md)。代码使用 MIT；贡献者有权授权的原创非代码素材使用 CC BY 4.0，第三方内容需单列来源和许可。

## 检查与打包

在按 README 还原现用素材并安装依赖后运行：

```powershell
npm test
npm run check
npm run audit:assets
```

Windows 程序使用 `npm run package` 构建，`npm run release` 生成安装 ZIP。公开源码使用 `scripts/prepare-github.py` 导出，上传前运行 `npm run audit:release` 检查 Git 暂存区。

## 提交范围

公开 Markdown 由 `scripts/public-documents.json` 明确列出，新增长期维护文档时同步更新该清单。开发日志、任务清单、验收截图、已完成事项、提示词和历史制作记录只在本地 `local-assets/` 保存，不进入 Git 或发布包。

不提交依赖、运行包、私人存档、凭据或含真实对话的日志。问题反馈请提供版本、复现步骤与脱敏截图；安全问题见 [安全说明](SECURITY.md)。
