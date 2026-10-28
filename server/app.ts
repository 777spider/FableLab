import express, {type Request, type Response, type NextFunction} from 'express';
import {randomBytes, createHmac, createHash, timingSafeEqual} from 'node:crypto';
import {existsSync} from 'node:fs';
import {join, dirname, basename} from 'node:path';
import {z} from 'zod';
import type {JobService} from './jobs.ts';
import {GenerationError} from './generation.ts';
import {AuthError, type AuthService, type AccountIdentity, type AuthResult} from './auth.ts';
import {ShareError, type ShareService} from './share.ts';
import type {SessionResponse} from '../shared/contracts.ts';

export interface AppConfig {
  production: boolean; cookieSecret: string; accessCodeHash: string; publicOrigin?: string;
  distDir: string; deploymentHoldFile?: string;
}
export interface AppStores {auth: AuthService; shares: ShareService;}
const LEGACY_COOKIE = 'fable_studio_owner', SESSION_COOKIE = 'fable_studio_session';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}
function cookie(req: Request, name: string) {
  return req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1);
}

export function createApp(service: JobService, config: AppConfig, {auth, shares}: AppStores) {
  if (config.cookieSecret.length < 32 || !/^[a-f0-9]{64}$/.test(config.accessCodeHash)) throw new Error('STUDIO_ACCESS_CONFIG_INVALID');
  const app = express(); app.disable('x-powered-by'); app.set('trust proxy', 'loopback');
  const sign = (value: string) => createHmac('sha256', config.cookieSecret).update(value).digest('base64url');
  const legacyOwner = (req: Request) => {
    const token = cookie(req, LEGACY_COOKIE);
    if (!token) return null;
    const [id, expiry, mac, ...extra] = token.split('.');
    if (extra.length || !/^[a-f0-9]{32}$/.test(id ?? '') || !/^\d{10,13}$/.test(expiry ?? '') || !mac || Number(expiry) < Date.now()) return null;
    return safeEqual(sign(id + '.' + expiry), mac) ? id : null;
  };
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({error: {code, message}});
  const identity = (req: Request) => auth.authenticate(cookie(req, SESSION_COOKIE));
  const legacyImportCount = (req: Request) => {const owner = legacyOwner(req); return owner && !auth.legacyClaimed(owner) ? service.list(owner).length : 0;};
  const session = (req: Request, account = identity(req)): SessionResponse => ({user: account?.user ?? null, legacyImportCount: legacyImportCount(req)});
  const clearLegacy = (res: Response) => res.clearCookie(LEGACY_COOKIE, {path: '/learn', httpOnly: true, secure: config.production, sameSite: 'strict'});
  const setSession = (req: Request, res: Response, result: AuthResult) => {
    res.cookie(SESSION_COOKIE, result.token, {path: '/learn', httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: Math.max(0, result.expiresAt - Date.now())});
    return {...session(req, result.account), ...(result.recoveryCode ? {recoveryCode: result.recoveryCode} : {})};
  };
  const gate = (req: Request, res: Response, next: NextFunction) => {
    const account = identity(req);
    if (!account) return void fail(res, 401, 'AUTH_REQUIRED', '请先登录后继续。');
    res.locals.account = account; res.locals.owners = auth.owners(account.id); next();
  };
  const ownedJob = (req: Request, res: Response) => {
    for (const owner of res.locals.owners as string[]) {const job = service.get(owner, String(req.params.id)); if (job) return {owner, job};}
    fail(res, 404, 'JOB_NOT_FOUND', '没有找到这份内容。'); return null;
  };
  const windows = new Map<string, {count: number; until: number}>();
  function rate(key: string, limit: number, ms: number) {
    const now = Date.now();
    if (windows.size >= 10000) {for (const [name, entry] of windows) if (entry.until <= now) windows.delete(name); if (windows.size >= 10000 && !windows.has(key)) return false;}
    let window = windows.get(key);
    if (!window || window.until <= now) {window = {count: 0, until: now + ms}; windows.set(key, window);}
    return ++window.count <= limit;
  }
  const authRate = (req: Request, res: Response, operation: 'register' | 'login' | 'recover') => {
    const name = typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
    if (!rate('auth-ip:' + req.ip, 120, 10 * 60000) || !rate(operation + '-name:' + hash(name), operation === 'recover' ? 5 : 15, 10 * 60000)) {
      fail(res, 429, 'AUTH_RATE_LIMIT', '尝试次数较多，请稍后再试。'); return false;
    }
    return true;
  };
  app.use((req, res, next) => {
    res.set({'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'; base-uri 'self'; object-src 'none'"});
    if (req.path.startsWith('/learn/s/') || req.path.startsWith('/learn/api/public/')) res.set({'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow'});
    next();
  });
  app.use('/learn/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && config.deploymentHoldFile && existsSync(config.deploymentHoldFile)) return void fail(res, 503, 'DEPLOYMENT_IN_PROGRESS', '正在更新，稍后再试。');
    if (!rate('api:' + req.ip, 600, 60000)) return void fail(res, 429, 'RATE_LIMIT', '操作较频繁，请稍后再试。');
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('origin'), expected = config.publicOrigin ?? (req.protocol + '://' + req.get('host'));
      if ((origin && origin !== expected) || req.get('sec-fetch-site') === 'cross-site') return void fail(res, 403, 'ORIGIN_REJECTED', '请从本站页面操作。');
      if (!req.is('application/json')) return void fail(res, 415, 'JSON_REQUIRED', '请使用有效的请求格式。');
    }
    next();
  });
  app.use('/learn/api', express.json({limit: '12kb', strict: true}));
  app.get('/learn/api/health', (_req, res) => res.json({ok: true, service: 'fablelab-studio'}));
  app.get('/learn/api/auth/session', (req, res) => res.json(session(req)));
  app.post('/learn/api/auth/register', async (req, res) => {
    if (!authRate(req, res, 'register')) return;
    const input = z.strictObject({code: z.string().max(80), username: z.string().max(24), displayName: z.string().max(60).optional(), password: z.string().max(512)}).safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'INVALID_ACCOUNT_INPUT', '请检查用户名、昵称和密码。');
    if (!safeEqual(hash(input.data.code), config.accessCodeHash)) return void fail(res, 403, 'INVALID_CODE', '邀请码不正确。');
    const result = await auth.register(input.data, cookie(req, SESSION_COOKIE));
    res.status(201).json(setSession(req, res, result));
  });
  app.post('/learn/api/auth/login', async (req, res) => {
    if (!authRate(req, res, 'login')) return;
    const input = z.strictObject({username: z.string().max(24), password: z.string().max(512)}).safeParse(req.body);
    if (!input.success) return void fail(res, 401, 'INVALID_CREDENTIALS', '用户名或密码不正确。');
    const result = await auth.login(input.data, cookie(req, SESSION_COOKIE)); res.json(setSession(req, res, result));
  });
  app.post('/learn/api/auth/logout', (req, res) => {
    if (!z.strictObject({}).safeParse(req.body).success) return void fail(res, 400, 'INVALID_INPUT', '请使用有效的请求格式。');
    auth.revoke(cookie(req, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, {path: '/learn', httpOnly: true, secure: config.production, sameSite: 'lax'});
    res.json(session(req, null));
  });
  app.post('/learn/api/auth/recover', async (req, res) => {
    if (!authRate(req, res, 'recover')) return;
    const input = z.strictObject({username: z.string().max(24), recoveryCode: z.string().max(80), password: z.string().max(512)}).safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'INVALID_ACCOUNT_INPUT', '请检查用户名、恢复码和新密码。');
    const result = await auth.recover(input.data, cookie(req, SESSION_COOKIE)); res.json(setSession(req, res, result));
  });
  app.post('/learn/api/auth/legacy-import', gate, (req, res) => {
    if (!z.strictObject({}).safeParse(req.body).success) return void fail(res, 400, 'INVALID_INPUT', '请使用有效的请求格式。');
    const account = res.locals.account as AccountIdentity, owner = legacyOwner(req);
    if (owner && service.list(owner).length) auth.claimLegacy(account.id, owner);
    clearLegacy(res); res.json({user: account.user, legacyImportCount: 0} satisfies SessionResponse);
  });
  // Compatibility only: a legacy access cookie cannot authorize private jobs or images.
  app.get('/learn/api/access', (req, res) => res.json({unlocked: !!legacyOwner(req)}));
  app.post('/learn/api/access', (req, res) => {
    if (!rate('access:' + req.ip, 12, 10 * 60000)) return void fail(res, 429, 'ACCESS_RATE_LIMIT', '尝试次数较多，请稍后再试。');
    const input = z.strictObject({code: z.string().max(80)}).safeParse(req.body);
    if (!input.success || !safeEqual(hash(input.data.code), config.accessCodeHash)) return void fail(res, 403, 'INVALID_CODE', '访问码不正确。');
    const existing = legacyOwner(req), id = existing ?? randomBytes(16).toString('hex');
    const value = id + '.' + (Date.now() + 30 * 86400000), token = existing ? cookie(req, LEGACY_COOKIE)! : value + '.' + sign(value);
    res.cookie(LEGACY_COOKIE, token, {path: '/learn', httpOnly: true, secure: config.production, sameSite: 'strict', maxAge: 30 * 86400000});
    res.json({unlocked: true});
  });
  app.get('/learn/api/public/shares/:token', (req, res) => {
    const shared = shares.read(String(req.params.token));
    if (!shared) return void fail(res, 404, 'SHARE_NOT_FOUND', '分享已失效或已撤销。');
    res.json({shared});
  });
  app.get('/learn/api/public/shares/:token/media/:name', (req, res) => {
    const path = shares.media(String(req.params.token), String(req.params.name));
    if (!path) return void fail(res, 404, 'MEDIA_NOT_FOUND', '这张插画暂不可用。');
    res.sendFile(basename(path), {root: dirname(path), cacheControl: false});
  });
  app.get('/learn/api/library', gate, (_req, res) => {
    const books = (res.locals.owners as string[]).flatMap(owner => service.library(owner)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({username: (res.locals.account as AccountIdentity).user.username, books});
  });
  app.use('/learn/api/jobs', gate);
  app.get('/learn/api/jobs', (_req, res) => {
    const jobs = (res.locals.owners as string[]).flatMap(owner => service.list(owner)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({jobs});
  });
  app.post('/learn/api/jobs', (req, res) => {
    const input = z.strictObject({concept: z.string().trim().min(1).max(120), format: z.enum(['text', 'comic']), storyLength: z.enum(['standard', 'long']).optional(), clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/)}).safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'INVALID_INPUT', '请填写1–120字的学术概念并选择阅读形式。');
    if (input.data.storyLength === 'long' && input.data.format !== 'text') return void fail(res, 400, 'LONG_TEXT_ONLY', '长篇故事目前支持文字阅读，请选择文字。');
    const account = res.locals.account as AccountIdentity;
    if (!rate('create:' + account.id, 12, 3600000)) return void fail(res, 429, 'CREATE_RATE_LIMIT', '创建次数较多，请稍后再试。');
    res.status(202).json({job: service.create(account.owner, input.data)});
  });
  app.get('/learn/api/jobs/:id', (req, res) => {const value = ownedJob(req, res); if (value) res.json({job: value.job});});
  app.post('/learn/api/jobs/:id/pause', (req, res) => {const value = ownedJob(req, res); if (value) res.json({job: service.pause(value.owner, value.job.id)});});
  app.post('/learn/api/jobs/:id/resume', (req, res) => {const value = ownedJob(req, res); if (value) res.json({job: service.resume(value.owner, value.job.id)});});
  app.post('/learn/api/jobs/:id/format', (req, res) => {
    const input = z.strictObject({format: z.enum(['text', 'comic'])}).safeParse(req.body);
    if (!input.success) return void fail(res, 400, 'INVALID_INPUT', '请选择文字或漫画。');
    const value = ownedJob(req, res); if (value) res.json({job: service.setFormat(value.owner, value.job.id, input.data.format)});
  });
  app.get('/learn/api/jobs/:id/share', (req, res) => {
    const value = ownedJob(req, res); if (value) res.json({share: shares.status((res.locals.account as AccountIdentity).id, value.job.id)});
  });
  app.post('/learn/api/jobs/:id/share', (req, res) => {
    if (!z.strictObject({}).safeParse(req.body).success) return void fail(res, 400, 'INVALID_INPUT', '请使用有效的请求格式。');
    const value = ownedJob(req, res); if (!value) return;
    const account = res.locals.account as AccountIdentity, previous = shares.status(account.id, value.job.id);
    if (!previous && !rate('publish:' + account.id, 12, 3600000)) return void fail(res, 429, 'SHARE_RATE_LIMIT', '发布次数较多，请稍后再试。');
    const share = shares.publish(account.id, value.job, name => service.media(value.owner, name));
    res.status(previous ? 200 : 201).json({share});
  });
  app.post('/learn/api/jobs/:id/share/revoke', (req, res) => {
    if (!z.strictObject({}).safeParse(req.body).success) return void fail(res, 400, 'INVALID_INPUT', '请使用有效的请求格式。');
    const value = ownedJob(req, res); if (!value) return;
    shares.revoke((res.locals.account as AccountIdentity).id, value.job.id); res.json({share: null});
  });
  app.get('/learn/media/:name', gate, (req, res) => {
    for (const owner of res.locals.owners as string[]) {
      const path = service.media(owner, String(req.params.name));
      if (path) {res.set('Cache-Control', 'no-store'); res.sendFile(basename(path), {root: dirname(path), cacheControl: false}); return;}
    }
    fail(res, 404, 'MEDIA_NOT_FOUND', '这张插画暂不可用。');
  });
  app.use('/learn/api', (_req, res) => fail(res, 404, 'NOT_FOUND', '没有找到这个操作。'));
  const spa = (res: Response) => {
    res.set('Cache-Control', 'no-cache');
    if (existsSync(join(config.distDir, 'index.html'))) res.sendFile('index.html', {root: config.distDir});
    else res.status(503).type('text').send('页面正在准备，请稍后再试。');
  };
  app.get('/learn/s/:token', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!shares.read(String(req.params.token))) res.status(404);
    // Keep the bearer URL out of navigation referrers and browser caches.
    if (existsSync(join(config.distDir, 'index.html'))) res.sendFile('index.html', {root: config.distDir, cacheControl: false});
    else res.status(503).type('text').send('页面正在准备，请稍后再试。');
  });
  app.use('/learn', express.static(config.distDir, {index: false, maxAge: config.production ? '1h' : 0,
    setHeaders(res, file) {
      const fontDirectory = join(config.distDir, 'fonts', 'lxgw-wenkai-screen-v1.7.0');
      if (config.production && (dirname(file) === join(config.distDir, 'art', 'optimized') && /^[a-f0-9]{64}\.webp$/.test(basename(file)) || dirname(file) === fontDirectory && /^[a-f0-9]{64}\.woff2$/.test(basename(file)))) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  app.get(['/learn', '/learn/', '/learn/auth', '/learn/auth/', '/learn/library', '/learn/library/', '/in', '/in/'], (_req, res) => spa(res));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AuthError) {
      const status = error.code === 'INVALID_CREDENTIALS' ? 401 : ['USERNAME_TAKEN', 'LEGACY_IMPORT_CONFLICT'].includes(error.code) ? 409 : error.code === 'AUTH_BUSY' ? 429 : error.code === 'AUTH_FAILED' ? 500 : 400;
      const messages: Record<string, string> = {INVALID_CREDENTIALS: '用户名、密码或恢复码不正确。', USERNAME_TAKEN: '这个用户名已被使用。', LEGACY_IMPORT_CONFLICT: '这些旧记录已被导入，请使用原账户查看。', AUTH_BUSY: '登录服务较忙，请稍后再试。', INVALID_ACCOUNT_INPUT: '用户名需为3–24位字母、数字或下划线，密码需6–128个字符，昵称需2–30个字符。'};
      return void fail(res, status, error.code, messages[error.code] ?? '服务暂时未能完成操作，请稍后再试。');
    }
    if (error instanceof ShareError) return void fail(res, error.code === 'NOT_SHAREABLE' ? 400 : 500, error.code, error.code === 'NOT_SHAREABLE' ? '故事完成并通过机器初检后才能分享。' : '分享暂时未能完成，请稍后再试。');
    if (error instanceof GenerationError) {
      const status = error.code === 'JOB_NOT_FOUND' ? 404 : error.code === 'REQUEST_CONFLICT' ? 409 : error.code === 'TOO_MANY_JOBS' ? 429 : 400;
      return void fail(res, status, error.code, error.code === 'LONG_TEXT_ONLY' ? '长篇故事目前支持文字阅读，请选择文字。' : status === 404 ? '没有找到这份内容。' : status === 409 ? '这次请求已存在，请刷新后继续。' : '暂时无法完成操作，请稍后再试。');
    }
    if (error instanceof SyntaxError || (error as {type?: string})?.type === 'entity.too.large') return void fail(res, 400, 'INVALID_JSON', '请求内容格式不正确。');
    fail(res, 500, 'INTERNAL_ERROR', '服务暂时未能完成操作，请稍后再试。');
  });
  return app;
}
