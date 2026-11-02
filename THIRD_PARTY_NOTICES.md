# 第三方组件与许可

项目代码的 MIT 和原创素材的 CC BY 4.0 不替代第三方许可。

| 内容 | 来源与许可位置 | 分发方式 |
| --- | --- | --- |
| Electron 运行时 | [Electron license](https://github.com/electron/electron/blob/main/LICENSE)，MIT | Windows 包的 `app/LICENSE` 保留运行时原文 |
| Chromium 及 Electron 集成的其他组件 | [Electron licensing](https://www.electronjs.org/docs/latest/tutorial/licensing)，逐项许可 | Windows 包的 `app/LICENSES.chromium.html` 保留原文 |
| Node.js 及其他运行时组件 | 上述运行时许可文件中的相应声明 | 随 Electron 原有通知一起保留 |
| 构建与制作依赖 | `package-lock.json` 和 `requirements-video.txt`；各包分发中的许可文件 | 开发依赖不放进安装 ZIP；单独分发依赖时仍需遵守对应许可 |
| OpenAI 等第三方品牌元素 | [品牌规则](https://openai.com/brand/) 与 [NOTICE](NOTICE.md) | 不属于本项目开放许可范围 |

程序使用操作系统字体，不附带 Microsoft 字体文件。陪伴音乐由项目脚本生成，未加入第三方采样。生成平台对输入和输出的协议另行适用，不能用开源许可证替代。

打包必须保留 Electron 原始 `LICENSE`、`LICENSES.chromium.html`，并将项目声明放在发布包顶层。**不要用项目 MIT 文件覆盖运行时的 `app/LICENSE`。**
