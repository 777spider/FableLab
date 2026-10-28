import type { JobDTO, LibraryBookDTO } from './contracts';

export function openingExcerpt(job: JobDTO): string {
  const story = job.stories[0];
  if (!story) return '';
  let text = '';
  const paragraphs = story.paragraphs.some(paragraph => paragraph.text.trim()) ? story.paragraphs : story.pages;
  for (const paragraph of paragraphs) {
    text += ' ' + paragraph.text;
    if (Array.from(text.replace(/\s+/gu, ' ').trim()).length > 180) break;
  }
  const characters = Array.from((text.trim() || story.text).replace(/\s+/gu, ' ').trim());
  return characters.slice(0, 180).join('') + (characters.length > 180 ? '…' : '');
}

/** Cover data only; complete lessons and story pages stay on the detail endpoint. */
export function libraryBook(job: JobDTO): LibraryBookDTO {
  const cover = job.format === 'comic' ? job.stories.flatMap(story => story.pages).find(page => page.image.status === 'ready' && page.image.url)?.image.url : undefined;
  return { id: job.id, concept: job.concept, format: job.format, status: job.status, phase: job.phase,
    createdAt: job.createdAt, updatedAt: job.updatedAt, progress: structuredClone(job.progress), error: job.error ? { ...job.error } : null,
    quality: job.quality, provenance: job.provenance, title: job.stories[0]?.title || job.concept, opening: openingExcerpt(job),
    ...(cover ? { coverUrl: cover } : {}) };
}
