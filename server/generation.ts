import {z} from 'zod';
import type {KnowledgeDTO,LessonDTO,StoryDTO,TaskDTO,DiscussionDTO} from '../shared/contracts.ts';
export class GenerationError extends Error {constructor(public code:string,public transient=false){super(code);}}
export class CandidateError extends GenerationError {constructor(public candidate:unknown,public details:string[]){super('CONTENT_INVALID');}}
export class ReviewOutputError extends CandidateError {constructor(candidate:unknown,details:string[]){super(candidate,details);this.code='REVIEW_OUTPUT_INVALID';}}
const text=z.string().trim().min(2).max(6000);
export const knowledgeSchema=z.object({concept:z.string().trim().min(1).max(120),definition:text,coreRelations:z.array(text).min(2).max(4),prerequisites:z.array(text).max(6),misconceptions:z.array(text).min(1).max(6),academicUse:text,searchTerms:z.array(text).max(6),sources:z.array(z.object({title:text,authors:text,year:z.string().max(20),url:z.url().optional(),verificationStatus:z.literal('unverified')})).max(4)});
export const storySchema=z.object({id:z.string(),title:z.string().trim().min(2).max(40),sourceDomain:text,characters:z.array(z.object({name:z.string().min(1).max(24),visualDesign:z.string().min(5).max(160)})).min(1).max(4),paragraphs:z.array(z.object({id:z.string().regex(/^p\d+$/),text:z.string().trim().min(2).max(1600)})).min(6).max(40),pages:z.array(z.object({title:z.string().min(1).max(24),paragraphIds:z.array(z.string()).min(1),imagePrompt:z.string().min(10).max(350),activeCharacters:z.array(z.string()).max(4)})).min(4).max(6)});
export const lessonSchema=z.object({lesson:z.object({definition:text,principles:z.array(text).min(2).max(6),academicExplanation:text,mapping:z.array(z.object({storyId:z.string(),paragraphId:z.string(),quote:z.string().min(2).max(1000),relation:text,explanation:text})).min(2).max(12),boundaries:z.array(text).min(2).max(6),workedExample:text}),tasks:z.array(z.object({id:z.string(),kind:z.enum(['comprehension','comparison','application']),prompt:text,options:z.array(z.object({id:z.string(),text})).length(4),correctAnswer:z.string(),explanation:text})).length(2),discussion:z.array(z.object({prompt:text,guidance:text})).min(1).max(3)});
export const reviewSchema=z.object({passed:z.boolean(),issues:z.array(z.object({target:z.enum(['knowledge','story-1','story-2','lesson']),detail:z.string().min(2).max(1200),evidence:z.object({paragraphId:z.string().nullable(),quote:z.string().min(2).max(400)})})).max(10)});
export type StoryWire=z.infer<typeof storySchema>;
export type LessonWire={lesson:LessonDTO;tasks:TaskDTO[];discussion:DiscussionDTO[]};
export type Review=z.infer<typeof reviewSchema>;
export type GenerationInput={concept:string;knowledge:KnowledgeDTO|null;stories:StoryDTO[];storyCount?:1|2;storyIndex?:number;lesson?:LessonWire|null;issues?:Review['issues'];previousCandidate?:unknown;validationErrors?:string[]};
/** A fresh audit cannot inherit an earlier verdict or rejected candidate. */
export function freshReviewInput(input:GenerationInput):GenerationInput{return structuredClone({concept:input.concept,knowledge:input.knowledge,stories:input.stories,storyCount:input.storyCount??(input.stories.length===1?1:2),lesson:input.lesson});}
export function validateReview(candidate:unknown,input:GenerationInput):Review{
 const parsed=reviewSchema.safeParse(candidate);if(!parsed.success)throw new ReviewOutputError(candidate,parsed.error.issues.map(i=>i.path.join('.')+':'+i.code));
 const review=parsed.data,errors:string[]=[];
 if(review.passed!==!review.issues.length)errors.push('passed must be true exactly when there are no issues');
 const strings=(value:unknown):string[]=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
 for(const issue of review.issues){const {paragraphId,quote}=issue.evidence;
  const grounded=issue.target.startsWith('story-')?!!input.stories.find(s=>s.id===issue.target)?.paragraphs.find(p=>p.id===paragraphId)?.text.includes(quote):paragraphId===null&&strings(issue.target==='knowledge'?input.knowledge:input.lesson).some(text=>text.includes(quote));
  if(!grounded)errors.push('Each issue must quote its CURRENT target verbatim; do a fresh audit, not a copy of an earlier verdict.');
 }
 if(errors.length)throw new ReviewOutputError(candidate,errors);return review;
}
export interface ImageInput {prompt:string;reference?:{bytes:Uint8Array;hash:string};}
export interface ImageResult {bytes:Buffer;extension:'.png'|'.jpg';hash:string;metadata:Record<string,unknown>;}
export interface GenerationProvider {
 provenance:'generated'|'preset';
 knowledge(input:GenerationInput,signal:AbortSignal):Promise<unknown>;
 story(input:GenerationInput,signal:AbortSignal):Promise<unknown>;
 lesson(input:GenerationInput,signal:AbortSignal):Promise<unknown>;
 review(input:GenerationInput,signal:AbortSignal):Promise<unknown>;
 image(input:ImageInput,signal:AbortSignal):Promise<ImageResult>;
}
export function parse<T>(schema:z.ZodType<T>,candidate:unknown):T {const result=schema.safeParse(candidate);if(!result.success)throw new CandidateError(candidate,result.error.issues.map(i=>i.path.join('.')+':'+i.code));return result.data;}
export function validateStory(candidate:unknown,input:GenerationInput):StoryWire{
 const story=parse(storySchema,candidate),errors:string[]=[];
 const ids=story.paragraphs.map(p=>p.id),refs=story.pages.flatMap(p=>p.paragraphIds);
 const prose=story.paragraphs.map(p=>p.text).join('\n\n').trim();
 if(prose.length<800||prose.length>6000)errors.push(`story length ${prose.length}; required 800–6000, aim 1400–2400 with actual events`);
 if(new Set(ids).size!==ids.length||JSON.stringify(ids)!==JSON.stringify(refs))errors.push('pages must cover all paragraphs exactly once in authored order');
 if(input.knowledge?.concept&&prose.includes(input.knowledge.concept))errors.push('formal concept name must stay in the later lesson, including the ending');
 if(/\bp\d+\b/i.test(prose))errors.push('paragraph IDs are metadata and must not appear in story prose');
 const names=new Set(story.characters.map(c=>c.name));if(names.size!==story.characters.length)errors.push('duplicate character name');
 for(const page of story.pages)if(page.activeCharacters.some(n=>!names.has(n)))errors.push('active character must use fixed character name');
 if(input.stories.some(s=>s.id!==story.id&&s.sourceDomain===story.sourceDomain))errors.push('second story requires a different source domain');
 if(story.id!=='story-'+((input.storyIndex??0)+1))errors.push('story id must equal assigned index');
 if(errors.length)throw new CandidateError(candidate,errors);return story;
}
export function validateLesson(candidate:unknown,input:GenerationInput):LessonWire{
 const value=parse(lessonSchema,candidate),errors:string[]=[],storyCount=input.storyCount??input.stories.length;
 if((storyCount!==1&&storyCount!==2)||input.stories.length!==storyCount)errors.push('lesson requires all assigned stories');
 for(const m of value.lesson.mapping){const p=input.stories.find(s=>s.id===m.storyId)?.paragraphs.find(p=>p.id===m.paragraphId);if(!p?.text.includes(m.quote))errors.push('mapping quote must be exact existing paragraph text');if(!input.knowledge?.coreRelations.includes(m.relation))errors.push('mapping relation must match one knowledge coreRelation exactly');}
 for(const story of input.stories)for(const relation of input.knowledge?.coreRelations??[])if(!value.lesson.mapping.some(m=>m.storyId===story.id&&m.relation===relation))errors.push('each assigned story must evidence each core relation');
 for(const task of value.tasks){if(new Set(task.options.map(o=>o.id)).size!==4||new Set(task.options.map(o=>o.text)).size!==4||!task.options.some(o=>o.id===task.correctAnswer))errors.push('each task needs four distinct options and one valid answer');}
 const expected=storyCount===1?['comprehension','application']:['comparison','application'];
 if(!expected.every(kind=>value.tasks.some(t=>t.kind===kind)))errors.push('include '+expected.join(' and ')+' tasks');
 if(errors.length)throw new CandidateError(candidate,errors);return value;
}
export function projectStory(wire:StoryWire):StoryDTO {const byId=new Map(wire.paragraphs.map(p=>[p.id,p.text]));return {id:wire.id,title:wire.title,sourceDomain:wire.sourceDomain,characters:wire.characters,paragraphs:wire.paragraphs,text:wire.paragraphs.map(p=>p.text).join('\n\n'),pages:wire.pages.map((p,i)=>({id:wire.id+'-page-'+(i+1),title:p.title,paragraphIds:p.paragraphIds,text:p.paragraphIds.map(id=>byId.get(id)).join('\n\n'),alt:p.activeCharacters.join('、')+'在《'+wire.title+'》的场景中。',image:{status:'not_requested'}}))};}
