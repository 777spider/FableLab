import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JobService} from '../../server/jobs.ts';
import {SyntheticProvider} from '../../server/synthetic.ts';
import {CandidateError,ReviewOutputError,freshReviewInput,projectStory,validateStory,validateLesson,validateReview,type GenerationInput} from '../../server/generation.ts';

const owner='d'.repeat(32),signal=new AbortController().signal;
async function until(fn:()=>boolean){for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('condition timed out');}
async function legacyFixture(dir:string){
 const p=new SyntheticProvider(),input:GenerationInput={concept:'反馈',knowledge:null,stories:[],storyCount:2};
 input.knowledge=await p.knowledge(input,signal);
 const wires=[];
 for(let storyIndex=0;storyIndex<2;storyIndex++){const wire=await p.story({...input,storyIndex},signal);wires.push(wire);input.stories.push(projectStory(wire));}
 input.lesson=await p.lesson(input,signal);
 const at='2026-10-20T00:00:00.000Z';
 const record:any={owner,clientRequestId:'legacy-request-01',requestedFormat:'text',attempts:{knowledge:1,'story-1':1,'story-2':1,lesson:1,review:1},retried:[],contentRepaired:[],candidates:{},candidateDetails:{},wires,lessonWire:input.lesson,review:{passed:true,issues:[]},history:[],dto:{id:'legacy-job-01',concept:input.concept,format:'text',status:'completed',phase:'complete',createdAt:at,updatedAt:at,progress:{completedStages:['knowledge','story-1','story-2','lesson','review'],stageLabel:'已完成',elapsedMs:0,etaMs:null,attempts:5,attemptBudget:48,retrying:false},knowledge:input.knowledge,stories:input.stories,lesson:input.lesson!.lesson,tasks:input.lesson!.tasks,discussion:input.lesson!.discussion,error:null,quality:'checked',provenance:'preset'}};
 const file=join(dir,'jobs.json'),save=()=>writeFileSync(file,JSON.stringify({version:1,jobs:[record]}),'utf8');
 save();return {record,input,file,save};
}

test('new jobs save one story and call only knowledge, story-1, lesson and a fresh review',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'studio-single-')),p=new SyntheticProvider(),calls:string[]=[];
 for(const stage of ['knowledge','story','lesson','review'] as const){const original=p[stage].bind(p);p[stage]=async(input,signal)=>{assert.equal(input.storyCount,1);calls.push(stage==='story'?'story-'+(input.storyIndex!+1):stage);if(stage==='review'){assert.equal('issues' in input,false);assert.equal('previousCandidate' in input,false);assert.equal('validationErrors' in input,false);}return original(input,signal);};}
 const service=new JobService(dir,p);try{
  const request={concept:'反馈',format:'text' as const,clientRequestId:'single-request-01',storyCount:2};
  const a=service.create(owner,request);await until(()=>service.get(owner,a.id)!.status==='completed');const result=service.get(owner,a.id)!;
  assert.deepEqual(calls,['knowledge','story-1','lesson','review']);assert.equal(result.storyCount,1);assert.equal(result.stories.length,1);assert.equal(result.progress.attempts,4);assert.equal(result.progress.attemptBudget,48);
  assert.deepEqual(result.progress.completedStages,['knowledge','story-1','lesson','review']);assert.deepEqual(result.tasks.map(t=>t.kind),['comprehension','application']);assert.equal(result.lesson!.mapping.length,2);
  assert.equal(JSON.parse(readFileSync(join(dir,'jobs.json'),'utf8')).jobs[0].dto.storyCount,1);
 }finally{service.shutdown();rmSync(dir,{recursive:true,force:true});}
});

test('legacy completed books keep both stories and startup reads do not rewrite or migrate them',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'studio-legacy-read-'));let service:JobService|undefined;try{
  const f=await legacyFixture(dir),before=readFileSync(f.file,'utf8');utimesSync(f.file,new Date(0),new Date(0));const modified=statSync(f.file).mtimeMs;
  service=new JobService(dir,new SyntheticProvider());const result=service.get(owner,f.record.dto.id)!;
  assert.equal(result.storyCount,2);assert.deepEqual(result.stories,f.record.dto.stories);assert.deepEqual(result.tasks.map(t=>t.kind),['comparison','application']);assert.equal(service.list(owner)[0].storyCount,2);
  assert.equal(readFileSync(f.file,'utf8'),before);assert.equal(statSync(f.file).mtimeMs,modified);assert.equal('storyCount' in JSON.parse(before).jobs[0].dto,false);
 }finally{service?.shutdown();rmSync(dir,{recursive:true,force:true});}
});

test('legacy story-2 resume retains its saved candidate, text, checkpoints and original counters',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'studio-legacy-resume-'));let service:JobService|undefined;try{
  const f=await legacyFixture(dir),r=f.record,first=structuredClone(r.dto.stories[0]),second=structuredClone(r.wires[1]);
  r.dto.status='paused';r.dto.phase='story-2';r.dto.stories=[first];r.dto.lesson=null;r.dto.tasks=[];r.dto.discussion=[];r.dto.quality='pending';r.dto.progress.completedStages=['knowledge','story-1'];r.dto.progress.attempts=4;r.dto.progress.attemptBudget=16;
  r.attempts={knowledge:1,'story-1':1,'story-2':2};r.wires=[r.wires[0]];r.lessonWire=null;r.review=null;r.retried=['story-2'];r.contentRepaired=['story-2'];r.candidates={'story-2':second};r.candidateDetails={'story-2':['Repair the saved second story only.']};f.save();
  const p=new SyntheticProvider(),calls:string[]=[],lesson=p.lesson.bind(p),review=p.review.bind(p);
  p.knowledge=async()=>{assert.fail('knowledge checkpoint must be reused');};
  p.story=async(input)=>{assert.equal(input.storyCount,2);assert.equal(input.storyIndex,1);assert.deepEqual(input.previousCandidate,second);assert.deepEqual(input.validationErrors,r.candidateDetails['story-2']);calls.push('story-2');return input.previousCandidate;};
  p.lesson=async(...args)=>{calls.push('lesson');return lesson(...args);};p.review=async(...args)=>{assert.equal(args[0].storyCount,2);calls.push('review');return review(...args);};
  service=new JobService(dir,p);service.resume(owner,r.dto.id);await until(()=>service!.get(owner,r.dto.id)!.status==='completed');const result=service.get(owner,r.dto.id)!,stored=JSON.parse(readFileSync(f.file,'utf8')).jobs[0];
  assert.deepEqual(calls,['story-2','lesson','review']);assert.deepEqual(result.stories[0],first);assert.deepEqual(result.knowledge,r.dto.knowledge);assert.equal(result.stories[1].text,projectStory(second).text);assert.equal(result.storyCount,2);assert.equal(result.progress.attempts,7);assert.equal(result.progress.attemptBudget,16);
  assert.deepEqual(stored.attempts,{knowledge:1,'story-1':1,'story-2':3,lesson:1,review:1});assert.deepEqual(stored.retried,['story-2']);assert.deepEqual(stored.contentRepaired,['story-2']);assert.equal('storyCount' in stored.dto,false);assert.deepEqual(result.tasks.map(t=>t.kind),['comparison','application']);
 }finally{service?.shutdown();rmSync(dir,{recursive:true,force:true});}
});

test('lesson mapping and task validation follows the actual story count, including legacy inputs',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'studio-mapping-count-'));try{
  const f=await legacyFixture(dir),p=new SyntheticProvider(),single={...f.input,stories:[f.input.stories[0]],storyCount:1 as const};
  const one=await p.lesson(single,signal);assert.equal(validateLesson(one,single).lesson.mapping.length,2);
  const {storyCount:_,...inferred}=single;assert.equal(validateLesson(one,inferred).tasks[0].kind,'comprehension');
  const wrongKind=structuredClone(one);wrongKind.tasks[0].kind='comparison';assert.throws(()=>validateLesson(wrongKind,single),CandidateError);
  const missing=structuredClone(one);missing.lesson.mapping[1]=structuredClone(missing.lesson.mapping[0]);assert.throws(()=>validateLesson(missing,single),CandidateError);
  const legacy=structuredClone(f.input.lesson!);assert.equal(validateLesson(legacy,f.input).lesson.mapping.length,4);
  legacy.lesson.mapping.pop();assert.throws(()=>validateLesson(legacy,f.input),CandidateError);assert.throws(()=>validateLesson(one,{...single,storyCount:2}),CandidateError);
  const wire=await p.story({...single,storyIndex:0},signal);wire.paragraphs[0].text+='参见p1和p2。';assert.throws(()=>validateStory(wire,single),CandidateError);
  const fresh=freshReviewInput({...single,issues:[],previousCandidate:{passed:false},validationErrors:['old verdict']});assert.equal(fresh.storyCount,1);assert.equal('issues' in fresh,false);assert.equal('previousCandidate' in fresh,false);assert.equal('validationErrors' in fresh,false);
  assert.throws(()=>validateReview({passed:false,issues:[{target:'story-2',detail:'不存在的第二则',evidence:{paragraphId:'p1',quote:single.stories[0].paragraphs[0].text.slice(0,8)}}]},fresh),ReviewOutputError);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('legacy quality continuation still repairs story-2 and rebuilds both-story mappings',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'studio-legacy-quality-'));let service:JobService|undefined;try{
  const f=await legacyFixture(dir),r=f.record,first=structuredClone(r.dto.stories[0]),before=r.dto.stories[1].paragraphs[1].text;
  r.dto.status='failed';r.dto.phase='review-final';r.dto.quality='needs_review';r.dto.error={code:'QUALITY_REVIEW_REQUIRED',message:'等待复核',recoverable:true};r.dto.progress.attempts=8;r.dto.progress.completedStages.push('repair-story-2','repair-lesson','review-final');r.attempts.lesson=1;r.attempts['repair-story-2']=1;r.attempts['repair-lesson']=1;r.attempts['review-final']=1;f.save();
  const p=new SyntheticProvider(),calls:string[]=[],lesson=p.lesson.bind(p);let fixed=false;
  p.review=async(input)=>{calls.push('review');assert.equal(input.storyCount,2);assert.equal('issues' in input,false);assert.equal('previousCandidate' in input,false);assert.equal('validationErrors' in input,false);return fixed?{passed:true,issues:[]}:{passed:false,issues:[{target:'story-2',detail:'修复当前第二则并重新摘取引用。',evidence:{paragraphId:'p2',quote:before.slice(0,18)}}]};};
  p.story=async(input)=>{calls.push('repair-story-2');assert.equal(input.storyIndex,1);const wire=structuredClone(input.previousCandidate) as any;wire.paragraphs[1].text='修订后的记事从当天继续。'+wire.paragraphs[1].text;fixed=true;return wire;};
  p.lesson=async(...args)=>{calls.push('repair-lesson');return lesson(...args);};
  service=new JobService(dir,p);service.resume(owner,r.dto.id);await until(()=>service!.get(owner,r.dto.id)!.status==='completed');const result=service.get(owner,r.dto.id)!,stored=JSON.parse(readFileSync(f.file,'utf8')).jobs[0];
  assert.deepEqual(calls,['review','repair-story-2','repair-lesson','review']);assert.deepEqual(result.stories[0],first);assert.ok(result.stories[1].paragraphs[1].text.startsWith('修订后的记事'));assert.equal(result.progress.attempts,12);assert.equal(result.progress.attemptBudget,48);assert.equal(stored.qualityRecovery.state,'closed');assert.equal(stored.attempts['review-final'],1);assert.equal('storyCount' in stored.dto,false);
  for(const m of result.lesson!.mapping)assert.ok(result.stories.find(s=>s.id===m.storyId)!.paragraphs.find(p=>p.id===m.paragraphId)!.text.includes(m.quote));
 }finally{service?.shutdown();rmSync(dir,{recursive:true,force:true});}
});
