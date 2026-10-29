import test from 'node:test';
import assert from 'node:assert/strict';
import { ByokProvider, imageCapability, normalizeBaseURL, parseConfiguration, probeText, requestImage, listModels, providerFetch, publicFailure, type Configuration } from '../../server/byok.ts';
import { GenerationError } from '../../server/generation.ts';
import type { TextProtocol, ImageProtocol, SecretEndpoint } from '../../shared/byok.ts';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a09kAAAAASUVORK5CYII=';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const endpoint = <P extends string>(protocol: P): SecretEndpoint<P> => ({ protocol, model: 'fixture-model', baseURL: 'https://fixture.example/v1', apiKey: 'user-only-fixture-key' });
const signal = () => new AbortController().signal;
test('capability detection distinguishes image OUTPUT from vision input and model-name guesses', () => {
  assert.equal(imageCapability({ id: 'gpt-super-image', input_modalities: ['image'], architecture: { output_modalities: ['text'] } }), 'unsupported');
  assert.equal(imageCapability({ id: 'imagen-name-only' }), 'unknown');
  assert.equal(imageCapability({ architecture: { input_modalities: ['image'] } }), 'unknown');
  assert.equal(imageCapability({ architecture: { output_modalities: ['image', 'text'] } }), 'declared');
  assert.equal(imageCapability({ capabilities: { image_generation: false } }), 'unsupported');
});
test('a new endpoint never inherits the old endpoint key; an explicit empty key clears it', () => {
  const previous: Configuration = { text: endpoint('chat'), image: endpoint('images') };
  const { apiKey: _key, ...publicText } = previous.text;
  assert.equal(parseConfiguration({ text: publicText, image: previous.image }, previous).text.apiKey, previous.text.apiKey);
  assert.equal(parseConfiguration({ text: { ...publicText, baseURL: 'https://new-service.example/v1' }, image: previous.image }, previous).text.apiKey, '');
  assert.equal(parseConfiguration({ text: { ...publicText, protocol: 'responses' }, image: previous.image }, previous).text.apiKey, '');
  assert.equal(parseConfiguration({ text: { ...publicText, apiKey: '' }, image: previous.image }, previous).text.apiKey, '');
});
test('base URLs reject embedded keys, insecure external HTTP and invalid schemes; local inference is supported', () => {
  assert.equal(normalizeBaseURL('http://localhost:11434/v1/'), 'http://localhost:11434/v1');
  assert.equal(normalizeBaseURL('https://example.com/v1/chat/completions'), 'https://example.com/v1');
  for (const url of ['https://u:secret@example.com/v1', 'https://example.com/v1?key=secret', 'http://169.254.169.254/', 'file:///tmp/x', 'http://external.example/v1']) assert.throws(() => normalizeBaseURL(url), GenerationError);
});
const textResponses: Record<TextProtocol, unknown> = {
  chat: { id: 'chat-1', object: 'chat.completion', created: 1, model: 'fixture-model', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  openrouter: { id: 'chat-1', object: 'chat.completion', created: 1, model: 'fixture-model', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  responses: { id: 'resp_1', created_at: 1, model: 'fixture-model', status: 'completed', output: [{ type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
  anthropic: { id: 'msg_1', type: 'message', role: 'assistant', model: 'fixture-model', content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  google: { candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } },
};
for (const protocol of Object.keys(textResponses) as TextProtocol[]) test(`SDK text adapter sends a real ${protocol} request with only the supplied key`, async () => {
  let calls = 0;
  await probeText(endpoint(protocol), signal(), (async (url, init) => {
    calls++; const headers = new Headers(init?.headers), body = JSON.parse(String(init?.body));
    assert.equal(body.model ?? (String(url).includes('fixture-model') ? 'fixture-model' : ''), 'fixture-model');
    const auth = headers.get('authorization') ?? headers.get('x-api-key') ?? headers.get('x-goog-api-key');
    assert.ok(auth?.includes('user-only-fixture-key')); assert.equal(init?.redirect, 'error');
    return json(textResponses[protocol]);
  }) as typeof fetch);
  assert.equal(calls, 1);
});
for (const protocol of ['images', 'google', 'openrouter'] as ImageProtocol[]) test(`SDK image adapter validates actual bytes from ${protocol}`, async () => {
  let calls = 0;
  const config = { ...endpoint(protocol), model: protocol === 'google' ? 'gemini-2.5-flash-image' : 'fixture-image' };
  const result = await requestImage(config, { prompt: 'A blue cup.' }, signal(), (async (url, init) => {
    calls++; assert.equal(init?.redirect, 'error');
    assert.ok(String(url).includes(protocol === 'images' ? '/images/generations' : protocol === 'google' ? ':generateContent' : '/images'));
    return json(protocol === 'google' ? { candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: 'image/png', data: png } }] }, finishReason: 'STOP' }] } : { created: 1, data: [{ b64_json: png }] });
  }) as typeof fetch);
  assert.equal(result.extension, '.png'); assert.equal(result.bytes.toString('base64'), png); assert.equal(calls, 1);
});
test('removed Imagen SDK support is rejected before a request rather than misreported as network failure', async () => {
  let calls = 0;
  await assert.rejects(() => requestImage({ ...endpoint('google'), model: 'imagen-4.0-generate-001' }, { prompt: 'A cup.' }, signal(), (async () => { calls++; return json({}); }) as typeof fetch), (error: unknown) => error instanceof GenerationError && error.code === 'IMAGE_MODEL_PROTOCOL');
  assert.equal(calls, 0);
});
test('a truncated PNG signature does not count as successful image output', async () => {
  await assert.rejects(() => requestImage(endpoint('images'), { prompt: 'A cup.' }, signal(), (async () => json({ data: [{ b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }] })) as typeof fetch), (error: unknown) => error instanceof GenerationError && error.code === 'IMAGE_OUTPUT_INVALID');
});
test('failed auth is sanitized and never causes hidden SDK retries', async () => {
  let calls = 0;
  await assert.rejects(() => probeText(endpoint('chat'), signal(), (async () => { calls++; return json({ error: { message: 'echo user-only-fixture-key', type: 'auth_error' } }, 401); }) as typeof fetch), (error: unknown) => error instanceof GenerationError && error.code === 'API_AUTH' && !error.message.includes('fixture-key'));
  assert.equal(calls, 1); assert.ok(!publicFailure('API_AUTH').includes('fixture-key'));
});
test('empty user keys never inherit author credentials from provider environment variables', async () => {
  const names = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENROUTER_API_KEY'];
  const previous = names.map(name => process.env[name]);
  try {
    for (const name of names) process.env[name] = 'author-environment-key-must-not-be-used';
    for (const protocol of Object.keys(textResponses) as TextProtocol[]) {
      let calls = 0;
      await probeText({ ...endpoint(protocol), apiKey: '' }, signal(), (async (_url, init) => {
        calls++; assert.ok(!JSON.stringify([...new Headers(init?.headers)]).includes('author-environment-key'));
        return json(textResponses[protocol]);
      }) as typeof fetch);
      assert.equal(calls, 1);
    }
  } finally { names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; }); }
});
test('a successful upstream completion echoing a credential cannot become a saved rejected candidate', async () => {
  const configuration: Configuration = { text: endpoint('chat'), image: endpoint('images') };
  const provider = new ByokProvider(() => configuration, (async () => json({ ...textResponses.chat as object, choices: [{ index: 0, message: { role: 'assistant', content: 'echo ' + configuration.text.apiKey }, finish_reason: 'stop' }] })) as typeof fetch);
  await assert.rejects(() => provider.knowledge({ concept: '概念', knowledge: null, stories: [] }, signal()), (error: unknown) => error instanceof GenerationError && error.code === 'UPSTREAM_CREDENTIAL_ECHO' && !('candidate' in error));
});
test('model lists without output metadata remain unknown, including image-looking names', async () => {
  const result = await listModels(endpoint('images'), 'image', signal(), (async () => json({ data: [{ id: 'my-image-model' }, { id: 'vision-reader', architecture: { input_modalities: ['image'], output_modalities: ['text'] } }] })) as typeof fetch);
  assert.deepEqual(result.map(model => model.capability), ['unknown', 'unsupported']);
});
test('image CDN downloads strip all provider credentials and reject redirects', async () => {
  await providerFetch('https://service.example/v1', (async (_url, init) => { const headers = new Headers(init?.headers); assert.equal(headers.get('authorization'), null); assert.equal(headers.get('x-api-key'), null); assert.equal(init?.redirect, 'error'); return new Response('image'); }) as typeof fetch)('https://cdn.example/image.png', { headers: { Authorization: 'Bearer fixture', 'x-api-key': 'fixture' } });
});
