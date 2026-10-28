import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JobDTO, ShareDTO } from '../shared/contracts';
import { forestArt, lighthouseArt } from './art';
import { libraryPresets, presetURL } from './preset';
import { bookCoverDesign, newestBooks, openingExcerpt } from './books';

export type AuthView = 'login' | 'register' | 'recover';
export type AuthFields = { username: string; password: string; invitationCode: string; recoveryCode: string };

export function safeReturnTo(value: string | null, fallback = '/learn'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || !/^\/learn(?:\/|\?|$)/.test(value) || url.pathname === '/learn/auth') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

export function authURL(view: AuthView = 'login', returnTo = `${location.pathname}${location.search}`) {
  return `/learn/auth?${new URLSearchParams({ view, returnTo: safeReturnTo(returnTo) })}`;
}

function Arrow() { return <span aria-hidden="true" className="arrow">↗</span>; }

export function AccountPage({ view, returnTo, busy, error, onSubmit }: {
  view: AuthView; returnTo: string; busy: boolean; error: string;
  onSubmit: (view: AuthView, fields: AuthFields) => Promise<void>;
}) {
  const [fields, setFields] = useState<AuthFields>({ username: '', password: '', invitationCode: '', recoveryCode: '' });
  const [visible, setVisible] = useState(false);
  const [localError, setLocalError] = useState('');
  const locked = useRef(false);
  const changingPassword = view !== 'login';
  const title = view === 'register' ? '给好奇心留个书架。' : view === 'recover' ? '找回你的书架。' : '回来，接着读。';
  const update = (key: keyof AuthFields, value: string) => setFields(old => ({ ...old, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current || busy) return;
    const passwordLength = Array.from(fields.password).length;
    if (changingPassword && (passwordLength < 6 || passwordLength > 128)) { setLocalError('密码请用6至128个字符，可以是一句好记的话。'); return; }
    locked.current = true; setLocalError('');
    try { await onSubmit(view, { ...fields, username: fields.username.trim(), invitationCode: fields.invitationCode.trim(), recoveryCode: fields.recoveryCode.trim() }); }
    finally { locked.current = false; }
  }
  const message = localError || error;
  return <main id="main" className="account-page">
    <aside className="account-art"><img {...lighthouseArt} alt="暮色海岸上的灯塔，灯光照向海面。" /><div><p>故事会记得，<br />你读到的那一页。</p><a href="/learn?demo=1">先读一篇故事 <Arrow /></a></div></aside>
    <section className="account-form" aria-labelledby="account-title">
      <nav className="account-tabs" aria-label="账户操作"><a href={authURL('login', returnTo)} aria-current={view === 'login' ? 'page' : undefined}>登录</a><a href={authURL('register', returnTo)} aria-current={view === 'register' ? 'page' : undefined}>注册</a></nav>
      <h1 id="account-title">{title}</h1>
      <form onSubmit={submit} aria-describedby={message ? 'account-error' : undefined}>
        <div className="field"><label htmlFor="username">用户名</label><input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={fields.username} onChange={e => update('username', e.target.value)} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" disabled={busy} aria-describedby={view === 'register' ? 'username-hint' : undefined} />{view === 'register' && <p className="field-hint" id="username-hint">3至24位字母、数字或下划线。</p>}</div>
        {view === 'recover' && <div className="field"><label htmlFor="recovery-code">恢复码</label><input id="recovery-code" name="recovery-code" autoComplete="off" autoCapitalize="none" spellCheck={false} value={fields.recoveryCode} onChange={e => update('recoveryCode', e.target.value)} required maxLength={128} disabled={busy} /></div>}
        <div className="field"><label htmlFor="password">{view === 'recover' ? '新密码' : '密码'}</label><div className="password-control"><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete={changingPassword ? 'new-password' : 'current-password'} value={fields.password} onChange={e => update('password', e.target.value)} required maxLength={512} disabled={busy} aria-describedby={changingPassword ? 'password-hint' : undefined} /><button type="button" className="password-toggle" aria-label={visible ? '隐藏密码' : '显示密码'} aria-pressed={visible} onClick={() => setVisible(!visible)} disabled={busy}>{visible ? '隐藏' : '显示'}</button></div>{changingPassword && <p className="field-hint" id="password-hint">6至128个字符，可以是一句好记的话。</p>}</div>
        {view === 'register' && <div className="field"><label htmlFor="invitation-code">开发访问码</label><input id="invitation-code" name="invitation-code" inputMode="numeric" autoComplete="off" value={fields.invitationCode} onChange={e => update('invitationCode', e.target.value)} required maxLength={64} disabled={busy} /></div>}
        {message && <p className="form-error" role="alert" id="account-error">{message}</p>}
        <button type="submit" className="button primary account-submit" disabled={busy}>{busy ? '请稍候…' : view === 'register' ? '创建书架' : view === 'recover' ? '重设密码' : '登录'}<Arrow /></button>
      </form>
      {view === 'login' ? <a className="account-recover" href={authURL('recover', returnTo)}>忘记密码？使用恢复码</a> : view === 'recover' ? <a className="account-recover" href={authURL('login', returnTo)}>回到登录</a> : null}
    </section>
  </main>;
}

export function RecoveryPage({ code, username, returnTo }: { code: string; username: string; returnTo: string }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copyError, setCopyError] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setCopyError(''); }
    catch { setCopyError('可以选中恢复码，手动复制。'); }
  }
  function download() {
    const blob = new Blob([`FableLab\n用户名：${username}\n恢复码：${code}\n\n请妥善保存，不要向他人提供此恢复码。\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'FableLab-recovery.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main id="main" className="recovery-page"><div className="recovery-emblem" aria-hidden="true">f.</div><h1>先收好这把钥匙。</h1><p>忘记密码时，用它找回书架。恢复码只在此展示一次。</p><section className="recovery-code" aria-label="恢复码"><span>{username}</span><code>{code}</code><div><button type="button" onClick={copy}>{copied ? '已复制' : '复制恢复码'}</button><button type="button" onClick={download}>保存到文件</button></div></section>{copyError && <p className="form-error" role="status">{copyError}</p>}<label className="saved-code"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />我已妥善保存恢复码</label><a className={`button primary ${!saved ? 'disabled-link' : ''}`} href={saved ? returnTo : undefined} aria-disabled={!saved} tabIndex={saved ? 0 : -1}>继续 <Arrow /></a></main>;
}

function currentStatus(job: JobDTO) {
  if (job.status === 'paused') return '已暂停';
  if (job.status === 'failed') return job.error?.recoverable === false ? '生成中断' : '等待继续';
  if (job.status === 'running' || job.status === 'queued') return job.progress.stageLabel || '正在生成';
  return '';
}

export function bookCreationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('.');
}

export function LibraryView({ jobs, loading, error, legacyCount, importing, onImport, onRetry, onOpenBook }: {
  jobs: JobDTO[]; loading: boolean; error: string; legacyCount: number; importing: boolean;
  onImport: () => void; onRetry: () => void; onOpenBook: (job: JobDTO) => void;
}) {
  const books = newestBooks([...libraryPresets, ...jobs.filter(job => !libraryPresets.some(example => example.id === job.id))]);
  const [openingId, setOpeningId] = useState('');
  const opening = useRef<{ animations: Animation[]; timer: number; navigating: boolean } | null>(null);
  useEffect(() => {
    const cancel = () => {
      const pending = opening.current; opening.current = null;
      if (pending) { window.clearTimeout(pending.timer); pending.animations.forEach(animation => animation.cancel()); }
    };
    const reset = () => { cancel(); setOpeningId(''); };
    window.addEventListener('pageshow', reset); window.addEventListener('pagehide', reset);
    return () => { window.removeEventListener('pageshow', reset); window.removeEventListener('pagehide', reset); cancel(); };
  }, []);
  function openBook(event: React.MouseEvent<HTMLAnchorElement>, job: JobDTO) {
    const link = event.currentTarget;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    if (opening.current) { event.preventDefault(); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { event.preventDefault(); onOpenBook(job); return; }
    const cover = link.querySelector<HTMLElement>('.book-cover');
    const face = link.querySelector<HTMLElement>('.book-cover-face');
    if (!cover?.animate || !face?.animate) { event.preventDefault(); onOpenBook(job); return; }
    const animations: Animation[] = [];
    try {
      const timing: KeyframeAnimationOptions = { duration: 170, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' };
      animations.push(cover.animate([{ transform: getComputedStyle(cover).transform }, { transform: 'translateY(-9px) rotate(-.8deg)', offset: .35 }, { transform: 'translateY(-9px) rotate(-.8deg)' }], timing));
      const turn = face.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(0deg)', offset: .3 }, { transform: 'rotateY(-38deg)' }], timing);
      animations.push(turn);
      const pending = { animations, timer: 0, navigating: false };
      const navigate = () => {
        if (opening.current !== pending || pending.navigating) return;
        pending.navigating = true; window.clearTimeout(pending.timer);
        cover.style.viewTransitionName = 'fable-open-book';
        onOpenBook(job);
      };
      pending.timer = window.setTimeout(navigate, 190);
      opening.current = pending;
      turn.finished.then(navigate, navigate);
      setOpeningId(job.id); event.preventDefault();
    } catch {
      if (opening.current?.animations === animations) { window.clearTimeout(opening.current.timer); opening.current = null; }
      animations.forEach(animation => animation.cancel());
      event.preventDefault(); onOpenBook(job);
    }
  }
  return <main id="main" className="library-page"><div className="library-heading"><h1>我的书架<span>{books.length}</span></h1><a className="button primary" href="/learn">新故事 <Arrow /></a></div>
    {legacyCount > 0 && <section className="legacy-import"><p>这台浏览器里，还有{legacyCount}份以前的阅读记录。</p><button type="button" disabled={importing} onClick={onImport}>{importing ? '正在导入…' : '导入本机记录'} <Arrow /></button></section>}
    {error && <div className="library-error" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>重新连接</button></div>}
    {books.length > 0 ? <div className="book-grid" aria-busy={loading || undefined}>{books.map((job, index) => <LibraryBook key={job.id} job={job} index={index} opening={openingId === job.id} onOpen={openBook} />)}</div> : loading ? <div className="book-grid book-grid-loading" aria-label="正在加载书架" aria-busy="true">{[0, 1, 2].map(n => <div className="book-placeholder" key={n}><div /><span /></div>)}</div> : <div className="empty-library"><figure><img {...forestArt} alt="森林里，动物们正围坐着观察彼此。" /></figure><div><h2>书架还空着，<br />好奇心已经到了。</h2><a href="/learn">从一个概念开始 <Arrow /></a><a className="empty-demo" href="/learn?demo=1">或先翻翻《雾港渡船》</a></div></div>}
  </main>;
}

function CoverPrint({ motif }: { motif: ReturnType<typeof bookCoverDesign>['motif'] }) {
  return <svg className={`cover-print print-${motif}`} viewBox="0 0 210 105" aria-hidden="true" focusable="false">
    {motif === 'orbit' ? <>
      <circle className="print-wash" cx="132" cy="44" r="43" />
      <path className="print-solid" d="M24 95V49a43 43 0 0 1 86 0v46H24Z" />
      <path className="print-line" d="M36 96V49a31 31 0 0 1 62 0v47M48 96V49a19 19 0 0 1 38 0v47M60 96V49a7 7 0 0 1 14 0v47M16 96h177M155 11v80M149 77h13" />
    </> : motif === 'fold' ? <>
      <path className="print-wash" d="M47 10h135L145 96H10Z" />
      <path className="print-solid" d="M47 10 145 96H10Z" />
      <path className="print-paper" d="m47 10 36 86h62Z" />
      <path className="print-line" d="m58 17 126 79M89 11l97 67M120 11l66 46M151 11l35 24M14 100h180" />
    </> : <>
      <circle className="print-wash" cx="146" cy="37" r="34" />
      <path className="print-solid" d="M18 75c28-34 57-34 88-5s61 29 87-2v32H18Z" />
      <path className="print-line" d="M18 26c31-25 57-20 88 7s59 26 87-2M18 38c31-25 57-20 88 7s59 26 87-2M18 50c31-25 57-20 88 7s59 26 87-2M18 62c31-25 57-20 88 7s59 26 87-2" />
      <path className="print-paper-line" d="M25 90c29-23 51-18 80 1s53 13 78-6" />
    </>}
  </svg>;
}

function CoverExcerpt({ excerpt }: { excerpt: string }) {
  const area = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const box = area.current, heading = text.current;
    if (!box || !heading) return;
    let frame = 0, disposed = false;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed || !box.clientWidth || !box.clientHeight) return;
        const lines = Math.max(1, Math.floor(box.clientHeight / parseFloat(getComputedStyle(heading).lineHeight)));
        heading.style.setProperty('--cover-excerpt-lines', String(lines));
      });
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(box); window.addEventListener('resize', fit);
    fit();
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', fit); };
  }, [excerpt]);
  return <div className="book-excerpt-space" ref={area}><p className="book-excerpt" ref={text}>{excerpt || '故事正在成篇。'}</p></div>;
}

function LibraryBook({ job, index, opening, onOpen }: { job: JobDTO; index: number; opening: boolean; onOpen: (event: React.MouseEvent<HTMLAnchorElement>, job: JobDTO) => void }) {
  const [failedCover, setFailedCover] = useState(false);
  const cover = job.format === 'comic' && !failedCover && job.stories.flatMap(s => s.pages).find(p => p.image.status === 'ready' && p.image.url)?.image.url;
  const title = job.stories[0]?.title || job.concept;
  const status = currentStatus(job);
  const shape = ['tall', 'compact', 'medium'][index % 3];
  const design = bookCoverDesign(job.id);
  const date = bookCreationDate(job.createdAt);
  const href = job.provenance === 'preset' ? presetURL(job) : `/learn?${new URLSearchParams({ job: job.id, mode: job.format })}`;
  return <a className={`library-book book-${shape} ${cover ? 'has-cover' : 'paper-cover'} cover-${design.tone} ${opening ? 'is-opening' : ''}`} data-book-id={job.id} href={href} onClick={event => onOpen(event, job)}><div className="book-cover" aria-hidden="true"><div className="book-pages" /><div className="book-cover-face">{cover ? <img src={cover} alt="" loading="lazy" onError={() => setFailedCover(true)} /> : <div className="type-cover"><span className="cover-imprint">fablelab.</span><CoverPrint motif={design.motif} /><CoverExcerpt excerpt={openingExcerpt(job)} /></div>}{date && <time className="book-date" dateTime={job.createdAt}>{date} {job.format === 'comic' ? '作画' : '写下'}</time>}<span className="book-open">翻开 ↗</span></div></div><div className="book-details"><h2>{title}</h2><p>{job.concept}{status && <span>{status}</span>}</p></div></a>;
}

export function SharePanel({ job, share, known, loading, busy, error, notice, onCreate, onRevoke, onReload, onClose }: {
  job: JobDTO; share: ShareDTO | null; known: boolean; loading: boolean; busy: boolean; error: string; notice: string;
  onCreate: () => void; onRevoke: () => void; onReload: () => void; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const title = job.stories[0]?.title || job.concept;
  useEffect(() => { setCopied(false); setCopyError(''); }, [share?.url]);
  async function copy(link: ShareDTO) {
    try { await navigator.clipboard.writeText(new URL(link.url, location.origin).href); setCopied(true); setCopyError(''); }
    catch { setCopyError('请选中链接，手动复制。'); }
  }
  return <section className="share-panel" aria-labelledby="share-title"><div className="share-panel-heading"><h2 id="share-title" tabIndex={-1}>分享这本故事</h2><button className="close-panel" type="button" onClick={onClose} aria-label="收起分享设置">×</button></div><div className="share-preview"><span className="share-preview-mark" aria-hidden="true">f.</span><div><h3>{title}</h3><span>{job.concept}</span></div><a href={`/learn?${new URLSearchParams({ job: job.id, preview: 'share', mode: job.format })}`} target="_blank" rel="noreferrer">访客预览 ↗</a></div><p className="share-explanation">持链接者可阅读这份故事、解和议。</p>
    {loading ? <p className="share-state" role="status">正在读取分享状态…</p> : !known ? <div className="share-unknown"><p className="share-state" role="alert">暂时未能读取分享状态</p><button type="button" disabled={busy} onClick={onReload}>重新读取</button></div> : share ? <div className="share-links"><div className="share-link"><a className="published-preview" href={share.url} target="_blank" rel="noreferrer">打开分享页 <Arrow /></a><label className="sr-only" htmlFor="published-share">分享链接</label><input id="published-share" value={new URL(share.url, location.origin).href} readOnly onFocus={event => event.currentTarget.select()} /><div><button type="button" disabled={busy} onClick={() => void copy(share)}>{copied ? '已复制' : '复制链接'}</button><button type="button" className="revoke-share" disabled={busy || !known} onClick={onRevoke}>撤销分享</button></div></div></div> : <p className="share-state">目前只有你可以阅读。</p>}
    {((known && error) || copyError) && <p className="form-error" role="alert">{known && error || copyError}</p>}
    {notice && <p className="share-notice" role="status">{notice}</p>}
    {!loading && (!known || !share) && <button type="button" className="button primary publish-share" disabled={!known || busy || job.status !== 'completed' || job.quality !== 'checked' || !job.lesson || job.stories.length === 0} onClick={onCreate}>{busy ? '处理中…' : '发布只读链接'} <Arrow /></button>}
    {!loading && known && (share ? <p className="share-footnote">已发布的内容保持不变，撤销后可发布新版本。</p> : job.status !== 'completed' || job.quality !== 'checked' ? <p className="share-footnote">生成与复核完成后可以发布。</p> : <p className="share-footnote">只发布此刻的内容。</p>)}
  </section>;
}

export function UnavailablePage({ kind, onRetry }: { kind: 'share' | 'connection'; onRetry?: () => void }) {
  return <main id="main" className="unavailable-page"><span className="unavailable-mark" aria-hidden="true">f.</span><h1>{kind === 'share' ? '这一页，暂时合上了。' : '连接暂时停了一下。'}</h1><p>{kind === 'share' ? '分享链接已撤销，或无法找到。' : '内容还在，重新连接后可以接着读。'}</p>{kind === 'connection' && onRetry && <button type="button" className="button primary" onClick={onRetry}>重新连接 <Arrow /></button>}<a href="/in">回到寓言实验室 <Arrow /></a></main>;
}
