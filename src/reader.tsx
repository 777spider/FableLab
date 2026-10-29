import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import type { JobDTO, LearningFormat, TaskDTO } from '../shared/contracts.ts';
import { presetArtSize } from './art.ts';
const readStorage = (key: string) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const saveStorage = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Optional reading position. */ } };
const isDemo = (job: JobDTO) => job.provenance === 'preset';
function FormatSwitch({ format, onChange, disabled = false, comicDisabled = false }: { format: LearningFormat; onChange: (f: LearningFormat) => void; disabled?: boolean; comicDisabled?: boolean }) {
  return <div className="format-switch" role="group" aria-label="阅读方式">{(['text', 'comic'] as const).map(f => <button key={f} type="button" aria-pressed={format === f} disabled={disabled || (f === 'comic' && comicDisabled)} title={f === 'comic' && comicDisabled ? '此读本仅提供文字' : undefined} onClick={() => onChange(f)}>{f === 'text' ? '文字' : '漫画'}</button>)}</div>;
}

function Prose({ text, className = '' }: { text: string; className?: string }) { return <div className={`prose ${className}`}>{text.split(/\n\s*\n|\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>; }

function Question({ task }: { task: TaskDTO }) {
  const [answer, setAnswer] = useState('');
  return <section className="question"><h3>{task.kind === 'comparison' ? '把两个故事放在一起' : task.kind === 'comprehension' ? '回到故事里' : '换一个情境'}</h3><Prose text={task.prompt} /><div className="answer-options">{task.options.map((option, index) => <button type="button" key={option.id} aria-pressed={answer === option.id} onClick={() => setAnswer(option.id)}><span>{String.fromCharCode(65 + index)}</span>{option.text}</button>)}</div>{answer && <div className="answer-feedback" role="status"><strong>{answer === task.correctAnswer ? '这个判断有依据。' : '再看看其中的关系。'}</strong><Prose text={task.explanation} /></div>}</section>;
}

export function Reader({ job, format: requestedFormat, busy = false, onFormat, onAction, readOnly = false, storageScope = 'preset',  }: { job: JobDTO; format: LearningFormat; busy?: boolean; onFormat: (f: LearningFormat) => void; onAction?: (a: 'pause' | 'resume') => void; readOnly?: boolean; storageScope?: string;  }) {
  const comicAvailable = job.storyLength !== 'long' && (job.format === 'comic' || job.stories.some(story => story.pages.some(page => page.image.status === 'ready' && page.image.url)));
  const format = comicAvailable ? requestedFormat : 'text';
  const storageKey = `fable-studio:page:${storageScope}:${job.id}`;
  const [position, setPosition] = useState(() => readStorage(storageKey));
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const focusAfterTurn = useRef(false);
  const pages = job.stories.flatMap((story, si) => story.pages.map((page, pi) => ({ story, si, page, pi, key: `${story.id}/${page.id}` })));
  const index = position === 'lesson' ? pages.length : position === 'discussion' ? pages.length + 1 : Math.max(0, pages.findIndex(p => p.key === position));
  const shown = index < pages.length ? pages[index] : null;
  const currentImage = shown?.page.image.url;
  const nextImage = shown ? pages[index + 1]?.page.image.url : undefined;
  const isLesson = index === pages.length;
  const canNext = index < pages.length - 1 || (!!job.lesson && index < pages.length + 1);
  const choose = (key: string) => {
    if (key === position) return;
    focusAfterTurn.current = true;
    setPosition(key); saveStorage(storageKey, key);
  };
  const turn = (to: number) => choose(to < pages.length ? pages[to].key : to === pages.length ? 'lesson' : 'discussion');
  useLayoutEffect(() => {
    content.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (focusAfterTurn.current) { heading.current?.focus({ preventScroll: true }); focusAfterTurn.current = false; }
  }, [position, format]);
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
      if (document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'ArrowRight' && canNext) { e.preventDefault(); turn(index + 1); }
      if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); turn(index - 1); }
    };
    document.addEventListener('keydown', keys); return () => document.removeEventListener('keydown', keys);
  }, [index, canNext, pages.length]);
  if (pages.length === 0) return <section className="reader-loading"><span className="loading-line" /><span className="loading-line" /><span className="loading-line" /><h2>故事正在成篇。</h2><p>写好的内容会先出现在这里。</p></section>;
  return <section className={`reader reader-${format}`} aria-label="阅读故事">
    <header className="reader-top"><span>{job.concept}{job.provenance === 'preset' && <span className="preset-note">预置示例</span>}</span><div className="reader-tools"><FormatSwitch format={format} onChange={onFormat} disabled={busy} comicDisabled={!comicAvailable} /></div></header>
    {job.provenance !== 'preset' && <p className={`quality-note ${job.quality === 'needs_review' ? 'needs-review' : ''}`} role="status">{job.quality === 'pending' ? '初稿可读，学理复核中' : job.quality === 'needs_review' ? '这份内容仍需复核，请结合教材与原始文献核对。' : '机器初检完成，学术来源待核验'}</p>}
    <div className="reader-navigation">
      <nav className="story-tabs" aria-label="故事目录">{job.stories.map((story, i) => <button type="button" key={story.id} disabled={!story.pages.length} aria-current={shown && shown.si === i ? 'page' : undefined} onClick={() => story.pages[0] && choose(`${story.id}/${story.pages[0].id}`)} title={story.title}>{job.stories.length > 1 && <span>{String(i + 1).padStart(2, '0')}</span>}{story.title}</button>)}</nav>
      <div className="reader-controls">
        <nav className="reader-pagination" aria-label="阅读翻页">
          <button type="button" className="turn-page" disabled={index === 0} onClick={() => turn(index - 1)} aria-label="上一页" title="上一页（←）">←</button>
          <label className="page-picker"><span className="sr-only">跳到某一页</span><select value={shown?.key ?? (isLesson ? 'lesson' : 'discussion')} onChange={event => choose(event.target.value)} title={shown ? `第 ${shown.pi + 1} / ${shown.story.pages.length} 页：${shown.page.title}` : isLesson ? '学术解析' : '讨论与应用'}>{job.stories.map(story => <optgroup key={story.id} label={story.title}>{story.pages.map((page, i) => <option key={page.id} value={`${story.id}/${page.id}`}>{String(i + 1).padStart(2, '0')} / {String(story.pages.length).padStart(2, '0')}</option>)}</optgroup>)}{job.lesson && <optgroup label="故事之后"><option value="lesson">学术解析</option><option value="discussion">讨论应用</option></optgroup>}</select></label>
          <button type="button" className="turn-page" disabled={!canNext} onClick={() => turn(index + 1)} aria-label="下一页" title="下一页（→）">→</button>
        </nav>
        <nav className="notes-tabs" aria-label="解析与讨论"><button type="button" disabled={!job.lesson} aria-current={isLesson ? 'page' : undefined} onClick={() => choose('lesson')} title="学术解析">解</button><button type="button" disabled={!job.lesson} aria-current={index === pages.length + 1 ? 'page' : undefined} onClick={() => choose('discussion')} title="讨论与应用">议</button></nav>
      </div>
    </div>
    <div ref={content} className="reading-content" tabIndex={0} role="region" aria-label="阅读正文">

      {shown ? <article className={`reading-page ${format === 'comic' ? 'comic-page' : 'text-page'}`}>
        <div className="page-heading"><span className="page-sequence">{String(shown.pi + 1).padStart(2, '0')}</span><h1 ref={heading} tabIndex={-1}>{shown.page.title}</h1></div>
        {format === 'comic' && <figure className="comic-frame">
          {currentImage && !failed[currentImage] ? <div className="comic-image" aria-busy={!loaded[currentImage]}><img src={currentImage} {...presetArtSize(currentImage)} decoding="async" fetchPriority="high" alt={shown.page.alt || `${shown.story.title}，${shown.page.title}`} onLoad={() => setLoaded(state => ({ ...state, [currentImage]: true }))} onError={() => setFailed(state => ({ ...state, [currentImage]: true }))} />{!loaded[currentImage] && <p className="comic-loading" role="status">插画加载中…</p>}</div> : <div className="image-waiting" role="status"><p>{readOnly || shown.page.image.status === 'failed' || failed[currentImage || ''] ? '插画暂未显示' : '插画正在路上'}</p>{!readOnly && (currentImage && failed[currentImage] ? <button type="button" onClick={() => { setLoaded(state => ({ ...state, [currentImage]: false })); setFailed(state => ({ ...state, [currentImage]: false })); }}>重新加载</button> : shown.page.image.status === 'failed' && !isDemo(job) ? <button type="button" disabled={busy} onClick={() => onAction?.('resume')}>重试插画</button> : null)}</div>}
        </figure>}
        <Prose text={shown.page.text} /><span className="page-flower" aria-hidden="true">◇</span>
      </article> : isLesson && job.lesson ? <article className="notes-page"><div className="page-heading"><span className="page-sequence">解</span><h1 ref={heading} tabIndex={-1}>故事之后：{job.concept}</h1></div><Prose text={job.lesson.definition} /><h2>关键关系</h2>{job.lesson.principles.map((p, i) => <div className="principle" key={i}><span>{i + 1}</span><Prose text={p} /></div>)}<h2>回到学理</h2><Prose text={job.lesson.academicExplanation} />{job.lesson.mapping.length > 0 && <><h2>在故事里找到依据</h2>{job.lesson.mapping.map((m, i) => <section className="mapping" key={i}><span>{job.stories.find(s => s.id === m.storyId)?.title}</span><blockquote>{m.quote}</blockquote><Prose text={m.explanation} /></section>)}</>}{job.lesson.workedExample && <><h2>换个例子</h2><Prose text={job.lesson.workedExample} /></>}<h2>哪些地方不能照搬</h2>{job.lesson.boundaries.map((p, i) => <Prose text={p} key={i} />)}{job.knowledge && job.knowledge.sources.length > 0 && <><h2>延伸阅读</h2><p className="source-notice">以下书目由模型提供，尚未独立核验。</p><ul className="sources">{job.knowledge.sources.map((s, i) => <li key={i}>{s.url && /^https?:\/\//.test(s.url) ? <a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a> : s.title}<span>{s.authors} · {s.year}</span></li>)}</ul></>}</article> : <article className="notes-page"><div className="page-heading"><span className="page-sequence">议</span><h1 ref={heading} tabIndex={-1}>把理解带到别处。</h1></div>{job.tasks.map(task => <Question key={task.id} task={task} />)}{job.discussion.map((d, i) => <section className="question" key={i}><h3>{d.prompt}</h3><details><summary>展开思路</summary><Prose text={d.guidance} /></details></section>)}{job.tasks.length === 0 && job.discussion.length === 0 && <p>讨论题正在整理，可以先回看故事。</p>}</article>}
    </div>
  </section>;
}
