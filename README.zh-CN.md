<div align="center">

# FableLab · 寓言实验室

**先读故事，再读懂概念。**

用你自己的 AI 接口，把抽象概念写成文字故事或漫画故事。

[![Check](https://github.com/777spider/FableLab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/777spider/FableLab/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-315b49)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-315b49)](https://nodejs.org/)

[课题组主页 ↗](https://aiecnu.site) · [English](README.md) · [快速开始](#快速开始) · [接口说明](docs/MODEL_SERVICE.md)

</div>

![FableLab 开源版：纸色的文字与漫画创作界面，使用自己的 API。](docs/assets/fablelab-byok.png)

## 两种生成方式

- **文字故事**：输入一个概念，生成一则寓言，再阅读学术解析「解」和讨论应用「议」。
- **漫画故事**：在同一学习流程中生成 4–6 张插画，文字和生图可以使用不同的服务商。

这是在自己电脑上运行的开源版，**没有登录、邀请码、书架或公开分享功能。作者不提供 API Key，也不承担调用费用。** 内置示例可直接阅读；新生成的内容使用你自己的服务与额度。应用本身不包含本地大模型。

## 快速开始

安装 [Node.js 24 或更新版本](https://nodejs.org/)，在终端运行：

```sh
git clone https://github.com/777spider/FableLab.git
cd FableLab
npm ci
npm run local
```

打开 **http://127.0.0.1:4318/learn/**。启动命令会先检查并构建当前代码。

1. 点右上角 **API 设置**。
2. 在文字栏**选择服务商，填 Key、选模型**。地址和协议会自动匹配，本机免 Key 服务可以留空 Key。
3. 要生成漫画，可勾选**文字与生图，共用一个 API**，只填一次 Key、分别选两个模型；也可取消共用，单独选择生图服务。模型支持读取列表或手动填写。
4. 保存，输入概念，选择文字或漫画并生成。

服务商的聊天会员不一定包含 API 额度，请向你选择的服务商获取 API 凭据与模型权限。无需使用作者或某一机构的服务。首次体验也可直接点 **先读一个示例**：它展示预置内容，不会调用模型。

## 支持哪些接口

提供 **37 个服务与地域预设**：DeepSeek、阿里百炼、硅基流动、火山方舟、智谱、Kimi、MiniMax、腾讯 TokenHub、百度千帆、阶跃星辰，以及 OpenAI、Claude、Gemini、OpenRouter、Grok、Mistral、Groq、Together、Fireworks、DeepInfra、Cerebras、Perplexity、Hugging Face、Azure OpenAI、Stability AI、fal.ai、Replicate、Ollama、LM Studio 和自定义网关。文字与生图分别只显示已适配的选项，不把读图能力当作生图能力。

常见服务无需手填地址；粘贴服务根地址或完整生成接口也能识别并补全。Azure 需填写自己的资源地址。地址与协议仍可展开修改。完整预设、官方文档及能力边界见 [接口说明](docs/MODEL_SERVICE.md)。

| 用途 | 接口协议 | 适配范围 |
| --- | --- | --- |
| 文字 | OpenAI Chat Completions | OpenAI、兼容网关、DeepSeek／通义等兼容文字接口，以及 Ollama／LM Studio 的兼容端点 |
| 文字 | OpenAI Responses | OpenAI 或实现 Responses 的服务 |
| 文字 | Anthropic Messages | Anthropic 或兼容 Messages 的服务 |
| 文字 | Google Gemini | Gemini generateContent |
| 文字 | OpenRouter | OpenRouter 对话接口 |
| 生图 | OpenAI Images | 实现 `/images/generations` 的服务 |
| 生图 | Google Gemini | 具备图片输出能力的 Gemini 模型 |
| 生图 | OpenRouter Images | OpenRouter 的独立图片接口 |
| 生图 | 厂商原生适配 | 硅基流动、MiniMax、智谱、火山方舟 Seedream、Stability AI |
| 生图 | 官方 SDK | fal.ai、Replicate |

接口适配复用开源的 [Vercel AI SDK](https://github.com/vercel/ai) 和 [OpenRouter 官方适配器](https://github.com/OpenRouterTeam/ai-sdk-provider)，并为返回结构不同的厂商提供单独适配。37 是服务与地域选项数，不是逐家付费实测数量；具体模型仍取决于账户权限。共用配置只向同一个服务地址发送 Key，更换服务商会清空旧 Key。

**能看图，不等于能生图。** 服务返回明确的图片输出能力时，会标为“接口声明支持生图”；只有模型名称时，仍是“待验证”。主动点 **验证生图（1张）** 才会实际生成测试图，成功后确认当前配置可用。这个操作可能计费，系统不会自动替你发起。文字测试也可能计费。认证、额度和网络错误不会直接被判为模型不能生图。

## 阅读与数据

页码、前后翻页以及「解／议」固定在阅读区顶部，正文和漫画在内部滚动。表单、设置弹窗外可用左右方向键翻页。长文使用本机完整中文字体，无需等待字体分片下载。

- Key 仅保存在本地服务的运行内存中，不写入浏览器存储、任务文件、导出文件或应用日志；更换服务地址不会自动沿用旧 Key。
- 你的本地服务将提示词和内容发给你配置的服务商，适用该服务商的数据政策。
- 本地服务仍在运行时，同一浏览器刷新可接回当前任务；关闭页面后，生成仍会继续。请不要关闭运行服务的终端。
- 任务进度和图片暂存在应用创建的临时目录，正常关闭服务时删除；强制结束进程可能留下临时内容，但不会留下已保存的 Key。重启后需重填 Key，不能恢复上一轮任务。**停止服务前请导出需要的文字。** 此版没有持久书架。
- SDK 的隐式重试已关闭。应用每个步骤最多调用 2 次，每个任务累计最多尝试 24 次，包含生图。结构检查或修复可能增加文字调用；漫画每页单独生图，失败时有次数受限的重试。

机器复核不等于独立学术核验；模型给出的书目仍需检查。平台尚未通过正式研究证明学习效果。[来源说明](SOURCES.md) 区分了设计启发、素材来源与效果证据。

## 开发与版本

```sh
npm test
npm run build
npm start
```

`npm start` 直接启动已有构建。需要前端热更新时，在两个终端分别运行 `npm run dev` 和 `npx vite`。服务默认只监听本机回环地址。更多内容见 [本地运行](docs/QUICKSTART.md)、[运行边界](docs/DEPLOYMENT.md) 和 [验证记录](docs/VALIDATION.md)。

原完整 Studio 版保存在标签 **`full-studio-20261029`**。当前源码中保留了部分历史模块及其回归测试，但默认入口只启用本版，不创建账户数据库。旧的账户、书架、分享和线上部署说明仅适用于归档版本。

应用代码遵循 [MIT](LICENSE)。第三方 SDK、字体和插画保留各自许可，见 [来源](SOURCES.md)、[字体](docs/FONTS.md) 和 [素材清单](docs/ASSETS.md)。

课题组主页：**[aiecnu.site](https://aiecnu.site)**。
