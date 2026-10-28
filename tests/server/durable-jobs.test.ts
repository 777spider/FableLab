import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {JobService,GenerationError} from '../../server/jobs.ts';
import {SyntheticProvider} from '../../server/synthetic.ts';

const owner='d'.repeat(32),epoch=Date.UTC(2026,9,28,0);
const flush=async()=>{for(let i=0;i<3;i++)await new Promise<void>(done=>setImmediate(done));};
function fixture(provider=new SyntheticProvider(),retryDelayMs?:number){
 const dir=mkdtempSync(join(tmpdir(),'studio-durable-')),file=join(dir,'jobs.json');let service=new JobService(dir,provider,{retryDelayMs});
 return {dir,file,get service(){return service;},stored(){return JSON.parse(readFileSync(file,'utf8')).jobs[0];},restart(next=provider){service.shutdown();service=new JobService(dir,next,{retryDelayMs});return service;},close(){service.shutdown();const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&basename(target).startsWith('studio-durable-'));rmSync(target,{recursive:true,force:true});}};
}

test('transport retry times and limits survive a restart without changing validated checkpoints',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider(),original=provider.story.bind(provider);let stories=0,knowledge=0;
 const originalKnowledge=provider.knowledge.bind(provider);provider.knowledge=async(...args)=>{knowledge++;return originalKnowledge(...args);};provider.story=async(...args)=>{if(++stories===1)throw new GenerationError('UPSTREAM_NETWORK',true);return original(...args);};
 const s=fixture(provider);try{
  const job=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'durable-restart-01'});await flush();const waiting=s.service.get(owner,job.id)!;
  assert.equal(waiting.status,'queued');assert.equal(waiting.progress.attempts,2);assert.deepEqual(waiting.progress.retry,{attempt:1,nextAttemptAt:new Date(epoch+15000).toISOString(),reason:'network'});assert.ok(waiting.knowledge);
  const before=readFileSync(s.file,'utf8');s.restart();assert.equal(readFileSync(s.file,'utf8'),before);await flush();assert.equal(stories,1);
  t.mock.timers.tick(14999);await flush();assert.equal(stories,1);assert.equal(s.service.get(owner,job.id)!.status,'queued');
  t.mock.timers.tick(1);await flush();const result=s.service.get(owner,job.id)!;assert.equal(result.status,'completed');assert.equal(result.id,job.id);assert.equal(result.progress.attempts,5);assert.equal(knowledge,1);assert.deepEqual(result.knowledge,waiting.knowledge);assert.equal(result.progress.retry,null);assert.equal('retry' in s.stored(),false);assert.equal(s.stored().transportFailures['story-1'],1);
 }finally{s.close();}
});

test('seven bounded backoffs permit eight transport calls and exhaust without resetting counters',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider();let calls=0;provider.knowledge=async()=>{calls++;throw new GenerationError('UPSTREAM_BUSY',true);};const s=fixture(provider);
 try{
  const job=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'durable-limit-01'});await flush();
  for(const [index,delay] of [15000,45000,135000,300000,300000,300000,300000].entries()){
   const state=s.service.get(owner,job.id)!;assert.equal(state.status,'queued');assert.equal(calls,index+1);assert.equal(state.progress.retry!.attempt,index+1);assert.equal(Date.parse(state.progress.retry!.nextAttemptAt)-Date.now(),delay);
   s.service.resume(owner,job.id);s.service.resume(owner,job.id);t.mock.timers.tick(delay-1);await flush();assert.equal(calls,index+1);t.mock.timers.tick(1);await flush();
  }
  const result=s.service.get(owner,job.id)!;assert.equal(calls,8);assert.equal(result.status,'failed');assert.equal(result.error!.code,'ATTEMPT_BUDGET_EXHAUSTED');assert.equal(result.error!.recoverable,false);assert.equal(result.progress.attempts,8);assert.equal(result.progress.attemptBudget,48);assert.equal(result.progress.retry,null);assert.equal(s.stored().attempts.knowledge,8);assert.equal(s.stored().transportFailures.knowledge,8);assert.equal('retry' in s.stored(),false);
  s.restart();s.service.resume(owner,job.id);t.mock.timers.tick(900000);await flush();assert.equal(calls,8);
 }finally{s.close();}
});

test('the remaining global budget bounds automatic transport recovery',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider();let calls=0;provider.knowledge=async()=>{calls++;throw new GenerationError('UPSTREAM_TIMEOUT',true);};const s=fixture(provider,1);
 try{
  const job=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'durable-global-01'});s.service.pause(owner,job.id);s.service.shutdown();const saved=JSON.parse(readFileSync(s.file,'utf8'));saved.jobs[0].dto.status='queued';saved.jobs[0].dto.progress.attemptBudget=3;writeFileSync(s.file,JSON.stringify(saved),'utf8');s.restart();await flush();
  t.mock.timers.tick(1);await flush();t.mock.timers.tick(3);await flush();const result=s.service.get(owner,job.id)!;assert.equal(calls,3);assert.equal(result.progress.attempts,3);assert.equal(result.error!.code,'ATTEMPT_BUDGET_EXHAUSTED');assert.equal(result.error!.recoverable,false);assert.equal('retry' in s.stored(),false);
 }finally{s.close();}
});

test('a waiting retry releases the single worker and never starts a second simultaneous provider call',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider(),knowledge=provider.knowledge.bind(provider);let active=0,maxActive=0,fail=true;
 provider.knowledge=async(input,signal)=>{if(input.concept==='反馈'&&fail){fail=false;throw new GenerationError('UPSTREAM_NETWORK',true);}return knowledge(input,signal);};
 for(const method of ['knowledge','story','lesson','review'] as const){const original=provider[method].bind(provider);provider[method]=async(input,signal)=>{active++;maxActive=Math.max(maxActive,active);try{await new Promise<void>(done=>setImmediate(done));return await original(input,signal);}finally{active--;}};}
 const s=fixture(provider);try{
  const first=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'durable-queue-01'}),second=s.service.create(owner,{concept:'控制论',format:'text',clientRequestId:'durable-queue-02'});for(let i=0;i<8;i++)await flush();
  assert.equal(s.service.get(owner,first.id)!.status,'queued');assert.equal(s.service.get(owner,second.id)!.status,'completed',JSON.stringify(s.service.get(owner,second.id)!.error));assert.equal(maxActive,1);
  t.mock.timers.tick(15000);for(let i=0;i<8;i++)await flush();assert.equal(s.service.get(owner,first.id)!.status,'completed');assert.equal(maxActive,1);
 }finally{s.close();}
});

test('explicit pause clears the automatic schedule and survives shutdown and restart',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider(),original=provider.knowledge.bind(provider);let calls=0;provider.knowledge=async(...args)=>{if(++calls===1)throw new GenerationError('UPSTREAM_NETWORK',true);return original(...args);};const s=fixture(provider);
 try{
  const job=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'durable-pause-01'});await flush();assert.ok(s.service.get(owner,job.id)!.progress.retry);s.service.pause(owner,job.id);assert.equal('retry' in s.stored(),false);s.restart();t.mock.timers.tick(900000);await flush();assert.equal(calls,1);assert.equal(s.service.get(owner,job.id)!.status,'paused');
  s.service.resume(owner,job.id);await flush();assert.equal(s.service.get(owner,job.id)!.status,'completed');assert.equal(calls,2);assert.equal(s.service.get(owner,job.id)!.progress.attempts,5);
 }finally{s.close();}
});

test('image transport retries resume the missing page after restart and preserve ready images and their reference',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider(),original=provider.image.bind(provider);let calls=0;const refs:(string|null)[]=[];provider.image=async(input,signal)=>{refs.push(input.reference?.hash??null);if(++calls===2)throw new GenerationError('ECNU_HTTP_503',true);return original(input,signal);};const s=fixture(provider);
 try{
  const job=s.service.create(owner,{concept:'反馈',format:'comic',clientRequestId:'durable-image-01'});await flush();const waiting=s.service.get(owner,job.id)!,first=waiting.stories[0].pages[0].image.url;assert.equal(waiting.phase,'images');assert.equal(waiting.status,'queued');assert.equal(waiting.stories[0].pages[1].image.status,'pending');assert.equal(waiting.progress.retry!.reason,'service');assert.ok(first);const before=readFileSync(s.file,'utf8');s.restart();assert.equal(readFileSync(s.file,'utf8'),before);
  t.mock.timers.tick(15000);await flush();const result=s.service.get(owner,job.id)!;assert.equal(result.status,'completed');assert.ok(result.stories[0].pages.every(p=>p.image.status==='ready'));assert.equal(result.stories[0].pages[0].image.url,first);assert.equal(calls,5);assert.equal(refs[0],null);assert.ok(refs[1]);assert.ok(refs.slice(1).every(ref=>ref===refs[1]));assert.equal(result.progress.attempts,9);assert.equal(result.progress.completedStages.filter(stage=>stage==='knowledge').length,1);assert.equal('retry' in s.stored(),false);
 }finally{s.close();}
});

test('content validation still stops after one automatic repair and cannot acquire a transport retry allowance',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider();let calls=0;provider.story=async()=>{calls++;return {invalid:true};};const s=fixture(provider);
 try{
  const job=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'durable-content-01'});await flush();assert.equal(calls,2);assert.equal(s.service.get(owner,job.id)!.error!.code,'CONTENT_INVALID');assert.equal('transportFailures' in s.stored(),false);assert.equal('retry' in s.stored(),false);t.mock.timers.tick(900000);await flush();assert.equal(calls,2);
  for(let i=0;i<3;i++){s.service.resume(owner,job.id);await flush();}const result=s.service.get(owner,job.id)!;assert.equal(calls,4);assert.equal(result.progress.attempts,5);assert.equal(result.error!.code,'ATTEMPT_BUDGET_EXHAUSTED');assert.equal(result.error!.recoverable,false);
 }finally{s.close();}
});

test('a saved rejected candidate and its single repair allowance survive an intervening transport failure',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider(),original=provider.story.bind(provider);let calls=0;provider.story=async(input,signal)=>{calls++;if(calls===1)return {rejected:'saved candidate'};assert.deepEqual(input.previousCandidate,{rejected:'saved candidate'});assert.ok(input.validationErrors?.length);if(calls===2)throw new GenerationError('UPSTREAM_TIMEOUT',true);return original(input,signal);};const s=fixture(provider);
 try{
  const job=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'durable-candidate-01'});await flush();assert.equal(calls,2);assert.equal(s.service.get(owner,job.id)!.status,'queued');assert.deepEqual(s.stored().candidates['story-1'],{rejected:'saved candidate'});assert.deepEqual(s.stored().contentRepaired,['story-1']);s.restart();t.mock.timers.tick(15000);await flush();assert.equal(s.service.get(owner,job.id)!.status,'completed');assert.equal(calls,3);assert.equal(s.service.get(owner,job.id)!.progress.attempts,6);assert.deepEqual(s.stored().candidates,{});assert.deepEqual(s.stored().contentRepaired,['story-1']);
 }finally{s.close();}
});

test('validated upstream retry hints are persisted and honored after restart without leaking error text',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider(),original=provider.knowledge.bind(provider);let calls=0;provider.knowledge=async(...args)=>{if(++calls===1)throw new GenerationError('UPSTREAM_BUSY',true,120000);return original(...args);};const s=fixture(provider);
 try{
  const job=s.service.create(owner,{concept:'反馈',format:'text',clientRequestId:'durable-hint-01'});await flush();assert.equal(Date.parse(s.service.get(owner,job.id)!.progress.retry!.nextAttemptAt),epoch+120000);s.restart();t.mock.timers.tick(119999);await flush();assert.equal(calls,1);t.mock.timers.tick(1);await flush();assert.equal(s.service.get(owner,job.id)!.status,'completed');assert.equal(calls,2);
 }finally{s.close();}
});

test('an automatic image retry does not reopen an earlier nontransport failure',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const provider=new SyntheticProvider(),original=provider.image.bind(provider);let calls=0;provider.image=async(...args)=>{calls++;if(calls===2)throw new GenerationError('INVALID_IMAGE');if(calls===3)throw new GenerationError('UPSTREAM_TIMEOUT',true);return original(...args);};const s=fixture(provider);
 try{
  const job=s.service.create(owner,{concept:'反馈',format:'comic',clientRequestId:'durable-image-distinction-01'});await flush();assert.equal(s.service.get(owner,job.id)!.stories[0].pages[1].image.status,'failed');assert.equal(s.stored().retry.key,'image-story-1-2');s.restart();t.mock.timers.tick(15000);await flush();const partial=s.service.get(owner,job.id)!;assert.equal(partial.status,'completed');assert.equal(partial.stories[0].pages[1].image.status,'failed');assert.equal(calls,5);
  s.service.resume(owner,job.id);await flush();assert.equal(s.service.get(owner,job.id)!.status,'completed');assert.ok(s.service.get(owner,job.id)!.stories[0].pages.every(page=>page.image.status==='ready'));assert.equal(calls,6);
 }finally{s.close();}
});
