# 阅读与界面字体

当前 BYOK 版使用设备上的完整中文字体，不导入 `src/fonts.css`，无需等待分片字体下载。正文、漫画配文、解析与控件使用 PingFang SC、Microsoft YaHei 或系统无衬线回退；页标题与入口大标题使用 Noto Serif SC、思源宋体、Songti SC、STSong、SimSun 或衬线回退。

长文桌面 20px、2 倍行高，移动端 18px；控制阅读行宽与段间距。字体不被复制打包，具体字形随设备略有不同。

## 历史资源与许可

原版的 LXGW WenKai Screen 1.7.0 GB 字符集资源仍保留用于历史核对，当前 UI 不引用。97 个 SHA-256 命名的 WOFF2 分片、原清单、CSS 与许可保留。

来源：[lxgw-wenkai-screen-webfont](https://github.com/chawyehsu/lxgw-wenkai-webfont) 与 [LXGW 项目](https://github.com/lxgw/LxgwWenKai-Screen)。字体遵循 SIL Open Font License 1.1，webfont 包装为 MIT。许可位于 `public/fonts/lxgw-wenkai-screen-v1.7.0/OFL.txt` 与 `LICENSE`；清单为 `src/font-assets.json`。应用 MIT 不替代字体许可。
