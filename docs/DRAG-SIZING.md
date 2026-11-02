# 连续拖动时人物逐渐变大

在用户机器的 Windows 125% 显示缩放下复现：旧逻辑每次调用 Electron `setPosition`，会复用经物理像素换算后取整的窗口尺寸，连续移动时误差累加。独立原生窗口测试连续移动 120 次，宽度从 264 增加到 384，内容随窗口扩大。设置中的人物缩放值本身没有改变。

修复在 `main/index.cjs`：集中通过 `petSize()` 从人物缩放设置计算设计尺寸；移动时使用 `setBounds({x,y,width,height})`，每次都传入设计宽高。屏幕边界约束也使用设计尺寸，避免拿已经变大的测量值继续计算。窗口的两条边经过物理像素换算后，测量尺寸相对设计值可能有少量固定误差，但后续移动不会继续累加。

连续移动验收通过真实渲染进程的 `petMoved` IPC 进入实际移动处理：依次选择 120%、145%、165%、185% 人物大小，每档 80 次往返移动，共 320 次；检查同一档位全部移动样本的宽高变化范围不超过 1 DIP，相对设计值的误差不超过两个物理像素的取整范围，且内容缩放保持所选值。在当前 125% 显示缩放下，相对设计值允许最多 2 DIP 的固定误差；连续移动不能继续增长。检查名为 `continuous-drag-keeps-configured-size`，结果记录在 `smoke-result.json`。

同时验证拖动视频的提起、持续悬空循环、松手放回与恢复待机。验收使用独立测试媒体库，原有动作文件和用户设置不受影响。

在项目根目录运行：

```powershell
npm run smoke -- --verify-idle=actions/production/00-idle/processed/idle-loop-v1.webm --verify-drag-dir=actions/production/02-drag/processed --verify-drag-version=v2
```
