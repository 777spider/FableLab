import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createLiteApp } from '../../server/lite-app.ts';
import { SyntheticProvider } from '../../server/synthetic.ts';
import { KNOWLEDGE, STORY, LESSON } from '../../server/prompts.ts';
import type { GenerationInput } from '../../server/generation.ts';
import type { JobDTO } from '../../shared/contracts.ts';
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const key = 'user-key-must-never-be-written';
test('public app runs text and comics through SDK, isolates sessions, omits accounts, and never persists keys', async () => {
  const fixture = new SyntheticProvider(), calls: string[] = [];
  let hold = false, markStarted: (() => void) | undefined;
  const fetcher = (async (url, init) => {
    if (String(url).endsWith('/models')) return json({ data: [{ id: 'fixture-image', architecture: { output_modalities: ['image'] } }, { id: 'fixture-vision', architecture: { output_modalities: ['text'] } }] });
    const body = JSON.parse(String(init?.body)); calls.push(String(url));
    if (hold) { markStarted?.(); await new Promise((_done, reject) => { init?.signal?.addEventListener('abort', () => { hold = false; reject(new DOMException('Aborted', 'AbortError')); }, { once: true }); }); }
    await new Promise(done => setTimeout(done, 8));
    if (String(url).endsWith('/images/generations')) { const image = await fixture.image({ prompt: '' }, new AbortController().signal); return json({ data: [{ b64_json: image.bytes.toString('base64') }] }); }
    const system = body.messages[0].content as string, input = JSON.parse(body.messages[1].content) as GenerationInput;
    const stage = system.includes(KNOWLEDGE) ? 'knowledge' : system.includes(STORY) ? 'story' : system.includes(LESSON) ? 'lesson' : 'review';
    const result = await fixture[stage](input, new AbortController().signal);
    return json({ id: 'fixture', created: 1, model: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(result) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
  }) as typeof fetch;
  const port = randomInt(30000, 49000), instance = createLiteApp({ port, distDir: 'absent-fixture-dist', fetcher, retryDelayMs: 1 });
  const server = instance.app.listen(port, '127.0.0.1'); await new Promise<void>(done => server.once('listening', done));
  const base = `http://127.0.0.1:${port}`;
  let cookie = '';
  const request = async (path: string, body?: unknown, method?: string, other = false) => {
    const response = await fetch(base + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { ...(cookie && !other ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!other && response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
    const content = await response.text(); return { response, content, value: content ? JSON.parse(content) : null };
  };
  try {
    const initial = await request('/learn/api/settings'); assert.equal(initial.value.settings.text.hasKey, false);
    for (const path of ['/learn/api/auth/login', '/learn/api/library', '/learn/api/shares']) assert.equal((await request(path)).response.status, 404);
    const fields = { text: { protocol: 'chat', baseURL: 'https://fixture.example/v1', model: 'fixture', apiKey: key }, image: { protocol: 'images', baseURL: 'https://fixture.example/v1', model: 'fixture-image', apiKey: key } };
    const saved = await request('/learn/api/settings', fields); assert.equal(saved.response.status, 200); assert.ok(!saved.content.includes(key));
    assert.equal((await request('/learn/api/models', { target: 'image' })).value.settings.imageCapability, 'declared');
    assert.equal((await request('/learn/api/settings', { ...fields, image: { ...fields.image, model: 'fixture-vision' } })).value.settings.imageCapability, 'unsupported');
    assert.equal((await request('/learn/api/settings', fields)).value.settings.imageCapability, 'declared');
    hold = true; const started = new Promise<void>(done => { markStarted = done; });
    const probing = request('/learn/api/probe', { target: 'text' }); await started;
    assert.equal((await request('/learn/api/operations/cancel', {})).response.status, 200);
    assert.equal((await probing).value.error.code, 'ABORTED');
    assert.equal((await request('/learn/api/settings', undefined, undefined, true)).value.settings.text.hasKey, false);
    for (const format of ['text', 'comic'] as const) {
      const input = { concept: '测试概念', format, clientRequestId: randomUUID() };
      const created = await request('/learn/api/jobs', input); assert.equal(created.response.status, 202);
      assert.equal(created.value.job.progress.attemptBudget, 24);
      assert.equal((await request('/learn/api/jobs', input)).value.job.id, created.value.job.id);
      assert.equal((await request('/learn/api/settings', fields)).response.status, 409);
      const id = created.value.job.id;
      assert.equal((await request('/learn/api/jobs/' + id, undefined, undefined, true)).response.status, 404);
      let job: JobDTO = created.value.job;
      for (let i = 0; i < 150 && ['queued', 'running'].includes(job.status); i++) { await new Promise(done => setTimeout(done, 10)); job = (await request('/learn/api/jobs/' + id)).value.job; }
      assert.equal(job.status, 'completed', JSON.stringify(job.error)); assert.equal(job.stories.length, 1); assert.ok(job.lesson); assert.equal(job.quality, 'checked');
      assert.ok(!JSON.stringify(job).includes(key));
      if (format === 'text') assert.equal(calls.filter(url => url.includes('/images/')).length, 0);
      else {
        assert.ok(job.stories[0].pages.every(page => page.image.status === 'ready'));
        const media = await fetch(base + job.stories[0].pages[0].image.url, { headers: { Cookie: cookie } }); assert.equal(media.status, 200); assert.equal(media.headers.get('cache-control'), 'no-store');
        const foreign = await fetch(base + job.stories[0].pages[0].image.url); assert.equal(foreign.status, 404);
      }
    }
    const readTree = (directory: string): string => readdirSync(directory, { withFileTypes: true }).map(item => item.isDirectory() ? readTree(join(directory, item.name)) : readFileSync(join(directory, item.name)).toString()).join('');
    assert.ok(!readTree(instance.temporaryRoot).includes(key));
    const forbidden = await fetch(base + '/learn/api/settings', { method: 'POST', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(fields) }); assert.equal(forbidden.status, 403);
    const clear = await request('/learn/api/settings', {}, 'DELETE'); assert.equal(clear.value.settings.text.hasKey, false);
  } finally { instance.close(); await new Promise<void>(done => server.close(() => done())); }
});
