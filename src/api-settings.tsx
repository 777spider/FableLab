import { useEffect, useRef, useState } from 'react';
import { X, ArrowUpRight, Check, LoaderCircle } from 'lucide-react';
import { capabilityLabels, textProtocols, imageProtocols, type Settings, type Target, type ModelChoice, type PublicEndpoint } from '../shared/byok.ts';
import { liteApi } from './lite-api.ts';
type Draft = PublicEndpoint & { apiKey: string };
const draft = (endpoint: PublicEndpoint): Draft => ({ ...endpoint, apiKey: '' });
export function ApiSettings({ settings, locked, onSaved, onClose }: { settings: Settings; locked: boolean; onSaved: (value: Settings) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelled = useRef(false);
  const [fields, setFields] = useState({ text: draft(settings.text), image: draft(settings.image) });
  const [models, setModels] = useState<Record<Target, ModelChoice[]>>({ text: [], image: [] });
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState('');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { setFields({ text: draft(settings.text), image: draft(settings.image) }); }, [settings]);
  function update(target: Target, patch: Partial<Draft>) {
    setFields(value => {
      const serviceChanged = (patch.baseURL !== undefined && patch.baseURL !== value[target].baseURL) || (patch.protocol !== undefined && patch.protocol !== value[target].protocol);
      return { ...value, [target]: { ...value[target], ...patch, ...(serviceChanged ? { apiKey: '', hasKey: false } : {}) } };
    });
    setNotice(''); setError(''); if (target === 'image') setPreview('');
    if (patch.baseURL !== undefined || patch.protocol !== undefined) setModels(value => ({ ...value, [target]: [] }));
  }
  async function save(): Promise<Settings> {
    const endpoint = (value: Draft) => ({ protocol: value.protocol, baseURL: value.baseURL, model: value.model, ...(value.apiKey.trim() ? { apiKey: value.apiKey.trim() } : value.hasKey ? {} : { apiKey: '' }) });
    const result = await liteApi.save({ text: endpoint(fields.text), image: endpoint(fields.image) });
    onSaved(result.settings); return result.settings;
  }
  async function perform(action: 'save' | 'models' | 'probe' | 'clear', target: Target = 'text') {
    if (busy) return; cancelled.current = false; setBusy(action + target); setError(''); setNotice('');
    try {
      if (action === 'clear') { const result = await liteApi.clear(); onSaved(result.settings); setPreview(''); setNotice('已清除本次运行中保存的 Key。'); return; }
      await save();
      if (cancelled.current) { setNotice('已取消请求。'); return; }
      if (action === 'save') { onClose(); return; }
      if (action === 'models') {
        const result = await liteApi.models(target); setModels(value => ({ ...value, [target]: result.models })); onSaved(result.settings);
        setNotice(`已读取 ${result.models.length} 个模型。可在模型输入框中选择，也可手动填写。`);
      } else {
        const result = await liteApi.probe(target); onSaved(result.settings);
        if (result.preview) setPreview(result.preview);
        setNotice(target === 'image' ? '已实际返回一张图片，当前接口与模型可生图。' : '文字接口已成功返回内容。');
      }
    } catch (failure) { if (cancelled.current) setNotice('已取消请求。服务商已接受的调用仍可能计费。'); else setError(failure instanceof Error ? failure.message : '请求未完成。'); }
    finally { setBusy(''); }
  }
  async function cancel() { cancelled.current = true; try { await liteApi.cancel(); } catch { setError('取消请求未能送达，请稍后重试。'); } }
  const changed = (target: Target) => ['protocol', 'baseURL', 'model'].some(key => fields[target][key as keyof Draft] !== settings[target][key as keyof PublicEndpoint]) || !!fields[target].apiKey;
  return <dialog ref={dialog} className="api-dialog" aria-labelledby="api-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === dialog.current && !busy) onClose(); }}>
    <div className="settings-inner">
      <header className="settings-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2 id="api-title">接上你自己的 AI。</h2><p>文字与生图可以来自不同服务。只做文字，填左侧即可。</p></div><button type="button" className="icon-button" aria-label="关闭 API 设置" disabled={!!busy} onClick={onClose}><X size={22} /></button></header>
      <div className="settings-columns">{(['text', 'image'] as const).map((target, index) => {
        const protocols = target === 'text' ? textProtocols : imageProtocols, field = fields[target];
        return <fieldset key={target} disabled={locked || !!busy} className="endpoint-settings"><legend><span>0{index + 1}</span>{target === 'text' ? '文字接口' : '生图接口'}{target === 'image' && <small>漫画需要</small>}</legend>
          <label>接口类型<select aria-label={`${target === 'text' ? '文字' : '生图'}接口类型`} value={field.protocol} onChange={event => { const choice = protocols.find(item => item.id === event.target.value)!; update(target, { protocol: choice.id, baseURL: choice.baseURL, model: '' }); }}>
            {protocols.map(protocol => <option value={protocol.id} key={protocol.id}>{protocol.label}</option>)}
          </select></label>
          <label>服务地址 <span>Base URL</span><input aria-label={`${target === 'text' ? '文字' : '生图'}服务地址`} type="url" spellCheck={false} autoComplete="off" value={field.baseURL} onChange={event => update(target, { baseURL: event.target.value })} /></label>
          <label>API Key <span>{field.hasKey ? '已保存在内存，留空沿用' : '本机免 Key 服务可留空'}</span><input aria-label={`${target === 'text' ? '文字' : '生图'} API Key`} type="password" autoComplete="off" spellCheck={false} value={field.apiKey} placeholder={field.hasKey ? '•••••••• 已设置' : '填入你自己的 Key'} onChange={event => update(target, { apiKey: event.target.value })} /></label>
          <label>模型 <span>支持手动填写</span><input aria-label={`${target === 'text' ? '文字' : '生图'}模型`} list={`${target}-model-choices`} autoComplete="off" spellCheck={false} placeholder={target === 'text' ? '例如 gpt-4.1 / 你的模型名称' : '填写服务商提供的生图模型名称'} value={field.model} onChange={event => update(target, { model: event.target.value })} /><datalist id={`${target}-model-choices`}>{models[target].map(model => <option key={model.id} value={model.id}>{model.name}{target === 'image' ? ' · ' + capabilityLabels[model.capability] : ''}</option>)}</datalist></label>
          <div className="endpoint-actions"><button type="button" className="text-button" onClick={() => void perform('models', target)}>读取模型列表 <ArrowUpRight size={14} /></button><button type="button" className="test-button" disabled={!field.model.trim()} onClick={() => void perform('probe', target)}>{busy === 'probe' + target ? <LoaderCircle size={14} className="spin" /> : target === 'image' ? '验证生图（1张）' : '测试文字（1次）'}</button></div>
          <p className="capability-note">{target === 'text' ? !changed(target) && settings.textVerified ? <><Check size={13} /> 文字接口已验证</> : '兼容服务选 Chat Completions；本机模型也可接入。' : <><span className={`capability-dot ${changed(target) ? 'unknown' : settings.imageCapability}`} />{changed(target) ? capabilityLabels.unknown : capabilityLabels[settings.imageCapability]}</>}</p>
        </fieldset>;
      })}</div>
      <div className="settings-notes"><p>“测试文字”和“验证生图”会向服务商发起真实请求，可能计费。模型列表只有名称时，生图能力仍需验证；能看图不代表能生图。</p><p>Key 不写入浏览器存储或磁盘，重启本地服务后需重新填写。更换服务地址或接口类型会清空该栏 Key。</p></div>
      {preview && <figure className="probe-preview"><img src={preview} alt="生图接口返回的测试插画" /><figcaption>当前模型的实际返回</figcaption></figure>}
      <div className="settings-message" aria-live="polite">{locked && <p>当前故事仍在生成。请先暂停，再修改配置。</p>}{error && <p className="error" role="alert">{error}</p>}{notice && <p>{notice}</p>}{busy && <p className="working"><LoaderCircle size={14} className="spin" />{busy.startsWith('probe') ? '正在等待接口返回…' : '正在连接…'}</p>}</div>
      <footer className="settings-footer"><button type="button" className="text-button" disabled={!!busy} onClick={() => void perform('clear')}>清除已存 Key</button>{busy.startsWith('probe') || busy.startsWith('models') ? <button type="button" className="primary-button" onClick={() => void cancel()}>取消请求 <X size={16} /></button> : <button type="button" className="primary-button" disabled={locked || !!busy} onClick={() => void perform('save')}>保存设置 <Check size={16} /></button>}</footer>
    </div>
  </dialog>;
}
