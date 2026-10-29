import test from 'node:test';
import assert from 'node:assert/strict';
import { services, detectService, matchServiceAddress, sharedImageRoute, serviceById } from '../../shared/services.ts';
import { imageProtocols, textProtocols, type ImageProtocol, type SecretEndpoint } from '../../shared/byok.ts';
import { parseConfiguration, normalizeBaseURL, requestImage, type Configuration } from '../../server/byok.ts';
import { GenerationError } from '../../server/generation.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a09kAAAAASUVORK5CYII=';
const bytes = Buffer.from(png, 'base64');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const signal = () => new AbortController().signal;
const config = <P extends string>(protocol: P): SecretEndpoint<P> => ({ protocol, baseURL: 'https://fixture.example/v1', apiKey: 'explicit-user-fixture-key', model: 'fixture-model' });
const previous = (): Configuration => ({ text: config('chat'), image: { ...config('images'), apiKey: 'old-separate-image-key' } });

test('every service preset has a unique ID and a wired protocol, with text-only services excluded from image sharing', () => {
  assert.equal(new Set(services.map(service => service.id)).size, services.length);
  assert.ok(services.length >= 30);
  for (const service of services) {
    assert.ok(service.text || service.image);
    if (service.text) assert.ok(textProtocols.some(item => item.id === service.text!.protocol));
    if (service.image) assert.ok(imageProtocols.some(item => item.id === service.image!.protocol));
  }
  assert.equal(sharedImageRoute({ protocol: 'chat', baseURL: 'https://api.deepseek.com', service: 'custom' }), undefined);
  assert.equal(sharedImageRoute({ protocol: 'chat', baseURL: 'https://api.siliconflow.cn/v1' })?.protocol, 'siliconflow');
  assert.equal(sharedImageRoute({ protocol: 'chat', baseURL: 'https://gateway.example/v1' })?.protocol, 'images');
});

const addresses: [string, 'text' | 'image', string, string][] = [
  ['api.deepseek.com', 'text', 'deepseek', 'https://api.deepseek.com'],
  ['https://dashscope.aliyuncs.com', 'image', 'dashscope', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
  ['https://work.cn-beijing.maas.aliyuncs.com', 'image', 'dashscope', 'https://work.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'],
  ['https://api.siliconflow.cn/v1/images/generations', 'image', 'siliconflow', 'https://api.siliconflow.cn/v1'],
  ['https://api.minimax.cn/v1/image_generation', 'image', 'minimax', 'https://api.minimax.cn/v1'],
  ['https://generativelanguage.googleapis.com/v1beta/models/gemini-fixture:generateContent', 'image', 'google', 'https://generativelanguage.googleapis.com/v1beta'],
  ['https://resource.openai.azure.com', 'text', 'azure', 'https://resource.openai.azure.com/openai/v1'],
  ['https://resource.openai.azure.com/openai', 'image', 'azure', 'https://resource.openai.azure.com/openai/v1'],
  ['https://api.stability.ai/v2beta/stable-image/generate/core', 'image', 'stability', 'https://api.stability.ai/v2beta'],
  ['https://tokenhub.tencentmaas.com', 'text', 'tokenhub', 'https://tokenhub.tencentmaas.com/v1'],
  ['https://api.perplexity.ai', 'text', 'perplexity', 'https://api.perplexity.ai/v1'],
  ['localhost:11434', 'text', 'ollama', 'http://localhost:11434/v1'],
];
for (const [address, target, id, expected] of addresses) test(`auto-matches ${id} without replacing the user's host`, () => {
  const matched = matchServiceAddress(address, target);
  assert.equal(matched.service?.id, id); assert.equal(matched.baseURL, expected);
});
test('unknown gateways keep their custom prefix and lookalike domains never match a vendor', () => {
  assert.equal(matchServiceAddress('https://gateway.example/proxy/acme/v2/chat/completions', 'text').baseURL, 'https://gateway.example/proxy/acme/v2');
  assert.equal(detectService('https://api.openai.com.evil.example/v1'), undefined);
  assert.throws(() => normalizeBaseURL('https://api.openai.com/v1?key=secret'), GenerationError);
});

test('shared API derives only the text key, retains separate models, and rejects cross-host sharing', () => {
  const old = previous(), input = { ...old, imageUsesText: true };
  const shared = parseConfiguration(input, old);
  assert.equal(shared.image.apiKey, old.text.apiKey); assert.equal(shared.image.model, old.image.model);
  assert.notEqual(shared.image.apiKey, old.image.apiKey);
  const { apiKey: _key, ...text } = shared.text;
  const { apiKey: _imageKey, ...image } = shared.image;
  assert.equal(parseConfiguration({ text, image, imageUsesText: true }, shared).image.apiKey, old.text.apiKey);
  assert.equal(parseConfiguration({ text: { ...text, model: 'another-text-model' }, image, imageUsesText: true }, shared).image.apiKey, old.text.apiKey);
  const newHost = parseConfiguration({ text: { ...text, baseURL: 'https://new.example/v1' }, image: { ...image, baseURL: 'https://new.example/v1' }, imageUsesText: true }, shared);
  assert.equal(newHost.text.apiKey, ''); assert.equal(newHost.image.apiKey, '');
  assert.throws(() => parseConfiguration({ text, image: { ...image, baseURL: 'https://foreign.example/v1' }, imageUsesText: true }, shared), (error: unknown) => error instanceof GenerationError && error.code === 'INVALID_SHARED_API');
  const unlinked = parseConfiguration({ text, image, imageUsesText: false }, shared);
  assert.equal(unlinked.text.apiKey, old.text.apiKey); assert.equal(unlinked.image.apiKey, '');
  assert.throws(() => parseConfiguration({ text: { ...text, baseURL: 'https://api.deepseek.com', service: 'custom' }, image: { ...image, baseURL: 'https://api.deepseek.com' }, imageUsesText: true }, shared), GenerationError);
});

for (const protocol of ['siliconflow', 'minimax', 'bigmodel', 'stability'] as const) test(`native ${protocol} adapter uses its actual wire format and verifies returned image bytes`, async () => {
  let posts = 0, downloads = 0;
  const endpoint = { ...config(protocol), model: protocol === 'stability' ? 'core' : 'fixture-model' };
  const result = await requestImage(endpoint, { prompt: 'A blue cup.' }, signal(), (async (url, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(init?.redirect, 'error');
    if (String(url).startsWith('https://cdn.example/')) {
      downloads++; assert.equal(headers.get('authorization'), null); return new Response(bytes);
    }
    posts++; assert.equal(headers.get('authorization'), 'Bearer ' + endpoint.apiKey); assert.equal(init?.method, 'POST');
    if (protocol === 'stability') {
      assert.equal(String(url), endpoint.baseURL + '/stable-image/generate/core');
      assert.ok(init?.body instanceof FormData); assert.equal(init.body.get('prompt'), 'A blue cup.'); assert.equal(init.body.get('output_format'), 'png');
      assert.equal(headers.get('content-type'), null); return new Response(bytes);
    }
    const body = JSON.parse(String(init?.body));
    if (protocol === 'minimax') {
      assert.equal(String(url), endpoint.baseURL + '/image_generation'); assert.equal(body.response_format, 'base64'); assert.equal(body.n, 1);
      return json({ base_resp: { status_code: 0 }, data: { image_base64: [png] } });
    }
    assert.equal(String(url), endpoint.baseURL + '/images/generations');
    if (protocol === 'siliconflow') { assert.equal(body.image_size, undefined); return json({ images: [{ url: 'https://cdn.example/generated.png' }] }); }
    assert.equal(body.size, '1280x1280'); return json({ data: [{ url: 'https://cdn.example/generated.png' }] });
  }) as typeof fetch);
  assert.equal(result.bytes.toString('base64'), png); assert.equal(result.extension, '.png'); assert.equal(result.metadata.referenceUsed, false);
  assert.equal(posts, 1); assert.equal(downloads, protocol === 'siliconflow' || protocol === 'bigmodel' ? 1 : 0);
});

for (const protocol of ['ark', 'fal', 'replicate'] as const) test(`official ${protocol} SDK receives an explicit user key and downloads the fixture without credentials`, async () => {
  let posts = 0, downloads = 0;
  const endpoint = { ...config(protocol), model: protocol === 'fal' ? 'fal-ai/flux/dev' : protocol === 'replicate' ? 'owner/model' : 'seedream-fixture' };
  const result = await requestImage(endpoint, { prompt: 'A blue cup.' }, signal(), (async (url, init) => {
    assert.equal(init?.redirect, 'error'); const headers = new Headers(init?.headers);
    if (String(url).startsWith('https://cdn.example/')) { downloads++; assert.equal(headers.get('authorization'), null); return new Response(bytes); }
    posts++; assert.ok(headers.get('authorization')?.includes(endpoint.apiKey));
    const body = JSON.parse(String(init?.body));
    if (protocol === 'fal') { assert.equal(String(url), endpoint.baseURL + '/fal-ai/flux/dev'); assert.equal(body.output_format, 'png'); return json({ images: [{ url: 'https://cdn.example/fixture.png' }] }); }
    if (protocol === 'replicate') { assert.equal(String(url), endpoint.baseURL + '/models/owner/model/predictions'); assert.equal(body.input.output_format, 'png'); return json({ status: 'succeeded', output: ['https://cdn.example/fixture.png'], urls: { get: endpoint.baseURL + '/predictions/fixture' } }); }
    assert.equal(String(url), endpoint.baseURL + '/images/generations'); assert.equal(body.watermark, true); assert.equal(body.size, '2K'); assert.equal(body.sequential_image_generation, 'disabled'); return json({ data: [{ b64_json: png }] });
  }) as typeof fetch);
  assert.equal(result.extension, '.png'); assert.equal(posts, 1); assert.equal(downloads, protocol === 'ark' ? 0 : 1);
});

test('logical MiniMax failures and native HTTP auth errors stay sanitized and are not retried', async () => {
  let calls = 0;
  for (const protocol of ['minimax', 'siliconflow'] as const) await assert.rejects(() => requestImage(config(protocol), { prompt: 'A cup.' }, signal(), (async () => {
    calls++; return protocol === 'minimax' ? json({ base_resp: { status_code: 1004, status_msg: 'echo explicit-user-fixture-key' } }) : json({ error: 'echo explicit-user-fixture-key' }, 401);
  }) as typeof fetch), (error: unknown) => error instanceof GenerationError && error.code === 'API_AUTH' && !String(error).includes('explicit-user-fixture-key'));
  assert.equal(calls, 2);
});
test('Stability moderation blocks and malformed native images never count as verified output', async () => {
  await assert.rejects(() => requestImage({ ...config('stability'), model: 'core' }, { prompt: 'A cup.' }, signal(), (async () => new Response(bytes, { headers: { 'finish-reason': 'CONTENT_FILTERED' } })) as typeof fetch), (error: unknown) => error instanceof GenerationError && error.code === 'IMAGE_FILTERED');
  await assert.rejects(() => requestImage(config('minimax'), { prompt: 'A cup.' }, signal(), (async () => json({ base_resp: { status_code: 0 }, data: { image_base64: ['not-an-image'] } })) as typeof fetch), (error: unknown) => error instanceof GenerationError && error.code === 'IMAGE_OUTPUT_INVALID');
});
test('new SDKs never fall back to machine environment credentials when the supplied key is empty', async () => {
  const names = ['FAL_API_KEY', 'FAL_KEY', 'REPLICATE_API_TOKEN', 'ARK_API_KEY'];
  const old = names.map(name => process.env[name]); names.forEach(name => { process.env[name] = 'forbidden-author-environment-key'; });
  try {
    for (const protocol of ['ark', 'fal', 'replicate'] as ImageProtocol[]) {
      let calls = 0;
      await assert.rejects(() => requestImage({ ...config(protocol), apiKey: '' }, { prompt: 'A cup.' }, signal(), (async (_url, init) => { calls++; assert.ok(!JSON.stringify([...new Headers(init?.headers)]).includes('forbidden-author-environment-key')); return json({ error: { message: 'not authorized', type: 'authentication_error' }, message: 'not authorized' }, 401); }) as typeof fetch));
      assert.equal(calls, 1);
    }
  } finally { names.forEach((name, index) => { if (old[index] === undefined) delete process.env[name]; else process.env[name] = old[index]; }); }
});

test('preset choices keep Azure resource names explicit and do not invent account model availability', () => {
  assert.equal(serviceById('azure')?.text?.baseURL, '');
  assert.equal(serviceById('deepseek')?.image, undefined);
  assert.equal(serviceById('stability')?.imageModels?.includes('core'), true);
});
