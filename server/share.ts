import {randomBytes, createHash} from 'node:crypto';
import {mkdirSync, openSync, closeSync, chmodSync, readFileSync, writeFileSync, existsSync, unlinkSync, rmdirSync, lstatSync, realpathSync} from 'node:fs';
import {join, resolve, dirname, basename, relative} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {JobDTO, SharedModuleDTO, ShareDTO, KnowledgeDTO, LessonDTO, TaskDTO} from '../shared/contracts.ts';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const IMAGE = /^[a-f0-9]{64}\.(png|jpg)$/;
interface ShareRow {id: string; token: string; created_at: string; snapshot_json: string; media_json: string;}

export class ShareError extends Error {
  constructor(public code: 'NOT_SHAREABLE' | 'SHARE_MEDIA_INVALID' | 'SHARE_FAILED') {super(code);}
}

function knowledge(value: KnowledgeDTO | null): KnowledgeDTO | null {
  if (!value) return null;
  return {
    concept: value.concept, definition: value.definition, coreRelations: value.coreRelations.map(text => text),
    prerequisites: value.prerequisites.map(text => text), misconceptions: value.misconceptions.map(text => text),
    academicUse: value.academicUse, searchTerms: value.searchTerms.map(text => text),
    sources: value.sources.map(source => ({title: source.title, authors: source.authors, year: source.year,
      ...(/^https?:\/\//.test(source.url ?? '') ? {url: source.url} : {}), verificationStatus: 'unverified'})),
  };
}

function lesson(value: LessonDTO): LessonDTO {
  return {definition: value.definition, principles: value.principles.map(text => text), academicExplanation: value.academicExplanation,
    mapping: value.mapping.map(item => ({storyId: item.storyId, paragraphId: item.paragraphId, quote: item.quote, relation: item.relation, explanation: item.explanation})),
    boundaries: value.boundaries.map(text => text), workedExample: value.workedExample};
}

function task(value: TaskDTO): TaskDTO {
  return {id: value.id, kind: value.kind, prompt: value.prompt, options: value.options.map(option => ({id: option.id, text: option.text})),
    correctAnswer: value.correctAnswer, explanation: value.explanation};
}

/** Only an owner can publish. Public readers receive a frozen, enumerated projection. */
export class ShareService {
  private db: DatabaseSync;
  private directory: string;

  constructor(dataDirectory: string) {
    mkdirSync(dataDirectory, {recursive: true, mode: 0o700});
    const file = join(dataDirectory, 'accounts.sqlite');
    closeSync(openSync(file, 'a', 0o600)); chmodSync(file, 0o600);
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, job_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL, revoked_at TEXT, snapshot_json TEXT NOT NULL, media_json TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS shares_active_job ON shares(owner, job_id) WHERE revoked_at IS NULL;`);
    this.directory = join(dataDirectory, 'shares');
    mkdirSync(this.directory, {recursive: true, mode: 0o700});
  }

  private dto(row: Pick<ShareRow, 'token' | 'created_at'>): ShareDTO {return {url: '/learn/s/' + row.token, createdAt: row.created_at};}
  private active(token: string): ShareRow | undefined {
    if (!TOKEN.test(token)) return undefined;
    return this.db.prepare('SELECT id, token, created_at, snapshot_json, media_json FROM shares WHERE token = ? AND revoked_at IS NULL').get(token) as unknown as ShareRow | undefined;
  }

  status(owner: string, jobId: string): ShareDTO | null {
    const row = this.db.prepare('SELECT token, created_at FROM shares WHERE owner = ? AND job_id = ? AND revoked_at IS NULL').get(owner, jobId) as Pick<ShareRow, 'token' | 'created_at'> | undefined;
    return row ? this.dto(row) : null;
  }

  publish(owner: string, job: JobDTO, resolveMedia: (name: string) => string | null): ShareDTO {
    const existing = this.status(owner, job.id);
    if (existing) return existing;
    if (job.status !== 'completed' || job.quality !== 'checked' || !job.lesson || !job.stories.length) throw new ShareError('NOT_SHAREABLE');
    const id = randomBytes(16).toString('hex'), token = randomBytes(32).toString('base64url'), createdAt = new Date().toISOString();
    const root = join(this.directory, id), mediaDirectory = join(root, 'media'), names = new Set<string>();
    mkdirSync(mediaDirectory, {recursive: true, mode: 0o700});
    const cleanup = () => {
      for (const name of names) try {unlinkSync(join(mediaDirectory, name));} catch {}
      try {rmdirSync(mediaDirectory);} catch {}
      try {rmdirSync(root);} catch {}
    };
    try {
      const snapshot: SharedModuleDTO = {
        concept: job.concept, format: job.format, createdAt: job.createdAt,
        stories: job.stories.map(story => ({
          id: story.id, title: story.title, sourceDomain: story.sourceDomain, text: story.text,
          characters: story.characters.map(character => ({name: character.name})),
          paragraphs: story.paragraphs.map(paragraph => ({id: paragraph.id, text: paragraph.text})),
          pages: story.pages.map(page => {
            let image: {status: 'ready' | 'failed'; url?: string} = {status: 'failed'};
            const name = /^\/learn\/media\/([a-f0-9]{64}\.(?:png|jpg))$/.exec(page.image.url ?? '')?.[1];
            if (page.image.status === 'ready' && name) {
              const source = resolveMedia(name);
              if (source && existsSync(source)) {
                const bytes = readFileSync(source);
                if (createHash('sha256').update(bytes).digest('hex') !== name.slice(0, 64)) throw new ShareError('SHARE_MEDIA_INVALID');
                if (!names.has(name)) {names.add(name); writeFileSync(join(mediaDirectory, name), bytes, {mode: 0o600, flag: 'wx'});}
                image = {status: 'ready', url: '/learn/api/public/shares/' + token + '/media/' + name};
              }
            }
            return {id: page.id, title: page.title, text: page.text, alt: page.alt, paragraphIds: page.paragraphIds.map(value => value), image};
          }),
        })),
        knowledge: knowledge(job.knowledge), lesson: lesson(job.lesson), tasks: job.tasks.map(task),
        discussion: job.discussion.map(item => ({prompt: item.prompt, guidance: item.guidance})),
        quality: 'checked', provenance: job.provenance,
      };
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const concurrent = this.status(owner, job.id);
        if (concurrent) {this.db.exec('COMMIT'); cleanup(); return concurrent;}
        this.db.prepare('INSERT INTO shares(id, owner, job_id, token, created_at, snapshot_json, media_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, owner, job.id, token, createdAt, JSON.stringify(snapshot), JSON.stringify([...names]));
        this.db.exec('COMMIT');
      } catch (error) {this.db.exec('ROLLBACK'); throw error;}
      return {url: '/learn/s/' + token, createdAt};
    } catch (error) {cleanup(); throw error instanceof ShareError ? error : new ShareError('SHARE_FAILED');}
  }

  revoke(owner: string, jobId: string) {
    const row = this.db.prepare('SELECT id, media_json FROM shares WHERE owner = ? AND job_id = ? AND revoked_at IS NULL').get(owner, jobId) as {id: string; media_json: string} | undefined;
    this.db.prepare('UPDATE shares SET revoked_at = ? WHERE owner = ? AND job_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), owner, jobId);
    if (row) this.cleanupRevoked(row);
  }

  private cleanupRevoked(row: {id: string; media_json: string}) {
    // The token is already revoked. Cleanup is deliberately confined and best effort.
    try {
      if (!/^[a-f0-9]{32}$/.test(row.id)) return;
      const names: unknown = JSON.parse(row.media_json);
      if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || !IMAGE.test(name))) return;
      const base = resolve(this.directory), root = resolve(base, row.id), media = resolve(root, 'media');
      if (dirname(root) !== base || dirname(media) !== root) return;
      for (const directory of [base, root, media]) {const info = lstatSync(directory); if (info.isSymbolicLink() || !info.isDirectory()) return;}
      const realBase = realpathSync(base), realMedia = realpathSync(media);
      if (relative(realBase, realMedia) !== join(row.id, 'media')) return;
      for (const name of names as string[]) {
        try {
          const path = resolve(media, name);
          if (dirname(path) !== media) continue;
          const info = lstatSync(path);
          if (info.isSymbolicLink() || !info.isFile()) continue;
          const realPath = realpathSync(path);
          if (dirname(realPath) !== realMedia || basename(realPath) !== name) continue;
          unlinkSync(path);
        } catch {}
      }
      try {rmdirSync(media);} catch {}
      try {rmdirSync(root);} catch {}
    } catch {}
  }

  read(token: string): SharedModuleDTO | null {
    const row = this.active(token);
    if (!row) return null;
    try {return JSON.parse(row.snapshot_json) as SharedModuleDTO;} catch {throw new ShareError('SHARE_FAILED');}
  }

  media(token: string, name: string): string | null {
    if (!IMAGE.test(name)) return null;
    const row = this.active(token);
    if (!row || !/^[a-f0-9]{32}$/.test(row.id)) return null;
    let names: unknown;
    try {names = JSON.parse(row.media_json);} catch {return null;}
    if (!Array.isArray(names) || !names.includes(name)) return null;
    const path = join(this.directory, row.id, 'media', name);
    return existsSync(path) ? path : null;
  }

  close() {this.db.close();}
}
