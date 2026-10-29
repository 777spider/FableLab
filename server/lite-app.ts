import express, { type Request, type Response, type NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname, resolve, sep } from 'node:path';
import { z } from 'zod';
import { initialSettings, type Settings, type Capability } from '../shared/byok.ts';
import { ByokProvider, parseConfiguration, endpointIdentity, listModels, probeText, requestImage, publicFailure, type Configuration } from './byok.ts';
import { GenerationError } from './generation.ts';
import { JobService } from './jobs.ts';

interface Session {
  token: string; configuration: Configuration; imageCapability: Capability; textVerified: boolean;
  service: JobService; currentId?: string; requestId?: string; dir: string; touched: number; operating: boolean;
  preview?: { bytes: Buffer; extension: '.png' | '.jpg' };
  imageCatalog?: { endpoint: string; models: Map<string, Capability> };
  operationAbort?: AbortController;
}
export interface LiteOptions { distDir: string; port?: number; host?: string; dev?: boolean; fetcher?: typeof fetch; retryDelayMs?: number; }
const active = (session: Session) => session.service.list('local').some(job => ['queued', 'running'].includes(job.status));
const publicSettings = (session: Session): Settings => {
  const expose = <P extends string>({ apiKey, ...rest }: { apiKey: string; protocol: P; baseURL: string; model: string }) => ({ ...rest, hasKey: !!apiKey });
  return { text: expose(session.configuration.text), image: expose(session.configuration.image), imageUsesText: !!session.configuration.imageUsesText, imageCapability: session.imageCapability, textVerified: session.textVerified };
};
export function createLiteApp(options: LiteOptions) {
  const app = express(), sessions = new Map<string, Session>();
  const root = mkdtempSync(join(tmpdir(), 'fablelab-'));
  const port = options.port ?? 4318;
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]', options.host ?? '127.0.0.1']);
  const allowedPorts = new Set([String(port), ...(options.dev ? ['5174'] : [])]);
  const allowedOrigin = (value: string) => {
    try { const url = new URL(value); return url.protocol === 'http:' && hosts.has(url.hostname) && allowedPorts.has(url.port || '80') && !url.username && !url.password; } catch { return false; }
  };
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!allowedOrigin('http://' + req.get('host'))) { res.status(403).json({ error: { code: 'HOST_REJECTED', message: '请通过本机地址访问。' } }); return; }
    const origin = req.get('origin');
    if (origin && !allowedOrigin(origin)) { res.status(403).json({ error: { code: 'ORIGIN_REJECTED', message: '请求来源不匹配。' } }); return; }
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    if (req.path.startsWith('/learn/api') || req.path.startsWith('/learn/media')) res.set('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) { res.status(415).json({ error: { code: 'JSON_REQUIRED', message: '请求需要 JSON 格式。' } }); return; }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  function sessionFor(req: Request, res: Response): Session {
    const token = /(?:^|;\s*)fablelab_session=([a-f0-9]{64})(?:;|$)/.exec(req.get('cookie') ?? '')?.[1];
    let session = token ? sessions.get(token) : undefined;
    if (!session) {
      if (sessions.size >= 32) throw new GenerationError('SESSION_LIMIT');
      const token = randomBytes(32).toString('hex'), dir = mkdtempSync(join(root, 'session-'));
      const configuration: Configuration = { text: { protocol: initialSettings.text.protocol, baseURL: initialSettings.text.baseURL, model: '', apiKey: '', service: 'openai' }, image: { protocol: initialSettings.image.protocol, baseURL: initialSettings.image.baseURL, model: '', apiKey: '', service: 'openai' }, imageUsesText: initialSettings.imageUsesText };
      session = { token, dir, configuration, imageCapability: 'unknown', textVerified: false, service: null!, touched: Date.now(), operating: false };
      const current = session;
      current.service = new JobService(dir, new ByokProvider(() => current.configuration, options.fetcher, () => { current.imageCapability = 'verified'; }), { retryDelayMs: options.retryDelayMs, maxStageCalls: 2, attemptBudget: 24 });
      sessions.set(token, current);
      res.cookie('fablelab_session', token, { httpOnly: true, sameSite: 'strict', path: '/learn' });
    }
    session.touched = Date.now(); return session;
  }
  app.get('/learn/api/health', (_req, res) => res.json({ status: 'ok', edition: 'byok', version: '0.3.0' }));
  app.get('/learn/api/settings', (req, res) => res.json({ settings: publicSettings(sessionFor(req, res)) }));
  app.post('/learn/api/settings', (req, res) => {
    const session = sessionFor(req, res);
    if (active(session) || session.operating) throw new GenerationError('SETTINGS_BUSY');
    const next = parseConfiguration(req.body, session.configuration);
    if (endpointIdentity(next.text) !== endpointIdentity(session.configuration.text)) session.textVerified = false;
    if (endpointIdentity(next.image) !== endpointIdentity(session.configuration.image)) {
      const identity = endpointIdentity({ ...next.image, model: '' });
      if (session.imageCatalog?.endpoint !== identity) delete session.imageCatalog;
      session.imageCapability = session.imageCatalog?.models.get(next.image.model) ?? 'unknown'; delete session.preview;
    }
    session.configuration = next;
    res.json({ settings: publicSettings(session) });
  });
  app.delete('/learn/api/settings', (req, res) => {
    const session = sessionFor(req, res);
    if (session.operating) throw new GenerationError('SETTINGS_BUSY');
    if (session.currentId) session.service.pause('local', session.currentId);
    session.configuration.text.apiKey = ''; session.configuration.image.apiKey = '';
    session.textVerified = false; session.imageCapability = 'unknown'; delete session.preview; delete session.imageCatalog;
    res.json({ settings: publicSettings(session) });
  });
  app.post('/learn/api/models', async (req, res) => {
    const target = z.enum(['text', 'image']).parse(req.body.target), session = sessionFor(req, res);
    if (session.operating) throw new GenerationError('SETTINGS_BUSY');
    session.operating = true; const operation = new AbortController(); session.operationAbort = operation;
    try {
      const config = session.configuration[target];
      const models = (await listModels(config, target, operation.signal, options.fetcher)).filter(model => !config.apiKey || !JSON.stringify(model).includes(config.apiKey));
      if (target === 'image') {
        session.imageCatalog = { endpoint: endpointIdentity({ ...config, model: '' }), models: new Map(models.map(model => [model.id, model.capability])) };
        if (session.imageCapability !== 'verified') session.imageCapability = models.find(model => model.id === config.model)?.capability ?? 'unknown';
      }
      res.json({ models, settings: publicSettings(session) });
    } finally { session.operating = false; delete session.operationAbort; }
  });
  app.post('/learn/api/probe', async (req, res) => {
    const target = z.enum(['text', 'image']).parse(req.body.target), session = sessionFor(req, res);
    if (active(session) || session.operating) throw new GenerationError('SETTINGS_BUSY');
    session.operating = true; const operation = new AbortController(); session.operationAbort = operation;
    try {
      if (target === 'text') { await probeText(session.configuration.text, operation.signal, options.fetcher); session.textVerified = true; }
      else {
        const image = await requestImage(session.configuration.image, { prompt: 'A single blue ceramic cup on a cream background, quiet ink illustration, no text.' }, operation.signal, options.fetcher);
        session.preview = { bytes: image.bytes, extension: image.extension }; session.imageCapability = 'verified';
      }
      res.json({ settings: publicSettings(session), ...(target === 'image' ? { preview: '/learn/media/probe?t=' + Date.now() } : {}) });
    } finally { session.operating = false; delete session.operationAbort; }
  });
  app.post('/learn/api/operations/cancel', (req, res) => { sessionFor(req, res).operationAbort?.abort(); res.json({ cancelled: true }); });
  app.get('/learn/api/current', (req, res) => {
    const session = sessionFor(req, res); res.json({ job: session.currentId ? session.service.get('local', session.currentId) : null });
  });
  app.post('/learn/api/jobs', (req, res) => {
    const request = z.object({ concept: z.string().trim().min(1).max(120), format: z.enum(['text', 'comic']), clientRequestId: z.string().uuid() }).strict().parse(req.body);
    const session = sessionFor(req, res);
    if (session.operating || (active(session) && session.requestId !== request.clientRequestId)) throw new GenerationError('JOB_ACTIVE');
    if (!session.configuration.text.model) throw new GenerationError('UPSTREAM_NOT_CONFIGURED');
    if (request.format === 'comic' && !session.configuration.image.model) throw new GenerationError('IMAGE_NOT_CONFIGURED');
    if (request.format === 'comic' && session.imageCapability === 'unsupported') throw new GenerationError('IMAGE_NOT_SUPPORTED');
    const job = session.service.create('local', request); session.currentId = job.id; session.requestId = request.clientRequestId;
    res.status(202).json({ job });
  });
  app.get('/learn/api/jobs/:id', (req, res) => {
    const session = sessionFor(req, res), job = session.service.get('local', req.params.id);
    if (!job) { res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: '当前会话没有这份故事。' } }); return; }
    res.json({ job });
  });
  app.post('/learn/api/jobs/:id/:action', (req, res) => {
    const action = z.enum(['pause', 'resume']).parse(req.params.action), session = sessionFor(req, res);
    if (action === 'resume' && (session.operating || (active(session) && session.currentId !== req.params.id))) throw new GenerationError('JOB_ACTIVE');
    res.json({ job: session.service[action]('local', req.params.id) });
  });
  app.get('/learn/media/:name', (req, res) => {
    const session = sessionFor(req, res);
    if (req.params.name === 'probe' && session.preview) { res.type(session.preview.extension === '.png' ? 'png' : 'jpeg').send(session.preview.bytes); return; }
    const file = session.service.media('local', req.params.name);
    if (!file) { res.sendStatus(404); return; }
    res.sendFile(basename(file), { root: dirname(file), cacheControl: false });
  });
  app.use('/learn/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: '此公开版不提供该功能。' } }));
  const dist = resolve(options.distDir);
  if (existsSync(join(dist, 'index.html'))) {
    app.use('/learn', express.static(dist, { index: false }));
    app.use('/fonts', express.static(join(dist, 'fonts')));
    app.get(['/', '/learn', '/learn/', '/in', '/in/'], (_req, res) => res.set('Cache-Control', 'no-cache').sendFile('index.html', { root: dist }));
  }
  app.use((_req, res) => res.sendStatus(404));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const code = error instanceof GenerationError ? error.code : 'INVALID_REQUEST';
    res.status(code === 'JOB_NOT_FOUND' ? 404 : ['SETTINGS_BUSY', 'JOB_ACTIVE'].includes(code) ? 409 : 400).json({ error: { code, message: publicFailure(code) } });
  });
  const remove = (session: Session) => { session.operationAbort?.abort(); session.service.shutdown(); sessions.delete(session.token); const target = resolve(session.dir); if (target.startsWith(resolve(root) + sep)) rmSync(target, { recursive: true, force: true }); };
  const cleanup = setInterval(() => { for (const session of sessions.values()) if (!session.operating && !active(session) && Date.now() - session.touched > 24 * 60 * 60 * 1000) remove(session); }, 60 * 60 * 1000);
  cleanup.unref();
  return { app, close() { clearInterval(cleanup); for (const session of sessions.values()) remove(session); rmSync(root, { recursive: true, force: true }); }, temporaryRoot: root };
}
