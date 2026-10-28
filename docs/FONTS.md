# 阅读与界面字体

2026-10-28 起，正文、漫画配文、解析和界面控件使用设备上的完整中文无衬线字体；页标题、书下书名和入口大标题使用本机中文衬线字体。正文桌面 20px、2 倍行高，移动端 18px；控制阅读行宽和段间距，不再用手写体承担长文。

无衬线依次尝试 Noto Sans CJK SC、Noto Sans SC、Source Han Sans SC、PingFang SC、Microsoft YaHei 和系统回退；衬线依次尝试 Noto Serif CJK SC、Noto Serif SC、Source Han Serif SC、Songti SC、STSong、SimSun。系统已有字体不被复制、打包或重新分发，不需购买或第三方字体服务。不同设备外观随本机字体略有不同；罕见字符仍可能由系统回退。

页面不导入 `src/fonts.css`，没有字体下载、预加载或逐片替换。一段常规中文正文由完整本机字体渲染，避免网络分片陆续抵达造成长期混用。冷缓存基线实测中，默认文字案例首屏使用 18 个 WenKai 分片，最慢单项请求约 6.6 秒；改后浏览器验证无字体网络请求。该数值是一次现场观测，不是通用加载时限。

## 保留的历史字体资源

Studio09 的 **LXGW WenKai Screen 1.7.0** GB 字符集、97 个 SHA-256 命名的 WOFF2 分片及原清单、CSS 和许可全部保留，当前界面不引用它们。历史资源仍可用于核对与回退。

来源为 [lxgw-wenkai-screen-webfont](https://github.com/chawyehsu/lxgw-wenkai-webfont) 的官方 npm 包，下载曾通过 registry 公布的 SHA-512 校验。字体由 [LXGW 项目](https://github.com/lxgw/LxgwWenKai-Screen) 提供，遵循 SIL Open Font License 1.1；webfont 包装为 MIT。原许可位于 `public/fonts/lxgw-wenkai-screen-v1.7.0/OFL.txt` 与 `LICENSE`，清单为 `src/font-assets.json`。应用 MIT 不替代字体许可。
