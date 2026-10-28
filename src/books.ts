import type { JobDTO } from '../shared/contracts';

/** A book keeps its print identity when reordered, resumed or viewed elsewhere. */
export function bookCoverDesign(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  return {
    tone: (['sage', 'clay', 'oat', 'slate'] as const)[hash % 4],
    motif: (['orbit', 'fold', 'tide'] as const)[Math.floor(hash / 4) % 3],
  };
}

/** Creation order never changes when a job is resumed, read or edited. */
export function newestBooks(jobs: JobDTO[]): JobDTO[] {
  const time = (value: string) => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : -Infinity; };
  return [...jobs].sort((a, b) => {
    const left = time(a.createdAt), right = time(b.createdAt);
    return left === right ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : left > right ? -1 : 1;
  });
}

/** Plain text only. React escapes the excerpt where it is displayed. */
export function openingExcerpt(job: JobDTO): string {
  const story = job.stories[0];
  if (!story) return '';
  const paragraphs = story.paragraphs.map(paragraph => paragraph.text).filter(text => text.trim());
  const text = paragraphs.length ? paragraphs.join(' ') : story.pages.map(page => page.text).filter(text => text.trim()).join(' ') || story.text;
  const characters = Array.from(text.replace(/\s+/gu, ' ').trim());
  return characters.slice(0, 180).join('') + (characters.length > 180 ? '…' : '');
}
