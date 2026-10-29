import type { Settings, ModelChoice, Target } from '../shared/byok.ts';
import type { JobDTO, LearningFormat } from '../shared/contracts.ts';
async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch('/learn/api' + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.error?.message || '连接暂时中断，请重试。');
  return value as T;
}
export const liteApi = {
  settings: () => request<{ settings: Settings }>('/settings'),
  save: (body: unknown) => request<{ settings: Settings }>('/settings', body),
  clear: () => request<{ settings: Settings }>('/settings', {}, 'DELETE'),
  models: (target: Target) => request<{ settings: Settings; models: ModelChoice[] }>('/models', { target }),
  probe: (target: Target) => request<{ settings: Settings; preview?: string }>('/probe', { target }),
  cancel: () => request<{ cancelled: boolean }>('/operations/cancel', {}),
  current: () => request<{ job: JobDTO | null }>('/current'),
  job: (id: string) => request<{ job: JobDTO }>('/jobs/' + encodeURIComponent(id)),
  create: (concept: string, format: LearningFormat, clientRequestId: string) => request<{ job: JobDTO }>('/jobs', { concept, format, clientRequestId }),
  action: (id: string, action: 'pause' | 'resume') => request<{ job: JobDTO }>('/jobs/' + encodeURIComponent(id) + '/' + action, {}),
};
