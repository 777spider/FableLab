import { useEffect, useRef, useState } from 'react';
import { X, ArrowUpRight, Check, LoaderCircle, Link2, ChevronDown } from 'lucide-react';
import { capabilityLabels, textProtocols, imageProtocols, type Settings, type Target, type ModelChoice, type PublicEndpoint } from '../shared/byok.ts';
import { services, serviceById, detectService, matchServiceAddress, sharedImageRoute } from '../shared/services.ts';
import { liteApi } from './lite-api.ts';

type Draft = PublicEndpoint & { apiKey: string };
const draft = (endpoint: PublicEndpoint): Draft => ({ ...endpoint, service: endpoint.service ?? detectService(endpoint.baseURL)?.id ?? 'custom', apiKey: '' });
const groups = ['国内服务', '国际服务', '本机与自定义'] as const;
export function ApiSettings({ settings, locked, onSaved, onClose }: { settings: Settings; locked: boolean; onSaved: (value: Settings) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), cancelled = useRef(false);
  const [fields, setFields] = useState({ text: draft(settings.text), image: draft(settings.image) });
  const [shared, setShared] = useState(settings.imageUsesText);
  const [models, setModels] = useState<Record<Target, ModelChoice[]>>({ text: [], image: [] });
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState('');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { setFields({ text: draft(settings.text), image: draft(settings.image) }); setShared(settings.imageUsesText); }, [settings]);
  const sharedRoute = sharedImageRoute(fields.text);
  const effectiveImage: Draft = shared && sharedRoute ? { ...fields.image, ...sharedRoute, ...(sharedRoute.service === 'custom' && fields.image.baseURL === fields.text.baseURL ? { protocol: fields.image.protocol } : {}), apiKey: '', hasKey: fields.text.hasKey || !!fields.text.apiKey.trim() } : fields.image;
  function update(target: Target, patch: Partial<Draft>) {
    const serviceChanged = (patch.baseURL !== undefined && patch.baseURL !== fields[target].baseURL) || (patch.protocol !== undefined && patch.protocol !== fields[target].protocol);
    setFields(value => ({ ...value, [target]: { ...value[target], ...patch, ...(serviceChanged ? { apiKey: '', hasKey: false } : {}) } }));
    if (target === 'text' && shared && serviceChanged) setFields(value => ({ ...value, image: { ...value.image, ...sharedImageRoute({ ...fields.text, ...patch }), model: '', apiKey: '', hasKey: false } }));
    if (target === 'text' && shared && !sharedImageRoute({ ...fields.text, ...patch })) {
      setShared(false);
      setFields(value => ({ ...value, image: { ...effectiveImage, apiKey: '', hasKey: false } }));
      setNotice('该服务的预设用于文字。生图请另选服务商。');
    } else setNotice('');
    setError('');
    if (target === 'image' || (target === 'text' && shared)) setPreview('');
    if (serviceChanged) setModels(value => ({ ...value, [target]: [], ...(target === 'text' && shared ? { image: [] } : {}) }));
  }
  function chooseService(target: Target, id: string) {
    const preset = serviceById(id)!, route = preset[target]!;
    update(target, { service: id, ...route, model: '', ...(id === 'custom' ? { baseURL: fields[target].baseURL, protocol: fields[target].protocol } : {}) });
  }
  function matchAddress(target: Target) {
    const field = fields[target], matched = matchServiceAddress(field.baseURL, target);
    const service = matched.service?.[target] ? matched.service : undefined;
    const differentService = service?.id !== field.service;
    update(target, { baseURL: matched.baseURL, service: service?.id ?? 'custom', ...(service && differentService ? { protocol: service[target]!.protocol } : {}) });
    if (service) setNotice(`已匹配 ${service.label} 的服务地址。`);
  }
  function toggleShared(value: boolean) {
    if (value && !sharedRoute) return;
    const endpointChanged = value && sharedRoute && (fields.image.baseURL !== sharedRoute.baseURL || fields.image.protocol !== sharedRoute.protocol);
    setFields(current => ({ ...current, image: { ...effectiveImage, ...(value ? sharedRoute : {}), ...(endpointChanged ? { model: '' } : {}), apiKey: '', hasKey: false } }));
    setShared(value); setModels(current => ({ ...current, image: [] })); setPreview(''); setError('');
    setNotice(value ? '生图已共用文字服务的地址与 Key；请单独选择生图模型。' : '已改为独立生图接口，请填写其 Key。');
  }
  async function save(): Promise<Settings> {
    const endpoint = (value: Draft, target: Target, omitKey = false) => ({ service: value.service, protocol: value.protocol, baseURL: matchServiceAddress(value.baseURL, target).baseURL, model: value.model, ...(!omitKey ? value.apiKey.trim() ? { apiKey: value.apiKey.trim() } : value.hasKey ? {} : { apiKey: '' } : {}) });
    const result = await liteApi.save({ text: endpoint(fields.text, 'text'), image: endpoint(effectiveImage, 'image', shared), imageUsesText: shared });
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
  const changed = (target: Target) => {
    const field = target === 'image' ? effectiveImage : fields.text;
    return ['protocol', 'baseURL', 'model'].some(key => field[key as keyof Draft] !== settings[target][key as keyof PublicEndpoint]) || !!field.apiKey || (target === 'image' && (shared !== settings.imageUsesText || (shared && !!fields.text.apiKey)));
  };
  const disabled = locked || !!busy;
  return <dialog ref={dialog} className="api-dialog" aria-labelledby="api-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === dialog.current && !busy) onClose(); }}>
    <div className="settings-inner">
      <header className="settings-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2 id="api-title">接上你的 AI。</h2><p>选择服务商，填入 Key，再选模型。常用地址与协议已为你配好。</p></div><button type="button" className="icon-button" aria-label="关闭 API 设置" disabled={!!busy} onClick={onClose}><X size={22} /></button></header>
      <label className={`shared-api ${shared ? 'is-shared' : ''}`}>
        <input type="checkbox" aria-label="文字与生图共用服务和 Key" checked={shared} disabled={disabled || !sharedRoute} onChange={event => toggleShared(event.target.checked)} />
        <span className="shared-api-copy"><strong><Link2 size={16} />文字与生图，共用一个 API</strong><small>{sharedRoute ? '只填一次 Key，文字与图片仍各选一个模型。' : '当前文字服务没有已适配的生图接口，请分别配置。'}</small></span>
        <span className="shared-api-state">{shared ? '已共用' : '独立配置'}</span>
      </label>
      <div className="settings-columns">{(['text', 'image'] as const).map((target, index) => {
        const name = target === 'text' ? '文字' : '生图', protocols = target === 'text' ? textProtocols : imageProtocols;
        const field = target === 'image' ? effectiveImage : fields.text, linked = target === 'image' && shared;
        const preset = serviceById(field.service), manualCatalog = ['stability', 'fal', 'replicate', 'minimax'].includes(field.protocol);
        return <fieldset key={target} disabled={disabled} className="endpoint-settings"><legend><span>0{index + 1}</span>{name}接口{target === 'image' && <small>漫画需要</small>}</legend>
          {linked ? <div className="shared-service"><Link2 size={16} /><div><strong>{serviceById(fields.text.service)?.label ?? '自定义服务'}</strong><small>沿用文字服务与 Key · 图片模型单独选择</small></div></div> : <>
            <label>服务商<select aria-label={`${name}服务商`} value={field.service ?? 'custom'} onChange={event => chooseService(target, event.target.value)}>
              {groups.map(group => <optgroup label={group} key={group}>{services.filter(service => service.group === group && service[target]).map(service => <option value={service.id} key={service.id}>{service.label}</option>)}</optgroup>)}
            </select></label>
            <label>API Key <span>{field.hasKey ? '留空沿用已存 Key' : '本机服务可留空'}</span><input key={`${target}:${field.baseURL}:${field.protocol}`} name={`${target}-${field.service}-api-key`} aria-label={`${name} API Key`} type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" spellCheck={false} value={field.apiKey} placeholder={field.hasKey ? '•••••••• 已设置' : shared && target === 'text' ? '文字与生图，只需填这一次' : '填入你自己的 Key'} onChange={event => update(target, { apiKey: event.target.value })} /></label>
          </>}
          {preset?.note && <p className="service-hint">{preset.note}</p>}
          <label>{name}模型 <span>支持手动填写</span><input aria-label={`${name}模型`} list={`${target}-model-choices`} autoComplete="off" spellCheck={false} placeholder={target === 'text' ? '选择或填写你的文字模型名称' : '选择或填写可生成图片的模型名称'} value={field.model} onChange={event => update(target, { model: event.target.value })} /><datalist id={`${target}-model-choices`}>{models[target].map(model => <option key={model.id} value={model.id}>{model.name}{target === 'image' ? ' · ' + capabilityLabels[model.capability] : ''}</option>)}{!models[target].length && preset?.imageModels && target === 'image' && preset.imageModels.map(id => <option value={id} key={id} />)}</datalist></label>
          <div className="endpoint-actions">{manualCatalog ? <a className="text-button" href={preset?.docs || 'https://ai-sdk.dev/providers/ai-sdk-providers'} target="_blank" rel="noreferrer">查看模型名称 <ArrowUpRight size={14} /></a> : <button type="button" className="text-button" onClick={() => void perform('models', target)}>读取模型列表 <ArrowUpRight size={14} /></button>}<button type="button" className="test-button" disabled={!field.model.trim() || !field.baseURL.trim()} onClick={() => void perform('probe', target)}>{busy === 'probe' + target ? <LoaderCircle size={14} className="spin" /> : target === 'image' ? '验证生图（1张）' : '测试文字（1次）'}</button></div>
          <p className="capability-note">{target === 'text' ? !changed(target) && settings.textVerified ? <><Check size={13} /> 文字接口已验证</> : '先选模型，再测试连接；不会自动发起付费调用。' : <><span className={`capability-dot ${changed(target) ? 'unknown' : settings.imageCapability}`} />{changed(target) ? capabilityLabels.unknown : capabilityLabels[settings.imageCapability]}</>}</p>
          {linked && <p className="matched-address"><span>共用地址</span><bdi>{field.baseURL || '请先填写文字服务地址'}</bdi></p>}
          {(!linked || field.service === 'custom') && <details className="advanced-settings" open={field.service === 'custom' || field.service === 'azure' ? true : undefined}><summary>地址与协议 <span>{field.service === 'custom' || field.service === 'azure' ? '需要填写地址' : '已自动匹配'}</span><ChevronDown size={14} /></summary>
            {!linked && <label>服务地址 <span>可粘贴完整接口链接</span><input aria-label={`${name}服务地址`} type="text" inputMode="url" spellCheck={false} autoComplete="off" value={field.baseURL} placeholder={field.service === 'azure' ? 'https://你的资源名.openai.azure.com' : 'https://你的服务地址/v1'} onChange={event => update(target, { baseURL: event.target.value })} onBlur={() => matchAddress(target)} /></label>}
            <label>接口类型<select aria-label={`${name}接口类型`} value={field.protocol} onChange={event => update(target, { protocol: event.target.value })}>{protocols.map(protocol => <option value={protocol.id} key={protocol.id}>{protocol.label}</option>)}</select></label>
            {preset?.docs && <a className="service-docs" href={preset.docs} target="_blank" rel="noreferrer">服务商文档 <ArrowUpRight size={12} /></a>}
          </details>}
        </fieldset>;
      })}</div>
      <div className="settings-notes"><p>测试会向你选择的服务商发起真实请求，可能计费。模型名称或“能看图”不能证明能生图，实际返回图片后才标记为已验证。</p><p>Key 只保存在本次本地服务的内存中。更换地址或协议会清空该栏 Key；重启服务后需重新填写。</p></div>
      {preview && <figure className="probe-preview"><img src={preview} alt="生图接口返回的测试插画" /><figcaption>当前模型的实际返回</figcaption></figure>}
      <div className="settings-message" aria-live="polite">{locked && <p>当前故事仍在生成。请先暂停，再修改配置。</p>}{error && <p className="error" role="alert">{error}</p>}{notice && <p>{notice}</p>}{busy && <p className="working"><LoaderCircle size={14} className="spin" />{busy.startsWith('probe') ? '正在等待接口返回…' : '正在连接…'}</p>}</div>
      <footer className="settings-footer"><button type="button" className="text-button" disabled={!!busy} onClick={() => void perform('clear')}>清除已存 Key</button>{busy.startsWith('probe') || busy.startsWith('models') ? <button type="button" className="primary-button" onClick={() => void cancel()}>取消请求 <X size={16} /></button> : <button type="button" className="primary-button" disabled={disabled} onClick={() => void perform('save')}>保存设置 <Check size={16} /></button>}</footer>
    </div>
  </dialog>;
}
