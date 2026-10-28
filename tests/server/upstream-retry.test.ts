import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {EcnuProvider} from '../../server/ecnu.ts';
import {GenerationError} from '../../server/generation.ts';
import {retryAfterDelay} from '../../server/retry.ts';

test('Retry-After accepts seconds or an HTTP date, rejects malformed values and caps server delays',()=>{
 const now=Date.UTC(2026,9,28,0);assert.equal(retryAfterDelay('60',now),60000);assert.equal(retryAfterDelay('Wed, 28 Oct 2026 00:02:00 GMT',now),120000);assert.equal(retryAfterDelay('999999999',now),900000);
 for(const value of [null,'','-5','NaN','Infinity','2026-10-28','private-upstream-message','Wed, 28 Oct 2026 00:00:00 GMT trailing','Tue, 27 Oct 2026 00:00:00 GMT'])assert.equal(retryAfterDelay(value,now),undefined);
});

test('text adapters classify timeout/rate limits/all 5xx and expose only bounded Retry-After metadata',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'studio-upstream-'));try{
  for(const status of [408,429,500,501,502,503,504,401,422]){
   const provider=new EcnuProvider({apiKey:'fixture-not-a-real-key',enabled:true,traceDir:dir,fetcher:(async()=>new Response('private-response-body',{status,headers:{'Retry-After':'1200','x-private-header':'private-header'}})) as typeof fetch});
   await assert.rejects(()=>provider.knowledge({concept:'反馈',knowledge:null,stories:[]},new AbortController().signal),(error:unknown)=>{assert.ok(error instanceof GenerationError);assert.equal(error.transient,status===408||status===429||status>=500);assert.equal(error.retryAfterMs,[429,503].includes(status)?900000:undefined);assert.equal(error.code,status===429?'UPSTREAM_BUSY':[408,504].includes(status)?'UPSTREAM_TIMEOUT':'UPSTREAM_HTTP_'+status);return true;});
  }
  const trace=readFileSync(join(dir,'calls.jsonl'),'utf8');for(const value of ['fixture-not-a-real-key','private-response-body','private-header','Retry-After'])assert.equal(trace.includes(value),false);
 }finally{const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&basename(target).startsWith('studio-upstream-'));rmSync(target,{recursive:true,force:true});}
});

test('image adapters retain retryable 408/429/all 5xx and do not retry content/authorization failures',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'studio-upstream-'));try{
  for(const status of [408,429,500,501,503,504,401,422]){
   const provider=new EcnuProvider({apiKey:'fixture-not-a-real-key',enabled:true,traceDir:dir,fetcher:(async()=>new Response('private-image-response',{status,headers:{'Retry-After':'90'}})) as typeof fetch});
   await assert.rejects(()=>provider.image({prompt:'A safe synthetic scene with a worn ledger.'},new AbortController().signal),(error:unknown)=>{assert.ok(error instanceof GenerationError);assert.equal(error.code,'ECNU_HTTP_'+status);assert.equal(error.transient,status===408||status===429||status>=500);assert.equal(error.retryAfterMs,[429,503].includes(status)?90000:undefined);return true;});
  }
 }finally{const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&basename(target).startsWith('studio-upstream-'));rmSync(target,{recursive:true,force:true});}
});
