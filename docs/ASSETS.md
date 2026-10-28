# 预置素材与字体

公开包包含本项目原创、AI辅助整理的“仿真”文字案例，以及 12 张本项目生成的 WebP 显示图，按项目 [MIT License](../LICENSE) 发布。它们用于演示学习流程，内容仍需独立学科审查。公开包不含原始 PNG、生成请求记录、生产数据或真实用户内容。

图像位于 `public/art/optimized/`；文件名是内容的 SHA-256。`src/preset-art.json` 记录显示 URL、实际宽高、字节数及哈希。测试直接验证所发布的 WebP 文件，不依赖未公开的原图或本机目录。

文字书封的三种 SVG 几何版画为本项目原创代码，按项目 MIT 发布；未复制参考仓库的图案、字体或代码。[书封设计](COVER_DESIGN.md)列出参考来源。`docs/assets/bookshelf-covers.png` 是实际本地界面截图，包含三本合成排版样例与两本自带案例，没有生产用户数据。

运行时合成漫画使用代码内的 1×1 PNG 占位图，该图只服务于离线流程测试。使用自己的模型服务生成的新内容由自部署者按服务条款及实际内容另行管理。

阅读字体 **LXGW WenKai Screen（霞鹜文楷屏幕阅读版）** 来自 `lxgw-wenkai-screen-webfont` 1.7.0 包，字体版本 v1.250.2。公开包包含 GB 覆盖版的 97 个原始 WOFF2 分片，以实际 SHA-256 命名；`src/font-assets.json` 记录字节数与哈希，`src/fonts.css` 按 Unicode 范围加载。

字体保留 **SIL Open Font License 1.1**，webfont 包装保留 **MIT**；两份原许可分别位于 [OFL.txt](../public/fonts/lxgw-wenkai-screen-v1.7.0/OFL.txt) 与 [LICENSE](../public/fonts/lxgw-wenkai-screen-v1.7.0/LICENSE)。项目 MIT 不替代字体许可。下载校验与来源见[字体说明](FONTS.md)。
