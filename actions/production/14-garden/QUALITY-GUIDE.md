# 花园素材的画面质感

0.1.11已接入11段透明视频与11张阶段终态图，所有原片和原始提帧保留不变。处理记录位于`processed/*-v1.json`，运行时索引为[runtime.json](runtime.json)。真实alpha经过全帧解码检查，并在Electron中逐段验证可播放、可读取透明像素及阶段图。

## 背景与轮廓

针对已审核的640方形、中性浅色背景，逐帧估计背景颜色，仅分离边界连通区域；保留银白头发和水壶的封闭浅色区域，同时保留独立花盆、植株与水壶。清理底部平台标识所在的无人物区，以及空土浇水片的孤立水渍。编码保留原生30fps，默认静音，不以复制帧冒充更高帧率。

已经保留的`.scene.mp4`是带原背景的剪辑预览，新的`.webm`才是透明成品。原始参考图保留用于来源核对；运行时使用成品的`.last-frame.png`作为静态阶段展示，避免再放回原背景。

## 连续性和实际结果

番茄最终4颗果、草莓3颗果、西瓜1颗果；静态兜底插画按这些数量和实际阶段同步。西瓜比原提示词的半盆口目标稍大，接入采用实际画面，不要求重新生成。收获价格仍为每批50–100金币，不按画面果数加倍。

草莓、西瓜生长复用早期发芽5秒，接点保留6帧/0.2秒过渡。美化两子叶参考图是生成式重绘，人物和盆存在轻微几何变化；背景已分离，但短接点仍可能看到细微重绘差异。保留已有素材，避免为此增加生成费用。

## 制作来源

- 原始草莓叶态帧（仅本地制作归档：`reference/07-strawberry-leaf-end-v3.png`）、美化参考（仅本地制作归档：`reference/07-strawberry-leaf-polished-v1.png`）及[来源记录](reference/07-strawberry-leaf-polished-v1.json)。
- 原始两子叶帧（仅本地制作归档：`reference/common-cotyledons-end-v3.png`）、干净版两子叶图（仅本地制作归档：`reference/common-cotyledons-polished-v1.png`）及[来源记录](reference/common-cotyledons-polished-v1.json)。
- 西瓜叶态原始尾帧（仅本地制作归档：`reference/11-watermelon-leaf-end-v4.png`）与[西瓜花果验收](processed/garden-watermelon-flower-fruit-v4.review.json)。
- [通用质感提示词](prompts/quality-v4/00-visual-style.txt)继续供以后参考；旧30秒花果提示词只作历史记录。

## 后续额度约束

当前主要素材已齐，不再安排新生成。以后新增视频单条最多15秒，优先5–10秒，优先复用已有片段或程序反馈。已收到的长原片和本地派生剪辑保留，不因这项限制重新生成。
