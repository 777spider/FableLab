import type { ImageProtocol, SecretEndpoint } from '../shared/byok.ts';
import { GenerationError, type ImageInput } from './generation.ts';
import { retryAfterDelay } from './retry.ts';

export const nativeImageProtocols = new Set<ImageProtocol>(['siliconflow', 'minimax', 'bigmodel', 'stability']);
function statusFailure(response: Response): GenerationError {
  const status = response.status;
  return new GenerationError(status === 401 || status === 403 ? 'API_AUTH' : status === 402 ? 'API_CREDIT' : status === 429 ? 'API_RATE_LIMIT' : status === 404 || status === 405 ? 'API_ENDPOINT' : status === 400 || status === 422 ? 'API_PARAMETERS' : 'UPSTREAM_SERVICE', status === 408 || status === 429 || status >= 500, retryAfterDelay(response.headers.get('retry-after')));
}
async function readLimited(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new GenerationError('IMAGE_OUTPUT_INVALID');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const result = await reader.read(); if (result.done) break;
      length += result.value.length;
      if (length > limit) { await reader.cancel(); throw new GenerationError('IMAGE_OUTPUT_INVALID'); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
/** Thin adapters for vendor wire formats not covered by the generic Images SDK. */
export async function nativeImage(config: SecretEndpoint<ImageProtocol>, input: ImageInput, signal: AbortSignal, fetcher: typeof fetch): Promise<Buffer> {
  const headers = new Headers({ Accept: 'application/json' });
  if (config.apiKey) headers.set('Authorization', 'Bearer ' + config.apiKey);
  let path = '/images/generations';
  let body: BodyInit;
  if (config.protocol === 'stability') {
    const model = config.model;
    if (!['core', 'ultra', 'sd3.5-large', 'sd3.5-large-turbo', 'sd3.5-medium', 'sd3-large', 'sd3-large-turbo', 'sd3-medium'].includes(model)) throw new GenerationError('API_PARAMETERS');
    path = '/stable-image/generate/' + (model === 'core' || model === 'ultra' ? model : 'sd3');
    const form = new FormData(); form.set('prompt', input.prompt); form.set('output_format', 'png');
    if (model !== 'core' && model !== 'ultra') form.set('model', model);
    headers.set('Accept', 'image/*'); body = form;
  } else {
    headers.set('Content-Type', 'application/json');
    const request: Record<string, unknown> = { model: config.model, prompt: input.prompt };
    if (config.protocol === 'minimax') { path = '/image_generation'; Object.assign(request, { response_format: 'base64', n: 1, aspect_ratio: '1:1' }); }
    if (config.protocol === 'bigmodel') Object.assign(request, { prompt: Array.from(input.prompt).slice(0, 1000).join(''), size: '1280x1280' });
    // SiliconFlow resolutions vary by model. Omit image_size to use its documented model default.
    body = JSON.stringify(request);
  }
  const response = await fetcher(config.baseURL + path, { method: 'POST', headers, body, signal });
  if (!response.ok) { await response.body?.cancel(); throw config.protocol === 'stability' && response.status === 403 ? new GenerationError('IMAGE_FILTERED') : statusFailure(response); }
  if (config.protocol === 'stability') {
    if (response.headers.get('finish-reason') === 'CONTENT_FILTERED') { await response.body?.cancel(); throw new GenerationError('IMAGE_FILTERED'); }
    return readLimited(response, 20 * 1024 * 1024);
  }
  type Payload = { error?: unknown; base_resp?: { status_code?: number }; images?: { url?: string }[]; data?: { image_base64?: string[]; image_urls?: string[] } & { b64_json?: string; url?: string }[] };
  let result: Payload;
  try { result = JSON.parse((await readLimited(response, 29 * 1024 * 1024)).toString('utf8')); }
  catch (error) { if (error instanceof GenerationError) throw error; throw new GenerationError('IMAGE_OUTPUT_INVALID'); }
  if (!result || typeof result !== 'object') throw new GenerationError('IMAGE_OUTPUT_INVALID');
  if (config.protocol === 'minimax' && result.base_resp?.status_code !== undefined && result.base_resp.status_code !== 0) {
    const code = result.base_resp.status_code;
    throw new GenerationError(code === 1004 ? 'API_AUTH' : code === 1008 ? 'API_CREDIT' : code === 1002 ? 'API_RATE_LIMIT' : 'UPSTREAM_SERVICE', code === 1001 || code === 1002);
  }
  if (result.error) throw new GenerationError('UPSTREAM_SERVICE');
  const encoded = config.protocol === 'minimax' ? result.data?.image_base64?.[0] : result.data?.[0]?.b64_json;
  if (typeof encoded === 'string') return Buffer.from(encoded.replace(/^data:image\/(?:png|jpe?g);base64,/, ''), 'base64');
  const url = config.protocol === 'siliconflow' ? result.images?.[0]?.url : config.protocol === 'minimax' ? result.data?.image_urls?.[0] : result.data?.[0]?.url;
  if (typeof url !== 'string' || !url || (config.apiKey && url.includes(config.apiKey))) throw new GenerationError('IMAGE_OUTPUT_INVALID');
  // Generated image downloads never need provider authentication, including on the same origin.
  const download = await fetcher(url, { signal, headers: { Accept: 'image/png,image/jpeg' } });
  if (!download.ok) { await download.body?.cancel(); throw statusFailure(download); }
  return readLimited(download, 20 * 1024 * 1024);
}
