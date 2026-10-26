import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import type {CreateJobRequest,JobPhase,LearningFormat,KnowledgeDTO,JobDTO} from '../shared/contracts.ts';
import {GenerationError,CandidateError,knowledgeSchema,parse,validateStory,validateLesson,validateReview,freshReviewInput,projectStory,type GenerationProvider,type StoryWire,type LessonWire,type Review,type GenerationInput} from './generation.ts';
export {GenerationError} from './generation.ts';
interface RecordJob {dto:JobDTO;owner:string;clientRequestId:string;requestedFormat:LearningFormat;attempts:Record<string,number>;retried:string[];contentRepaired:string[];candidates:Record<string,unknown>;candidateDetails:Record<string,string[]>;wires:StoryWire[];lessonWire:LessonWire|null;review:Review|null;history:unknown[];qualityRecovery?:{state:'active'|'closed';completedStages:string[]};}
const labels:Record<JobPhase,string>={knowledge:'厘清概念与原理','story-1':'写第一则寓言','story-2':'写第二则寓言',lesson:'整理「解」与「议」',review:'复核学理、情节与计算','repair-story-1':'修复第一则的具体问题','repair-story-2':'修复第二则的具体问题','repair-lesson':'修复学术解释', 'review-final':'复查修复结果',images:'绘制故事插画',complete:'已完成'};
const atomic=(path:string,value:unknown)=>{const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(value),{encoding:'utf8',mode:0o600});renameSync(tmp,path);};
export class JobService {
 private records:RecordJob[]=[];private current:{record:RecordJob;controller:AbortController}|null=null;private stopped=false;private scheduled=false;private file:string;
 constructor(private dir:string,private provider:GenerationProvider,private options:{retryDelayMs?:number}={}){
  mkdirSync(dir,{recursive:true,mode:0o700});this.file=join(dir,'jobs.json');
  if(existsSync(this.file)){const saved=JSON.parse(readFileSync(this.file,'utf8'));if(saved.version!==1||!Array.isArray(saved.jobs))throw new Error('STUDIO_STORE_INVALID');this.records=saved.jobs;let changed=false;
   for(const r of this.records){if(!r.requestedFormat){r.requestedFormat=r.dto.format;changed=true;}if(!r.candidateDetails){r.candidateDetails={};changed=true;}if(r.dto.status==='running'){r.dto.status='queued';changed=true;}if(r.dto.progress.retrying!==false){r.dto.progress.retrying=false;changed=true;}for(const s of r.dto.stories)for(const p of s.pages)if(p.image.status==='generating'){p.image.status='pending';changed=true;}if(r.dto.error?.code==='QUALITY_REVIEW_REQUIRED'){const recoverable=this.canQualityContinue(r);if(r.dto.error.recoverable!==recoverable){r.dto.error.recoverable=recoverable;changed=true;}}}if(changed)this.save();}
  this.schedule();
 }
 private save(){atomic(this.file,{version:1,jobs:this.records});}
 private touch(r:RecordJob){if(this.stopped)return;r.dto.updatedAt=new Date().toISOString();r.dto.progress.stageLabel=r.qualityRecovery?.state==='active'&&r.dto.phase==='review'?'重新检查当前内容':r.dto.phase==='complete'&&r.dto.format==='comic'&&r.dto.stories.some(s=>s.pages.some(p=>p.image.status!=='ready'))?'文字已完成，部分插画待补':labels[r.dto.phase];this.save();}
 private storyCount(r:RecordJob):1|2{return r.dto.storyCount??2;}
 private canQualityContinue(r:RecordJob){return !r.qualityRecovery&&r.dto.status==='failed'&&r.dto.error?.code==='QUALITY_REVIEW_REQUIRED'&&r.dto.progress.attempts<r.dto.progress.attemptBudget&&!!r.dto.knowledge&&r.dto.stories.length===this.storyCount(r)&&!!r.lessonWire;}
 private owned(owner:string,id:string){const r=this.records.find(r=>r.owner===owner&&r.dto.id===id);if(!r)throw new GenerationError('JOB_NOT_FOUND');return r;}
 private dto(r:RecordJob){const value=structuredClone(r.dto);value.storyCount=this.storyCount(r);value.progress.elapsedMs=(['queued','running'].includes(value.status)?Date.now():Date.parse(value.updatedAt))-Date.parse(value.createdAt);return value;}
 get(owner:string,id:string){const r=this.records.find(r=>r.owner===owner&&r.dto.id===id);return r?this.dto(r):null;}
 list(owner:string){return this.records.filter(r=>r.owner===owner).sort((a,b)=>b.dto.createdAt.localeCompare(a.dto.createdAt)).map(r=>this.dto(r));}
 create(owner:string,request:CreateJobRequest){
  const previous=this.records.find(r=>r.owner===owner&&r.clientRequestId===request.clientRequestId);
  if(previous){if(previous.dto.concept!==request.concept||previous.requestedFormat!==request.format)throw new GenerationError('REQUEST_CONFLICT');return this.dto(previous);}
  if(this.records.filter(r=>r.owner===owner&&['queued','running'].includes(r.dto.status)).length>=2)throw new GenerationError('TOO_MANY_JOBS');
  if(this.records.length>=2000)throw new GenerationError('STORAGE_LIMIT');
  const now=new Date().toISOString();const r:RecordJob={owner,clientRequestId:request.clientRequestId,requestedFormat:request.format,attempts:{},retried:[],contentRepaired:[],candidates:{},candidateDetails:{},wires:[],lessonWire:null,review:null,history:[],dto:{id:randomUUID(),concept:request.concept,format:request.format,storyCount:1,status:'queued',phase:'knowledge',createdAt:now,updatedAt:now,progress:{completedStages:[],stageLabel:labels.knowledge,elapsedMs:0,etaMs:null,attempts:0,attemptBudget:48,retrying:false},knowledge:null,stories:[],lesson:null,tasks:[],discussion:[],error:null,quality:'pending',provenance:this.provider.provenance}};
  this.records.push(r);this.touch(r);this.schedule();return this.dto(r);
 }
 pause(owner:string,id:string){const r=this.owned(owner,id);if(['queued','running'].includes(r.dto.status)){r.dto.status='paused';r.dto.progress.retrying=false;this.current?.record===r&&this.current.controller.abort();this.touch(r);}return this.dto(r);}
 resume(owner:string,id:string){const r=this.owned(owner,id);if(r.dto.status==='running'||r.dto.status==='queued')return this.dto(r);
  if(r.dto.error?.code==='QUALITY_REVIEW_REQUIRED'){if(!this.canQualityContinue(r))return this.dto(r);r.qualityRecovery={state:'active',completedStages:[]};r.dto.phase='review';}
  else if(r.dto.error?.recoverable===false)return this.dto(r);
  if(r.dto.status==='completed'&&!(r.dto.format==='comic'&&r.dto.stories.some(s=>s.pages.some(p=>p.image.status!=='ready'))))return this.dto(r);
  r.dto.status='queued';r.dto.error=null;r.dto.progress.retrying=false;this.touch(r);this.schedule();return this.dto(r);
 }
 setFormat(owner:string,id:string,format:LearningFormat){const r=this.owned(owner,id);r.dto.format=format;if(format==='text'&&this.current?.record===r&&r.dto.phase==='images')this.current.controller.abort();
  if(format==='comic'&&r.dto.status==='completed'&&r.dto.stories.some(s=>s.pages.some(p=>p.image.status!=='ready'))){r.dto.phase='images';r.dto.status='queued';}
  this.touch(r);this.schedule();return this.dto(r);
 }
 shutdown(){if(this.stopped)return;if(this.current?.record.dto.status==='running'){this.current.record.dto.status='queued';this.current.record.dto.progress.retrying=false;this.save();}this.stopped=true;this.current?.controller.abort();}
 private schedule(){if(this.scheduled||this.stopped)return;this.scheduled=true;setImmediate(()=>{this.scheduled=false;void this.pump();});}
 private async pump(){if(this.current||this.stopped)return;const r=this.records.find(r=>r.dto.status==='queued');if(!r)return;const controller=new AbortController();this.current={record:r,controller};r.dto.status='running';this.touch(r);
  try{await this.run(r,controller.signal);}catch(error){if(controller.signal.aborted){if(this.stopped){if(r.dto.status==='running')r.dto.status='queued';}else if(r.dto.status==='running')r.dto.status='queued';this.touch(r);}else{const e=error instanceof GenerationError?error:new GenerationError('GENERATION_FAILED');r.dto.status='failed';if(['QUALITY_REVIEW_REQUIRED','ATTEMPT_BUDGET_EXHAUSTED'].includes(e.code)&&r.qualityRecovery)r.qualityRecovery.state='closed';r.dto.error={code:e.code,message:this.message(e.code),recoverable:!['QUALITY_REVIEW_REQUIRED','ATTEMPT_BUDGET_EXHAUSTED','UPSTREAM_NOT_CONFIGURED'].includes(e.code)&&r.dto.progress.attempts<r.dto.progress.attemptBudget};if(e.code==='QUALITY_REVIEW_REQUIRED')r.dto.error.recoverable=this.canQualityContinue(r);this.touch(r);}}
  finally{r.dto.progress.retrying=false;this.touch(r);this.current=null;this.schedule();}
 }
 private message(code:string){return ({UPSTREAM_TIMEOUT:'本步骤等待超时，已保存之前完成的内容。',UPSTREAM_BUSY:'生成服务暂时繁忙，已保存之前完成的内容。',CONTENT_INVALID:'本步骤未通过内容检查，已保留先前成果。',REVIEW_OUTPUT_INVALID:'复核返回的依据未能对应当前内容，已有成果已保存；这不表示正文已被判错。',QUALITY_REVIEW_REQUIRED:'学理复核仍发现问题，当前内容保留供阅读，暂不能作为已复核材料。',ATTEMPT_BUDGET_EXHAUSTED:'本任务已达到尝试上限，现有内容已保存。',UPSTREAM_NOT_CONFIGURED:'生成服务尚未配置完成。'} as Record<string,string>)[code]??'本步骤暂未完成，已有内容已保存，可继续本步骤。';}
 private input(r:RecordJob):GenerationInput{return {concept:r.dto.concept,knowledge:r.dto.knowledge,stories:r.dto.stories,storyCount:this.storyCount(r),lesson:r.lessonWire};}
 private done(r:RecordJob,phase:string){if(!r.dto.progress.completedStages.includes(phase))r.dto.progress.completedStages.push(phase);this.touch(r);}
 private async attempt<T>(r:RecordJob,key:string,signal:AbortSignal,operation:(repair?:unknown,details?:string[])=>Promise<T>):Promise<T>{
  let details:string[]|undefined;let repair=r.candidates[key];if(repair)details=r.candidateDetails[key]??['Repair the saved rejected candidate, preserve valid content.'];
  while(true){if(signal.aborted)throw new GenerationError('ABORTED');if(r.dto.progress.attempts>=r.dto.progress.attemptBudget||(r.attempts[key]??0)>=4)throw new GenerationError('ATTEMPT_BUDGET_EXHAUSTED');
   r.attempts[key]=(r.attempts[key]??0)+1;r.dto.progress.attempts++;this.touch(r);
   try{const result=await operation(repair,details);if(signal.aborted)throw new GenerationError('ABORTED');delete r.candidates[key];delete r.candidateDetails[key];r.dto.progress.retrying=false;return result;}
   catch(e){if(signal.aborted)throw e;if(e instanceof CandidateError){r.candidates[key]=e.candidate;r.candidateDetails[key]=e.details;this.touch(r);if(!r.contentRepaired.includes(key)){r.contentRepaired.push(key);repair=e.candidate;details=e.details;r.dto.progress.retrying=true;this.touch(r);continue;}}
    if(e instanceof GenerationError&&e.transient&&!r.retried.includes(key)){r.retried.push(key);r.dto.progress.retrying=true;this.touch(r);await new Promise<void>((resolve,reject)=>{const t=setTimeout(resolve,this.options.retryDelayMs??1500);signal.addEventListener('abort',()=>{clearTimeout(t);reject(new GenerationError('ABORTED'));},{once:true});});continue;}throw e;}
  }
 }
 private async run(r:RecordJob,signal:AbortSignal){
  const recovery=r.qualityRecovery?.state==='active'?r.qualityRecovery:null;
  const storyStages:JobPhase[]=this.storyCount(r)===1?['story-1']:['story-1','story-2'];
  const repairStages=storyStages.map(phase=>('repair-'+phase) as JobPhase);
  const stages:JobPhase[]=recovery?['review',...repairStages,'repair-lesson','review-final']:['knowledge',...storyStages,'lesson','review',...repairStages,'repair-lesson','review-final'];
  const completed=recovery?recovery.completedStages:r.dto.progress.completedStages;
  for(const phase of stages){if(signal.aborted)throw new GenerationError('ABORTED');if(completed.includes(phase))continue;
   const target=phase.startsWith('repair-')?phase.slice(7):null;
   const storyChanged=completed.some(s=>s==='repair-story-1'||s==='repair-story-2');
   if(target&&!r.review?.issues.some(i=>i.target===target)&&!(target==='lesson'&&storyChanged))continue;
   if(phase==='review-final'&&r.review?.passed)continue;
   r.dto.phase=phase;r.dto.progress.retrying=false;this.touch(r);
   const attemptKey=recovery?'quality-recovery:'+phase:phase;
   await this.attempt(r,attemptKey,signal,async(previousCandidate,validationErrors)=>{
    const input={...this.input(r),previousCandidate,validationErrors};
    if(phase==='knowledge'){const result=await this.provider.knowledge(input,signal);if(signal.aborted)throw new GenerationError('ABORTED');r.dto.knowledge=parse(knowledgeSchema,result) as KnowledgeDTO;}
    else if(phase==='story-1'||phase==='story-2'||target==='story-1'||target==='story-2'){
     const index=Number((target??phase).slice(-1))-1;input.storyIndex=index;
     if(target){input.issues=r.review?.issues.filter(i=>i.target===target);input.previousCandidate??=r.wires[index];input.validationErrors??=input.issues!.map(i=>i.detail);}
     const result=await this.provider.story(input,signal);if(signal.aborted)throw new GenerationError('ABORTED');const wire=validateStory(result,input);if(target)r.history.push({phase,story:r.wires[index]});r.wires[index]=wire;r.dto.stories[index]=projectStory(wire);
    }else if(phase==='lesson'||target==='lesson'){
     if(target){input.issues=r.review?.issues.filter(i=>i.target===target);input.previousCandidate??=r.lessonWire;input.validationErrors??=[...(storyChanged?['A story was repaired. Re-ground all mappings and affected explanations/tasks in the updated paragraphs, preserve valid content.']:[]),...input.issues!.map(i=>i.detail)];}
     const result=await this.provider.lesson(input,signal);if(signal.aborted)throw new GenerationError('ABORTED');const wire=validateLesson(result,input);if(target)r.history.push({phase,lesson:r.lessonWire});r.lessonWire=wire;r.dto.lesson=wire.lesson;r.dto.tasks=wire.tasks;r.dto.discussion=wire.discussion;
    }else{
     const current=freshReviewInput(this.input(r));const result=await this.provider.review(current,signal);if(signal.aborted)throw new GenerationError('ABORTED');const review=validateReview(result,current);if(r.review)r.history.push({phase:attemptKey,review:r.review});r.review=review;
     if(!review.passed&&(phase==='review-final'||review.issues.some(i=>i.target==='knowledge')||!review.issues.length)){r.dto.quality='needs_review';throw new GenerationError('QUALITY_REVIEW_REQUIRED');}
     if(review.passed)r.dto.quality='checked';else r.dto.quality='needs_review';
    }
   });if(recovery)recovery.completedStages.push(phase);this.done(r,attemptKey);
  }
  if(r.dto.quality!=='checked')throw new GenerationError('QUALITY_REVIEW_REQUIRED');
  if(recovery){recovery.state='closed';this.touch(r);}
  if(r.dto.format==='comic'){r.dto.phase='images';this.touch(r);await this.images(r,signal);}
  if(signal.aborted)throw new GenerationError('ABORTED');r.dto.status='completed';r.dto.phase='complete';r.dto.error=null;this.touch(r);
 }
 private async images(r:RecordJob,signal:AbortSignal){
  for(const [s,story] of r.dto.stories.entries())for(const [i,page] of story.pages.entries()){
   if(r.dto.format==='text')return;if(page.image.status==='ready')continue;if(signal.aborted)throw new GenerationError('ABORTED');
   const key='image-'+story.id+'-'+i;page.image.status='generating';this.touch(r);
   try{const result=await this.attempt(r,key,signal,async()=>{
     let reference:undefined|{bytes:Uint8Array;hash:string};if(i>0){const first=story.pages[0].image.url?.split('/').at(-1);if(!first||story.pages[0].image.status!=='ready')throw new GenerationError('REFERENCE_UNAVAILABLE');const bytes=readFileSync(join(this.dir,'media',r.owner,first));reference={bytes,hash:createHash('sha256').update(bytes).digest('hex')};}
     const wire=r.wires[s],scene=wire.pages[i];const prompt=('Adult literary comic, cinematic ink, muted amber and blue palette, one scene, no panels, no text. '+(i?'Preserve exact identity and appearance from reference. ':'Establish all recurring characters: '+wire.characters.map(c=>c.name+': '+c.visualDesign).join('; ')+'. ')+scene.imagePrompt).slice(0,1024);
     return this.provider.image({prompt,reference},signal);
    });if(signal.aborted)throw new GenerationError('ABORTED');
    const hash=createHash('sha256').update(result.bytes).digest('hex');if(hash!==result.hash)throw new GenerationError('IMAGE_HASH_MISMATCH');const directory=join(this.dir,'media',r.owner);mkdirSync(directory,{recursive:true,mode:0o700});const name=hash+result.extension;
    writeFileSync(join(directory,name),result.bytes,{mode:0o600});atomic(join(directory,hash+'.json'),result.metadata);page.image={status:'ready',url:'/learn/media/'+name};this.done(r,key);
   }catch(error){if(signal.aborted)throw error;page.image={status:'failed',error:'这张插画尚未完成，正文可继续阅读。'};this.touch(r);if(error instanceof GenerationError&&error.code==='ATTEMPT_BUDGET_EXHAUSTED')throw error;}
  }
 }
 media(owner:string,name:string){if(!/^[a-f0-9]{64}\.(png|jpg)$/.test(name))return null;const path=join(this.dir,'media',owner,name);return existsSync(path)?path:null;}
}
