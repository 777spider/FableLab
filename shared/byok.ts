export type TextProtocol = 'chat' | 'responses' | 'anthropic' | 'google' | 'openrouter';
export type ImageProtocol = 'images' | 'google' | 'openrouter' | 'siliconflow' | 'minimax' | 'ark' | 'bigmodel' | 'stability' | 'fal' | 'replicate';
export type Target = 'text' | 'image';
export type Capability = 'unknown' | 'declared' | 'verified' | 'unsupported';
export interface Endpoint<P extends string = string> { protocol: P; baseURL: string; model: string; service?: string; }
export interface SecretEndpoint<P extends string = string> extends Endpoint<P> { apiKey: string; }
export interface PublicEndpoint<P extends string = string> extends Endpoint<P> { hasKey: boolean; }
export interface Settings {
  text: PublicEndpoint<TextProtocol>; image: PublicEndpoint<ImageProtocol>;
  imageCapability: Capability; textVerified: boolean;
  imageUsesText: boolean;
}
export interface ModelChoice { id: string; name: string; capability: Capability; }
export const textProtocols: { id: TextProtocol; label: string; baseURL: string }[] = [
  { id: 'chat', label: 'OpenAI 兼容 · Chat Completions', baseURL: 'https://api.openai.com/v1' },
  { id: 'responses', label: 'OpenAI · Responses', baseURL: 'https://api.openai.com/v1' },
  { id: 'anthropic', label: 'Anthropic · Messages', baseURL: 'https://api.anthropic.com/v1' },
  { id: 'google', label: 'Google · Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'openrouter', label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1' },
];
export const imageProtocols: { id: ImageProtocol; label: string; baseURL: string }[] = [
  { id: 'images', label: 'OpenAI 兼容 · Images', baseURL: 'https://api.openai.com/v1' },
  { id: 'google', label: 'Google · Gemini 图片生成', baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'openrouter', label: 'OpenRouter · Images', baseURL: 'https://openrouter.ai/api/v1' },
  { id: 'siliconflow', label: '硅基流动 · Images', baseURL: 'https://api.siliconflow.cn/v1' },
  { id: 'minimax', label: 'MiniMax · Image Generation', baseURL: 'https://api.minimax.cn/v1' },
  { id: 'ark', label: '火山方舟 · Seedream', baseURL: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'bigmodel', label: '智谱 · Images', baseURL: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'stability', label: 'Stability AI · Stable Image', baseURL: 'https://api.stability.ai/v2beta' },
  { id: 'fal', label: 'fal.ai', baseURL: 'https://fal.run' },
  { id: 'replicate', label: 'Replicate', baseURL: 'https://api.replicate.com/v1' },
];
export const initialSettings: Settings = {
  text: { protocol: 'chat', baseURL: textProtocols[0].baseURL, model: '', hasKey: false },
  image: { protocol: 'images', baseURL: imageProtocols[0].baseURL, model: '', hasKey: false },
  imageCapability: 'unknown', textVerified: false, imageUsesText: true,
};
export const capabilityLabels: Record<Capability, string> = {
  unknown: '生图能力待验证', declared: '接口声明支持生图', verified: '已成功生成测试图', unsupported: '接口声明不支持生图',
};
