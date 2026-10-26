# 阅读字体

书名、阅读正文和页标题使用自托管的 **LXGW WenKai Screen（霞鹜文楷屏幕阅读版）**。界面控件保留系统无衬线；字体失败时立即使用系统回退，文字始终可读。

来源为[lxgw-wenkai-screen-webfont](https://github.com/chawyehsu/lxgw-wenkai-webfont)发布到官方npm registry的1.7.0包，内含字体版本v1.250.2。下载包通过registry公布的SHA-512完整性校验；只导入GB字符覆盖版本的97个Unicode分片，合计4,538,380字节。浏览器只取当前文本所需分片，`font-display: swap`；不依赖第三方字体CDN或订阅。

字体由[LXGW项目](https://github.com/lxgw/LxgwWenKai-Screen)提供，保持SIL Open Font License 1.1；webfont包装为MIT。两份原许可位于 `public/fonts/lxgw-wenkai-screen-v1.7.0/OFL.txt` 与 `LICENSE`。应用MIT不替代字体许可。

WOFF2字节未改动，按实际SHA-256重新命名供缓存；CSS使用本项目的`Fable WenKai`别名与原Unicode范围。完整文件哈希、字节数及来源记录在 `src/font-assets.json`。本项目不把webfont作为可安装桌面字体另行分发，也不声称字体作者为本项目背书。
