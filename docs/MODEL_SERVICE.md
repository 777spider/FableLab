# 自定义模型接口

本版复用 [Vercel AI SDK](https://github.com/vercel/ai)（Apache-2.0）和 [OpenRouter 官方 provider](https://github.com/OpenRouterTeam/ai-sdk-provider)（Apache-2.0），通过 `GenerationProvider` 接口衔接原有的概念、故事、解析、复核和插画流程。具体依赖版本固定在 `package.json` 与 lockfile 中。

## 服务地址与协议

| 选择 | 常见 Base URL | SDK 调用 / 上游路径 |
| --- | --- | --- |
| 文字 · Chat Completions | `https://api.openai.com/v1`，或兼容服务商提供的地址 | OpenAI-compatible `.chatModel()` → `/chat/completions` |
| 文字 · Responses | `https://api.openai.com/v1` | OpenAI `.responses()` → `/responses` |
| 文字 · Anthropic | `https://api.anthropic.com/v1` | Anthropic `.messages()` → `/messages` |
| 文字 · Gemini | `https://generativelanguage.googleapis.com/v1beta` | Google 模型 → `/models/{model}:generateContent` |
| 文字 · OpenRouter | `https://openrouter.ai/api/v1` | OpenRouter `.chat()` → `/chat/completions` |
| 生图 · Images | `https://api.openai.com/v1`，或兼容服务商的地址 | OpenAI-compatible `.imageModel()` → `/images/generations` |
| 生图 · Gemini | `https://generativelanguage.googleapis.com/v1beta` | Google `.image()` → Gemini 图片输出 |
| 生图 · OpenRouter | `https://openrouter.ai/api/v1` | 官方 `.imageModel()` → 独立 `/images` 接口 |

以上地址是协议示例，不包含可用凭据，也不保证某个账户拥有某个模型权限。选择服务商真实提供的协议；模型名称从其文档或模型列表获取。Ollama、LM Studio 等本地服务使用自己的回环地址。

兼容服务选 Chat Completions 通常更合适；没有完整实现 Responses 的服务不能仅靠改模型名称变成 Responses。Anthropic 支持读图不等于支持原生图片输出。当前固定的 Google SDK 仅支持 Gemini 图片模型，已经移除旧 Imagen 模型调用；此处不宣传 Imagen 可用。原生 DashScope、火山、SiliconFlow 等图片接口如果不实现以上协议，需要额外适配或使用确实兼容的网关。可选外部方案有 [LiteLLM](https://github.com/BerriAI/litellm)，但本应用不捆绑或自动运行它。

地址填写服务根路径，不必附 `/chat/completions`。常见完整 endpoint 会被规范化去掉末尾路径。地址不接受嵌入用户名、密码、查询参数或 fragment；外部服务要求 HTTPS，本机回环服务允许 HTTP。

## 生图能力判定

1. **读取模型列表**：OpenAI 兼容与 Anthropic 使用 `/models`，Gemini 使用 `/models`，OpenRouter 生图使用 `/images/models`。
2. **检查输出字段**：只采用 `output_modalities`、`architecture.output_modalities` 或明确的 `capabilities.image_generation` 等字段。`input_modalities: image`、`generateContent` 方法存在或名称带 image/vision 都不能证明图片输出。
3. **信息不足**：显示“待验证”，允许手工填写。列表缺失、无权限或 404 不等于生成端点不可用。
4. **主动验证**：使用者点“验证生图（1张）”后，向当前生图接口发一次请求，核对实际 PNG/JPEG 字节，再标记成功并展示预览。该请求可能计费。
5. **失败归因**：认证、额度、限流、参数、超时与网络错误分别提示，失败不会把能力直接改成“不支持”。更换模型、地址、协议或 Key 会清除既有验证结论。

没有自动扫描所有模型或逐个付费测试。列表是服务商的声明；成功返回一次图片才是当前配置的运行证据，不保证其未来可用性和画质。

## 图像与文字边界

每个新任务生成一则中文故事。标准故事 4–6 页；输入先形成知识结构，再写情节，生成解析和题目，最后进行独立的一轮机器复核，必要时有次数受限的修复。

SDK 的 `maxRetries` 固定为 0；应用单步骤最多尝试 2 次，整任务最多 24 次。结构错误、复核修复和网络重试都消耗次数，不会无限调用。使用者可以暂停。服务端已接受的调用仍可能计费，客户端取消不保证退款。

Gemini 和 OpenRouter 适配器可以向后续页传入首图作为人物参考。Images 兼容服务不统一实现图像编辑，因此本版只调用 `/images/generations`，以固定人物文字描述维持连贯，不擅自调用 `/images/edits`。跨页人物一致性取决于服务和模型，不保证完全一致。

接受 PNG、JPEG 输出；其他格式目前显示清楚的验证失败，不伪装成图片成功。真实接口可能对尺寸、模型权限、图片格式或参数有额外要求；此版不提供每家厂商的全部高级选项。

文字服务需能按提示词返回完整 JSON，并具备足够的中文长文与输出长度能力。协议可连接不代表任意小模型都能通过完整故事和引用映射检查。“测试文字”只确认能返回文字，不验证内容质量。

## 凭据与请求

文字、生图分别配置；模型字符串显式创建 provider，不经过默认 AI Gateway。API Key 只由浏览器显式提交到本机服务，不从环境中的作者 Key 自动兜底。密钥不返回给前端，也不落入检查点、日志或导出内容。更换地址或协议时，留空不会继承旧 Key。

请求禁止自动重定向。图片 CDN 下载会移除认证头，避免向另一个来源泄露 provider Key。所有工作媒体与配置响应使用 `no-store`，匿名会话 Cookie 仅用于同机浏览器之间隔离，并非账号或登录系统。

## 验证依据

使用 SDK 的真实序列化和响应解析路径，针对本地构造的上游响应测试五种文字协议及 Images、Gemini、OpenRouter 生图协议；HTTP 测试覆盖完整文字/漫画流程、Key 不落盘和会话隔离。未使用真实付费凭据逐家调用，不能把这些检查描述成所有厂商线上实测。

接口参考：[AI SDK compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers)、[Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google)、[OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)。实现以本仓库固定依赖版本为准。
