# 共用人物参考图

这里只合并字节完全相同的参考图，不改人物、画风、尺寸、背景或颜色。

- character-design.png（仅本地制作归档：`character-design.png`）：00–13主题旧版制作共用的角色定稿，与历史`assets/character/qiqi-chibi-v3-gpt.png`逐字节相同；保留源视频溯源，不用于后续新动画。新版生成统一引用[当前立绘](../../../assets/character/qiqi-chibi-v5-knot-sprout.png)和[提示词模板](../../../docs/animation/README.md)。
- idle-reference.png（仅本地制作归档：`idle-reference.png`）：01–12主题共用的已装配透明待机首帧，逐字节复制自待机首帧（仅本地制作归档：`../00-idle/processed/idle-loop-v1.first-frame.png`），保留原720×720构图与脚底位置。
- [relocations.json](relocations.json)：26个旧别名路径到共用文件的映射、原字节数与SHA-256，供制作溯源核对。旧路径不再保留图片副本。

动作提示词、来源视频、透明成品、历史版本与处理报告保持原样。番茄钟与花园的桌椅、花盆等连续场景参考仍保存在各自`reference/`目录，不能用共用人物图替代这些接点图。

运行时角色图和插件图标属于独立安装包边界，保留各自副本，避免安装插件时依赖仓库外部路径。
