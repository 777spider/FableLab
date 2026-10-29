import { createHash } from 'node:crypto';
import { z } from 'zod';
import { generateText, generateImage, APICallError } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createFal } from '@ai-sdk/fal';
import { createReplicate } from '@ai-sdk/replicate';
import { createByteDance } from '@ai-sdk/bytedance';
import type { SecretEndpoint, TextProtocol, ImageProtocol, ModelChoice, Capability } from '../shared/byok.ts';
import { imageProtocols, textProtocols } from '../shared/byok.ts';
import { detectService, matchServiceAddress, sharedImageRoute } from '../shared/services.ts';
import { nativeImage, nativeImageProtocols } from './native-images.ts';
import { GenerationError, CandidateError, knowledgeSchema, storySchemaFor, lessonSchema, reviewSchema, freshReviewInput, type GenerationProvider, type GenerationInput, type ImageInput, type ImageResult } from './generation.ts';
import { COMMON, KNOWLEDGE, STORY, LESSON, REVIEW, PROMPT_VERSION } from './prompts.ts';
import { retryAfterDelay } from './retry.ts';

export type Configuration = { text: SecretEndpoint<TextProtocol>; image: SecretEndpoint<ImageProtocol>; imageUsesText?: boolean };
const loopback = (host: string) => host === 'localhost' || host === '[::1]' || /^127\./.test(host);
export function normalizeBaseURL(value: string): string {
  let url: URL;
  try { url = new URL(matchServiceAddress(value, 'text').baseURL); } catch { throw new GenerationError('INVALID_BASE_URL'); }
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol) ||
      (url.protocol === 'http:' && !loopback(url.hostname)) || ['0.0.0.0', '169.254.169.254', '[::]'].includes(url.hostname)) {
    throw new GenerationError('INVALID_BASE_URL');
  }
  url.pathname = url.pathname.replace(/\/(?:chat\/completions|images\/generations|responses|messages|generateContent)\/?$/, '').replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}
const endpointSchema = z.object({ protocol: z.string(), baseURL: z.string().max(2048), model: z.string().trim().max(200), service: z.string().max(64).optional(), apiKey: z.string().max(8192).optional() }).strict();
export function parseConfiguration(value: unknown, previous: Configuration): Configuration {
  const result = z.object({ text: endpointSchema, image: endpointSchema, imageUsesText: z.boolean().optional().default(false) }).strict().safeParse(value);
  if (!result.success) throw new GenerationError('INVALID_SETTINGS');
  const read = <P extends string>(raw: z.infer<typeof endpointSchema>, old: SecretEndpoint<P>, protocols: readonly P[]): SecretEndpoint<P> => {
    if (!protocols.includes(raw.protocol as P) || /[\r\n]/.test(raw.apiKey ?? '')) throw new GenerationError('INVALID_SETTINGS');
    const baseURL = normalizeBaseURL(raw.baseURL);
    const sameEndpoint = raw.protocol === old.protocol && baseURL === old.baseURL;
    // Omitted means retain only for the SAME service. An explicit empty string clears the key.
    const apiKey = raw.apiKey === undefined && sameEndpoint ? old.apiKey : (raw.apiKey ?? '').trim();
    return { protocol: raw.protocol as P, baseURL, model: raw.model, apiKey, service: detectService(baseURL)?.id ?? 'custom' };
  };
  const text = read(result.data.text, previous.text, textProtocols.map(item => item.id));
  const rawImage = result.data.image;
  const imageUsesText = result.data.imageUsesText;
  if (imageUsesText && (!sharedImageRoute(text) || normalizeBaseURL(rawImage.baseURL) !== text.baseURL)) throw new GenerationError('INVALID_SHARED_API');
  // Sharing is explicit and confined to ONE address. Unlinking cannot retain a copied key.
  const image = read(imageUsesText ? { ...rawImage, apiKey: text.apiKey } : previous.imageUsesText && rawImage.apiKey === undefined ? { ...rawImage, apiKey: '' } : rawImage, previous.image, imageProtocols.map(item => item.id));
  return { text, image, imageUsesText };
}
export function endpointIdentity(endpoint: SecretEndpoint): string {
  return createHash('sha256').update(JSON.stringify(endpoint)).digest('hex');
}

/** Do not follow credential-bearing redirects or send provider credentials to image CDNs. */
export function providerFetch(baseURL: string, fetcher: typeof fetch = fetch): typeof fetch {
  const origin = new URL(baseURL).origin;
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.protocol === 'http:' && !loopback(url.hostname))) throw new GenerationError('INVALID_UPSTREAM_URL');
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (url.origin !== origin) {
      if (url.protocol !== 'https:' || loopback(url.hostname) || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) throw new GenerationError('INVALID_UPSTREAM_URL');
      for (const name of ['authorization', 'x-api-key', 'x-goog-api-key', 'cookie']) headers.delete(name);
    }
    return fetcher(input, { ...init, headers, redirect: 'error' });
  };
}
export function safeFailure(error: unknown, signal?: AbortSignal): GenerationError {
  if (signal?.aborted) return new GenerationError('ABORTED');
  if (error instanceof GenerationError) return error;
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    return new GenerationError(status === 401 || status === 403 ? 'API_AUTH' : status === 402 ? 'API_CREDIT' : status === 429 ? 'API_RATE_LIMIT' : status === 404 || status === 405 ? 'API_ENDPOINT' : status === 400 || status === 422 ? 'API_PARAMETERS' : 'UPSTREAM_SERVICE', !!status && (status === 408 || status === 429 || status >= 500), retryAfterDelay(error.responseHeaders?.['retry-after'] ?? null));
  }
  return new GenerationError(error instanceof Error && /timeout|Timeout/i.test(error.name) ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK', true);
}
export function publicFailure(code: string): string {
  if (code === 'INVALID_SHARED_API') return '共用 API 需要相同的服务地址，且该服务提供生图接口；也可取消共用，单独配置生图服务。';
  if (code === 'IMAGE_FILTERED') return '服务商未通过这张图片的内容审核，可调整主题后重试。';
  return ({ IMAGE_MODEL_PROTOCOL: '当前 Google 接口请使用支持图片输出的 gemini- 模型。Imagen 已不在此 SDK 接口的支持范围。', INVALID_BASE_URL: '请填写 HTTPS 服务地址；本机服务可使用 http://localhost。', INVALID_SETTINGS: '请检查接口类型、服务地址和模型名称。', API_AUTH: '认证未通过，请检查 API Key 和服务地址。', API_CREDIT: '服务余额不足，请在服务商处查看额度。', API_RATE_LIMIT: '服务限流或额度不足，请稍后重试或查看服务商额度。', API_ENDPOINT: '该地址未提供所选接口，请核对协议与 Base URL。模型列表不可用时也可手动填模型。', API_PARAMETERS: '服务拒绝了模型或参数，请核对模型名称、接口及账户权限。', UPSTREAM_TIMEOUT: '服务响应超时，可以重试。', UPSTREAM_NETWORK: '连接服务失败，请检查地址与网络。', UPSTREAM_SERVICE: '服务暂时未能完成请求。', IMAGE_OUTPUT_INVALID: '接口未返回可用的 PNG 或 JPEG 图片，生图能力尚未确认。', TEXT_OUTPUT_EMPTY: '接口没有返回文字，尚未确认可用。', UPSTREAM_NOT_CONFIGURED: '请先在 API 设置中填写服务地址和模型。', MODELS_UNAVAILABLE: '未能读取模型列表，可手动输入模型名称。', SETTINGS_BUSY: '请先暂停当前生成，再修改 API 设置。', IMAGE_NOT_SUPPORTED: '接口声明该模型不支持图片输出，请选择其他模型。', IMAGE_NOT_CONFIGURED: '生成漫画还需要配置生图接口。', JOB_ACTIVE: '当前故事仍在生成，请先暂停。', SESSION_LIMIT: '本机打开的会话过多，请稍后再试。' } as Record<string, string>)[code] ?? '本次请求未完成，请检查服务配置后重试。';
}
function languageModel(config: SecretEndpoint<TextProtocol>, fetcher?: typeof fetch) {
  const options = { baseURL: config.baseURL, apiKey: config.apiKey, fetch: providerFetch(config.baseURL, fetcher) };
  switch (config.protocol) {
    case 'chat': return createOpenAICompatible({ ...options, name: 'custom' }).chatModel(config.model);
    case 'responses': return createOpenAI(options).responses(config.model);
    case 'anthropic': return createAnthropic(options).messages(config.model);
    case 'google': return createGoogleGenerativeAI(options)(config.model);
    case 'openrouter': return createOpenRouter(options).chat(config.model);
  }
}
function imageModel(config: SecretEndpoint<ImageProtocol>, fetcher?: typeof fetch) {
  const options = { baseURL: config.baseURL, apiKey: config.apiKey, fetch: providerFetch(config.baseURL, fetcher) };
  switch (config.protocol) {
    case 'images': return createOpenAICompatible({ ...options, name: 'custom' }).imageModel(config.model);
    case 'google': return createGoogleGenerativeAI(options).image(config.model);
    case 'openrouter': return createOpenRouter(options).imageModel(config.model);
    case 'fal': return createFal(options).imageModel(config.model);
    case 'replicate': return createReplicate({ ...options, apiToken: config.apiKey }).imageModel(config.model);
    case 'ark': return createByteDance(options).imageModel(config.model);
    default: throw new GenerationError('IMAGE_MODEL_PROTOCOL');
  }
}
function configured(config: SecretEndpoint) { if (!config.model || !config.baseURL) throw new GenerationError('UPSTREAM_NOT_CONFIGURED'); }
export async function probeText(config: SecretEndpoint<TextProtocol>, signal: AbortSignal, fetcher?: typeof fetch): Promise<void> {
  configured(config);
  try {
    const result = await generateText({ model: languageModel(config, fetcher), prompt: 'Reply with the single word OK.', maxOutputTokens: 64, maxRetries: 0, abortSignal: AbortSignal.any([signal, AbortSignal.timeout(90000)]) });
    if (!result.text.trim()) throw new GenerationError('TEXT_OUTPUT_EMPTY');
  } catch (error) { throw safeFailure(error, signal); }
}
export async function requestImage(config: SecretEndpoint<ImageProtocol>, input: ImageInput, signal: AbortSignal, fetcher?: typeof fetch): Promise<ImageResult> {
  configured(config);
  if (config.protocol === 'google' && !config.model.startsWith('gemini-')) throw new GenerationError('IMAGE_MODEL_PROTOCOL');
  try {
    const abortSignal = AbortSignal.any([signal, AbortSignal.timeout(240000)]);
    // Reference/edit formats are model-specific. Only use the protocols with a known image-input contract.
    const referenceUsed = !!input.reference && ['google', 'openrouter', 'ark'].includes(config.protocol);
    const prompt = referenceUsed ? { text: input.prompt, images: [input.reference!.bytes] } : input.prompt;
    const providerOptions: Record<string, Record<string, string | boolean>> | undefined = config.protocol === 'fal' ? { fal: { outputFormat: 'png' } } : config.protocol === 'replicate' ? { replicate: { output_format: 'png' } } : config.protocol === 'ark' ? { bytedance: { watermark: true, sequentialImageGeneration: 'disabled', size: '2K' } } : undefined;
    const bytes = nativeImageProtocols.has(config.protocol)
      ? await nativeImage(config, input, abortSignal, providerFetch(config.baseURL, fetcher))
      : Buffer.from((await generateImage({ model: imageModel(config, fetcher), prompt, n: 1, maxRetries: 0, providerOptions, abortSignal })).image.uint8Array);
    const png = bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND';
    const jpeg = bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
    const extension = png ? '.png' : jpeg ? '.jpg' : null;
    if (!extension || bytes.length > 20 * 1024 * 1024) throw new GenerationError('IMAGE_OUTPUT_INVALID');
    return { bytes, extension, hash: createHash('sha256').update(bytes).digest('hex'), metadata: { protocol: config.protocol, model: config.model, promptVersion: PROMPT_VERSION, referenceUsed, ...(config.protocol === 'bigmodel' ? { promptShortened: Array.from(input.prompt).length > 1000 } : {}) } };
  } catch (error) { throw safeFailure(error, signal); }
}

/** Metadata is evidence about OUTPUT modalities only. Names and vision input are not evidence. */
export function imageCapability(model: Record<string, unknown>): Capability {
  const architecture = model.architecture as Record<string, unknown> | undefined;
  const output = model.output_modalities ?? model.outputModalities ?? architecture?.output_modalities;
  if (Array.isArray(output) && output.every(v => typeof v === 'string')) return output.includes('image') || output.includes('images') ? 'declared' : 'unsupported';
  const capabilities = model.capabilities as Record<string, unknown> | undefined;
  if (capabilities?.image_generation === true || capabilities?.imageGeneration === true) return 'declared';
  if (capabilities?.image_generation === false || capabilities?.imageGeneration === false) return 'unsupported';
  return 'unknown';
}
export async function listModels(config: SecretEndpoint, target: 'text' | 'image', signal: AbortSignal, fetcher?: typeof fetch): Promise<ModelChoice[]> {
  if (['stability', 'fal', 'replicate', 'minimax'].includes(config.protocol)) throw new GenerationError('MODELS_UNAVAILABLE');
  const headers = new Headers({ Accept: 'application/json' });
  if (config.protocol === 'google') headers.set('x-goog-api-key', config.apiKey);
  else if (config.protocol === 'anthropic') { headers.set('x-api-key', config.apiKey); headers.set('anthropic-version', '2023-06-01'); }
  else if (config.apiKey) headers.set('Authorization', 'Bearer ' + config.apiKey);
  const path = config.protocol === 'openrouter' && target === 'image' ? '/images/models' : '/models';
  try {
    const response = await providerFetch(config.baseURL, fetcher)(config.baseURL + path, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    if (!response.ok) { await response.body?.cancel(); throw new GenerationError(response.status === 401 || response.status === 403 ? 'API_AUTH' : 'MODELS_UNAVAILABLE'); }
    const content = await response.text();
    if (content.length > 4 * 1024 * 1024) throw new GenerationError('MODELS_UNAVAILABLE');
    const value = JSON.parse(content), models = value.data ?? value.models;
    if (!Array.isArray(models)) throw new GenerationError('MODELS_UNAVAILABLE');
    return models.slice(0, 2000).flatMap((model: Record<string, unknown>) => {
      const id = typeof model.id === 'string' ? model.id : typeof model.name === 'string' ? model.name.replace(/^models\//, '') : '';
      if (!id || id.length > 200) return [];
      return [{ id, name: typeof model.displayName === 'string' ? model.displayName.slice(0, 200) : id, capability: config.protocol === 'anthropic' ? 'unsupported' : imageCapability(model) }];
    });
  } catch (error) { if (error instanceof GenerationError) throw error; throw safeFailure(error, signal); }
}

export class ByokProvider implements GenerationProvider {
  provenance = 'generated' as const;
  constructor(private configuration: () => Configuration, private fetcher?: typeof fetch, private imageSucceeded?: () => void) {}
  private async text(system: string, input: GenerationInput, schema: z.ZodType, maxOutputTokens: number, signal: AbortSignal): Promise<unknown> {
    const config = this.configuration().text; configured(config);
    const compact = { ...input, stories: input.stories.map(({ id, title, sourceDomain, characters, paragraphs }) => ({ id, title, sourceDomain, characters, paragraphs })) };
    try {
      const result = await generateText({ model: languageModel(config, this.fetcher), system: COMMON + '\n' + system + '\nReturn one JSON object matching this schema:\n' + JSON.stringify(z.toJSONSchema(schema)), prompt: JSON.stringify(compact), maxOutputTokens, maxRetries: 0, abortSignal: AbortSignal.any([signal, AbortSignal.timeout(240000)]) });
      const configuration = this.configuration();
      if ([configuration.text, configuration.image].some(endpoint => endpoint.apiKey && result.text.includes(endpoint.apiKey))) throw new GenerationError('UPSTREAM_CREDENTIAL_ECHO');
      const text = result.text.trim().replace(/^<think>[\s\S]*?<\/think>\s*/i, '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      try { return JSON.parse(text); } catch { throw new CandidateError(text.slice(0, 100000), ['Return a complete JSON object with the required fields, without Markdown.']); }
    } catch (error) { throw safeFailure(error, signal); }
  }
  knowledge(input: GenerationInput, signal: AbortSignal) { return this.text(KNOWLEDGE, { ...input, stories: [] }, knowledgeSchema, 4000, signal); }
  story(input: GenerationInput, signal: AbortSignal) { return this.text(STORY, { ...input, lesson: null }, storySchemaFor(input.storyLength), 7000, signal); }
  lesson(input: GenerationInput, signal: AbortSignal) { return this.text(LESSON, input, lessonSchema, 6500, signal); }
  review(input: GenerationInput, signal: AbortSignal) { return this.text(REVIEW, freshReviewInput(input), reviewSchema, 3000, signal); }
  async image(input: ImageInput, signal: AbortSignal) {
    const result = await requestImage(this.configuration().image, input, signal, this.fetcher);
    this.imageSucceeded?.(); return result;
  }
}
