import type { JobDTO } from '../shared/contracts';
import data from './preset-data.json';
import { presetArtURL } from './art';

export const preset: JobDTO = {
  id: 'preset-simulation', concept: '仿真', format: 'text', status: 'completed', phase: 'complete',
  createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z',
  progress: { completedStages: [], stageLabel: '预置示例', elapsedMs: 0, etaMs: null, attempts: 0, attemptBudget: 0 },
  knowledge: { concept: '仿真', definition: data.explanation.definition, coreRelations: data.explanation.coreRelations,
    prerequisites: [], misconceptions: [], academicUse: data.explanation.summary, searchTerms: [], sources: [] },
  stories: data.stories.map(story => ({
    id: story.id, title: story.title, sourceDomain: '', text: story.paragraphs.map(p => p.text).join('\n\n'),
    characters: [], paragraphs: story.paragraphs,
    pages: story.pages.map(page => ({ id: page.id, title: page.title, text: page.text, alt: page.alt,
      paragraphIds: [], image: { status: 'ready' as const, url: presetArtURL(page.image) } })),
  })),
  lesson: {
    definition: data.explanation.definition, principles: data.explanation.coreRelations,
    academicExplanation: `${data.explanation.summary}\n\n${data.explanation.methods.map(m => `${m.title}：${m.detail}`).join('\n\n')}\n\n${data.explanation.checks.join('\n\n')}`,
    mapping: data.explanation.mapping.map((m, index) => ({ storyId: m.storyId, paragraphId: `preset-${index}`, quote: m.quote, relation: m.target, explanation: m.target })),
    boundaries: [...data.explanation.conditions, ...data.explanation.limitations, ...data.explanation.boundaries], workedExample: '',
  },
  tasks: data.discussion.map((task, index) => ({ id: task.id, kind: index === 0 ? 'comparison' : 'application', prompt: task.prompt,
    options: task.options, correctAnswer: task.correctAnswer, explanation: task.feedback })),
  discussion: [], error: null, quality: 'checked', provenance: 'preset',
};
