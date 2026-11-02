# 知栖角色与素材

当前原画为 `assets/character/qiqi-chibi-v5-knot-sprout.png`：银白渐青长发、紫眼睛、侧编发、黑金蝴蝶结、黑白金服装、小芽抱星胸章和白结／双紫晶／流苏发饰。完整原始透明立绘、尺寸与SHA保存在 [人设清单](../assets/character/appearance.json)，后续动画使用[新版人设与提示词](animation/README.md)。旧生图记录见 [CHIBI-GENERATION.md](CHIBI-GENERATION.md)。

当前渲染导出的 [角色参考图](images/character-reference.png) 放在 `docs/images/`；README展示当前V5原画，历史截图留在本地。番茄钟连续视频仍使用对应制作包里的桌椅场景参考。

显示大小由用户设置控制。可用时播放待机视频，没有可用视频则对原画做轻微网格呼吸。网格变形不等同于视频生成，不创造独立肢体或闭眼动作。

视频由用户使用图生视频工具制作。每个主题的 `source/` 保留原片，`processed/` 保留透明成品、参数和 QA；提示词与参考图放在同一主题。处理包含背景分离、批准区域内漫画特效保留、局部生成标记修复及循环接缝。被标记遮住的局部细节不能视为精确还原。

旧设计稿、旧抠图和本机测试图片归档于 Git 忽略的 `archive/pre-release/`，不进入发布。贡献者有权授权的素材采用 [CC BY 4.0](../LICENSE-ASSETS.md)，第三方标志不在许可范围内。历史含第三方标志的素材与生成平台权限仍按原记录保留，不能据此宣称角色和所有视频已完成权利清查，见 [权利与发布核对](RIGHTS.md) 及 [目录规范](../actions/ASSET-LAYOUT.md)。

原创陪伴音乐《窗边的栖光》位于 `assets/audio/window-light.wav`，由 `scripts/compose-companion.py` 生成轻钢琴音色与和声，无第三方采样、录音或联网播放服务。乐曲约 56.5 秒，循环尾音跨边界衔接；关闭“安静陪伴”时以 16% 音量播放。
