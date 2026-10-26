import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as Collapsible from '@radix-ui/react-collapsible';
import type { JobDTO, LearningFormat, SessionResponse, ShareDTO, SharedModuleDTO, StoryLength, TaskDTO, UserDTO } from '../shared/contracts';
import { api, ApiError, upsert } from './api';
import { AccountPage, authURL, bookCreationDate, type AuthFields, type AuthView, LibraryView, RecoveryPage, safeReturnTo, SharePanel, UnavailablePage } from './account-views';
import { libraryPresets, preset, presetForDemo, presetURL } from './preset';
import { forestArt, presetArtSize } from './art';
import './fonts.css';
import './styles.css';
import './account.css';

const readStorage = (key: string) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const saveStorage = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Reading remains available without storage. */ } };
const readSession = (key: string) => { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } };
const saveSession = (key: string, value: string) => { try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch { /* Reading remains available without storage. */ } };
const pendingKey = (username: string) => `fable-studio:pending:${username}`;
const draftKey = (username: string) => `fable-studio:draft:${username}`;
type ComposeDraft = { concept: string; format: LearningFormat; storyLength: StoryLength };
type PendingRequest = ComposeDraft & { id: string };
const normalizedLength = (format: LearningFormat, length: unknown): StoryLength => format === 'text' && length === 'long' ? 'long' : 'standard';
const readPending = (username: string): PendingRequest | null => { try { const value = JSON.parse(readSession(pendingKey(username))); return typeof value?.concept === 'string' && typeof value?.id === 'string' && ['text', 'comic'].includes(value?.format) ? { ...value, storyLength: normalizedLength(value.format, value.storyLength) } : null; } catch { return null; } };
function readDraft(username: string): ComposeDraft | null {
  const raw = readSession(draftKey(username));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value?.concept === 'string' && ['text', 'comic'].includes(value?.format)) return { concept: value.concept, format: value.format, storyLength: normalizedLength(value.format, value.storyLength) };
  } catch { /* Older drafts contain only the concept string. */ }
  return { concept: raw, format: 'text', storyLength: 'standard' };
}
function clearPrivateStorage() {
  try {
    localStorage.removeItem('fable-studio:current-job'); localStorage.removeItem('fable-studio:pending-request');
    Object.keys(sessionStorage).filter(key => key.startsWith('fable-studio:')).forEach(key => sessionStorage.removeItem(key));
  } catch { /* Storage may be unavailable. */ }
}
// The previous anonymous UI persisted request details. Only reading positions remain in localStorage.
try { localStorage.removeItem('fable-studio:current-job'); localStorage.removeItem('fable-studio:pending-request'); } catch { /* Optional storage. */ }
const modeFromURL = (): LearningFormat => new URLSearchParams(location.search).get('mode') === 'comic' ? 'comic' : 'text';
const active = (job: JobDTO) => job.status === 'queued' || job.status === 'running';
const isDemo = (job: JobDTO) => libraryPresets.some(item => item.id === job.id);
const label = (job: JobDTO) => job.status === 'paused' ? '已暂停' : job.status === 'failed' ? '等待继续' : active(job) ? '正在生成' : '可阅读';
const publicMessage = (error: unknown) => error instanceof ApiError ? error.message : '连接暂时中断。已保存的故事还在，可以重试。';
const authRequired = (error: unknown) => error instanceof ApiError && error.status === 401 && error.code !== 'ACCESS_CODE_REQUIRED';

function Arrow({ back = false }: { back?: boolean }) { return <span aria-hidden="true" className="arrow">{back ? '←' : '↗'}</span>; }
function Wordmark() { return <a className="wordmark" href="/in" aria-label="FableLab 首页">fable<span>lab</span><i aria-hidden="true">.</i></a>; }

function Header({ user = null, current, publicOnly = false, onLogout }: { user?: UserDTO | null; current?: 'home' | 'studio' | 'library'; publicOnly?: boolean; onLogout?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() { if (busy || !onLogout) return; setBusy(true); setError(''); try { await onLogout(); } catch (e) { setError(publicMessage(e)); } finally { setBusy(false); } }
  return <header className="masthead"><Wordmark /><nav aria-label="主导航"><a className="nav-home" href="/in" aria-current={current === 'home' ? 'page' : undefined}>首页</a>{!publicOnly && <a href="/learn/library" aria-current={current === 'library' ? 'page' : undefined}>我的书架</a>}<a className="nav-start" href="/learn" aria-current={current === 'studio' ? 'page' : undefined}>开始学习 <Arrow /></a>{!publicOnly && (user ? <details className="account-menu"><summary>{user.displayName || user.username}</summary><div className="account-menu-content"><button type="button" disabled={busy} onClick={() => void logout()}>{busy ? '正在退出…' : '退出登录'}</button>{error && <p role="alert">{error}</p>}</div></details> : <a href={authURL()}>登录</a>)}</nav></header>;
}

function Home() {
  return <main id="main" className="home">
    <div className="home-title"><h1>复杂的知识，<br />从故事读懂<span>。</span></h1><p>从你好奇的概念开始。</p></div>
    <div className="entry-grid">
      <a className="entry entry-comic" href="/learn?mode=comic">
        <div className="entry-heading"><h2>读漫画</h2><Arrow /></div>
        <figure><img {...forestArt} alt="四只戴金色面具的动物坐在森林中，互相观察。" /></figure>
        <div className="entry-bottom"><span>让抽象关系，有情节也有画面。</span><span aria-hidden="true">漫画 →</span></div>
      </a>
      <a className="entry entry-text" href="/learn?mode=text">
        <div className="entry-heading"><h2>读文字</h2><Arrow /></div>
        <div className="print-preview" aria-hidden="true"><span className="print-title">故事的另一面</span><p>雾港的早班渡船只有两条，阿澈每天最怕听见码头拐角传来的一串脚步声。</p><p>同样是六个人，光看总数看不出差别，得看到达的先后。</p><span className="print-rule" /><em>从一件具体的事，<br />看到它背后的关系。</em></div>
        <div className="entry-bottom"><span>留一点空白，慢慢想清楚。</span><span aria-hidden="true">文字 →</span></div>
      </a>
    </div>
    <footer className="home-footer"><span>FableLab · 寓言实验室</span><span>故事、学理与新的问题。</span></footer>
  </main>;
}

function FormatSwitch({ format, onChange, disabled = false, comicDisabled = false }: { format: LearningFormat; onChange: (f: LearningFormat) => void; disabled?: boolean; comicDisabled?: boolean }) {
  return <div className="format-switch" role="group" aria-label="阅读方式">{(['text', 'comic'] as const).map(f => <button key={f} type="button" aria-pressed={format === f} disabled={disabled || (f === 'comic' && comicDisabled)} title={f === 'comic' && comicDisabled ? '此读本仅提供文字' : undefined} onClick={() => onChange(f)}>{f === 'text' ? '文字' : '漫画'}</button>)}</div>;
}

function Progress({ job, busy, offline, onAction }: { job: JobDTO; busy: boolean; offline: boolean; onAction: (a: 'pause' | 'resume') => void }) {
  const isActive = active(job);
  const blocked = job.error?.recoverable === false;
  const hasFailedImage = job.stories.some(s => s.pages.some(p => p.image.status === 'failed'));
  if (isDemo(job) || (job.status === 'completed' && !hasFailedImage)) return null;
  const single = job.storyCount === 1;
  const stage = job.phase === 'knowledge' ? '梳理概念' : job.phase === 'story-1' ? single ? '写成一则寓言' : '写第一则故事' : job.phase === 'story-2' ? '写第二则故事' : job.phase === 'lesson' ? '整理解析与讨论' : job.phase === 'images' ? '绘制插画' : '核对故事与学理';
  const steps = single ? [['概念', 'knowledge'], ['寓言', 'story-1'], ['解析', 'lesson'], ['复核', 'review']] : [['概念', 'knowledge'], ['故事一', 'story-1'], ['故事二', 'story-2'], ['解析', 'lesson'], ['复核', 'review']];
  return <section className={`generation ${job.status === 'failed' ? 'generation-stopped' : ''}`} aria-label="生成进度">
    <div className="generation-heading"><span className={isActive && !offline ? 'status-dot pulsing' : 'status-dot'} /><strong>{offline ? '连接中断，内容已保留' : job.status === 'paused' ? '已暂停' : job.status === 'failed' ? '这一步暂时停住了' : job.status === 'completed' ? '部分插画尚未完成' : job.status === 'queued' ? '已排队，等待继续' : job.progress.retrying ? '正在自动重试' : stage}</strong>
      {isActive ? <button type="button" disabled={busy || offline} onClick={() => onAction('pause')}>{busy ? '处理中…' : '暂停'}</button> : <button type="button" disabled={busy || offline || blocked} onClick={() => onAction('resume')}>{busy ? '处理中…' : blocked ? '暂不能继续' : job.error?.code === 'QUALITY_REVIEW_REQUIRED' && job.error.recoverable ? '修复并继续' : hasFailedImage && job.status === 'completed' ? '重试插画' : '继续生成'}</button>}
    </div>
    <ol className="generation-steps">{steps.map(([name, key]) => <li key={key} className={job.progress.completedStages.includes(key) ? 'step-done' : job.phase === key ? 'step-current' : ''}><span aria-hidden="true">{job.progress.completedStages.includes(key) ? '✓' : '·'}</span>{name}</li>)}</ol>
    {job.status === 'failed' || job.status === 'paused' ? <p>已完成的内容可以阅读，继续时从未完成处接上。</p> : job.stories.length > 0 ? <p>文字已经可以读，后续内容会陆续出现。</p> : <p>内容会逐步保存，离开后仍可回来继续。</p>}
  </section>;
}

function Welcome({ format, onDemo }: { format: LearningFormat; onDemo: () => void }) {
  return <section className={`welcome welcome-${format}`}>
    <div className="welcome-heading"><h1>一个概念，<br />可以怎样讲？</h1><span className="welcome-asterisk" aria-hidden="true">*</span></div>
    {format === 'comic' ? <figure className="welcome-illustration"><img {...forestArt} alt="森林中的四只动物戴着相同面具，彼此观察。" /></figure> : <div className="welcome-page"><span className="paper-number" aria-hidden="true">1</span><h2>雾港渡船</h2><p>雾港的早班渡船只有两条，船工阿澈每天最怕听见码头拐角传来的一串脚步声。</p><p>老周把黄铜怀表往桌上一搁：“你干脆把岸边等船的人画成小石子，一趟一趟摆给你看。”</p><span className="paper-end" aria-hidden="true">◇</span></div>}
    <button className="demo-link" type="button" onClick={onDemo}><span>先读一篇<span className="demo-name">《雾港渡船》</span></span><span>预置示例 <Arrow /></span></button>
  </section>;
}

function Prose({ text, className = '' }: { text: string; className?: string }) { return <div className={`prose ${className}`}>{text.split(/\n\s*\n|\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>; }

function Question({ task }: { task: TaskDTO }) {
  const [answer, setAnswer] = useState('');
  return <section className="question"><h3>{task.kind === 'comparison' ? '把两个故事放在一起' : task.kind === 'comprehension' ? '回到故事里' : '换一个情境'}</h3><Prose text={task.prompt} /><div className="answer-options">{task.options.map((option, index) => <button type="button" key={option.id} aria-pressed={answer === option.id} onClick={() => setAnswer(option.id)}><span>{String.fromCharCode(65 + index)}</span>{option.text}</button>)}</div>{answer && <div className="answer-feedback" role="status"><strong>{answer === task.correctAnswer ? '这个判断有依据。' : '再看看其中的关系。'}</strong><Prose text={task.explanation} /></div>}</section>;
}

function Reader({ job, format: requestedFormat, busy = false, onFormat, onAction, readOnly = false, storageScope = 'preset', shareControl, bookArrival = false }: { job: JobDTO; format: LearningFormat; busy?: boolean; onFormat: (f: LearningFormat) => void; onAction?: (a: 'pause' | 'resume') => void; readOnly?: boolean; storageScope?: string; shareControl?: React.ReactNode; bookArrival?: boolean }) {
  const comicAvailable = job.storyLength !== 'long' && (!isDemo(job) || job.stories.some(story => story.pages.some(page => page.image.status === 'ready' && page.image.url)));
  const format = comicAvailable ? requestedFormat : 'text';
  const storageKey = `fable-studio:page:${storageScope}:${job.id}`;
  const [position, setPosition] = useState(() => readStorage(storageKey));
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const pages = job.stories.flatMap((story, si) => story.pages.map((page, pi) => ({ story, si, page, pi, key: `${story.id}/${page.id}` })));
  const index = position === 'lesson' ? pages.length : position === 'discussion' ? pages.length + 1 : Math.max(0, pages.findIndex(p => p.key === position));
  const shown = index < pages.length ? pages[index] : null;
  const currentImage = shown?.page.image.url;
  const nextImage = shown ? pages[index + 1]?.page.image.url : undefined;
  const currentStory = shown?.si ?? 0;
  const isLesson = index === pages.length;
  const canNext = index < pages.length - 1 || (!!job.lesson && index < pages.length + 1);
  const choose = (key: string) => { setPosition(key); saveStorage(storageKey, key); requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = 0; heading.current?.focus({ preventScroll: true }); }); };
  const turn = (to: number) => choose(to < pages.length ? pages[to].key : to === pages.length ? 'lesson' : 'discussion');
  useEffect(() => { if (!position && pages[0]) { setPosition(pages[0].key); saveStorage(storageKey, pages[0].key); } }, [pages[0]?.key]);
  useEffect(() => {
    // Only public preset art may enter the browser's prefetch cache. Private and
    // revocable share media always use their authenticated, no-store routes.
    if (format !== 'comic' || !isDemo(job) || !currentImage || !loaded[currentImage] || !nextImage || !presetArtSize(nextImage)) return;
    const connection = (navigator as Navigator & {connection?: {saveData?: boolean; effectiveType?: string}}).connection;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return;
    const link = document.createElement('link');
    link.rel = 'prefetch'; link.as = 'image'; link.href = nextImage; link.fetchPriority = 'low';
    document.head.append(link);
    return () => link.remove();
  }, [format, job.id, currentImage, !!currentImage && loaded[currentImage], nextImage]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'ArrowRight' && canNext) { e.preventDefault(); turn(index + 1); }
      if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); turn(index - 1); }
    };
    document.addEventListener('keydown', keys); return () => document.removeEventListener('keydown', keys);
  }, [index, canNext, pages.length]);
  if (pages.length === 0) return <section className="reader-loading"><span className="loading-line" /><span className="loading-line" /><span className="loading-line" /><h2>故事正在成篇。</h2><p>写好的内容会先出现在这里。</p></section>;
  return <section className={`reader reader-${format}`} aria-label="阅读故事" data-book-arrival={bookArrival || undefined}>
    <header className="reader-top"><span>{job.concept}{job.provenance === 'preset' && <span className="preset-note">预置示例</span>}</span><div className="reader-tools"><FormatSwitch format={format} onChange={onFormat} disabled={busy} comicDisabled={!comicAvailable} />{shareControl}</div></header>
    {job.provenance !== 'preset' && <p className={`quality-note ${job.quality === 'needs_review' ? 'needs-review' : ''}`} role="status">{job.quality === 'pending' ? '初稿可读，学理复核中' : job.quality === 'needs_review' ? '这份内容仍需复核，请结合教材与原始文献核对。' : '机器初检完成，学术来源待核验'}</p>}
    <nav className="story-tabs" aria-label="故事与学理">{job.stories.map((story, i) => <button type="button" key={story.id} disabled={!story.pages.length} aria-current={shown && shown.si === i ? 'page' : undefined} onClick={() => story.pages[0] && choose(`${story.id}/${story.pages[0].id}`)}>{job.stories.length > 1 && <span>{String(i + 1).padStart(2, '0')}</span>}{story.title}</button>)}<div className="notes-tabs"><button type="button" disabled={!job.lesson} aria-current={isLesson ? 'page' : undefined} onClick={() => choose('lesson')} title="学术解析">解</button><button type="button" disabled={!job.lesson} aria-current={index === pages.length + 1 ? 'page' : undefined} onClick={() => choose('discussion')} title="讨论与应用">议</button></div></nav>
    <div className="reading-scroll" ref={scroll} tabIndex={0} aria-label="当前页内容">
      {shown ? <article className={`reading-page ${format === 'comic' ? 'comic-page' : 'text-page'}`}>
        <div className="page-heading"><span className="page-sequence">{String(shown.pi + 1).padStart(2, '0')}</span><h1 ref={heading} tabIndex={-1}>{shown.page.title}</h1></div>
        {format === 'comic' && <figure className="comic-frame">
          {currentImage && !failed[currentImage] ? <div className="comic-image" aria-busy={!loaded[currentImage]}><img src={currentImage} {...presetArtSize(currentImage)} decoding="async" fetchPriority="high" alt={shown.page.alt || `${shown.story.title}，${shown.page.title}`} onLoad={() => setLoaded(state => ({ ...state, [currentImage]: true }))} onError={() => setFailed(state => ({ ...state, [currentImage]: true }))} />{!loaded[currentImage] && <p className="comic-loading" role="status">插画加载中…</p>}</div> : <div className="image-waiting" role="status"><span aria-hidden="true">{shown.page.image.status === 'failed' || failed[currentImage || ''] ? '↻' : '*'}</span><p>{readOnly || shown.page.image.status === 'failed' || failed[currentImage || ''] ? '插画暂未显示' : '插画正在路上'}</p>{!readOnly && (currentImage && failed[currentImage] ? <button type="button" onClick={() => { setLoaded(state => ({ ...state, [currentImage]: false })); setFailed(state => ({ ...state, [currentImage]: false })); }}>重新加载</button> : shown.page.image.status === 'failed' && !isDemo(job) ? <button type="button" disabled={busy} onClick={() => onAction?.('resume')}>重试插画</button> : null)}</div>}
        </figure>}
        <Prose text={shown.page.text} /><span className="page-flower" aria-hidden="true">◇</span>
      </article> : isLesson && job.lesson ? <article className="notes-page"><div className="page-heading"><span className="page-sequence">解</span><h1 ref={heading} tabIndex={-1}>故事之后：{job.concept}</h1></div><Prose text={job.lesson.definition} /><h2>关键关系</h2>{job.lesson.principles.map((p, i) => <div className="principle" key={i}><span>{i + 1}</span><Prose text={p} /></div>)}<h2>回到学理</h2><Prose text={job.lesson.academicExplanation} />{job.lesson.mapping.length > 0 && <><h2>在故事里找到依据</h2>{job.lesson.mapping.map((m, i) => <section className="mapping" key={i}><span>{job.stories.find(s => s.id === m.storyId)?.title}</span><blockquote>{m.quote}</blockquote><Prose text={m.explanation} /></section>)}</>}{job.lesson.workedExample && <><h2>换个例子</h2><Prose text={job.lesson.workedExample} /></>}<h2>哪些地方不能照搬</h2>{job.lesson.boundaries.map((p, i) => <Prose text={p} key={i} />)}{job.knowledge && job.knowledge.sources.length > 0 && <><h2>延伸阅读</h2><p className="source-notice">以下书目由模型提供，尚未独立核验。</p><ul className="sources">{job.knowledge.sources.map((s, i) => <li key={i}>{s.url && /^https?:\/\//.test(s.url) ? <a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a> : s.title}<span>{s.authors} · {s.year}</span></li>)}</ul></>}</article> : <article className="notes-page"><div className="page-heading"><span className="page-sequence">议</span><h1 ref={heading} tabIndex={-1}>把理解带到别处。</h1></div>{job.tasks.map(task => <Question key={task.id} task={task} />)}{job.discussion.map((d, i) => <section className="question" key={i}><h3>{d.prompt}</h3><details><summary>展开思路</summary><Prose text={d.guidance} /></details></section>)}{job.tasks.length === 0 && job.discussion.length === 0 && <p>讨论题正在整理，可以先回看故事。</p>}</article>}
    </div>
    <footer className="reader-footer"><button type="button" className="turn-page" disabled={index === 0} onClick={() => turn(index - 1)} aria-label="上一页">←</button>{shown ? <nav className="page-numbers" aria-label="逐页目录">{job.stories[currentStory]?.pages.map((page, i) => <button type="button" key={page.id} aria-current={shown.page.id === page.id ? 'page' : undefined} onClick={() => choose(`${job.stories[currentStory].id}/${page.id}`)} aria-label={`第 ${i + 1} 页：${page.title}`}>{i + 1}</button>)}</nav> : <span className="reader-note-position">{isLesson ? '解析' : '讨论与应用'}</span>}<button type="button" className="turn-page" disabled={!canNext} onClick={() => turn(index + 1)} aria-label="下一页">→</button></footer>
  </section>;
}

function prepareActiveStorage(username: string) {
  const guestDraft = readSession(draftKey('guest'));
  try { Object.keys(sessionStorage).filter(key => key.startsWith('fable-studio:') && key !== pendingKey(username) && key !== draftKey(username)).forEach(key => sessionStorage.removeItem(key)); } catch { /* Optional storage. */ }
  if (guestDraft && !readSession(draftKey(username))) saveSession(draftKey(username), guestDraft);
}

function AuthController({ onSession, onRecovery }: { onSession: (state: SessionResponse) => void; onRecovery: (value: { code: string; username: string; returnTo: string }) => void }) {
  const params = new URLSearchParams(location.search);
  const requested = params.get('view');
  const view: AuthView = requested === 'register' || requested === 'recover' ? requested : 'login';
  const returnTo = safeReturnTo(params.get('returnTo'), '/learn/library');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(action: AuthView, fields: AuthFields) {
    setBusy(true); setError('');
    try {
      const username = fields.username.toLowerCase();
      const result = action === 'register' ? await api.register({ code: fields.invitationCode, username, password: fields.password }) : action === 'recover' ? await api.recover(username, fields.recoveryCode, fields.password) : await api.login(username, fields.password);
      if (!result.user) throw new Error('Missing authenticated user');
      prepareActiveStorage(result.user.username); onSession(result);
      if (result.recoveryCode) onRecovery({ code: result.recoveryCode, username: result.user.username, returnTo });
      else location.assign(returnTo);
    } catch (e) { setError(publicMessage(e)); }
    finally { setBusy(false); }
  }
  return <AccountPage key={view} view={view} returnTo={returnTo} busy={busy} error={error} onSubmit={submit} />;
}

function PrivateEntry({ expired = false }: { expired?: boolean }) {
  return <main id="main" className="private-entry"><img {...forestArt} alt="森林里，四只动物安静地围坐着。" /><div><h1>{expired ? '再登录，接着读。' : '把好奇，收进自己的书架。'}</h1><p>{expired ? '登录已过期，原来的故事仍在你的书架。' : '登录后生成故事，换一台设备也可以继续。'}</p><div className="private-entry-links"><a className="button primary" href={authURL('login')}>登录 <Arrow /></a><a href={authURL('register')}>创建书架</a></div></div></main>;
}

function PageLoading() { return <main id="main" className="public-reading"><section className="reader-loading" aria-label="正在连接" aria-busy="true"><span className="loading-line" /><span className="loading-line" /><span className="loading-line" /></section></main>; }

type ShelfReturn = { x: number; y: number; bookId: string };

function LibraryController({ user, legacyCount, onSession, onAuthLost, onOpenBook, restorePosition }: { user: UserDTO; legacyCount: number; onSession: (state: SessionResponse) => void; onAuthLost: () => void; onOpenBook: (job: JobDTO) => void; restorePosition: ShelfReturn | null }) {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false; setLoading(true); setError('');
    api.jobs().then(result => { if (!cancelled) setJobs(result.jobs); }).catch(e => { if (cancelled) return; if (authRequired(e)) { setJobs([]); onAuthLost(); } else setError(publicMessage(e)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.username, refresh]);
  useEffect(() => {
    if (loading || !restorePosition) return;
    const frame = requestAnimationFrame(() => {
      const book = Array.from(document.querySelectorAll<HTMLAnchorElement>('.library-book')).find(link => link.dataset.bookId === restorePosition.bookId);
      book?.focus({ preventScroll: true });
      window.scrollTo({ left: restorePosition.x, top: restorePosition.y, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, restorePosition]);
  async function importRecords() {
    if (importing) return;
    setImporting(true); setError(''); setNotice('');
    try { const result = await api.importLegacy(); onSession(result); setNotice('本机记录已加入你的书架。'); setRefresh(value => value + 1); }
    catch (e) { if (authRequired(e)) onAuthLost(); else setError(publicMessage(e)); }
    finally { setImporting(false); }
  }
  return <><LibraryView jobs={jobs} loading={loading} error={error} legacyCount={legacyCount} importing={importing} onImport={() => void importRecords()} onRetry={() => setRefresh(value => value + 1)} onOpenBook={onOpenBook} />{notice && <p className="library-import-notice" role="status">{notice}</p>}</>;
}

function Studio({ user, onAuthLost, initialJob = null, bookArrival = false }: { user: UserDTO | null; onAuthLost: () => void; initialJob?: JobDTO | null; bookArrival?: boolean }) {
  const username = user?.username || 'guest';
  const params = new URLSearchParams(location.search);
  const [draft, setDraft] = useState<ComposeDraft>(() => {
    const pending = readPending(username);
    if (pending) return { concept: pending.concept, format: pending.format, storyLength: pending.storyLength };
    const saved = readDraft(username) || readDraft('guest');
    const explicitMode = !params.has('job') && !params.has('demo') && params.has('mode');
    const format = explicitMode ? modeFromURL() : saved?.format || modeFromURL();
    return { concept: saved?.concept || '', format, storyLength: normalizedLength(format, explicitMode && params.has('storyLength') ? params.get('storyLength') : saved?.storyLength) };
  });
  const { concept, format: composeFormat, storyLength } = draft;
  const [format, setFormat] = useState<LearningFormat>(() => initialJob?.format || modeFromURL());
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [job, setJob] = useState<JobDTO | null>(() => { if (initialJob && (user || isDemo(initialJob))) return initialJob; const example = presetForDemo(params.get('demo')); return example ? { ...example, format: modeFromURL() } : null; });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [share, setShare] = useState<ShareDTO | null>(null);
  const [shareKnown, setShareKnown] = useState(false);
  const [shareRefresh, setShareRefresh] = useState(0);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareNotice, setShareNotice] = useState('');
  const mutation = useRef(false);
  const shareMutation = useRef(false);
  const requestKey = useRef<PendingRequest | null>(readPending(username));
  const pollGeneration = useRef(0);
  const selectedJob = useRef(job?.id || '');
  const shareTrigger = useRef<HTMLButtonElement>(null);
  const shareContent = useRef<HTMLDivElement>(null);
  const shareNeedsFocus = useRef(false);
  const beforeShare = useRef<{ x: number; y: number; jobId: string } | null>(null);
  useEffect(() => { saveSession(draftKey(username), JSON.stringify(draft)); }, [username, draft]);
  function updateDraft(patch: Partial<ComposeDraft>) {
    const next = { ...draft, ...patch }; next.storyLength = normalizedLength(next.format, next.storyLength); setDraft(next);
    if (!job && (patch.format || patch.storyLength)) {
      const url = new URL(location.href); url.searchParams.set('mode', next.format);
      if (next.storyLength === 'long') url.searchParams.set('storyLength', 'long'); else url.searchParams.delete('storyLength');
      history.replaceState(history.state, '', url);
    }
  }
  function changeShareOpen(open: boolean) {
    if (open && !sharing && job) { beforeShare.current = { x: window.scrollX, y: window.scrollY, jobId: job.id }; shareNeedsFocus.current = true; }
    setSharing(open);
  }
  useLayoutEffect(() => {
    const returnPosition = beforeShare.current;
    if (!sharing && !returnPosition) return;
    const frame = requestAnimationFrame(() => {
      if (sharing) {
        const panel = shareContent.current;
        if (!panel) return;
        if (shareNeedsFocus.current) { panel.querySelector<HTMLHeadingElement>('#share-title')?.focus({ preventScroll: true }); shareNeedsFocus.current = false; }
        const bounds = panel.getBoundingClientRect();
        if (bounds.top < 0 || bounds.bottom > window.innerHeight) panel.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      } else {
        beforeShare.current = null; shareNeedsFocus.current = false;
        if (!returnPosition || returnPosition.jobId !== job?.id) return;
        window.scrollTo({ left: returnPosition.x, top: returnPosition.y, behavior: 'auto' });
        shareTrigger.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [sharing, job?.id, shareLoading]);
  function lostAuth() { ++pollGeneration.current; selectedJob.current = ''; setJob(null); setJobs([]); setShare(null); setSharing(false); onAuthLost(); }
  function updateURL(next: JobDTO) {
    const url = new URL(location.href); url.searchParams.set('mode', next.format); url.searchParams.delete('storyLength');
    if (isDemo(next)) { url.searchParams.delete('job'); url.searchParams.set('demo', next.id === preset.id ? '1' : 'education-xai'); }
    else { url.searchParams.delete('demo'); url.searchParams.set('job', next.id); }
    history.replaceState(history.state, '', url);
  }
  const accept = (next: JobDTO) => {
    if (selectedJob.current !== next.id) { setSharing(false); setShare(null); setShareKnown(false); setShareError(''); setShareNotice(''); }
    setJob(next); setFormat(next.format); setJobs(list => isDemo(next) ? list : upsert(list, next)); selectedJob.current = next.id; updateURL(next);
  };
  useEffect(() => {
    if (!user) return;
    prepareActiveStorage(user.username);
    let cancelled = false;
    const id = params.get('job');
    const verify = <T,>(request: Promise<T>) => request.catch(e => { if (!cancelled && authRequired(e)) lostAuth(); throw e; });
    Promise.allSettled([verify(api.jobs()), id ? verify(api.job(id)) : Promise.resolve(null)] as const).then(([list, current]) => {
      if (cancelled) return;
      if ((list.status === 'rejected' && authRequired(list.reason)) || (current.status === 'rejected' && authRequired(current.reason))) { lostAuth(); return; }
      if (list.status === 'fulfilled') setJobs(list.value.jobs); else setError(publicMessage(list.reason));
      if (current.status === 'fulfilled' && current.value) accept(current.value.job);
      else if (current.status === 'rejected') { if (current.reason instanceof ApiError && [403, 404].includes(current.reason.status)) { selectedJob.current = ''; setJob(null); } setError(publicMessage(current.reason)); }
    });
    return () => { cancelled = true; };
  }, [user?.username]);
  useEffect(() => {
    const online = () => { setOffline(false); setRefreshKey(key => key + 1); };
    const off = () => setOffline(true);
    window.addEventListener('online', online); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    if (!job || isDemo(job) || !user) return;
    const token = ++pollGeneration.current; const id = job.id;
    let timer: ReturnType<typeof setTimeout>; let cancelled = false;
    async function poll() {
      try {
        const result = await api.job(id);
        if (cancelled || token !== pollGeneration.current || selectedJob.current !== id) return;
        setOffline(false); setJob(result.job); setJobs(list => upsert(list, result.job));
        if (active(result.job)) timer = setTimeout(poll, 2500);
      } catch (e) {
        if (cancelled || token !== pollGeneration.current) return;
        if (authRequired(e)) { lostAuth(); return; }
        if (e instanceof ApiError && e.status === 404) { setJob(null); setError(publicMessage(e)); return; }
        setOffline(true); timer = setTimeout(poll, 7000);
      }
    }
    if (active(job) || offline || refreshKey) timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [job?.id, job?.status, user?.username, refreshKey]);
  useEffect(() => {
    if (!sharing || !job || isDemo(job) || !user) return;
    let cancelled = false; const id = job.id;
    setShareLoading(true); setShareKnown(false); setShareError(''); setShareNotice('');
    api.share(id).then(result => { if (!cancelled && selectedJob.current === id) { setShare(result.share); setShareKnown(true); } }).catch(e => { if (cancelled) return; if (authRequired(e)) lostAuth(); else setShareError(publicMessage(e)); }).finally(() => { if (!cancelled) setShareLoading(false); });
    return () => { cancelled = true; };
  }, [sharing, job?.id, shareRefresh]);
  async function mutate(action: () => Promise<void>) {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (e) { if (authRequired(e)) lostAuth(); else setError(publicMessage(e)); }
    finally { mutation.current = false; setBusy(false); }
  }
  function changeFormat(next: LearningFormat) {
    if (next === format || busy || (next === 'comic' && job?.storyLength === 'long')) return;
    if (!job || isDemo(job)) { setFormat(next); if (job) accept({ ...job, format: next }); else { const url = new URL(location.href); url.searchParams.set('mode', next); history.replaceState(null, '', url); } }
    else void mutate(async () => { const result = await api.format(job.id, next); accept(result.job); });
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault(); if (!concept.trim() || offline) return;
    if (!user) { saveSession(draftKey('guest'), JSON.stringify(draft)); location.assign(authURL('login', `/learn?${new URLSearchParams({ mode: composeFormat, storyLength })}`)); return; }
    await mutate(async () => {
      const value = concept.trim();
      if (requestKey.current?.concept !== value || requestKey.current.format !== composeFormat || requestKey.current.storyLength !== storyLength) requestKey.current = { concept: value, format: composeFormat, storyLength, id: crypto.randomUUID() };
      saveSession(pendingKey(username), JSON.stringify(requestKey.current));
      const result = await api.create(value, composeFormat, requestKey.current.id, storyLength); accept(result.job); requestKey.current = null; saveSession(pendingKey(username), ''); setDraft(current => ({ ...current, concept: '' }));
    });
  }
  const performAction = (action: 'pause' | 'resume') => { if (job && user) void mutate(async () => { const result = await api.action(job.id, action); accept(result.job); setRefreshKey(key => key + 1); }); };
  const openJob = (item: JobDTO) => { if (busy || shareBusy || item.id === job?.id) return; if (isDemo(item)) { accept(item); return; } void mutate(async () => { const result = await api.job(item.id); accept(result.job); }); };
  async function changeSharing(action: 'publish' | 'revoke') {
    if (shareMutation.current || !shareKnown || !job || isDemo(job) || !user) return;
    const id = job.id; shareMutation.current = true; setShareBusy(true); setShareError(''); setShareNotice('');
    try {
      const result = action === 'publish' ? await api.publishShare(id) : await api.revokeShare(id);
      if (selectedJob.current !== id) return;
      setShare(result.share); setShareKnown(true); setShareNotice(action === 'publish' ? '只读链接已发布。' : '已撤销分享，原链接与插画已关闭。');
    } catch (e) { if (authRequired(e)) lostAuth(); else { setShareKnown(false); setShareError(publicMessage(e)); } }
    finally { shareMutation.current = false; setShareBusy(false); }
  }
  if (!user && params.get('job')) return <PrivateEntry />;
  return <main id="main" className="studio">
    <aside className="workspace">
      <div className="compose"><h1>今天，想读懂什么？</h1><form onSubmit={generate}><label className="sr-only" htmlFor="concept">想了解的概念</label><textarea id="concept" value={concept} onChange={e => updateDraft({ concept: e.target.value })} rows={3} maxLength={120} placeholder="熵、贝叶斯推断、机会成本…" required disabled={busy} /><div className="compose-bottom"><FormatSwitch format={composeFormat} onChange={next => updateDraft({ format: next })} disabled={busy} /><button className="button primary" disabled={busy || offline || !concept.trim()}>{busy ? '处理中…' : user ? '生成故事' : '登录后生成'}<Arrow /></button></div>{composeFormat === 'text' && <div className="story-length-row"><div className="story-length-switch" role="group" aria-label="文字篇幅">{(['standard', 'long'] as const).map(length => <button type="button" key={length} aria-pressed={storyLength === length} disabled={busy} onClick={() => updateDraft({ storyLength: length })}>{length === 'long' ? '长篇' : '标准'}</button>)}</div>{storyLength === 'long' && <span>8–16页</span>}</div>}</form>
      {!job && <div className="concept-suggestions">{['沉没成本', '机制识别', '涌现'].map(value => <button key={value} type="button" onClick={() => { updateDraft({ concept: value }); document.getElementById('concept')?.focus(); }}>{value} ↗</button>)}</div>}</div>
      {job && <Progress job={job} busy={busy} offline={offline} onAction={performAction} />}
      {offline && !job && <p className="form-error" role="status">当前离线。恢复连接后可以继续生成。</p>}
      {error && <div className="workspace-error" role="alert"><p>{error}</p><button type="button" onClick={() => setError('')}>收起</button></div>}
      {user ? <section className="bookshelf"><div className="shelf-heading"><h2><a href="/learn/library">我的书架 <Arrow /></a></h2><span>{jobs.length + libraryPresets.length}</span></div><div className="shelf-list">{[...libraryPresets, ...jobs.filter(item => !isDemo(item))].slice(0, 5).map((item, i) => <button type="button" key={item.id} className={`shelf-item ${job?.id === item.id ? 'selected' : ''}`} disabled={busy || shareBusy} onClick={() => openJob(item)}><span className="shelf-index">{String(i + 1).padStart(2, '0')}</span><span><strong>{item.stories[0]?.title || item.concept}</strong><small>{bookCreationDate(item.createdAt)}{item.format === 'comic' ? ' 作画' : ' 写下'}{item.status !== 'completed' && ` · ${label(item)}`}</small></span><span aria-hidden="true">↗</span></button>)}</div></section> : <p className="guest-compose-note"><a href={authURL('register')}>创建自己的书架</a>，故事下次接着读。</p>}
      <button type="button" className="workspace-demo" onClick={() => accept({ ...preset, format: composeFormat })} disabled={busy || shareBusy}>预置示例《雾港渡船》 <Arrow /></button>
    </aside>
    {job ? <Collapsible.Root open={sharing} onOpenChange={changeShareOpen} asChild><div className={`reading-workspace ${sharing ? 'with-share' : ''}`}><Reader key={job.id} job={job} format={format} busy={busy} onFormat={changeFormat} onAction={performAction} storageScope={isDemo(job) ? 'preset' : username} bookArrival={bookArrival} shareControl={user && !isDemo(job) ? <Collapsible.Trigger asChild><button ref={shareTrigger} type="button" className="reader-share-button" disabled={shareBusy}>分享</button></Collapsible.Trigger> : undefined} /><Collapsible.Content ref={shareContent} className="share-disclosure"><SharePanel job={job} share={share} known={shareKnown} loading={shareLoading || (!shareKnown && !shareError)} busy={shareBusy} error={shareError} notice={shareNotice} onCreate={() => void changeSharing('publish')} onRevoke={() => void changeSharing('revoke')} onReload={() => { setShareError(''); setShareKnown(false); setShareRefresh(value => value + 1); }} onClose={() => changeShareOpen(false)} /></Collapsible.Content></div></Collapsible.Root> : <div className="reading-workspace"><Welcome format={composeFormat} onDemo={() => accept({ ...preset, format: composeFormat })} /></div>}
  </main>;
}

function readableShare(shared: SharedModuleDTO, token: string): JobDTO {
  return {
    ...shared, id: `shared-${token}`, status: 'completed', phase: 'complete', storyCount: shared.stories.length === 1 ? 1 : 2, updatedAt: shared.createdAt,
    stories: shared.stories.map(story => ({ ...story, characters: story.characters.map(character => ({ name: character.name, visualDesign: '' })) })),
    error: null, progress: { completedStages: [], stageLabel: '', elapsedMs: 0, etaMs: null, attempts: 0, attemptBudget: 0 },
  };
}

function PublicSharePage({ token }: { token: string }) {
  const [job, setJob] = useState<JobDTO | null>(null);
  const [format, setFormat] = useState<LearningFormat>(modeFromURL);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'connection'>('loading');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false; let loading = false;
    async function load() {
      if (loading) return; loading = true;
      try {
        const result = await api.publicShare(token); if (cancelled) return;
        setJob(readableShare(result.shared, token)); setFormat(current => new URLSearchParams(location.search).has('mode') ? current : result.shared.format); setState('ready');
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 404 || e.status === 410)) { setJob(null); setState('unavailable'); }
        else setState(previous => previous === 'ready' ? previous : 'connection');
      } finally { loading = false; }
    }
    void load();
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', visible); };
  }, [token, refresh]);
  function changeFormat(next: LearningFormat) { setFormat(next); const url = new URL(location.href); url.searchParams.set('mode', next); history.replaceState(null, '', url); }
  return <><Header publicOnly />{state === 'loading' ? <PageLoading /> : state === 'unavailable' ? <UnavailablePage kind="share" /> : !job ? <UnavailablePage kind="connection" onRetry={() => setRefresh(value => value + 1)} /> : <main id="main" className="public-reading"><Reader key={job.id} job={job} format={format} onFormat={changeFormat} readOnly storageScope="public" /></main>}</>;
}

function OwnerPreviewPage({ user, onAuthLost }: { user: UserDTO; onAuthLost: () => void }) {
  const id = new URLSearchParams(location.search).get('job') || '';
  const [job, setJob] = useState<JobDTO | null>(null);
  const [format, setFormat] = useState<LearningFormat>(modeFromURL);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.job(id).then(result => { if (!cancelled) { setJob(result.job); setFormat(modeFromURL()); } }).catch(e => { if (cancelled) return; if (authRequired(e)) onAuthLost(); else setError(true); });
    return () => { cancelled = true; };
  }, [id, user.username]);
  return <><Header publicOnly />{error ? <UnavailablePage kind="connection" onRetry={() => location.reload()} /> : !job ? <PageLoading /> : <main id="main" className="public-reading is-preview"><div className="share-preview-notice"><span>访客预览</span><a href={`/learn?${new URLSearchParams({ job: id, mode: format })}`}>返回我的读本 <Arrow back /></a></div><Reader key={job.id} job={job} format={format} onFormat={setFormat} readOnly storageScope={`${user.username}:preview`} /></main>}</>;
}

function SessionApp() {
  const [route, setRoute] = useState(0);
  const [openedBook, setOpenedBook] = useState<JobDTO | null>(null);
  const [bookArrival, setBookArrival] = useState(false);
  const [shelfReturn, setShelfReturn] = useState<ShelfReturn | null>(null);
  const navigation = useRef<{ transition: ViewTransition | null; timer: number } | null>(null);
  const path = location.pathname.replace(/\/$/, '') || '/';
  const home = path === '/' || path === '/in';
  const auth = path === '/learn/auth';
  const library = path === '/learn/library';
  const preview = new URLSearchParams(location.search).get('preview') === 'share';
  const [session, setSession] = useState<SessionResponse>({ user: null, legacyImportCount: 0 });
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [expired, setExpired] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [recovery, setRecovery] = useState<{ code: string; username: string; returnTo: string } | null>(null);
  function cancelBookTransition() {
    const pending = navigation.current; navigation.current = null;
    if (pending) { window.clearTimeout(pending.timer); pending.transition?.skipTransition(); }
    delete document.documentElement.dataset.bookTransition;
  }
  useEffect(() => {
    const back = () => {
      cancelBookTransition(); setBookArrival(false); setOpenedBook(null);
      const saved = history.state?.fableShelfReturn;
      setShelfReturn(saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && typeof saved.bookId === 'string' ? saved : null);
      setRoute(value => value + 1);
    };
    window.addEventListener('popstate', back);
    return () => { window.removeEventListener('popstate', back); cancelBookTransition(); };
  }, []);
  function openBook(book: JobDTO) {
    if (navigation.current || !session.user) return;
    const pending = { transition: null as ViewTransition | null, timer: 0 }; navigation.current = pending;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let committed = false;
    const commit = () => {
      if (committed || navigation.current !== pending) return;
      committed = true;
      history.replaceState({ ...history.state, fableShelfReturn: { x: scrollX, y: scrollY, bookId: book.id } }, '');
      const href = isDemo(book) ? presetURL(book) : `/learn?${new URLSearchParams({ job: book.id, mode: book.format })}`;
      history.pushState({ fableBook: true }, '', href);
      flushSync(() => { setOpenedBook(book); setBookArrival(!reduce); setShelfReturn(null); setRoute(value => value + 1); });
      const heading = document.querySelector<HTMLHeadingElement>('.reader .page-heading h1');
      const reader = document.querySelector<HTMLElement>('.reader');
      const bounds = heading?.getBoundingClientRect();
      if (bounds && (bounds.top < 0 || bounds.bottom > innerHeight - 30)) reader?.scrollIntoView({ block: 'start', behavior: 'auto' });
      heading?.focus({ preventScroll: true });
    };
    const done = () => {
      if (navigation.current !== pending) return;
      window.clearTimeout(pending.timer); navigation.current = null;
      delete document.documentElement.dataset.bookTransition; setBookArrival(false);
    };
    if (reduce) { commit(); done(); return; }
    if (typeof document.startViewTransition === 'function') {
      document.documentElement.dataset.bookTransition = 'native';
      try {
        pending.transition = document.startViewTransition(commit);
        pending.transition.ready.catch(() => {});
        pending.transition.finished.then(done, () => { commit(); done(); });
        pending.timer = window.setTimeout(() => { pending.transition?.skipTransition(); commit(); done(); }, 390);
        return;
      } catch { /* Same-page reading remains available if snapshots cannot start. */ }
    }
    document.documentElement.dataset.bookTransition = 'fallback'; commit();
    pending.timer = window.setTimeout(done, 170);
  }
  useEffect(() => {
    let cancelled = false; setChecking(true); setSessionError('');
    api.session().then(result => { if (!cancelled) setSession(result); }).catch(e => { if (!cancelled) setSessionError(publicMessage(e)); }).finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [refresh]);
  function authLost() { cancelBookTransition(); setOpenedBook(null); setBookArrival(false); setSession({ user: null, legacyImportCount: 0 }); setExpired(true); setRecovery(null); }
  async function logout() { await api.logout(); cancelBookTransition(); setOpenedBook(null); clearPrivateStorage(); setSession({ user: null, legacyImportCount: 0 }); setRecovery(null); location.replace('/in'); }
  if (preview && session.user && !checking) return <OwnerPreviewPage key={session.user.username} user={session.user} onAuthLost={authLost} />;
  return <><Header user={session.user} current={home ? 'home' : library ? 'library' : !auth ? 'studio' : undefined} onLogout={logout} />
    {sessionError && <div className="account-banner" role="status">{sessionError}<button type="button" onClick={() => setRefresh(value => value + 1)}>重新连接</button></div>}
    {recovery ? <RecoveryPage code={recovery.code} username={recovery.username} returnTo={recovery.returnTo} /> : home ? <Home /> : auth ? <AuthController onSession={setSession} onRecovery={setRecovery} /> : checking ? <PageLoading /> : (library || preview) && !session.user ? <PrivateEntry expired={expired} /> : library && session.user ? <LibraryController key={session.user.username} user={session.user} legacyCount={session.legacyImportCount} onSession={setSession} onAuthLost={authLost} onOpenBook={openBook} restorePosition={shelfReturn} /> : <Studio key={`${session.user?.username || 'guest'}:${route}`} user={session.user} onAuthLost={authLost} initialJob={openedBook} bookArrival={bookArrival} />}
  </>;
}

function App() {
  const sharePath = /^\/learn\/s\/([^/]+)\/?$/.exec(location.pathname);
  return <><a className="skip-link" href="#main">跳到内容</a>{sharePath ? <PublicSharePage token={sharePath[1]} /> : <SessionApp />}</>;
}

createRoot(document.getElementById('root')!).render(<App />);
