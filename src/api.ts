import type { AccessResponse, AuthResponse, JobDTO, JobResponse, JobsResponse, LearningFormat, PublicShareResponse, SessionResponse, ShareResponse, StoryLength } from '../shared/contracts';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code = '') { super(message); }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/learn/api${path}`, {
    credentials: 'same-origin', cache: 'no-store',
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  let data: T & { error?: { code?: string; message?: string } };
  try { data = await response.json(); } catch { throw new ApiError('暂时无法连接，请稍后重试。', response.status); }
  if (!response.ok) {
    const fallback = response.status === 401 ? '请登录后继续。' : response.status === 429 ? '操作有些频繁，稍等片刻再试。' : response.status === 400 ? '请检查输入后再试。' : '这一步暂时未完成，可以重试。';
    throw new ApiError(data.error?.message || fallback, response.status, data.error?.code || '');
  }
  return data;
}

export const api = {
  session: () => request<SessionResponse>('/auth/session'),
  register: (input: { code: string; username: string; password: string; displayName?: string }) => request<AuthResponse>('/auth/register', input),
  login: (username: string, password: string) => request<AuthResponse>('/auth/login', { username, password }),
  recover: (username: string, recoveryCode: string, password: string) => request<AuthResponse>('/auth/recover', { username, recoveryCode, password }),
  logout: () => request<SessionResponse>('/auth/logout', {}),
  importLegacy: () => request<SessionResponse>('/auth/legacy-import', {}),
  access: () => request<AccessResponse>('/access'),
  unlock: (code: string) => request<AccessResponse>('/access', { code }),
  jobs: () => request<JobsResponse>('/jobs'),
  job: (id: string) => request<JobResponse>(`/jobs/${encodeURIComponent(id)}`),
  create: (concept: string, format: LearningFormat, clientRequestId: string, storyLength: StoryLength = 'standard') => request<JobResponse>('/jobs', { concept, format, clientRequestId, storyLength }),
  action: (id: string, action: 'pause' | 'resume') => request<JobResponse>(`/jobs/${encodeURIComponent(id)}/${action}`, {}),
  format: (id: string, format: LearningFormat) => request<JobResponse>(`/jobs/${encodeURIComponent(id)}/format`, { format }),
  share: (id: string) => request<ShareResponse>(`/jobs/${encodeURIComponent(id)}/share`),
  publishShare: (id: string) => request<ShareResponse>(`/jobs/${encodeURIComponent(id)}/share`, {}),
  revokeShare: (id: string) => request<ShareResponse>(`/jobs/${encodeURIComponent(id)}/share/revoke`, {}),
  publicShare: (token: string) => request<PublicShareResponse>(`/public/shares/${encodeURIComponent(token)}`),
};

export function upsert(jobs: JobDTO[], job: JobDTO): JobDTO[] {
  return [job, ...jobs.filter(item => item.id !== job.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
