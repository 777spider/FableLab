import type { ImageProtocol, TextProtocol, Target } from './byok.ts';

type Route<P> = { protocol: P; baseURL: string };
export interface ServicePreset {
  id: string; label: string; group: '国内服务' | '国际服务' | '本机与自定义';
  hosts: readonly string[]; text?: Route<TextProtocol>; image?: Route<ImageProtocol>;
  docs: string; note?: string; imageModels?: readonly string[];
}
const chat = (baseURL: string): Route<TextProtocol> => ({ protocol: 'chat', baseURL });
const images = (baseURL: string, protocol: ImageProtocol = 'images'): Route<ImageProtocol> => ({ protocol, baseURL });
// These are service endpoints, not promises that every model/account supports both modalities.
// Keep model IDs user-selected: catalogs and deployment names change independently of the protocol.
export const services: readonly ServicePreset[] = [
  { id: 'openai', label: 'OpenAI', group: '国际服务', hosts: ['api.openai.com'], text: { protocol: 'responses', baseURL: 'https://api.openai.com/v1' }, image: images('https://api.openai.com/v1'), docs: 'https://platform.openai.com/docs/api-reference' },
  { id: 'anthropic', label: 'Anthropic / Claude', group: '国际服务', hosts: ['api.anthropic.com'], text: { protocol: 'anthropic', baseURL: 'https://api.anthropic.com/v1' }, docs: 'https://platform.claude.com/docs/en/api/overview' },
  { id: 'google', label: 'Google / Gemini', group: '国际服务', hosts: ['generativelanguage.googleapis.com'], text: { protocol: 'google', baseURL: 'https://generativelanguage.googleapis.com/v1beta' }, image: images('https://generativelanguage.googleapis.com/v1beta', 'google'), docs: 'https://ai.google.dev/gemini-api/docs/image-generation', note: '生图请选择支持图片输出的 Gemini 模型；此接口不接入 Imagen。' },
  { id: 'openrouter', label: 'OpenRouter', group: '国际服务', hosts: ['openrouter.ai'], text: { protocol: 'openrouter', baseURL: 'https://openrouter.ai/api/v1' }, image: images('https://openrouter.ai/api/v1', 'openrouter'), docs: 'https://openrouter.ai/docs/features/multimodal/image-generation' },
  { id: 'deepseek', label: 'DeepSeek', group: '国内服务', hosts: ['api.deepseek.com'], text: chat('https://api.deepseek.com'), docs: 'https://api-docs.deepseek.com/' },
  { id: 'dashscope', label: '阿里百炼 / 通义千问 · 中国', group: '国内服务', hosts: ['dashscope.aliyuncs.com'], text: chat('https://dashscope.aliyuncs.com/compatible-mode/v1'), image: images('https://dashscope.aliyuncs.com/compatible-mode/v1'), docs: 'https://help.aliyun.com/en/model-studio/qwen-image-generation-and-editing-api-reference', note: '生图接入 Qwen 的 OpenAI Images 兼容接口；不混用万相异步接口。工作空间地址也可自定义。' },
  { id: 'dashscope-intl', label: '阿里百炼 / Model Studio · 新加坡', group: '国内服务', hosts: ['dashscope-intl.aliyuncs.com'], text: chat('https://dashscope-intl.aliyuncs.com/compatible-mode/v1'), image: images('https://dashscope-intl.aliyuncs.com/compatible-mode/v1'), docs: 'https://help.aliyun.com/en/model-studio/qwen-image-generation-and-editing-api-reference', note: '不同地域的 Key、可用模型与额度相互独立。' },
  { id: 'siliconflow', label: '硅基流动 · 中国', group: '国内服务', hosts: ['api.siliconflow.cn'], text: chat('https://api.siliconflow.cn/v1'), image: images('https://api.siliconflow.cn/v1', 'siliconflow'), docs: 'https://api-docs.siliconflow.cn/docs/api/images-generations-post' },
  { id: 'siliconflow-intl', label: 'SiliconFlow · 国际', group: '国际服务', hosts: ['api.siliconflow.com'], text: chat('https://api.siliconflow.com/v1'), image: images('https://api.siliconflow.com/v1', 'siliconflow'), docs: 'https://docs.siliconflow.com/en/api-reference/images/images-generations' },
  { id: 'ark', label: '火山方舟 / 豆包', group: '国内服务', hosts: ['ark.cn-beijing.volces.com'], text: chat('https://ark.cn-beijing.volces.com/api/v3'), image: images('https://ark.cn-beijing.volces.com/api/v3', 'ark'), docs: 'https://www.volcengine.com/docs/82379/1541523', note: '可填写模型 ID 或你创建的推理接入点 ID；生图使用 Seedream。' },
  { id: 'bigmodel', label: '智谱 / GLM · 中国', group: '国内服务', hosts: ['open.bigmodel.cn'], text: chat('https://open.bigmodel.cn/api/paas/v4'), image: images('https://open.bigmodel.cn/api/paas/v4', 'bigmodel'), docs: 'https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image', note: '已适配 GLM / CogView 图片返回格式；单张图片提示词遵循服务商长度限制。' },
  { id: 'zai', label: 'Z.ai / GLM · 国际', group: '国际服务', hosts: ['api.z.ai'], text: chat('https://api.z.ai/api/paas/v4'), docs: 'https://docs.z.ai/guides/overview/quick-start' },
  { id: 'moonshot', label: '月之暗面 / Kimi · 中国', group: '国内服务', hosts: ['api.moonshot.cn'], text: chat('https://api.moonshot.cn/v1'), docs: 'https://platform.moonshot.cn/docs/guide/start-using-kimi-api' },
  { id: 'moonshot-intl', label: 'Moonshot / Kimi · 国际', group: '国际服务', hosts: ['api.moonshot.ai'], text: chat('https://api.moonshot.ai/v1'), docs: 'https://platform.kimi.ai/docs/get-your-api-key' },
  { id: 'minimax', label: 'MiniMax · 中国', group: '国内服务', hosts: ['api.minimax.cn', 'api.minimaxi.com'], text: chat('https://api.minimax.cn/v1'), image: images('https://api.minimax.cn/v1', 'minimax'), docs: 'https://platform.minimax.cn/docs/api-reference/image-generation-t2i' },
  { id: 'minimax-intl', label: 'MiniMax · 国际', group: '国际服务', hosts: ['api.minimax.io'], text: chat('https://api.minimax.io/v1'), image: images('https://api.minimax.io/v1', 'minimax'), docs: 'https://platform.minimax.io/docs/api-reference/image-generation-t2i' },
  { id: 'tokenhub', label: '腾讯 TokenHub / 混元 · 中国', group: '国内服务', hosts: ['tokenhub.tencentmaas.com'], text: chat('https://tokenhub.tencentmaas.com/v1'), docs: 'https://cloud.tencent.com/document/product/1823/132252' },
  { id: 'tokenhub-intl', label: 'Tencent TokenHub · 国际', group: '国际服务', hosts: ['tokenhub-intl.tencentcloudmaas.com'], text: chat('https://tokenhub-intl.tencentcloudmaas.com/v1'), docs: 'https://intl.cloud.tencent.com/ind/document/product/1300/79733' },
  { id: 'hunyuan', label: '腾讯混元 · 旧兼容接口', group: '国内服务', hosts: ['api.hunyuan.cloud.tencent.com'], text: chat('https://api.hunyuan.cloud.tencent.com/v1'), docs: 'https://cloud.tencent.com/document/product/1729/131925', note: '原接口正在迁移；新用户请选择腾讯 TokenHub，并使用对应的新 Key。' },
  { id: 'qianfan', label: '百度千帆 / 文心', group: '国内服务', hosts: ['qianfan.baidubce.com'], text: chat('https://qianfan.baidubce.com/v2'), docs: 'https://cloud.baidu.com/doc/qianfan-docs/s/Fm9l6ocai', note: '使用千帆 V2 API Key，无需填写旧版 access_token。' },
  { id: 'stepfun', label: '阶跃星辰 / StepFun', group: '国内服务', hosts: ['api.stepfun.com'], text: chat('https://api.stepfun.com/v1'), docs: 'https://platform.stepfun.com/docs/zh/guides/model-migration', note: '使用当前文字接口；旧版生图模型不列为可用预设。' },
  { id: 'xai', label: 'xAI / Grok', group: '国际服务', hosts: ['api.x.ai'], text: chat('https://api.x.ai/v1'), image: images('https://api.x.ai/v1'), docs: 'https://docs.x.ai/developers/model-capabilities/images/generation' },
  { id: 'mistral', label: 'Mistral', group: '国际服务', hosts: ['api.mistral.ai'], text: chat('https://api.mistral.ai/v1'), docs: 'https://docs.mistral.ai/resources/migration-guides' },
  { id: 'groq', label: 'Groq', group: '国际服务', hosts: ['api.groq.com'], text: chat('https://api.groq.com/openai/v1'), docs: 'https://console.groq.com/docs/openai' },
  { id: 'together', label: 'Together AI', group: '国际服务', hosts: ['api.together.ai', 'api.together.xyz'], text: chat('https://api.together.ai/v1'), image: images('https://api.together.ai/v1'), docs: 'https://docs.together.ai/docs/inference/openai-compatibility' },
  { id: 'fireworks', label: 'Fireworks AI', group: '国际服务', hosts: ['api.fireworks.ai'], text: chat('https://api.fireworks.ai/inference/v1'), docs: 'https://docs.fireworks.ai/tools-sdks/openai-compatibility' },
  { id: 'deepinfra', label: 'DeepInfra', group: '国际服务', hosts: ['api.deepinfra.com'], text: chat('https://api.deepinfra.com/v1/openai'), docs: 'https://deepinfra.com/docs/openai_api' },
  { id: 'cerebras', label: 'Cerebras', group: '国际服务', hosts: ['api.cerebras.ai'], text: chat('https://api.cerebras.ai/v1'), docs: 'https://inference-docs.cerebras.ai/resources/openai' },
  { id: 'perplexity', label: 'Perplexity', group: '国际服务', hosts: ['api.perplexity.ai'], text: { protocol: 'responses', baseURL: 'https://api.perplexity.ai/v1' }, docs: 'https://docs.perplexity.ai/docs/agent-api/openai-compatibility' },
  { id: 'huggingface', label: 'Hugging Face Router', group: '国际服务', hosts: ['router.huggingface.co'], text: chat('https://router.huggingface.co/v1'), docs: 'https://huggingface.co/docs/inference-providers/index' },
  { id: 'azure', label: 'Azure OpenAI', group: '国际服务', hosts: [], text: chat(''), image: images(''), docs: 'https://learn.microsoft.com/en-us/azure/foundry-classic/openai/how-to/switching-endpoints', note: '填写你自己的资源地址，自动补齐 /openai/v1；模型填写部署名称。' },
  { id: 'stability', label: 'Stability AI', group: '国际服务', hosts: ['api.stability.ai'], image: images('https://api.stability.ai/v2beta', 'stability'), docs: 'https://docs.stability.ai/api-reference', imageModels: ['core', 'ultra', 'sd3.5-large', 'sd3.5-large-turbo', 'sd3.5-medium'], note: '模型可选 core、ultra 或 SD3.5 系列。' },
  { id: 'fal', label: 'fal.ai', group: '国际服务', hosts: ['fal.run'], image: images('https://fal.run', 'fal'), docs: 'https://ai-sdk.dev/providers/ai-sdk-providers/fal', note: '填写文生图模型的完整路径，例如 fal-ai/flux/dev。' },
  { id: 'replicate', label: 'Replicate', group: '国际服务', hosts: ['api.replicate.com'], image: images('https://api.replicate.com/v1', 'replicate'), docs: 'https://ai-sdk.dev/providers/ai-sdk-providers/replicate', note: '填写 owner/model 或 owner/model:version；需是提供 prompt 输入的图片模型。' },
  { id: 'ollama', label: 'Ollama · 本机', group: '本机与自定义', hosts: [], text: chat('http://127.0.0.1:11434/v1'), docs: 'https://docs.ollama.com/api/openai-compatibility' },
  { id: 'lmstudio', label: 'LM Studio · 本机', group: '本机与自定义', hosts: [], text: chat('http://127.0.0.1:1234/v1'), docs: 'https://lmstudio.ai/docs/developer/openai-compat' },
  { id: 'custom', label: '自定义 / 中转 / 其他兼容服务', group: '本机与自定义', hosts: [], text: chat(''), image: images(''), docs: '', note: '填写服务商实际提供的 API 地址；支持独立选择文字与生图协议。' },
];
export const serviceById = (id?: string) => services.find(service => service.id === id);
export function detectService(address: string): ServicePreset | undefined {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(address.trim()) ? address.trim() : 'https://' + address.trim());
    if (/\.(?:openai\.azure\.com|services\.ai\.azure\.com)$/.test(url.hostname)) return serviceById('azure');
    if (/\.cn-beijing\.maas\.aliyuncs\.com$/.test(url.hostname)) return serviceById('dashscope');
    if (/\.ap-southeast-1\.maas\.aliyuncs\.com$/.test(url.hostname)) return serviceById('dashscope-intl');
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return serviceById(url.port === '11434' ? 'ollama' : url.port === '1234' ? 'lmstudio' : 'custom');
    return services.find(service => service.hosts.includes(url.hostname));
  } catch { return undefined; }
}
/** Normalize pasted roots or full generation endpoints without changing a custom gateway's host/path. */
export function matchServiceAddress(address: string, target: Target): { baseURL: string; service?: ServicePreset } {
  let value = address.trim();
  if (!value) return { baseURL: '' };
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = (/^(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value) ? 'http://' : 'https://') + value;
  let url: URL;
  try { url = new URL(value); } catch { return { baseURL: value }; }
  const service = detectService(url.href);
  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/(?:chat\/completions|images\/generations|image_generation|responses|messages)$/, '').replace(/\/models\/[^/]+:generateContent$/, '');
  if (service?.id === 'stability') path = path.replace(/\/stable-image\/generate\/(?:core|ultra|sd3)$/, '');
  const route = service?.[target];
  if (!path && route?.baseURL) path = new URL(route.baseURL).pathname;
  if (service?.id === 'azure' && (!path || path === '/openai')) path = '/openai/v1';
  url.pathname = path;
  // Keep query/userinfo visible so server validation can reject accidental credential-bearing URLs.
  return { baseURL: url.toString().replace(/\/$/, ''), service };
}
export function sharedImageRoute(text: { protocol: string; baseURL: string; service?: string }): { protocol: ImageProtocol; baseURL: string; service?: string } | undefined {
  const service = detectService(text.baseURL);
  if (service && !service.image) return undefined;
  const protocol = service?.image?.protocol ?? (text.protocol === 'google' ? 'google' : text.protocol === 'openrouter' ? 'openrouter' : 'images');
  return { protocol, baseURL: text.baseURL, service: service?.id ?? 'custom' };
}
