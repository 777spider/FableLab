import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JobService,GenerationError} from '../../server/jobs.ts';
import {SyntheticProvider} from '../../server/synthetic.ts';

const owner='a'.repeat(32);
async function until(fn:()=>boolean){for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('condition timed out');}
function setup(provider=new SyntheticProvider()){
 const dir=mkdtempSync(join(tmpdir(),'studio-test-'));const service=new JobService(dir,provider,{retryDelayMs:1});
 return {dir,service,cleanup(){service.shutdown();rmSync(dir,{recursive:true,force:true});}};
}
test('completed knowledge survives repeated upstream failures and automatic continuation does not rewrite it',async()=>{
 let calls=0;const p=new SyntheticProvider();const story=p.story.bind(p);p.story=async(...args)=>{calls++;if(calls<=2)throw new GenerationError('UPSTREAM_TIMEOUT',true);return story(...args);};
 const s=setup(p);try{
  const job=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'request-0001'});
  await until(()=>s.service.get(owner,job.id)!.status==='completed');const completed=s.service.get(owner,job.id)!;
  assert.ok(completed.knowledge);assert.equal(calls,3);assert.equal(completed.progress.attempts,6);
  assert.equal(completed.progress.completedStages.filter(stage=>stage==='knowledge').length,1);assert.equal(completed.stories.length,1);assert.equal(completed.progress.retry,null);
 }finally{s.cleanup();}
});
test('duplicate submissions and concurrent resumes share one job, owners cannot read it',async()=>{
 const s=setup();try{const req={concept:'反馈',format:'text' as const,clientRequestId:'request-0002'};const a=s.service.create(owner,req);const b=s.service.create(owner,req);
 assert.equal(a.id,b.id);assert.equal(s.service.get('b'.repeat(32),a.id),null);assert.equal(s.service.list('b'.repeat(32)).length,0);
 s.service.resume(owner,a.id);s.service.resume(owner,a.id);await until(()=>s.service.get(owner,a.id)!.status==='completed');assert.equal(s.service.get(owner,a.id)!.progress.attempts,4);
 }finally{s.cleanup();}
});
test('pause aborts current stage, restart retains readable checkpoints and explicit pause',async()=>{
 const p=new SyntheticProvider();p.story=async(_input,signal)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new GenerationError('ABORTED',false)),{once:true});});
 const s=setup(p);try{const a=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'request-0003'});await until(()=>s.service.get(owner,a.id)!.phase==='story-1');s.service.pause(owner,a.id);
 await until(()=>s.service.get(owner,a.id)!.status==='paused');s.service.shutdown();const restarted=new JobService(s.dir,new SyntheticProvider());
 assert.equal(restarted.get(owner,a.id)!.status,'paused');assert.ok(restarted.get(owner,a.id)!.knowledge);restarted.resume(owner,a.id);await until(()=>restarted.get(owner,a.id)!.status==='completed');restarted.shutdown();
 }finally{s.cleanup();}
});
test('text makes no image calls; comic switch preserves text and reuses first image reference',async()=>{
 const p=new SyntheticProvider();const refs:(string|null)[]=[];const image=p.image.bind(p);p.image=async(input,signal)=>{refs.push(input.reference?.hash??null);return image(input,signal);};
 const s=setup(p);try{const a=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'request-0004'});await until(()=>s.service.get(owner,a.id)!.status==='completed');assert.equal(refs.length,0);
 const text=s.service.get(owner,a.id)!.stories.map(x=>x.text);s.service.setFormat(owner,a.id,'comic');await until(()=>s.service.get(owner,a.id)!.status==='completed');const result=s.service.get(owner,a.id)!;
 assert.deepEqual(result.stories.map(x=>x.text),text);assert.equal(refs.length,4);assert.equal(refs[0],null);assert.ok(refs[1]);assert.equal(refs[1],refs[2]);assert.equal(refs[2],refs[3]);
 }finally{s.cleanup();}
});
test('quality failure repairs its target once and only accepts a successful recheck',async()=>{
 const p=new SyntheticProvider();let checks=0;const review=p.review.bind(p);p.review=async(...args)=>{checks++;return checks===1?{passed:false,issues:[{target:'story-1' as const,detail:'时间窗不一致',evidence:{paragraphId:'p1',quote:args[0].stories[0].paragraphs[0].text.slice(0,20)}}]}:review(...args);};
 const s=setup(p);try{const a=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'request-0005'});await until(()=>s.service.get(owner,a.id)!.status==='completed');assert.equal(s.service.get(owner,a.id)!.quality,'checked');assert.equal(checks,2);assert.ok(s.service.get(owner,a.id)!.progress.completedStages.includes('repair-story-1'));
 }finally{s.cleanup();}
});
test('paused job rejects an old provider result even if it ignores network cancellation',async()=>{
 const p=new SyntheticProvider();const original=p.story.bind(p);let release:(v:any)=>void=()=>{};p.story=async(input,signal)=>new Promise(resolve=>{release=async()=>resolve(await original(input,signal));});
 const s=setup(p);try{const a=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'request-late-01'});await until(()=>s.service.get(owner,a.id)!.phase==='story-1');s.service.pause(owner,a.id);release(null);await new Promise(r=>setTimeout(r,20));
 assert.equal(s.service.get(owner,a.id)!.status,'paused');assert.equal(s.service.get(owner,a.id)!.stories.length,0);
 }finally{s.cleanup();}
});
test('shutdown records queued stage immediately and restart automatically continues it',async()=>{
 const p=new SyntheticProvider();p.story=async(_input,signal)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new GenerationError('ABORTED')),{once:true});});
 const s=setup(p);try{const a=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'request-restart-01'});await until(()=>s.service.get(owner,a.id)!.phase==='story-1');s.service.shutdown();const recovered=new JobService(s.dir,new SyntheticProvider());
 await until(()=>recovered.get(owner,a.id)!.status==='completed');assert.equal(recovered.get(owner,a.id)!.progress.attempts,5);recovered.shutdown();
 }finally{s.cleanup();}
});
test('repeating original submission after format switch remains idempotent',async()=>{
 const s=setup();try{const req={concept:'反馈',format:'text' as const,clientRequestId:'request-format-01'},a=s.service.create(owner,req);await until(()=>s.service.get(owner,a.id)!.status==='completed');s.service.setFormat(owner,a.id,'comic');assert.equal(s.service.create(owner,req).id,a.id);
 }finally{s.cleanup();}
});
test('repairing a story rebuilds dependent mappings before final review',async()=>{
 const p=new SyntheticProvider();let checks=0,lessons=0;const lesson=p.lesson.bind(p),review=p.review.bind(p);p.lesson=async(...args)=>{lessons++;return lesson(...args);};p.review=async(...args)=>{checks++;return checks===1?{passed:false,issues:[{target:'story-1' as const,detail:'时间窗不一致',evidence:{paragraphId:'p1',quote:args[0].stories[0].paragraphs[0].text.slice(0,20)}}]}:review(...args);};
 const s=setup(p);try{const a=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'request-mapping-01'});await until(()=>s.service.get(owner,a.id)!.status==='completed');assert.equal(lessons,2);
 }finally{s.cleanup();}
});
test('restarting a rejected stage does not reset automatic repair or attempt budget',async()=>{
 const p=new SyntheticProvider();p.story=async()=>({invalid:true});const s=setup(p);try{const a=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'request-budget-01'});await until(()=>s.service.get(owner,a.id)!.status==='failed');assert.equal(s.service.get(owner,a.id)!.progress.attempts,3);s.service.shutdown();
 const recovered=new JobService(s.dir,p,{retryDelayMs:1});recovered.resume(owner,a.id);await until(()=>recovered.get(owner,a.id)!.status==='failed');assert.equal(recovered.get(owner,a.id)!.progress.attempts,4);recovered.resume(owner,a.id);await until(()=>recovered.get(owner,a.id)!.status==='failed');assert.equal(recovered.get(owner,a.id)!.progress.attempts,5);recovered.resume(owner,a.id);await until(()=>recovered.get(owner,a.id)!.error?.code==='ATTEMPT_BUDGET_EXHAUSTED');assert.equal(recovered.get(owner,a.id)!.progress.attempts,5);assert.equal(recovered.get(owner,a.id)!.error!.recoverable,false);recovered.shutdown();
 }finally{s.cleanup();}
});
test('retrying comic failures fills missing pages while preserving all ready images',async()=>{
 const p=new SyntheticProvider();const image=p.image.bind(p);let count=0;p.image=async(...args)=>{count++;if(count===2)throw new GenerationError('IMAGE_FAILED');return image(...args);};const s=setup(p);try{
 const a=s.service.create(owner,{concept:'反馈',format:'comic',clientRequestId:'request-images-01'});await until(()=>s.service.get(owner,a.id)!.status==='completed');const initial=s.service.get(owner,a.id)!;assert.equal(initial.stories[0].pages[1].image.status,'failed');const ready=initial.stories[0].pages.filter(p=>p.image.status==='ready').map(p=>p.image.url);assert.equal(ready.length,3);
 s.service.resume(owner,a.id);await until(()=>s.service.get(owner,a.id)!.status==='completed');const result=s.service.get(owner,a.id)!;assert.ok(result.stories.every(s=>s.pages.every(p=>p.image.status==='ready')));assert.deepEqual(result.stories[0].pages.filter((_p,i)=>i!==1).map(p=>p.image.url),ready);assert.equal(count,5);assert.equal(result.progress.completedStages.filter(s=>s==='knowledge').length,1);
 }finally{s.cleanup();}
});
