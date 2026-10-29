import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ArrowUpRight, Download, Settings2, LoaderCircle, Pause, Play, ChevronDown } from 'lucide-react';
import type { JobDTO, LearningFormat } from '../shared/contracts.ts';
import { initialSettings, type Settings } from '../shared/byok.ts';
import { Reader } from './reader.tsx';
import { ApiSettings } from './api-settings.tsx';
import { liteApi } from './lite-api.ts';
import { forestArt } from './art.ts';
import { preset } from './preset.ts';
import './styles.css';
const active = (job: JobDTO | null) => !!job && ['queued', 'running'].includes(job.status);
const message = (error: unknown) => error instanceof Error ? error.message : '连接暂时中断，请重试。';
function download(job: JobDTO) {
  const text = ['# ' + job.concept, ...job.stories.flatMap(story => ['## ' + story.title, story.text]), ...(job.lesson ? ['## 解', job.lesson.definition, ...job.lesson.principles, job.lesson.academicExplanation, ...job.lesson.mapping.map(mapping => '> ' + mapping.quote + '\n\n' + mapping.explanation), '### 使用边界', ...job.lesson.boundaries, job.lesson.workedExample] : []), '## 议', ...job.tasks.flatMap(task => [task.prompt, ...task.options.map(option => option.id + '. ' + option.text), '参考答案：' + task.correctAnswer, task.explanation]), ...job.discussion.flatMap(item => [item.prompt, item.guidance]), '---', 'FableLab · 生成内容及模型提供的书目须另行核验。'].join('\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = job.concept.replace(/[<>:"/\\|?*]/g, '').slice(0, 60) + '.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [settings, setSettings] = useState<Settings>(initialSettings), [settingsOpen, setSettingsOpen] = useState(false);
  const [concept, setConcept] = useState(''), [format, setFormat] = useState<LearningFormat>('text'), [readingFormat, setReadingFormat] = useState<LearningFormat>('text');
  const [job, setJob] = useState<JobDTO | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [offline, setOffline] = useState(false), [composerOpen, setComposerOpen] = useState(false);
  const pending = useRef<{ concept: string; format: LearningFormat; id: string } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // The first response sets the anonymous isolation cookie before the next request.
        const result = await liteApi.settings(); if (!alive) return; setSettings(result.settings);
        const current = await liteApi.current(); if (!alive) return;
        if (current.job) { setJob(current.job); setReadingFormat(current.job.format); setFormat(current.job.format); setConcept(current.job.concept); }
      } catch (failure) { if (alive) setError(message(failure)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!job || job.provenance === 'preset' || !active(job)) return;
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const id = job.id;
    async function poll() {
      try {
        const result = await liteApi.job(id); if (!alive) return;
        setJob(result.job); setOffline(false);
        if (!active(result.job)) { const config = await liteApi.settings(); if (alive) setSettings(config.settings); return; }
      } catch { if (alive) setOffline(true); }
      if (alive) timer = setTimeout(() => void poll(), 2000);
    }
    timer = setTimeout(() => void poll(), 900);
    return () => { alive = false; clearTimeout(timer); };
  }, [job?.id, job?.status]);
  async function generate() {
    if (busy || loading || !concept.trim()) return;
    if (!settings.text.model || (format === 'comic' && !settings.image.model)) { setSettingsOpen(true); return; }
    setBusy(true); setError('');
    if (!pending.current || pending.current.concept !== concept.trim() || pending.current.format !== format) pending.current = { concept: concept.trim(), format, id: crypto.randomUUID() };
    try { const result = await liteApi.create(pending.current.concept, format, pending.current.id); setJob(result.job); setReadingFormat(format); pending.current = null; setComposerOpen(false); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  async function action(action: 'pause' | 'resume') {
    if (!job || busy) return; setBusy(true); setError('');
    try { const result = await liteApi.action(job.id, action); setJob(result.job); setOffline(false); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  const running = active(job), failedImages = job?.format === 'comic' && job.stories.some(story => story.pages.some(page => page.image.status === 'failed'));
  const showProgress = job && job.provenance !== 'preset' && (job.status !== 'completed' || failedImages);
  function example() { if (running || busy) return; setJob({ ...preset, format }); setReadingFormat(format); setComposerOpen(false); setError(''); }
  return <>
    <a className="skip-link" href="#main">跳到正文</a>
    <header className="lite-header"><a className="wordmark" href="/learn" aria-label="FableLab 首页">fable<span>lab</span><i>.</i></a><span className="edition-label">寓言实验室 · 开源版</span><nav aria-label="主导航"><a className="group-link" href="https://aiecnu.site" target="_blank" rel="noreferrer">课题组 <ArrowUpRight size={14} /></a><a className="github-link" href="https://github.com/777spider/FableLab" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14} /></a><button type="button" className="settings-trigger" disabled={loading} onClick={() => setSettingsOpen(true)}><span className={`status-dot ${settings.text.model ? 'ready' : ''}`} /><Settings2 size={16} /><span>API 设置</span></button></nav></header>
    <main id="main" className={`lite-layout ${job ? 'has-reader' : ''}`}>
      <aside className={`creator ${composerOpen ? 'creator-open' : ''}`} aria-label="故事创作"><button type="button" className="mobile-compose-toggle" aria-expanded={composerOpen} onClick={() => setComposerOpen(value => !value)}><span>{running ? '生成中 · ' + job?.progress.stageLabel : job?.status === 'paused' ? '已暂停 · 展开继续' : job ? '再写一个故事' : '开始创作'}</span><ChevronDown size={17} /></button>
        <div className="creator-content"><span className="eyebrow">A DIFFERENT WAY TO UNDERSTAND</span><h1>把一个概念，<br />放进故事里<span>。</span></h1><p className="creator-intro">从一件具体的事，<br />看见背后的关系。</p>
          <div className="mode-selector" role="group" aria-label="生成版本">{(['text', 'comic'] as const).map(mode => <button type="button" key={mode} aria-pressed={format === mode} onClick={() => setFormat(mode)}><span>{mode === 'text' ? '文字故事' : '漫画故事'}</span><small>{mode === 'text' ? 'READ BETWEEN THE LINES' : 'THINK IN PICTURES'}</small></button>)}</div>
          <label className="concept-label" htmlFor="concept">今天，想读懂什么？</label><textarea id="concept" value={concept} maxLength={120} rows={3} placeholder="例如：机会成本、贝叶斯推断、认知失调……" onChange={event => setConcept(event.target.value)} />
          <button type="button" className="generate-button" disabled={busy || loading || running || !concept.trim()} onClick={() => void generate()}>{busy ? '正在连接…' : `生成${format === 'text' ? '文字' : '漫画'}故事`}{busy ? <LoaderCircle size={19} className="spin" /> : <ArrowRight size={20} />}</button>
          <p className="generation-hint">{format === 'comic' ? '一则故事，4–6 张插画，再读「解」与「议」。' : '一则故事，再读「解」与「议」。'}<br />生成使用你自己的 API 额度。</p>
          <button type="button" className="service-summary" disabled={loading} onClick={() => setSettingsOpen(true)}><span className="status-dot" /><span>{settings.text.model ? `文字 · ${settings.text.model}` : '先连接你自己的 AI 服务'}{format === 'comic' && settings.image.model && <small>生图 · {settings.image.model}</small>}</span><ArrowUpRight size={15} /></button>
          {showProgress && <section className="generation-progress" aria-label="生成进度"><div><span className={`status-dot ${running ? 'pulsing' : ''}`} /><strong>{offline ? '连接中断，正在重连' : job.status === 'paused' ? '已暂停' : job.status === 'failed' ? '这一步需要再看看' : failedImages && job.status === 'completed' ? '部分插画尚未完成' : job.progress.stageLabel}</strong><button type="button" disabled={busy || job.error?.recoverable === false} onClick={() => void action(running ? 'pause' : 'resume')}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? '暂停' : '继续'}</button></div><ol>{[['概念', 'knowledge'], ['故事', 'story-1'], ['解析', 'lesson'], ['复核', 'review']].map(([title, stage]) => <li key={stage} className={job.progress.completedStages.includes(stage) ? 'done' : ''}>{title}</li>)}</ol><p>{job.error?.message || (job.progress.retry ? '等待自动重试。已有内容仍可阅读。' : '可先读已写好的内容。本地服务运行期间，关闭页面也会继续。')}</p></section>}
          {error && <p className="error app-error" role="alert">{error}</p>}
          <div className="creator-bottom"><button type="button" className="text-button" disabled={running || busy} onClick={example}>先读一个示例 <ArrowUpRight size={15} /></button>{job?.stories.length ? <button type="button" className="text-button" onClick={() => download(job)}><Download size={14} /> 导出文字</button> : null}</div>
        </div>
        <footer className="creator-footer"><span>你的好奇，自己的节奏。</span><span>FABLELAB / 02</span></footer>
      </aside>
      <div className="reading-desk">{job ? <Reader key={job.id} job={job} format={readingFormat} onFormat={setReadingFormat} onAction={action} busy={busy} readOnly={job.provenance === 'preset'} storageScope="local" /> : <section className={`opening opening-${format}`} aria-label="故事预览"><div className="opening-caption"><span>THE ART OF MAKING SENSE</span><span>一处安静的理解空间</span></div><div className="opening-grid"><div className="opening-copy"><span className="opening-number">01 / 故事的另一面</span><h2>有些道理，<br />先走进故事，<br />再慢慢懂得。</h2><p>船为什么总在拥挤？<br />同一件事，为何有不同的选择？<br />把抽象的关系，放回有人的情境。</p><button type="button" className="sample-button" disabled={loading} onClick={example}>翻开《雾港渡船》<ArrowRight size={18} /></button></div><figure className="opening-art"><img {...forestArt} alt="四只戴着金色面具的动物，安静地坐在森林里。" fetchPriority="high" /><figcaption><span>看见故事</span><span>也看见关系</span></figcaption></figure></div><div className="opening-footer"><span>故事 → 学理 → 新的问题</span><span>文字 / 漫画</span></div></section>}</div>
    </main>
    {settingsOpen && <ApiSettings settings={settings} locked={running} onSaved={setSettings} onClose={() => setSettingsOpen(false)} />}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
