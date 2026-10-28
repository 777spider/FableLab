import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, unlinkSync} from 'node:fs';
import {join, resolve, sep, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash, randomInt} from 'node:crypto';
import type {Express} from 'express';
import {createApp} from '../../server/app.ts';
import {AuthService} from '../../server/auth.ts';
import {ShareService} from '../../server/share.ts';
import {JobService} from '../../server/jobs.ts';
import {SyntheticProvider} from '../../server/synthetic.ts';
import type {AuthResponse, JobResponse, SessionResponse, ShareResponse, PublicShareResponse} from '../../shared/contracts.ts';

const password = 'a local synthetic passphrase 2026';
function removeFixture(directory: string) {
  const target = resolve(directory);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('studio-http-'));
  rmSync(target, {recursive: true, force: true});
}
async function listenForFetch(app: Express) {
  // Some Windows dynamic ranges include WHATWG-fetch forbidden ports such as 6000.
  // Bind in an unrestricted high range, retrying only an occupied local port.
  for (let attempt = 0; attempt < 20; attempt++) {
    const server = app.listen(randomInt(20000, 60000), '127.0.0.1');
    const error = await new Promise<Error | undefined>(done => {server.once('listening', () => done(undefined)); server.once('error', done);});
    if (!error) return server;
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
  }
  throw new Error('No fetch-compatible local test port was allocated');
}
async function setup(production = false, unicode = false, provider = new SyntheticProvider()) {
  const dir = mkdtempSync(join(tmpdir(), 'studio-http-')), dataDir = join(dir, 'data'), distDir = unicode ? join(dir, '.hidden', '寓言工作室') : join(dir, 'dist');
  mkdirSync(distDir, {recursive: true}); writeFileSync(join(distDir, 'index.html'), '<html><title>Studio</title></html>');
  const jobs = new JobService(dataDir, provider), auth = new AuthService(dataDir), shares = new ShareService(dataDir), deploymentHoldFile = join(dataDir, '.deployment-hold');
  const app = createApp(jobs, {production, cookieSecret: 'test-only-secret-'.repeat(3), accessCodeHash: createHash('sha256').update('1025').digest('hex'), publicOrigin: 'https://yuyan.example', distDir, deploymentHoldFile}, {auth, shares});
  const server = await listenForFetch(app);
  const address = server.address() as {port: number};
  return {url: 'http://127.0.0.1:' + address.port, dir, dataDir, jobs, auth, shares, deploymentHoldFile, async close() {
    jobs.shutdown(); await new Promise<void>(done => server.close(() => done())); shares.close(); auth.close(); removeFixture(dir);
  }};
}
function post(url: string, path: string, body: unknown, cookie?: string, extra: Record<string, string> = {}) {
  return fetch(url + '/learn/api' + path, {method: 'POST', headers: {'Content-Type': 'application/json', ...(cookie ? {Cookie: cookie} : {}), ...extra}, body: JSON.stringify(body)});
}
async function register(url: string, username: string, legacy?: string) {
  const response = await post(url, '/auth/register', {code: '1025', username, password}, legacy);
  assert.equal(response.status, 201);
  return {cookie: response.headers.get('set-cookie')!.split(';')[0], data: await response.json() as AuthResponse, header: response.headers.get('set-cookie')!};
}
async function legacy(url: string) {
  const response = await post(url, '/access', {code: '1025'}); assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  return {cookie, owner: cookie.split('=')[1].split('.')[0]};
}
async function completed(jobs: JobService, owner: string, id: string) {
  for (let i = 0; i < 400; i++) {const job = jobs.get(owner, id)!; if (job.status === 'completed') return job; if (job.status === 'failed') assert.fail(job.error?.code); await new Promise(done => setTimeout(done, 5));}
  assert.fail('synthetic job did not complete');
}

test('accounts alone authorize private content; production cookies rotate and stay scoped', async () => {
  const s = await setup(true);
  try {
    assert.equal((await fetch(s.url + '/learn/api/jobs')).status, 401);
    assert.equal((await fetch(s.url + '/learn/media/' + 'a'.repeat(64) + '.png')).status, 401);
    const guest = await legacy(s.url);
    assert.equal((await fetch(s.url + '/learn/api/jobs', {headers: {Cookie: guest.cookie}})).status, 401);
    const denied = await post(s.url, '/auth/register', {code: 'wrong', username: 'reader_a', password}); assert.equal(denied.status, 403);
    const a = await register(s.url, 'Reader_A');
    assert.match(a.header, /Path=\/learn(?:;|$)/); assert.match(a.header, /HttpOnly/); assert.match(a.header, /SameSite=Lax/); assert.match(a.header, /Secure/);
    assert.deepEqual(a.data.user, {username: 'reader_a', displayName: 'reader_a'}); assert.equal(a.data.legacyImportCount, 0); assert.match(a.data.recoveryCode!, /^[A-Za-z0-9_-]{43}$/);
    const state = await fetch(s.url + '/learn/api/auth/session', {headers: {Cookie: a.cookie}});
    assert.equal(state.headers.get('cache-control'), 'no-store'); assert.deepEqual(await state.json(), {user: a.data.user, legacyImportCount: 0});
    const login = await post(s.url, '/auth/login', {username: 'READER_A', password}, a.cookie); assert.equal(login.status, 200);
    const next = login.headers.get('set-cookie')!.split(';')[0]; assert.notEqual(next, a.cookie); assert.equal((await login.json() as AuthResponse).recoveryCode, undefined);
    assert.equal((await (await fetch(s.url + '/learn/api/auth/session', {headers: {Cookie: a.cookie}})).json() as SessionResponse).user, null);
    assert.equal((await post(s.url, '/auth/logout', {}, next)).status, 200);
    assert.equal((await fetch(s.url + '/learn/api/jobs', {headers: {Cookie: next}})).status, 401);
  } finally {await s.close();}
});

test('foreign origins cannot mutate; a different account cannot read or mutate another shelf', async () => {
  const s = await setup();
  try {
    const a = await register(s.url, 'reader_a'), b = await register(s.url, 'reader_b');
    const request = {concept: '反馈', format: 'text', clientRequestId: 'test-owner-01'};
    assert.equal((await post(s.url, '/jobs', request, a.cookie, {Origin: 'https://evil.example'})).status, 403);
    assert.equal((await post(s.url, '/auth/login', {username: 'reader_a', password}, undefined, {'Sec-Fetch-Site': 'cross-site'})).status, 403);
    const created = await post(s.url, '/jobs', request, a.cookie); assert.equal(created.status, 202);
    const {job} = await created.json() as JobResponse;
    assert.equal((await fetch(s.url + '/learn/api/jobs/' + job.id, {headers: {Cookie: b.cookie}})).status, 404);
    for (const action of ['pause', 'resume', 'share', 'share/revoke']) assert.equal((await post(s.url, '/jobs/' + job.id + '/' + action, {}, b.cookie)).status, 404);
    assert.equal((await post(s.url, '/jobs/' + job.id + '/format', {format: 'comic'}, b.cookie)).status, 404);
    assert.deepEqual(await (await fetch(s.url + '/learn/api/jobs', {headers: {Cookie: b.cookie}})).json(), {jobs: []});
    const malformed = await fetch(s.url + '/learn/api/jobs', {method: 'POST', headers: {'Content-Type': 'application/json', Cookie: a.cookie}, body: '{"concept":'});
    assert.equal(malformed.status, 400); assert.equal(JSON.stringify(await malformed.json()).includes('SyntaxError'), false);
  } finally {await s.close();}
});

test('Unicode SPA auth/library routes work and unrelated routes remain unavailable', async () => {
  const s = await setup(false, true);
  try {
    for (const path of ['/in', '/learn', '/learn/auth', '/learn/library']) {const page = await fetch(s.url + path); assert.equal(page.status, 200); assert.match(await page.text(), /<title>Studio<\/title>/);}
    assert.equal((await fetch(s.url + '/yuyan/learn')).status, 404);
    assert.equal((await fetch(s.url + '/learn/s/' + 'a'.repeat(43))).status, 404);
  } finally {await s.close();}
});

test('only hashed public art and the specific reading font receive immutable production caching', async () => {
  for (const production of [true, false]) {
    const s = await setup(production);
    try {
      const bytes = Buffer.from('public static cache fixture'), hash = createHash('sha256').update(bytes).digest('hex');
      for (const {path,files,immutable} of [
        {path: ['art','optimized'], files: [hash+'.webp','preview.webp','forest.png'], immutable: hash+'.webp'},
        {path: ['fonts','lxgw-wenkai-screen-v1.7.0'], files: [hash+'.woff2','preview.woff2','LICENSE','font.css'], immutable: hash+'.woff2'},
        {path: ['fonts','other'], files: [hash+'.woff2'], immutable: null},
      ]) {
        const directory = join(s.dir, 'dist', ...path); mkdirSync(directory, {recursive: true});
        for (const file of files) writeFileSync(join(directory, file), bytes);
        for (const file of files) {
          const response = await fetch(s.url + '/learn/' + path.join('/') + '/' + file);
          assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
          assert.equal(response.headers.get('cache-control'), production && file === immutable ? 'public, max-age=31536000, immutable' : production ? 'public, max-age=3600' : 'public, max-age=0');
        }
      }
    } finally {await s.close();}
  }
});

test('ready private media needs its actual account and is not cached across account switches', async () => {
  const s = await setup();
  try {
    const a = await register(s.url, 'reader_a'), b = await register(s.url, 'reader_b');
    const result = await post(s.url, '/jobs', {concept: '反馈', format: 'comic', clientRequestId: 'media-owner-01'}, a.cookie), id = (await result.json() as JobResponse).job.id;
    const owner = s.auth.authenticate(a.cookie.split('=')[1])!.owner, job = await completed(s.jobs, owner, id), url = s.url + job.stories[0].pages[0].image.url;
    const image = await fetch(url, {headers: {Cookie: a.cookie}}); assert.equal(image.status, 200); assert.equal(image.headers.get('cache-control'), 'no-store'); await image.arrayBuffer();
    assert.equal((await fetch(url, {headers: {Cookie: b.cookie}})).status, 404); assert.equal((await fetch(url)).status, 401);
  } finally {await s.close();}
});

test('legacy records require explicit import and one guest owner can never be claimed twice', async () => {
  const s = await setup();
  try {
    const guest = await legacy(s.url), old = s.jobs.create(guest.owner, {concept: '旧资料', format: 'text', clientRequestId: 'legacy-import-01'});
    await completed(s.jobs, guest.owner, old.id);
    const before = readFileSync(join(s.dataDir, 'jobs.json'));
    assert.deepEqual(await (await fetch(s.url + '/learn/api/auth/session', {headers: {Cookie: guest.cookie}})).json(), {user: null, legacyImportCount: 1});
    const a = await register(s.url, 'reader_a', guest.cookie), b = await register(s.url, 'reader_b');
    assert.equal(a.data.legacyImportCount, 1);
    assert.deepEqual(await (await fetch(s.url + '/learn/api/jobs', {headers: {Cookie: a.cookie}})).json(), {jobs: []});
    const imported = await post(s.url, '/auth/legacy-import', {}, a.cookie + '; ' + guest.cookie); assert.equal(imported.status, 200); assert.match(imported.headers.get('set-cookie')!, /fable_studio_owner=;/); assert.equal((await imported.json() as SessionResponse).legacyImportCount, 0);
    assert.deepEqual(readFileSync(join(s.dataDir, 'jobs.json')), before);
    const shelf = await (await fetch(s.url + '/learn/api/jobs', {headers: {Cookie: a.cookie}})).json() as {jobs: {id: string}[]}; assert.deepEqual(shelf.jobs.map(job => job.id), [old.id]);
    assert.equal((await post(s.url, '/auth/legacy-import', {}, a.cookie + '; ' + guest.cookie)).status, 200);
    assert.equal((await post(s.url, '/auth/legacy-import', {}, b.cookie + '; ' + guest.cookie)).status, 409);
    assert.deepEqual(await (await fetch(s.url + '/learn/api/auth/session', {headers: {Cookie: guest.cookie}})).json(), {user: null, legacyImportCount: 0});
    assert.equal((await fetch(s.url + '/learn/api/jobs/' + old.id, {headers: {Cookie: guest.cookie}})).status, 401);
  } finally {await s.close();}
});

test('a public snapshot needs no account, freezes its content, and revocation blocks JSON, page, and media', async () => {
  const s = await setup();
  try {
    const a = await register(s.url, 'reader_a'), owner = s.auth.authenticate(a.cookie.split('=')[1])!.owner;
    const original = s.jobs.create(owner, {concept: '反馈', format: 'comic', clientRequestId: 'public-share-01'}), job = await completed(s.jobs, owner, original.id);
    const published = await post(s.url, '/jobs/' + job.id + '/share', {}, a.cookie); assert.equal(published.status, 201);
    const {share} = await published.json() as ShareResponse, token = share!.url.split('/').at(-1)!;
    assert.equal((await post(s.url, '/jobs/' + job.id + '/share', {}, a.cookie)).status, 200);
    const response = await fetch(s.url + '/learn/api/public/shares/' + token); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const publicData = await response.json() as PublicShareResponse, imageUrl = publicData.shared.stories[0].pages[0].image.url!;
    assert.equal(JSON.stringify(publicData).includes('visualDesign'), false); assert.equal(JSON.stringify(publicData).includes(job.id), false); assert.equal(JSON.stringify(publicData).includes(owner), false);
    const image = await fetch(s.url + imageUrl); assert.equal(image.status, 200); assert.equal(image.headers.get('cache-control'), 'no-store'); await image.arrayBuffer();
    assert.equal((await fetch(s.url + '/learn/api/public/shares/' + token + '/media/' + 'f'.repeat(64) + '.png')).status, 404);
    assert.equal((await fetch(s.url + share!.url)).status, 200);
    s.jobs.setFormat(owner, job.id, 'text');
    const frozen = await (await fetch(s.url + '/learn/api/public/shares/' + token)).json() as PublicShareResponse; assert.deepEqual(frozen, publicData);
    assert.equal((await post(s.url, '/jobs/' + job.id + '/share/revoke', {}, a.cookie)).status, 200);
    for (const path of ['/learn/api/public/shares/' + token, share!.url, imageUrl]) {const denied = await fetch(s.url + path); assert.equal(denied.status, 404); assert.equal(denied.headers.get('cache-control'), 'no-store');}
    assert.equal((await post(s.url, '/jobs/' + job.id + '/share/revoke', {}, a.cookie)).status, 200);
    const republished = await post(s.url, '/jobs/' + job.id + '/share', {}, a.cookie); assert.equal(republished.status, 201); assert.notEqual((await republished.json() as ShareResponse).share!.url, share!.url);
  } finally {await s.close();}
});

test('single-character concepts are accepted and malformed authentication cookies stay unauthenticated', async () => {
  const s = await setup();
  try {
    const malformed = 'fable_studio_owner=' + 'a'.repeat(32) + '.' + (Date.now() + 86400000) + '.' + 'é'.repeat(43);
    assert.deepEqual(await (await fetch(s.url + '/learn/api/access', {headers: {Cookie: malformed}})).json(), {unlocked: false});
    assert.deepEqual(await (await fetch(s.url + '/learn/api/auth/session', {headers: {Cookie: 'fable_studio_session=é'}})).json(), {user: null, legacyImportCount: 0});
    const a = await register(s.url, 'reader_a');
    assert.equal((await post(s.url, '/jobs', {concept: '熵', format: 'text', clientRequestId: 'concept-entropy-01'}, a.cookie)).status, 202);
  } finally {await s.close();}
});

test('recovery needs only the username and one-use code and replaces the current authenticated session', async () => {
  const s = await setup();
  try {
    const a = await register(s.url, 'recover_reader'), nextPassword = 'a replacement synthetic passphrase';
    const response = await post(s.url, '/auth/recover', {username: 'recover_reader', recoveryCode: a.data.recoveryCode, password: nextPassword}, a.cookie);
    assert.equal(response.status, 200); const data = await response.json() as AuthResponse;
    assert.match(data.recoveryCode!, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(data.recoveryCode, a.data.recoveryCode); assert.deepEqual(data.user, a.data.user);
    assert.equal((await fetch(s.url + '/learn/api/jobs', {headers: {Cookie: a.cookie}})).status, 401);
    const next = response.headers.get('set-cookie')!.split(';')[0]; assert.equal((await fetch(s.url + '/learn/api/jobs', {headers: {Cookie: next}})).status, 200);
    assert.equal((await post(s.url, '/auth/recover', {username: 'recover_reader', recoveryCode: a.data.recoveryCode, password})).status, 401);
    assert.equal((await post(s.url, '/auth/login', {username: 'recover_reader', password})).status, 401);
    assert.equal((await post(s.url, '/auth/login', {username: 'recover_reader', password: nextPassword})).status, 200);
  } finally {await s.close();}
});

test('deployment hold rejects every API write before parsing while read routes stay available', async () => {
  const s = await setup();
  try {
    writeFileSync(s.deploymentHoldFile, 'local synthetic deployment hold');
    const response = await fetch(s.url + '/learn/api/auth/register', {method: 'POST', body: 'not-json'});
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), {error: {code: 'DEPLOYMENT_IN_PROGRESS', message: '正在更新，稍后再试。'}});
    assert.equal((await fetch(s.url + '/learn/api/auth/session')).status, 200); assert.equal((await fetch(s.url + '/learn/api/health')).status, 200);
    unlinkSync(s.deploymentHoldFile);
    assert.equal((await post(s.url, '/auth/register', {code: 'wrong', username: 'reader_a', password})).status, 403);
  } finally {await s.close();}
});

test('logging out and leaving the page do not abort a job, and login restores the same saved progress', async () => {
  const provider = new SyntheticProvider(), original = provider.story.bind(provider); let started: () => void = () => {}, release: () => void = () => {};
  const storyStarted = new Promise<void>(resolve => {started = resolve;}), detached = new Promise<void>(resolve => {release = resolve;});
  provider.story = async (input, signal) => {started(); await detached; assert.equal(signal.aborted, false); return original(input, signal);};
  const s = await setup(false, false, provider);
  try {
    const a = await register(s.url, 'background_reader'), owner = s.auth.authenticate(a.cookie.split('=')[1])!.owner;
    const response = await post(s.url, '/jobs', {concept: '反馈', format: 'text', clientRequestId: 'background-session-01'}, a.cookie), id = (await response.json() as JobResponse).job.id;
    await storyStarted; const before = s.jobs.get(owner, id)!; assert.ok(before.knowledge);
    assert.equal((await post(s.url, '/auth/logout', {}, a.cookie)).status, 200); assert.equal((await fetch(s.url + '/learn/api/jobs/' + id, {headers: {Cookie: a.cookie}})).status, 401);
    // No browser polling or session remains while the server finishes this same job.
    release(); const result = await completed(s.jobs, owner, id); assert.equal(result.id, id); assert.equal(result.progress.attempts, 4); assert.deepEqual(result.knowledge, before.knowledge);
    const login = await post(s.url, '/auth/login', {username: 'background_reader', password}); assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const restored = await (await fetch(s.url + '/learn/api/jobs/' + id, {headers: {Cookie: cookie}})).json() as JobResponse;
    assert.equal(restored.job.id, id); assert.equal(restored.job.status, 'completed'); assert.deepEqual(restored.job.stories, result.stories);
    const shelf = await (await fetch(s.url + '/learn/api/jobs', {headers: {Cookie: cookie}})).json() as {jobs: JobResponse['job'][]}; assert.deepEqual(shelf.jobs.map(job => job.id), [id]);
  } finally {release(); await s.close();}
});
