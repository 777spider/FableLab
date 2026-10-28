import type { JobDTO } from '../shared/contracts';
import data from './preset-data.json';
import education from './education-xai-data.json';
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

export const educationPreset: JobDTO = {
  id: 'preset-education-xai', concept: '教育 AI 可解释性', format: 'text', status: 'completed', phase: 'complete', storyCount: 1,
  createdAt: '2026-10-25T01:56:06.000Z', updatedAt: '2026-10-25T01:56:06.000Z',
  progress: { completedStages: [], stageLabel: '预置示例', elapsedMs: 0, etaMs: null, attempts: 0, attemptBudget: 0 },
  knowledge: {
    concept: '教育 AI 可解释性', definition: education.definition, coreRelations: education.principles,
    prerequisites: [], misconceptions: [], academicUse: '结合教育任务核查模型判定、解释依据与使用边界。', searchTerms: [],
    sources: [
      { title: 'Explainable Artificial Intelligence in education', authors: 'Khosravi et al.', year: '2022', url: 'https://doi.org/10.1016/j.caeai.2022.100074', verificationStatus: 'unverified' },
      { title: 'Towards Faithfully Interpretable NLP Systems: How Should We Define and Evaluate Faithfulness?', authors: 'Jacovi & Goldberg', year: '2020', url: 'https://aclanthology.org/2020.acl-main.386/', verificationStatus: 'unverified' },
      { title: 'Algorithmic Recourse: from Counterfactual Explanations to Interventions', authors: 'Karimi et al.', year: '2020', url: 'https://arxiv.org/abs/2002.06278', verificationStatus: 'unverified' },
    ],
  },
  stories: [{
    id: 'education-xai', title: education.title, sourceDomain: '借风馆的路线图与问纸匣',
    text: education.paragraphs.join('\n\n'), characters: [],
    paragraphs: education.paragraphs.map((text, i) => ({ id: `xai-p${i + 1}`, text })),
    pages: education.scenes.map((scene, i) => ({
      id: `xai-scene-${i + 1}`, title: scene.title, text: education.paragraphs.slice(scene.start, scene.end).join('\n\n'), alt: '',
      paragraphIds: education.paragraphs.slice(scene.start, scene.end).map((_, n) => `xai-p${scene.start + n + 1}`), image: { status: 'not_requested' as const },
    })),
  }],
  lesson: {
    definition: education.definition, principles: education.principles, academicExplanation: education.academicExplanation,
    mapping: education.mapping.map(item => ({ ...item, storyId: 'education-xai' })), boundaries: education.boundaries, workedExample: '',
  },
  tasks: [], discussion: education.discussion.map(prompt => ({ prompt, guidance: '' })),
  error: null, quality: 'checked', provenance: 'preset',
};

export const libraryPresets: JobDTO[] = [{ ...preset, format: 'comic' }, educationPreset];

export function presetForDemo(value: string | null): JobDTO | null {
  return value === '1' ? preset : value === 'education-xai' ? educationPreset : null;
}

export function presetURL(job: Pick<JobDTO, 'id' | 'format'>): string {
  const demo = job.id === educationPreset.id ? 'education-xai' : '1';
  return `/learn?${new URLSearchParams({ demo, mode: job.format })}`;
}
