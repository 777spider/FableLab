# 自定义模型接口 · 0.3.0

选择服务商 → 填 Key → 选模型。提供 **37 个服务与地域预设**（34 个文字选项、18 个生图选项，含自定义服务），常见地址与协议自动匹配。预设数不等于厂商数，也不等于已经逐家付费实测。

## 一个 API，或分别配置

默认勾选“文字与生图，共用一个 API”。共用服务地址与 Key，两个模型独立选择。例如同一个硅基流动账户，文字选对话模型、生图选图片模型，只填一次 Key。

取消共用即可分别选择服务。DeepSeek、Claude、Kimi 等文字预设不会被误标为可生图；选择这类预设时会转为独立配置。共用仅限同一个地址，不自动推测或跨厂商转发 Key。取消共用后需单独填写生图 Key；切换服务、地域、地址或协议不会继承旧 Key。

模型 ID 不按 Key 猜测，也不把本地参考名称当作账户权限。支持目录的服务可主动读取列表；其他服务从“查看模型名称”进入官方文档。Azure 模型字段使用你自己的部署名称。

## 服务目录

地址与协议可以在高级设置中修改。表格中“—”表示本版没有该服务的对应适配，并非判断厂商所有产品都不具备这项能力。地区的凭据与模型可能不同。

| 服务 / 官方文档 | 文字协议 | 生图协议 | 默认服务地址 |
| --- | --- | --- | --- |
| [OpenAI](https://platform.openai.com/docs/api-reference) | responses | images | https://api.openai.com/v1 |
| [Anthropic / Claude](https://platform.claude.com/docs/en/api/overview) | anthropic | — | https://api.anthropic.com/v1 |
| [Google / Gemini](https://ai.google.dev/gemini-api/docs/image-generation) | google | google | https://generativelanguage.googleapis.com/v1beta |
| [OpenRouter](https://openrouter.ai/docs/features/multimodal/image-generation) | openrouter | openrouter | https://openrouter.ai/api/v1 |
| [DeepSeek](https://api-docs.deepseek.com/) | chat | — | https://api.deepseek.com |
| [阿里百炼 / 通义千问 · 中国](https://help.aliyun.com/en/model-studio/qwen-image-generation-and-editing-api-reference) | chat | images | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| [阿里百炼 / Model Studio · 新加坡](https://help.aliyun.com/en/model-studio/qwen-image-generation-and-editing-api-reference) | chat | images | https://dashscope-intl.aliyuncs.com/compatible-mode/v1 |
| [硅基流动 · 中国](https://api-docs.siliconflow.cn/docs/api/images-generations-post) | chat | siliconflow | https://api.siliconflow.cn/v1 |
| [SiliconFlow · 国际](https://docs.siliconflow.com/en/api-reference/images/images-generations) | chat | siliconflow | https://api.siliconflow.com/v1 |
| [火山方舟 / 豆包](https://www.volcengine.com/docs/82379/1541523) | chat | ark | https://ark.cn-beijing.volces.com/api/v3 |
| [智谱 / GLM · 中国](https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image) | chat | bigmodel | https://open.bigmodel.cn/api/paas/v4 |
| [Z.ai / GLM · 国际](https://docs.z.ai/guides/overview/quick-start) | chat | — | https://api.z.ai/api/paas/v4 |
| [月之暗面 / Kimi · 中国](https://platform.moonshot.cn/docs/guide/start-using-kimi-api) | chat | — | https://api.moonshot.cn/v1 |
| [Moonshot / Kimi · 国际](https://platform.kimi.ai/docs/get-your-api-key) | chat | — | https://api.moonshot.ai/v1 |
| [MiniMax · 中国](https://platform.minimax.cn/docs/api-reference/image-generation-t2i) | chat | minimax | https://api.minimax.cn/v1 |
| [MiniMax · 国际](https://platform.minimax.io/docs/api-reference/image-generation-t2i) | chat | minimax | https://api.minimax.io/v1 |
| [腾讯 TokenHub / 混元 · 中国](https://cloud.tencent.com/document/product/1823/132252) | chat | — | https://tokenhub.tencentmaas.com/v1 |
| [Tencent TokenHub · 国际](https://intl.cloud.tencent.com/ind/document/product/1300/79733) | chat | — | https://tokenhub-intl.tencentcloudmaas.com/v1 |
| [腾讯混元 · 旧兼容接口](https://cloud.tencent.com/document/product/1729/131925) | chat | — | https://api.hunyuan.cloud.tencent.com/v1 |
| [百度千帆 / 文心](https://cloud.baidu.com/doc/qianfan-docs/s/Fm9l6ocai) | chat | — | https://qianfan.baidubce.com/v2 |
| [阶跃星辰 / StepFun](https://platform.stepfun.com/docs/zh/guides/model-migration) | chat | — | https://api.stepfun.com/v1 |
| [xAI / Grok](https://docs.x.ai/developers/model-capabilities/images/generation) | chat | images | https://api.x.ai/v1 |
| [Mistral](https://docs.mistral.ai/resources/migration-guides) | chat | — | https://api.mistral.ai/v1 |
| [Groq](https://console.groq.com/docs/openai) | chat | — | https://api.groq.com/openai/v1 |
| [Together AI](https://docs.together.ai/docs/inference/openai-compatibility) | chat | images | https://api.together.ai/v1 |
| [Fireworks AI](https://docs.fireworks.ai/tools-sdks/openai-compatibility) | chat | — | https://api.fireworks.ai/inference/v1 |
| [DeepInfra](https://deepinfra.com/docs/openai_api) | chat | — | https://api.deepinfra.com/v1/openai |
| [Cerebras](https://inference-docs.cerebras.ai/resources/openai) | chat | — | https://api.cerebras.ai/v1 |
| [Perplexity](https://docs.perplexity.ai/docs/agent-api/openai-compatibility) | responses | — | https://api.perplexity.ai/v1 |
| [Hugging Face Router](https://huggingface.co/docs/inference-providers/index) | chat | — | https://router.huggingface.co/v1 |
| [Azure OpenAI](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/how-to/switching-endpoints) | chat | images | 填写自己的资源地址 |
| [Stability AI](https://docs.stability.ai/api-reference) | — | stability | https://api.stability.ai/v2beta |
| [fal.ai](https://ai-sdk.dev/providers/ai-sdk-providers/fal) | — | fal | https://fal.run |
| [Replicate](https://ai-sdk.dev/providers/ai-sdk-providers/replicate) | — | replicate | https://api.replicate.com/v1 |
| [Ollama · 本机](https://docs.ollama.com/api/openai-compatibility) | chat | — | http://127.0.0.1:11434/v1 |
| [LM Studio · 本机](https://lmstudio.ai/docs/developer/openai-compat) | chat | — | http://127.0.0.1:1234/v1 |
| 自定义 / 中转 / 其他兼容服务 | chat | images | 填写网关地址 |

## 自动匹配的范围

- 选择预设后填写其地址与协议；中国、国际与本机服务分组显示。
- 粘贴已识别的服务根域名或完整生成接口，离开输入框时识别服务并去掉末尾生成路径。例如硅基流动的 /v1/images/generations 变为 /v1。
- Azure 资源根地址补齐 /openai/v1；阿里工作空间域名保留原主机并补齐 /compatible-mode/v1。不会编造资源名或部署名。
- 自定义中转保留自己的主机与路径前缀，不替换为官方域名。相似拼写或后缀伪装的域名不会被识别为官方服务。
- 不从 Key 的前缀猜测提供商，不扫描模型，不自动生图。地址不接受内嵌用户名、密码、查询参数或 fragment；外部要求 HTTPS，本机回环允许 HTTP。

## 协议与开源实现

文字协议：Chat Completions、Responses、Anthropic Messages、Google Gemini、OpenRouter。兼容 Chat 的服务不一定支持 Responses；预设按已核对的接口选择。Perplexity 使用当前 Agent / Responses 兼容入口，腾讯新用户使用 TokenHub，而不是旧混元地址。

图片适配：

| 协议 | 实现与请求方式 | 边界 |
| --- | --- | --- |
| images | OpenAI-compatible SDK → /images/generations | OpenAI、xAI、Together、阿里 Qwen Images 兼容接口、Azure 与兼容网关；不是所有万相模型都实现此协议 |
| google | Google SDK → Gemini generateContent | 仅支持图片输出的 gemini- 模型；当前固定 SDK 已移除 Imagen |
| openrouter | OpenRouter 官方 SDK → 独立 /images | 与其对话接口分别选模型 |
| siliconflow | 原生 /images/generations，解析 images 数组中的 URL | 不套用 OpenAI 的 data 数组；尺寸使用所选模型的默认值 |
| minimax | 原生 /image_generation，解析 data.image_base64 / image_urls | 包含 HTTP 200 下的业务状态码检查 |
| bigmodel | 原生 /images/generations，解析 data 中图片 | 默认 1280×1280；提示词按文档截至 1000 个字符，是否截短写入非敏感媒体元数据 |
| ark | AI SDK ByteDance provider → Seedream | 配置中国方舟地址；单图 2K，不关闭水印；可填模型或接入点 ID |
| stability | 原生 multipart/form-data → Stable Image Core、Ultra 或 SD3 | 模型填 core、ultra 或受支持的 SD3 系列；接收 PNG 字节 |
| fal | 官方 AI SDK provider → fal.run/模型路径 | 只接入提供 prompt 输入的文生图模型；不承诺任意工具或编辑模型适用 |
| replicate | 官方 AI SDK provider → predictions，支持异步结果轮询 | 模型填 owner/model 或 owner/model:version；不承诺非图片模型适用 |

复用 [Vercel AI SDK](https://github.com/vercel/ai)（Apache-2.0）与 [OpenRouter 官方 provider](https://github.com/OpenRouterTeam/ai-sdk-provider)（Apache-2.0）。ByteDance、fal、Replicate 使用其直接 provider，没有隐式 AI Gateway。版本见 package.json 与 lockfile。硅基流动、MiniMax、智谱、Stability 的轻量适配遵循各自官方文档，不要求再运行一个网关。

Ollama / LM Studio 需你先启动本机模型服务，本应用不捆绑权重。AWS Bedrock、Google Vertex 等需要额外云身份认证的接口不冒充单 Key 直连接口；如需使用，可通过自行部署且实现受支持协议的网关接入。[LiteLLM](https://github.com/BerriAI/litellm) 是可选外部方案，本应用不安装或自动启动它。

## 生图能力如何判断

1. 读取目录只查看服务商返回的输出能力。output_modalities、architecture.output_modalities、明确的 capabilities.image_generation 可作为声明。
2. 模型名带 image/vision、能接收图片、支持 generateContent，都不能证明能输出图片。缺少元数据保持“待验证”。
3. 主动点“验证生图（1张）”才发送一次生成请求；解析真实 PNG/JPEG 字节，成功后标记“已成功生成测试图”并预览。可能计费，不自动运行。
4. 列表不存在、无权限或网络失败不等于模型不支持生图。认证、额度、限流、参数与连接错误分别提示；失败不伪造成功状态。
5. 地址、协议、模型或 Key 改变后原验证结论失效。共用时修改文字 Key 也会使生图验证失效。

Stability、MiniMax、fal 与 Replicate 没有统一的 OpenAI /models 目录，界面直接提供官方模型文档。Stability 的下拉参考项是已适配的请求名称，仍需账户权限与实际验证。

## 内容流程、次数与人物参考

每个新任务生成一则故事，4–6 页。先形成知识结构，再写情节，生成“解”和题目，独立进行机器复核，必要时有限修复。文字模型需按提示返回完整 JSON；连通成功不证明生成内容的质量。

SDK maxRetries 为 0；应用每步骤最多尝试 2 次，整任务最多 24 次，包含图片及结构修复。Replicate 的状态轮询不重新提交生成任务，仍有次数与超时上限。取消不能保证服务商未执行或不计费。

Gemini、OpenRouter、Seedream 可向后续页传首图作为人物参考。其他适配器使用固定人物文字描述，不假定其任意模型都支持编辑或参考图。跨页一致性、模型事实准确性和学习效果均不由接口测试保证。

目前接受 PNG / JPEG，拒绝伪图片与过大的返回。不统一提供所有厂商的尺寸、风格和高级参数。服务商支持的模型、权限和接口生命周期会变化，选项内的官方文档是进一步核对入口。

## 凭据与验证边界

Key 由使用者显式填入本机服务，不从系统环境中的作者或机构凭据兜底；不写入浏览器持久存储、任务文件、应用日志或导出。服务端不把 Key 回传前端，只返回 hasKey。重启服务后需要重填。

禁止自动重定向；生成图片 CDN 下载不带服务商认证。配置与工作媒体使用 no-store，匿名会话 Cookie 仅用于本机浏览器之间隔离。

适配测试使用真实 SDK 序列化、解析和本地构造的上游响应，并通过 HTTP 完成单 Key 的文字与漫画任务。没有真实付费凭据逐家调用；这不证明任意账户的所有模型都可用。用户可用自己的配置进行显式运行验证。具体测试与浏览器检查见 [验证记录](VALIDATION.md)。
